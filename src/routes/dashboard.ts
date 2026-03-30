import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, count, desc, and, isNull, or, ilike, sql } from "drizzle-orm";
import * as authService from "../services/auth.service.js";
import * as domainService from "../services/domain.service.js";
import * as apiKeyService from "../services/api-key.service.js";
import * as webhookService from "../services/webhook.service.js";
import * as emailService from "../services/email.service.js";
import * as audienceService from "../services/audience.service.js";
import * as broadcastService from "../services/broadcast.service.js";
import * as warmupService from "../services/warmup.service.js";
import * as mailboxService from "../services/mailbox.service.js";
import * as templateService from "../services/template.service.js";
import { getDb } from "../db/index.js";
import { emails, domains, apiKeys, webhooks, audiences, inboundEmails, folders } from "../db/schema/index.js";
import { ForbiddenError } from "../lib/errors.js";
import { getDnsVerifyQueue } from "../queues/index.js";
import { getConfig } from "../config/index.js";
import { WEBHOOK_EVENT_TYPES } from "../types/webhook-events.js";

function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

function calculateReputationScore(t: any): number {
  const totalSent = (t.sent || 0) + (t.delivered || 0);
  if (totalSent === 0) return 100;
  const bounceRate = (t.bounced || 0) / totalSent;
  const complaintRate = (t.complained || 0) / totalSent;
  const deliveryRate = (t.delivered || 0) / totalSent;
  let score = 100;
  score -= bounceRate * 200;
  score -= complaintRate * 1000;
  score += deliveryRate * 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    try {
      const token = request.cookies.token;
      if (!token) throw new ForbiddenError();
      const decoded = app.jwt.verify<{ id: string; role: string }>(token);
      const account = await authService.getAccountById(decoded.id);
      if (!account) throw new ForbiddenError();
      request.account = account;
    } catch {
      throw new ForbiddenError("Authentication required");
    }
  });

  // --- Stats ---
  app.get("/stats", async (request) => {
    const db = getDb();
    const id = request.account.id;
    const [[e], [d], [a], [w], [au], [vd]] = await Promise.all([
      db.select({ count: count() }).from(emails).where(eq(emails.accountId, id)),
      db.select({ count: count() }).from(domains).where(eq(domains.accountId, id)),
      db.select({ count: count() }).from(apiKeys).where(and(eq(apiKeys.accountId, id), isNull(apiKeys.revokedAt))),
      db.select({ count: count() }).from(webhooks).where(eq(webhooks.accountId, id)),
      db.select({ count: count() }).from(audiences).where(eq(audiences.accountId, id)),
      db.select({ count: count() }).from(domains).where(and(eq(domains.accountId, id), eq(domains.status, "verified"))),
    ]);
    return { data: { emails: Number(e.count), domains: Number(d.count), verified_domains: Number(vd.count), api_keys: Number(a.count), webhooks: Number(w.count), audiences: Number(au.count) } };
  });

  // --- Emails ---
  app.get("/emails", async (request) => {
    const db = getDb();
    const query = z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      domain_id: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    }).parse(request.query);

    const conditions: any[] = [eq(emails.accountId, request.account.id)];

    if (query.search) {
      const pattern = `%${escapeIlike(query.search)}%`;
      conditions.push(
        or(
          ilike(emails.fromAddress, pattern),
          ilike(emails.subject, pattern),
          sql`${emails.toAddresses}::text ILIKE ${pattern}`,
        ),
      );
    }

    if (query.status) {
      conditions.push(eq(emails.status, query.status as any));
    }

    if (query.domain_id) {
      conditions.push(eq(emails.domainId, query.domain_id));
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [totalResult] = await db.select({ count: count() }).from(emails).where(whereClause);
    const total = Number(totalResult.count);
    const data = await db.select({
      id: emails.id,
      accountId: emails.accountId,
      domainId: emails.domainId,
      folderId: emails.folderId,
      fromAddress: emails.fromAddress,
      fromName: emails.fromName,
      toAddresses: emails.toAddresses,
      ccAddresses: emails.ccAddresses,
      bccAddresses: emails.bccAddresses,
      replyTo: emails.replyTo,
      subject: emails.subject,
      tags: emails.tags,
      status: emails.status,
      scheduledAt: emails.scheduledAt,
      sentAt: emails.sentAt,
      deliveredAt: emails.deliveredAt,
      lastEventAt: emails.lastEventAt,
      openCount: emails.openCount,
      clickCount: emails.clickCount,
      messageId: emails.messageId,
      isDraft: emails.isDraft,
      createdAt: emails.createdAt,
    }).from(emails).where(whereClause).orderBy(desc(emails.createdAt)).limit(query.limit).offset(offset);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  });

  app.post("/emails", async (request, reply) => {
    const input = z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      subject: z.string().min(1),
      html: z.string().optional(),
      text: z.string().optional(),
    }).refine((d) => d.html || d.text, {
      message: "At least one of html or text is required",
      path: ["html"],
    }).parse(request.body);
    const toAddresses = input.to.split(",").map((e) => e.trim()).filter(Boolean);
    // Validate each email address
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidAddresses = toAddresses.filter((addr) => !emailRegex.test(addr));
    if (invalidAddresses.length > 0) {
      throw new (await import("../lib/errors.js")).ValidationError(`Invalid email address(es): ${invalidAddresses.join(", ")}`);
    }
    if (toAddresses.length === 0) {
      throw new (await import("../lib/errors.js")).ValidationError("At least one recipient is required");
    }
    const result = await emailService.sendEmail(request.account.id, {
      from: input.from,
      to: toAddresses,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return reply.status(201).send({ data: result.response });
  });

  // --- Email Events ---
  app.get<{ Params: { id: string } }>("/emails/:id/events", async (request) => {
    const db = getDb();
    const { emailEvents, emails } = await import("../db/schema/index.js");
    // Verify email belongs to account
    const [email] = await db.select().from(emails)
      .where(and(eq(emails.id, request.params.id), eq(emails.accountId, request.account.id)));
    if (!email) throw new (await import("../lib/errors.js")).NotFoundError("Email");

    const events = await db.select().from(emailEvents)
      .where(eq(emailEvents.emailId, request.params.id))
      .orderBy(desc(emailEvents.createdAt))
      .limit(500);

    return { data: events.map(e => ({
      id: e.id,
      type: e.type,
      data: e.data,
      created_at: e.createdAt.toISOString(),
    })) };
  });

  // --- Cancel Scheduled Email ---
  app.delete<{ Params: { id: string } }>("/emails/:id", async (request) => {
    const cancelled = await emailService.cancelScheduledEmail(request.account.id, request.params.id);
    return { data: emailService.formatEmailResponse(cancelled) };
  });

  // --- Retry Failed Email ---
  app.post<{ Params: { id: string } }>("/emails/:id/retry", async (request, reply) => {
    const db = getDb();
    const [email] = await db.select().from(emails)
      .where(and(eq(emails.id, request.params.id), eq(emails.accountId, request.account.id)));
    if (!email) throw new (await import("../lib/errors.js")).NotFoundError("Email");
    if (email.status !== "failed") throw new (await import("../lib/errors.js")).ValidationError("Only failed emails can be retried");

    // Create a new send with the same content
    const result = await emailService.sendEmail(request.account.id, {
      from: email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress,
      to: email.toAddresses as string[],
      cc: (email.ccAddresses as string[]) || undefined,
      bcc: (email.bccAddresses as string[]) || undefined,
      reply_to: (email.replyTo as string[]) || undefined,
      subject: email.subject,
      html: email.htmlBody || undefined,
      text: email.textBody || undefined,
      headers: (email.headers as Record<string, string>) || undefined,
      tags: (email.tags as Record<string, string>) || undefined,
    });
    return reply.status(201).send({ data: result.response });
  });

  // --- Inbox (inbound emails + folder-aware) ---
  app.get("/inbox", async (request) => {
    const db = getDb();
    const query = z.object({
      search: z.string().optional(),
      filter: z.enum(["all", "unread", "starred", "archived"]).optional().default("all"),
      folder_slug: z.string().optional(),
      domain_id: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    }).parse(request.query);

    const offset = (query.page - 1) * query.limit;

    // --- Sent folder: query the emails (outbound) table ---
    if (query.folder_slug === "sent") {
      const conditions: any[] = [
        eq(emails.accountId, request.account.id),
        eq(emails.isDraft, false),
        isNull(emails.deletedAt),
      ];
      if (query.search) {
        const pattern = `%${escapeIlike(query.search)}%`;
        conditions.push(
          or(
            ilike(emails.fromAddress, pattern),
            ilike(emails.subject, pattern),
            sql`${emails.toAddresses}::text ILIKE ${pattern}`,
          ),
        );
      }
      if (query.domain_id) {
        conditions.push(eq(emails.domainId, query.domain_id));
      }
      const whereClause = and(...conditions);
      const [totalResult] = await db.select({ count: count() }).from(emails).where(whereClause);
      const total = Number(totalResult.count);
      const list = await db.select().from(emails).where(whereClause).orderBy(desc(emails.createdAt)).limit(query.limit).offset(offset);

      // Normalize sent emails to match inbound email shape for the frontend
      const normalized = list.map((e) => ({
        id: e.id,
        fromAddress: e.fromAddress,
        fromName: e.fromName,
        toAddress: (e.toAddresses as string[])?.join(", ") ?? "",
        ccAddresses: e.ccAddresses,
        subject: e.subject,
        textBody: e.textBody,
        htmlBody: e.htmlBody,
        messageId: e.messageId,
        inReplyTo: e.inReplyTo,
        threadId: e.threadId,
        references: e.references,
        folderId: e.folderId,
        isRead: true,
        isStarred: false,
        isArchived: false,
        hasAttachments: (e.attachments as any[])?.length > 0 || false,
        deletedAt: e.deletedAt,
        createdAt: e.createdAt,
        status: e.status,
        _type: "sent" as const,
      }));
      return {
        data: normalized,
        pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
      };
    }

    // --- Drafts folder: query emails table where isDraft = true ---
    if (query.folder_slug === "drafts") {
      const conditions: any[] = [
        eq(emails.accountId, request.account.id),
        eq(emails.isDraft, true),
        isNull(emails.deletedAt),
      ];
      if (query.search) {
        const pattern = `%${escapeIlike(query.search)}%`;
        conditions.push(
          or(
            ilike(emails.fromAddress, pattern),
            ilike(emails.subject, pattern),
            sql`${emails.toAddresses}::text ILIKE ${pattern}`,
          ),
        );
      }
      if (query.domain_id) {
        conditions.push(eq(emails.domainId, query.domain_id));
      }
      const whereClause = and(...conditions);
      const [totalResult] = await db.select({ count: count() }).from(emails).where(whereClause);
      const total = Number(totalResult.count);
      const list = await db.select({
        id: emails.id,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        toAddresses: emails.toAddresses,
        ccAddresses: emails.ccAddresses,
        subject: emails.subject,
        status: emails.status,
        messageId: emails.messageId,
        inReplyTo: emails.inReplyTo,
        threadId: emails.threadId,
        references: emails.references,
        folderId: emails.folderId,
        attachments: emails.attachments,
        deletedAt: emails.deletedAt,
        createdAt: emails.createdAt,
      }).from(emails).where(whereClause).orderBy(desc(emails.createdAt)).limit(query.limit).offset(offset);

      const normalized = list.map((e) => ({
        id: e.id,
        fromAddress: e.fromAddress,
        fromName: e.fromName,
        toAddress: (e.toAddresses as string[])?.join(", ") ?? "",
        ccAddresses: e.ccAddresses,
        subject: e.subject,
        textBody: null,
        htmlBody: null,
        messageId: e.messageId,
        inReplyTo: e.inReplyTo,
        threadId: e.threadId,
        references: e.references,
        folderId: e.folderId,
        isRead: true,
        isStarred: false,
        isArchived: false,
        hasAttachments: (e.attachments as any[])?.length > 0 || false,
        deletedAt: e.deletedAt,
        createdAt: e.createdAt,
        status: e.status,
        _type: "draft" as const,
      }));
      return {
        data: normalized,
        pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
      };
    }

    // --- Trash / Spam / Archive: query inbound_emails filtered by folder ---
    if (query.folder_slug === "trash" || query.folder_slug === "spam" || query.folder_slug === "archive") {
      const [folder] = await db.select().from(folders)
        .where(and(eq(folders.accountId, request.account.id), eq(folders.slug, query.folder_slug)));
      if (folder) {
        const conditions: any[] = [
          eq(inboundEmails.accountId, request.account.id),
          eq(inboundEmails.folderId, folder.id),
        ];
        if (query.search) {
          const pattern = `%${escapeIlike(query.search)}%`;
          conditions.push(
            or(
              ilike(inboundEmails.fromAddress, pattern),
              ilike(inboundEmails.fromName, pattern),
              ilike(inboundEmails.subject, pattern),
            ),
          );
        }
        if (query.domain_id) {
          conditions.push(eq(inboundEmails.domainId, query.domain_id));
        }
        const whereClause = and(...conditions);
        const [totalResult] = await db.select({ count: count() }).from(inboundEmails).where(whereClause);
        const total = Number(totalResult.count);
        const list = await db.select({
          id: inboundEmails.id, accountId: inboundEmails.accountId, domainId: inboundEmails.domainId,
          folderId: inboundEmails.folderId, fromAddress: inboundEmails.fromAddress, fromName: inboundEmails.fromName,
          toAddress: inboundEmails.toAddress, ccAddresses: inboundEmails.ccAddresses, subject: inboundEmails.subject,
          messageId: inboundEmails.messageId, inReplyTo: inboundEmails.inReplyTo, threadId: inboundEmails.threadId,
          references: inboundEmails.references, isRead: inboundEmails.isRead, isStarred: inboundEmails.isStarred,
          isArchived: inboundEmails.isArchived, hasAttachments: inboundEmails.hasAttachments,
          deletedAt: inboundEmails.deletedAt, createdAt: inboundEmails.createdAt,
        }).from(inboundEmails).where(whereClause).orderBy(desc(inboundEmails.createdAt)).limit(query.limit).offset(offset);
        return {
          data: list,
          pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
        };
      }
      // Folder not found — return empty
      return { data: [], pagination: { page: 1, limit: query.limit, total: 0, pages: 0 } };
    }

    // --- Default: inbox folder (inbound emails) ---
    const conditions: any[] = [eq(inboundEmails.accountId, request.account.id)];

    // For explicit inbox folder, filter by inbox folder to exclude trash/spam/archive
    if (!query.folder_slug || query.folder_slug === "inbox") {
      const [inboxFolder] = await db.select().from(folders)
        .where(and(eq(folders.accountId, request.account.id), eq(folders.slug, "inbox")));
      if (inboxFolder) {
        conditions.push(eq(inboundEmails.folderId, inboxFolder.id));
      }
    }

    if (query.search) {
      const pattern = `%${escapeIlike(query.search)}%`;
      conditions.push(
        or(
          ilike(inboundEmails.fromAddress, pattern),
          ilike(inboundEmails.fromName, pattern),
          ilike(inboundEmails.subject, pattern),
        ),
      );
    }

    if (query.filter === "unread") {
      conditions.push(eq(inboundEmails.isRead, false));
    } else if (query.filter === "starred") {
      conditions.push(eq(inboundEmails.isStarred, true));
    } else if (query.filter === "archived") {
      conditions.push(eq(inboundEmails.isArchived, true));
    }

    if (query.domain_id) {
      conditions.push(eq(inboundEmails.domainId, query.domain_id));
    }

    const whereClause = and(...conditions);

    const [totalResult] = await db.select({ count: count() }).from(inboundEmails).where(whereClause);
    const total = Number(totalResult.count);
    const list = await db.select({
      id: inboundEmails.id, accountId: inboundEmails.accountId, domainId: inboundEmails.domainId,
      folderId: inboundEmails.folderId, fromAddress: inboundEmails.fromAddress, fromName: inboundEmails.fromName,
      toAddress: inboundEmails.toAddress, ccAddresses: inboundEmails.ccAddresses, subject: inboundEmails.subject,
      messageId: inboundEmails.messageId, inReplyTo: inboundEmails.inReplyTo, threadId: inboundEmails.threadId,
      references: inboundEmails.references, isRead: inboundEmails.isRead, isStarred: inboundEmails.isStarred,
      isArchived: inboundEmails.isArchived, hasAttachments: inboundEmails.hasAttachments,
      deletedAt: inboundEmails.deletedAt, createdAt: inboundEmails.createdAt,
    }).from(inboundEmails).where(whereClause).orderBy(desc(inboundEmails.createdAt)).limit(query.limit).offset(offset);

    return {
      data: list,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  });

  app.get<{ Params: { id: string } }>("/inbox/:id", async (request) => {
    const db = getDb();
    const { inboundEmails } = await import("../db/schema/index.js");
    const [email] = await db.select().from(inboundEmails)
      .where(and(eq(inboundEmails.id, request.params.id), eq(inboundEmails.accountId, request.account.id)));
    if (!email) throw new (await import("../lib/errors.js")).NotFoundError("Email");
    // Mark as read
    if (!email.isRead) {
      await db.update(inboundEmails).set({ isRead: true }).where(eq(inboundEmails.id, email.id));
    }
    return { data: { ...email, isRead: true } };
  });

  app.patch<{ Params: { id: string } }>("/inbox/:id", async (request) => {
    const db = getDb();
    const { inboundEmails } = await import("../db/schema/index.js");
    const input = z.object({ isRead: z.boolean().optional(), isStarred: z.boolean().optional(), isArchived: z.boolean().optional() }).parse(request.body);
    const [updated] = await db.update(inboundEmails).set(input).where(and(eq(inboundEmails.id, request.params.id), eq(inboundEmails.accountId, request.account.id))).returning();
    if (!updated) throw new (await import("../lib/errors.js")).NotFoundError("Email");
    return { data: updated };
  });

  app.delete<{ Params: { id: string } }>("/inbox/:id", async (request) => {
    const db = getDb();
    const { inboundEmails } = await import("../db/schema/index.js");
    const [deleted] = await db.delete(inboundEmails).where(and(eq(inboundEmails.id, request.params.id), eq(inboundEmails.accountId, request.account.id))).returning();
    if (!deleted) throw new (await import("../lib/errors.js")).NotFoundError("Email");
    return { data: { success: true } };
  });

  // --- Domains ---
  app.get("/domains", async (request) => {
    const list = await domainService.listDomains(request.account.id);
    return { data: list.map(domainService.formatDomainResponse) };
  });

  app.post("/domains", async (request, reply) => {
    const { name, mode } = z.object({ name: z.string().min(1), mode: z.enum(["send", "receive", "both"]).optional().default("both") }).parse(request.body);
    const domain = await domainService.createDomain(request.account.id, { name, mode });
    try { await getDnsVerifyQueue().add("dns-verify", { domainId: domain.id, attempt: 0, startedAt: Date.now() }, { delay: 60_000 }); } catch {}
    return reply.status(201).send({ data: domainService.formatDomainResponse(domain) });
  });

  app.delete<{ Params: { id: string } }>("/domains/:id", async (request) => {
    const deleted = await domainService.deleteDomain(request.account.id, request.params.id);
    return { data: domainService.formatDomainResponse(deleted) };
  });

  app.post<{ Params: { id: string } }>("/domains/:id/verify", async (request) => {
    const domain = await domainService.getDomain(request.account.id, request.params.id);
    const { verifyDnsRecords } = await import("../services/dns.service.js");
    const { getDb } = await import("../db/index.js");
    const { domains: domainsTable } = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");

    // Run verification directly (no Redis dependency)
    const result = await verifyDnsRecords(
      domain.name,
      domain.spfRecord || "",
      domain.dkimSelector || "es1",
      domain.dkimDnsValue || "",
    );

    const allVerified = result.spfVerified && result.dkimVerified && result.dmarcVerified;
    const newStatus = allVerified ? "verified" as const : "pending" as const;

    await domainService.updateDomainVerification(domain.id, {
      spfVerified: result.spfVerified,
      dkimVerified: result.dkimVerified,
      dmarcVerified: result.dmarcVerified,
      mxVerified: result.mxVerified,
      status: newStatus,
    });

    return {
      data: {
        status: newStatus,
        spf: result.spfVerified,
        dkim: result.dkimVerified,
        dmarc: result.dmarcVerified,
        mx: result.mxVerified,
        message: allVerified
          ? "Domain verified successfully!"
          : `Pending: ${[!result.spfVerified && "SPF", !result.dkimVerified && "DKIM", !result.dmarcVerified && "DMARC"].filter(Boolean).join(", ")} not yet detected. DNS propagation can take up to 24 hours.`,
      },
    };
  });

  // DNS provider detection
  app.get<{ Params: { id: string } }>("/domains/:id/detect-provider", async (request) => {
    const domain = await domainService.getDomain(request.account.id, request.params.id);
    const { detectDnsProvider } = await import("../services/dns-providers.service.js");
    const provider = await detectDnsProvider(domain.name);
    // Check if credentials are already saved
    const hasSaved = !!(domain as any).dnsProvider;
    return { data: { provider, savedProvider: (domain as any).dnsProvider || null, hasSavedCredentials: hasSaved } };
  });

  // DNS auto-setup
  app.post<{ Params: { id: string } }>("/domains/:id/auto-setup", async (request) => {
    const domain = await domainService.getDomain(request.account.id, request.params.id);
    const formatted = domainService.formatDomainResponse(domain);
    const input = z.object({
      provider: z.enum(["godaddy", "cloudflare"]),
      godaddy_key: z.string().optional(),
      godaddy_secret: z.string().optional(),
      cloudflare_token: z.string().optional(),
      cloudflare_zone_id: z.string().optional(),
    }).parse(request.body);

    const { encryptPrivateKey, decryptPrivateKey } = await import("../lib/crypto.js");
    const config = getConfig();
    const db = getDb();
    const { domains: domainsTable } = await import("../db/schema/index.js");
    const encKey = (k: string) => encryptPrivateKey(k, config.ENCRYPTION_KEY);
    const decKey = (k: string) => decryptPrivateKey(k, config.ENCRYPTION_KEY);

    // Resolve credentials: prefer newly submitted, fall back to saved (decrypted)
    let apiGodaddyKey = input.godaddy_key || "";
    let apiGodaddySecret = input.godaddy_secret || "";
    let apiCloudflareToken = input.cloudflare_token || "";
    let apiCloudflareZoneId = input.cloudflare_zone_id || "";

    try {
      if (input.provider === "godaddy") {
        if (!apiGodaddyKey && domain.dnsProviderKey) apiGodaddyKey = decKey(domain.dnsProviderKey);
        if (!apiGodaddySecret && domain.dnsProviderSecret) apiGodaddySecret = decKey(domain.dnsProviderSecret);
      } else if (input.provider === "cloudflare") {
        if (!apiCloudflareToken && domain.dnsProviderKey) apiCloudflareToken = decKey(domain.dnsProviderKey);
        if (!apiCloudflareZoneId && domain.dnsProviderZoneId) apiCloudflareZoneId = domain.dnsProviderZoneId;
      }
    } catch {
      throw new (await import("../lib/errors.js")).ValidationError("Failed to decrypt saved credentials — please re-enter them.");
    }

    // Only save new credentials to DB — never overwrite with empty values
    const updateFields: Record<string, any> = { dnsProvider: input.provider, updatedAt: new Date() };
    if (input.provider === "godaddy") {
      if (input.godaddy_key) updateFields.dnsProviderKey = encKey(input.godaddy_key);
      if (input.godaddy_secret) updateFields.dnsProviderSecret = encKey(input.godaddy_secret);
    } else if (input.provider === "cloudflare") {
      if (input.cloudflare_token) updateFields.dnsProviderKey = encKey(input.cloudflare_token);
      if (input.cloudflare_zone_id) updateFields.dnsProviderZoneId = input.cloudflare_zone_id;
    }
    await db.update(domainsTable).set(updateFields).where(eq(domainsTable.id, domain.id));

    const { setupDnsRecords } = await import("../services/dns-providers.service.js");
    const result = await setupDnsRecords(domain.name, formatted.records, {
      provider: input.provider,
      godaddyKey: apiGodaddyKey,
      godaddySecret: apiGodaddySecret,
      cloudflareToken: apiCloudflareToken,
      cloudflareZoneId: apiCloudflareZoneId,
    });

    // Trigger verification after auto-setup
    if (result.success) {
      try { await getDnsVerifyQueue().add("dns-verify", { domainId: domain.id, attempt: 0, startedAt: Date.now() }, { delay: 10_000 }); } catch {}
    }

    return { data: result };
  });

  // Test GoDaddy/Cloudflare credentials before running setup
  app.post<{ Params: { id: string } }>("/domains/:id/test-credentials", async (request) => {
    const domain = await domainService.getDomain(request.account.id, request.params.id);
    const input = z.object({
      provider: z.enum(["godaddy", "cloudflare"]),
      godaddy_key: z.string().optional(),
      godaddy_secret: z.string().optional(),
      cloudflare_token: z.string().optional(),
      cloudflare_zone_id: z.string().optional(),
    }).parse(request.body);

    const { decryptPrivateKey } = await import("../lib/crypto.js");
    const config = getConfig();

    if (input.provider === "godaddy") {
      let key = "", secret = "";
      try {
        key = input.godaddy_key || (domain.dnsProviderKey ? decryptPrivateKey(domain.dnsProviderKey, config.ENCRYPTION_KEY) : "");
        secret = input.godaddy_secret || (domain.dnsProviderSecret ? decryptPrivateKey(domain.dnsProviderSecret, config.ENCRYPTION_KEY) : "");
      } catch {
        return { data: { success: false, error: "Failed to decrypt saved credentials. They may be corrupted — please re-enter them." } };
      }

      if (!key || !secret) return { data: { success: false, error: "API key and secret are required" } };

      const res = await fetch(`https://api.godaddy.com/v1/domains/${domain.name}/records`, {
        headers: { Authorization: `sso-key ${key}:${secret}` },
      });
      const body = await res.text();

      if (!res.ok) {
        let msg = body;
        try { msg = JSON.parse(body)?.message || JSON.parse(body)?.description || body; } catch {}
        const hints: Record<number, string> = {
          401: "Invalid API key or secret. Make sure you're using Production keys (not OTE/test keys) from developer.godaddy.com/keys.",
          403: "Access denied — the domain may be in a different GoDaddy account, or your API key needs 'Domain - Edit DNS' permission.",
          404: `Domain not found. Is ${domain.name} registered in the same GoDaddy account that issued this API key?`,
        };
        return { data: { success: false, status: res.status, error: msg, hint: hints[res.status] || "" } };
      }

      let records: any[] = [];
      try { records = JSON.parse(body); } catch {}
      return { data: { success: true, message: `Connected! Found ${records.length} existing DNS records on ${domain.name}.` } };
    }

    if (input.provider === "cloudflare") {
      let token = "", zoneId = "";
      try {
        token = input.cloudflare_token || (domain.dnsProviderKey ? decryptPrivateKey(domain.dnsProviderKey, config.ENCRYPTION_KEY) : "");
      } catch {
        return { data: { success: false, error: "Failed to decrypt saved credentials. They may be corrupted — please re-enter them." } };
      }
      zoneId = input.cloudflare_zone_id || domain.dnsProviderZoneId || "";

      if (!token || !zoneId) return { data: { success: false, error: "API token and Zone ID are required" } };

      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?per_page=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({})) as any;

      if (!res.ok || !body.success) {
        const msg = body.errors?.[0]?.message || "Authentication failed";
        return { data: { success: false, status: res.status, error: msg, hint: "Check that your API token has 'Zone DNS Edit' permission and the Zone ID is correct." } };
      }
      return { data: { success: true, message: `Connected! Cloudflare zone accessible.` } };
    }

    return { data: { success: false, error: "Unsupported provider" } };
  });

  // Debug: read current GoDaddy DNS records for a domain
  app.get<{ Params: { id: string } }>("/domains/:id/dns-check", async (request) => {
    const domain = await domainService.getDomain(request.account.id, request.params.id);

    // Try to read GoDaddy records if credentials exist
    let godaddyRecords = null;
    let godaddyError = null;
    if ((domain as any).dnsProviderKey && (domain as any).dnsProvider === "godaddy") {
      try {
        const { decryptPrivateKey } = await import("../lib/crypto.js");
        const config = getConfig();
        const key = decryptPrivateKey((domain as any).dnsProviderKey, config.ENCRYPTION_KEY);
        const secret = (domain as any).dnsProviderSecret ? decryptPrivateKey((domain as any).dnsProviderSecret, config.ENCRYPTION_KEY) : "";

        const res = await fetch(`https://api.godaddy.com/v1/domains/${domain.name}/records`, {
          headers: { Authorization: `sso-key ${key}:${secret}` },
        });
        const body = await res.text();
        if (res.ok) {
          godaddyRecords = JSON.parse(body);
        } else {
          godaddyError = `${res.status}: ${body}`;
        }
      } catch (e: any) {
        godaddyError = e.message;
      }
    }

    // Also do a direct DNS lookup
    const dns = await import("node:dns/promises");
    let dnsLookup: any = {};
    try { dnsLookup.txt = await dns.resolveTxt(domain.name); } catch (e: any) { dnsLookup.txt = e.code; }
    try { dnsLookup.mx = await dns.resolveMx(domain.name); } catch (e: any) { dnsLookup.mx = e.code; }
    try { dnsLookup.dkim = await dns.resolveTxt(`${domain.dkimSelector || "es1"}._domainkey.${domain.name}`); } catch (e: any) { dnsLookup.dkim = e.code; }
    try { dnsLookup.dmarc = await dns.resolveTxt(`_dmarc.${domain.name}`); } catch (e: any) { dnsLookup.dmarc = e.code; }

    return { data: { domain: domain.name, godaddyRecords, godaddyError, dnsLookup } };
  });

  // --- API Keys ---
  app.get("/api-keys", async (request) => {
    const keys = await apiKeyService.listApiKeys(request.account.id);
    return { data: keys.map(apiKeyService.formatApiKeyResponse) };
  });

  app.post("/api-keys", async (request, reply) => {
    const input = z.object({ name: z.string().min(1).max(255) }).parse(request.body);
    const { apiKey, fullKey } = await apiKeyService.createApiKey(request.account.id, { name: input.name, permissions: {}, rate_limit: 60 });
    return reply.status(201).send({ data: { ...apiKeyService.formatApiKeyResponse(apiKey), key: fullKey } });
  });

  app.delete<{ Params: { id: string } }>("/api-keys/:id", async (request) => {
    const revoked = await apiKeyService.revokeApiKey(request.account.id, request.params.id);
    return { data: apiKeyService.formatApiKeyResponse(revoked) };
  });

  // --- Webhooks ---
  app.get("/webhooks", async (request) => {
    const list = await webhookService.listWebhooks(request.account.id);
    return { data: list.map(webhookService.formatWebhookResponse) };
  });

  app.post("/webhooks", async (request, reply) => {
    const input = z.object({
      url: z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), { message: "Webhook URL must use http:// or https://" }),
      events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
    }).parse(request.body);
    const webhook = await webhookService.createWebhook(request.account.id, { url: input.url, events: input.events as any });
    return reply.status(201).send({ data: webhookService.formatWebhookResponse(webhook) });
  });

  app.delete<{ Params: { id: string } }>("/webhooks/:id", async (request) => {
    const deleted = await webhookService.deleteWebhook(request.account.id, request.params.id);
    return { data: webhookService.formatWebhookResponse(deleted) };
  });

  // POST /dashboard/webhooks/:id/test — send a test event to the webhook URL
  app.post<{ Params: { id: string } }>("/webhooks/:id/test", async (request) => {
    const webhook = await webhookService.getWebhook(request.account.id, request.params.id);

    const testPayload = {
      type: "email.sent",
      created_at: new Date().toISOString(),
      data: {
        email_id: "00000000-0000-0000-0000-000000000000",
        from: "test@example.com",
        to: ["recipient@example.com"],
        subject: "Test webhook event",
        status: "sent",
        created_at: new Date().toISOString(),
      },
    };

    const body = JSON.stringify(testPayload);
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "EmailService-Webhook/1.0 (test)",
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      responseStatus = response.status;
      responseBody = (await response.text()).substring(0, 1000);
      success = response.ok;
    } catch (error) {
      responseBody = error instanceof Error ? error.message : "Unknown error";
    }

    return {
      data: {
        success,
        url: webhook.url,
        response_status: responseStatus,
        response_body: responseBody,
      },
    };
  });

  // --- Webhook Deliveries ---
  app.get<{ Params: { id: string } }>("/webhooks/:id/deliveries", async (request) => {
    const webhook = await webhookService.getWebhook(request.account.id, request.params.id);
    const deliveries = await webhookService.listDeliveries(request.account.id, webhook.id);
    return { data: deliveries.map(webhookService.formatDeliveryResponse) };
  });

  // --- Audiences ---
  app.get("/audiences", async (request) => {
    const list = await audienceService.listAudiences(request.account.id);
    return { data: list.map(audienceService.formatAudienceResponse) };
  });

  app.post("/audiences", async (request, reply) => {
    const input = z.object({ name: z.string().min(1) }).parse(request.body);
    const audience = await audienceService.createAudience(request.account.id, input);
    return reply.status(201).send({ data: audienceService.formatAudienceResponse(audience) });
  });

  app.delete<{ Params: { id: string } }>("/audiences/:id", async (request) => {
    const deleted = await audienceService.deleteAudience(request.account.id, request.params.id);
    return { data: audienceService.formatAudienceResponse(deleted) };
  });

  app.get<{ Params: { id: string } }>("/audiences/:id/contacts", async (request) => {
    const { paginationSchema } = await import("../lib/pagination.js");
    const pagination = paginationSchema.parse(request.query);
    const result = await audienceService.listContacts(request.account.id, request.params.id, pagination);
    return { data: result.data.map(audienceService.formatContactResponse), pagination: result.pagination };
  });

  app.post<{ Params: { id: string } }>("/audiences/:id/contacts", async (request, reply) => {
    const input = z.object({
      email: z.string().email(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      subscribed: z.boolean().optional().default(true),
    }).parse(request.body);
    const contact = await audienceService.createContact(request.account.id, request.params.id, input);
    return reply.status(201).send({ data: audienceService.formatContactResponse(contact) });
  });

  app.patch<{ Params: { id: string; contactId: string } }>("/audiences/:id/contacts/:contactId", async (request) => {
    const input = z.object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      subscribed: z.boolean().optional(),
    }).parse(request.body);
    const updated = await audienceService.updateContact(request.account.id, request.params.id, request.params.contactId, input);
    return { data: audienceService.formatContactResponse(updated) };
  });

  app.delete<{ Params: { id: string; contactId: string } }>("/audiences/:id/contacts/:contactId", async (request) => {
    const deleted = await audienceService.deleteContact(request.account.id, request.params.id, request.params.contactId);
    return { data: audienceService.formatContactResponse(deleted) };
  });

  // CSV Export
  app.get<{ Params: { id: string } }>("/audiences/:id/contacts/export", async (request, reply) => {
    const { contacts: contactsTable } = await import("../db/schema/index.js");
    const audience = await audienceService.getAudience(request.account.id, request.params.id);
    const allContacts = await getDb().select().from(contactsTable).where(eq(contactsTable.audienceId, audience.id));

    const header = "email,first_name,last_name,subscribed\n";
    const rows = allContacts.map(c => {
      const formatted = audienceService.formatContactResponse(c);
      return `${formatted.email},${formatted.first_name || ""},${formatted.last_name || ""},${formatted.subscribed}`;
    }).join("\n");

    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", `attachment; filename="${audience.name}-contacts.csv"`);
    return header + rows;
  });

  // CSV Import
  app.post<{ Params: { id: string } }>("/audiences/:id/contacts/import", async (request, reply) => {
    const audience = await audienceService.getAudience(request.account.id, request.params.id);
    const { csv } = z.object({ csv: z.string().min(1) }).parse(request.body);

    const lines = csv.split("\n").map(l => l.trim()).filter(Boolean);
    const startIdx = lines[0]?.toLowerCase().includes("email") ? 1 : 0;

    const { contacts: contactsTable } = await import("../db/schema/index.js");
    const rows: { audienceId: string; email: string; firstName: string | null; lastName: string | null; subscribed: boolean }[] = [];
    let skipped = 0;

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(",").map(p => p.trim().replace(/^"|"$/g, ""));
      const email = parts[0];
      if (!email || !email.includes("@")) { skipped++; continue; }
      rows.push({
        audienceId: audience.id,
        email,
        firstName: parts[1] || null,
        lastName: parts[2] || null,
        subscribed: parts[3] !== "false",
      });
    }

    let imported = 0;
    if (rows.length > 0) {
      // Batch insert in chunks of 500, skip duplicates
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const result = await getDb().insert(contactsTable).values(chunk).onConflictDoNothing().returning({ id: contactsTable.id });
        imported += result.length;
      }
      skipped += rows.length - imported;
    }

    return reply.status(200).send({ data: { imported, skipped, total: lines.length - startIdx } });
  });

  // --- Broadcasts ---
  app.get("/broadcasts", async (request) => {
    const { paginationSchema } = await import("../lib/pagination.js");
    const pagination = paginationSchema.parse(request.query);
    const result = await broadcastService.listBroadcasts(request.account.id, pagination);
    return { data: result.data.map(broadcastService.formatBroadcastResponse), pagination: result.pagination };
  });

  app.post("/broadcasts", async (request, reply) => {
    const input = z.object({
      audience_id: z.string().uuid(),
      name: z.string().min(1),
      from: z.string().min(1),
      subject: z.string().min(1),
      html: z.string().optional(),
      text: z.string().optional(),
    }).refine((d) => d.html || d.text, {
      message: "At least one of html or text is required",
      path: ["html"],
    }).parse(request.body);
    const broadcast = await broadcastService.createBroadcast(request.account.id, input);
    return reply.status(201).send({ data: broadcastService.formatBroadcastResponse(broadcast) });
  });

  app.get<{ Params: { id: string } }>("/broadcasts/:id", async (request) => {
    const broadcast = await broadcastService.getBroadcast(request.account.id, request.params.id);
    return { data: broadcastService.formatBroadcastResponse(broadcast) };
  });

  app.delete<{ Params: { id: string } }>("/broadcasts/:id", async (request) => {
    const deleted = await broadcastService.deleteBroadcast(request.account.id, request.params.id);
    return { data: broadcastService.formatBroadcastResponse(deleted) };
  });

  // --- Warmup ---
  app.get("/warmup", async (request) => {
    const list = await warmupService.listWarmups(request.account.id);
    return { data: list.map(warmupService.formatWarmupResponse) };
  });

  app.post("/warmup", async (request, reply) => {
    const input = z.object({
      domain_id: z.string().uuid(),
      total_days: z.number().int().min(7).max(90).optional(),
      from_address: z.string().optional(),
      extra_recipients: z.array(z.string().email()).max(20).optional(),
    }).parse(request.body);
    const schedule = await warmupService.startWarmup(request.account.id, input.domain_id, {
      totalDays: input.total_days,
      fromAddress: input.from_address,
      externalRecipients: input.extra_recipients,
    });
    return reply.status(201).send({ data: warmupService.formatWarmupResponse(schedule) });
  });

  app.get<{ Params: { id: string } }>("/warmup/:id", async (request) => {
    const schedule = await warmupService.getWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  app.get<{ Params: { id: string } }>("/warmup/:id/stats", async (request) => {
    const stats = await warmupService.getWarmupStats(request.account.id, request.params.id);
    return { data: stats };
  });

  app.post<{ Params: { id: string } }>("/warmup/:id/pause", async (request) => {
    const schedule = await warmupService.pauseWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  app.post<{ Params: { id: string } }>("/warmup/:id/resume", async (request) => {
    const schedule = await warmupService.resumeWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  app.delete<{ Params: { id: string } }>("/warmup/:id", async (request) => {
    const schedule = await warmupService.cancelWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  // --- Mailboxes ---

  app.get("/mailboxes/providers", async () => {
    return { data: mailboxService.PROVIDER_PRESETS };
  });

  app.get("/mailboxes", async (request) => {
    const list = await mailboxService.listMailboxes(request.account.id);
    return { data: list.map(mailboxService.formatMailboxResponse) };
  });

  app.post("/mailboxes", async (request, reply) => {
    const input = z.object({
      display_name: z.string().min(1).max(255),
      email: z.string().email(),
      provider: z.enum(["gmail", "outlook", "yahoo", "icloud", "custom"]).default("custom"),
      smtp_host: z.string().min(1),
      smtp_port: z.number().int().min(1).max(65535).default(587),
      smtp_secure: z.boolean().default(false),
      imap_host: z.string().min(1),
      imap_port: z.number().int().min(1).max(65535).default(993),
      imap_secure: z.boolean().default(true),
      username: z.string().min(1),
      password: z.string().min(1),
    }).parse(request.body);

    const mailbox = await mailboxService.createMailbox(request.account.id, {
      displayName: input.display_name,
      email: input.email,
      provider: input.provider,
      smtpHost: input.smtp_host,
      smtpPort: input.smtp_port,
      smtpSecure: input.smtp_secure,
      imapHost: input.imap_host,
      imapPort: input.imap_port,
      imapSecure: input.imap_secure,
      username: input.username,
      password: input.password,
    });
    return reply.status(201).send({ data: mailboxService.formatMailboxResponse(mailbox) });
  });

  app.patch<{ Params: { id: string } }>("/mailboxes/:id", async (request) => {
    const input = z.object({
      display_name: z.string().min(1).max(255).optional(),
      smtp_host: z.string().min(1).optional(),
      smtp_port: z.number().int().min(1).max(65535).optional(),
      smtp_secure: z.boolean().optional(),
      imap_host: z.string().min(1).optional(),
      imap_port: z.number().int().min(1).max(65535).optional(),
      imap_secure: z.boolean().optional(),
      username: z.string().min(1).optional(),
      password: z.string().min(1).optional(),
    }).parse(request.body);

    const mailbox = await mailboxService.updateMailbox(request.account.id, request.params.id, {
      displayName: input.display_name,
      smtpHost: input.smtp_host,
      smtpPort: input.smtp_port,
      smtpSecure: input.smtp_secure,
      imapHost: input.imap_host,
      imapPort: input.imap_port,
      imapSecure: input.imap_secure,
      username: input.username,
      password: input.password,
    });
    return { data: mailboxService.formatMailboxResponse(mailbox) };
  });

  app.delete<{ Params: { id: string } }>("/mailboxes/:id", async (request, reply) => {
    await mailboxService.deleteMailbox(request.account.id, request.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/mailboxes/:id/test", async (request) => {
    const result = await mailboxService.testMailboxConnection(request.account.id, request.params.id);
    return { data: result };
  });

  app.post<{ Params: { id: string } }>("/mailboxes/:id/sync", async (request) => {
    const mailbox = await mailboxService.getMailbox(request.account.id, request.params.id);
    const { getMailboxSyncQueue, isRedisConfigured } = await import("../queues/index.js");
    if (isRedisConfigured()) {
      await getMailboxSyncQueue().add("manual-sync", { mailboxId: mailbox.id });
    }
    return { data: { queued: true } };
  });

  // --- Templates ---
  app.get("/templates", async (request) => {
    const { paginationSchema } = await import("../lib/pagination.js");
    const pagination = paginationSchema.parse(request.query);
    const result = await templateService.listTemplates(request.account.id, pagination);
    return { data: result.data.map(templateService.formatTemplateResponse), pagination: result.pagination };
  });

  app.post("/templates", async (request, reply) => {
    const { createTemplateSchema } = await import("../schemas/template.schema.js");
    const input = createTemplateSchema.parse(request.body);
    const template = await templateService.createTemplate(request.account.id, input);
    return reply.status(201).send({ data: templateService.formatTemplateResponse(template) });
  });

  app.get<{ Params: { id: string } }>("/templates/:id", async (request) => {
    const template = await templateService.getTemplate(request.account.id, request.params.id);
    return { data: templateService.formatTemplateResponse(template) };
  });

  app.patch<{ Params: { id: string } }>("/templates/:id", async (request) => {
    const { updateTemplateSchema } = await import("../schemas/template.schema.js");
    const input = updateTemplateSchema.parse(request.body);
    const updated = await templateService.updateTemplate(request.account.id, request.params.id, input);
    return { data: templateService.formatTemplateResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/templates/:id", async (request) => {
    const deleted = await templateService.deleteTemplate(request.account.id, request.params.id);
    return { data: templateService.formatTemplateResponse(deleted) };
  });

  // --- Global Search ---
  app.get("/search", async (request) => {
    const { q } = z.object({ q: z.string().min(1).max(200) }).parse(request.query);
    const db = getDb();
    const accountId = request.account.id;
    const pattern = `%${escapeIlike(q)}%`;
    const limit = 5;

    // Search emails
    const emailResults = await db.select({
      id: emails.id,
      fromAddress: emails.fromAddress,
      subject: emails.subject,
      status: emails.status,
      createdAt: emails.createdAt,
    }).from(emails).where(
      and(
        eq(emails.accountId, accountId),
        or(ilike(emails.fromAddress, pattern), ilike(emails.subject, pattern)),
      ),
    ).orderBy(desc(emails.createdAt)).limit(limit);

    // Search inbound emails
    const inboxResults = await db.select({
      id: inboundEmails.id,
      fromAddress: inboundEmails.fromAddress,
      subject: inboundEmails.subject,
      createdAt: inboundEmails.createdAt,
    }).from(inboundEmails).where(
      and(
        eq(inboundEmails.accountId, accountId),
        or(ilike(inboundEmails.fromAddress, pattern), ilike(inboundEmails.subject, pattern)),
      ),
    ).orderBy(desc(inboundEmails.createdAt)).limit(limit);

    // Search domains
    const domainResults = await db.select({
      id: domains.id,
      name: domains.name,
      status: domains.status,
    }).from(domains).where(
      and(eq(domains.accountId, accountId), ilike(domains.name, pattern)),
    ).limit(limit);

    // Search contacts across all audiences
    const { contacts } = await import("../db/schema/index.js");
    const contactResults = await db.select({
      id: contacts.id,
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      audienceId: contacts.audienceId,
    }).from(contacts)
      .innerJoin(audiences, eq(contacts.audienceId, audiences.id))
      .where(
        and(
          eq(audiences.accountId, accountId),
          or(
            ilike(contacts.email, pattern),
            ilike(contacts.firstName, pattern),
            ilike(contacts.lastName, pattern),
          ),
        ),
      ).limit(limit);

    // Search templates
    const { templates } = await import("../db/schema/index.js");
    const templateResults = await db.select({
      id: templates.id,
      name: templates.name,
      subject: templates.subject,
    }).from(templates).where(
      and(
        eq(templates.accountId, accountId),
        or(ilike(templates.name, pattern), ilike(templates.subject, pattern)),
      ),
    ).limit(limit);

    return {
      data: {
        emails: emailResults,
        inbox: inboxResults,
        domains: domainResults,
        contacts: contactResults,
        templates: templateResults,
      },
    };
  });

  // --- Suppressions ---
  app.get("/suppressions", async (request) => {
    const { listSuppressions, formatSuppressionResponse } = await import("../services/suppression.service.js");
    const list = await listSuppressions(request.account.id);
    return { data: list.map(formatSuppressionResponse) };
  });

  app.post("/suppressions", async (request, reply) => {
    const { addSuppression, formatSuppressionResponse } = await import("../services/suppression.service.js");
    const { email, reason } = z.object({
      email: z.string().email(),
      reason: z.enum(["bounce", "complaint", "unsubscribe", "manual"]).default("manual"),
    }).parse(request.body);
    const suppression = await addSuppression(request.account.id, email, reason);
    return reply.status(201).send({ data: formatSuppressionResponse(suppression) });
  });

  app.delete<{ Params: { id: string } }>("/suppressions/:id", async (request) => {
    const { removeSuppression, formatSuppressionResponse } = await import("../services/suppression.service.js");
    const removed = await removeSuppression(request.account.id, request.params.id);
    return { data: formatSuppressionResponse(removed) };
  });

  // --- Activity Feed (SSE) ---
  app.get("/activity/stream", async (request, reply) => {
    const accountId = request.account.id;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send initial batch of recent events
    const db = getDb();
    const { emailEvents } = await import("../db/schema/index.js");
    const recent = await db.select({
      id: emailEvents.id,
      type: emailEvents.type,
      emailId: emailEvents.emailId,
      data: emailEvents.data,
      createdAt: emailEvents.createdAt,
    }).from(emailEvents)
      .where(eq(emailEvents.accountId, accountId))
      .orderBy(desc(emailEvents.createdAt))
      .limit(20);

    reply.raw.write(`data: ${JSON.stringify({ type: "init", events: recent.map(e => ({
      id: e.id,
      type: e.type,
      email_id: e.emailId,
      data: e.data,
      created_at: e.createdAt?.toISOString(),
    })) })}\n\n`);

    // Poll for new events every 5 seconds
    let lastId = recent[0]?.id || null;
    const interval = setInterval(async () => {
      try {
        const conditions: any[] = [eq(emailEvents.accountId, accountId)];
        if (lastId) {
          conditions.push(sql`${emailEvents.createdAt} > (SELECT created_at FROM email_events WHERE id = ${lastId})`);
        }
        const newEvents = await db.select({
          id: emailEvents.id,
          type: emailEvents.type,
          emailId: emailEvents.emailId,
          data: emailEvents.data,
          createdAt: emailEvents.createdAt,
        }).from(emailEvents)
          .where(and(...conditions))
          .orderBy(emailEvents.createdAt)
          .limit(50);

        for (const e of newEvents) {
          reply.raw.write(`data: ${JSON.stringify({
            type: "event",
            event: {
              id: e.id,
              type: e.type,
              email_id: e.emailId,
              data: e.data,
              created_at: e.createdAt?.toISOString(),
            },
          })}\n\n`);
          lastId = e.id;
        }
      } catch {
        // Connection might be closed
      }
    }, 5000);

    // Keepalive ping every 30s
    const ping = setInterval(() => {
      try { reply.raw.write(": ping\n\n"); } catch {}
    }, 30000);

    // Auto-close after 5 minutes to prevent resource exhaustion
    const maxDuration = setTimeout(() => {
      clearInterval(interval);
      clearInterval(ping);
      try { reply.raw.end(); } catch {}
    }, 5 * 60 * 1000);

    request.raw.on("close", () => {
      clearTimeout(maxDuration);
      clearInterval(interval);
      clearInterval(ping);
    });
  });

  // --- Usage ---
  app.get("/usage", async (request) => {
    const db = getDb();
    const accountId = request.account.id;

    // Current month usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monthUsage] = await db.select({
      emailsSent: sql<number>`count(*) filter (where ${emails.status} in ('sent','delivered','bounced','failed','complained'))::int`,
      emailsDelivered: sql<number>`count(*) filter (where ${emails.status} = 'delivered')::int`,
    }).from(emails).where(and(
      eq(emails.accountId, accountId),
      sql`${emails.createdAt} >= ${startOfMonth.toISOString()}::timestamp`,
    ));

    // Last 6 months breakdown
    const monthlyBreakdown = await db.select({
      month: sql<string>`to_char(${emails.createdAt}, 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
    }).from(emails)
      .where(and(
        eq(emails.accountId, accountId),
        sql`${emails.createdAt} > now() - interval '6 months'`,
      ))
      .groupBy(sql`to_char(${emails.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${emails.createdAt}, 'YYYY-MM')`);

    // Counts
    const [domainCount] = await db.select({ count: count() }).from(domains).where(eq(domains.accountId, accountId));
    const [audienceCount] = await db.select({ count: count() }).from(audiences).where(eq(audiences.accountId, accountId));
    const { contacts } = await import("../db/schema/index.js");
    const { templates } = await import("../db/schema/index.js");
    const [contactCount] = await db.select({ count: count() }).from(contacts)
      .innerJoin(audiences, eq(contacts.audienceId, audiences.id))
      .where(eq(audiences.accountId, accountId));
    const [templateCount] = await db.select({ count: count() }).from(templates).where(eq(templates.accountId, accountId));

    return {
      data: {
        current_month: {
          emails_sent: monthUsage.emailsSent || 0,
          emails_delivered: monthUsage.emailsDelivered || 0,
          period: startOfMonth.toISOString().slice(0, 7),
        },
        monthly: monthlyBreakdown.map(m => ({ month: m.month, count: m.count })),
        resources: {
          domains: Number(domainCount.count),
          audiences: Number(audienceCount.count),
          contacts: Number(contactCount.count),
          templates: Number(templateCount.count),
        },
      },
    };
  });

  // --- Deliverability ---
  app.get("/deliverability", async (request) => {
    const db = getDb();
    const accountId = request.account.id;
    const [totals] = await db.select({
      total: count(),
      sent: sql<number>`count(*) filter (where ${emails.status} = 'sent')::int`,
      delivered: sql<number>`count(*) filter (where ${emails.status} = 'delivered')::int`,
      bounced: sql<number>`count(*) filter (where ${emails.status} = 'bounced')::int`,
      failed: sql<number>`count(*) filter (where ${emails.status} = 'failed')::int`,
      complained: sql<number>`count(*) filter (where ${emails.status} = 'complained')::int`,
      totalOpens: sql<number>`coalesce(sum(${emails.openCount}), 0)::int`,
      totalClicks: sql<number>`coalesce(sum(${emails.clickCount}), 0)::int`,
    }).from(emails).where(eq(emails.accountId, accountId));

    const daily = await db.select({
      date: sql<string>`date(${emails.createdAt})`,
      sent: sql<number>`count(*) filter (where ${emails.status} in ('sent','delivered'))::int`,
      bounced: sql<number>`count(*) filter (where ${emails.status} = 'bounced')::int`,
      complained: sql<number>`count(*) filter (where ${emails.status} = 'complained')::int`,
      opens: sql<number>`coalesce(sum(${emails.openCount}), 0)::int`,
    }).from(emails)
      .where(and(eq(emails.accountId, accountId), sql`${emails.createdAt} > now() - interval '7 days'`))
      .groupBy(sql`date(${emails.createdAt})`)
      .orderBy(sql`date(${emails.createdAt})`);

    const { suppressions } = await import("../db/schema/index.js");
    const [suppCount] = await db.select({ count: count() }).from(suppressions).where(eq(suppressions.accountId, accountId));
    const t = totals;
    const totalSent = (t.sent || 0) + (t.delivered || 0);
    return {
      data: {
        score: calculateReputationScore(t),
        totals: { sent: totalSent, delivered: t.delivered || 0, bounced: t.bounced || 0, failed: t.failed || 0, complained: t.complained || 0, opens: t.totalOpens || 0, clicks: t.totalClicks || 0, suppressions: Number(suppCount.count) },
        rates: {
          delivery: totalSent > 0 ? (t.delivered || 0) / totalSent : 0,
          bounce: totalSent > 0 ? (t.bounced || 0) / totalSent : 0,
          complaint: totalSent > 0 ? (t.complained || 0) / totalSent : 0,
          open: totalSent > 0 ? (t.totalOpens || 0) / totalSent : 0,
          click: totalSent > 0 ? (t.totalClicks || 0) / totalSent : 0,
        },
        daily,
      },
    };
  });

  // --- API Docs metadata ---
  app.get("/api-info", async (request) => {
    return {
      data: {
        role: request.account.role,
        version: "1.4.0",
        updated: "2026-03-19",
      },
    };
  });

  // --- Folders ---
  app.get("/folders", async (request) => {
    const folderService = await import("../services/folder.service.js");
    const folders = await folderService.listFolders(request.account.id);
    const unreadCounts = await folderService.getUnreadCounts(request.account.id);
    return {
      data: folders.map((f) => ({
        ...folderService.formatFolderResponse(f),
        unread_count: unreadCounts[f.id] || 0,
      })),
    };
  });

  app.post("/folders", async (request, reply) => {
    const folderService = await import("../services/folder.service.js");
    const { createFolderSchema } = await import("../schemas/folder.schema.js");
    const input = createFolderSchema.parse(request.body);
    const folder = await folderService.createFolder(request.account.id, input);
    return reply.status(201).send({ data: folderService.formatFolderResponse(folder) });
  });

  app.patch<{ Params: { id: string } }>("/folders/:id", async (request) => {
    const folderService = await import("../services/folder.service.js");
    const { updateFolderSchema } = await import("../schemas/folder.schema.js");
    const input = updateFolderSchema.parse(request.body);
    const updated = await folderService.updateFolder(request.account.id, request.params.id, input);
    return { data: folderService.formatFolderResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/folders/:id", async (request) => {
    const folderService = await import("../services/folder.service.js");
    const deleted = await folderService.deleteFolder(request.account.id, request.params.id);
    return { data: folderService.formatFolderResponse(deleted!) };
  });

  // --- Inbox Extended ---
  app.post<{ Params: { id: string } }>("/inbox/:id/move", async (request) => {
    const inboxService = await import("../services/inbox.service.js");
    const { moveEmailSchema } = await import("../schemas/inbox.schema.js");
    const input = moveEmailSchema.parse(request.body);
    const updated = await inboxService.moveToFolder(request.account.id, request.params.id, input.folder_id);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  app.post<{ Params: { id: string } }>("/inbox/:id/restore", async (request) => {
    const inboxService = await import("../services/inbox.service.js");
    const updated = await inboxService.restoreFromTrash(request.account.id, request.params.id);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  app.post("/inbox/bulk", async (request) => {
    const inboxService = await import("../services/inbox.service.js");
    const { bulkActionSchema } = await import("../schemas/inbox.schema.js");
    const input = bulkActionSchema.parse(request.body);
    return { data: await inboxService.bulkAction(request.account.id, input) };
  });

  app.get<{ Params: { id: string } }>("/inbox/:id/attachments", async (request) => {
    const attachmentService = await import("../services/attachment.service.js");
    const attachments = await attachmentService.listAttachments(request.account.id, request.params.id);
    return { data: attachments.map(attachmentService.formatAttachmentResponse) };
  });

  app.get<{ Params: { id: string; aid: string } }>("/inbox/:id/attachments/:aid", async (request, reply) => {
    const attachmentService = await import("../services/attachment.service.js");
    const { metadata, stream } = await attachmentService.getAttachment(request.account.id, request.params.aid);
    reply.header("Content-Type", metadata.contentType);
    reply.header("Content-Disposition", `attachment; filename="${metadata.filename}"`);
    reply.header("Content-Length", metadata.size);
    return reply.send(stream);
  });

  // --- Drafts ---
  app.get("/drafts", async (request) => {
    const draftService = await import("../services/draft.service.js");
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }).parse(request.query);
    return draftService.listDrafts(request.account.id, query);
  });

  app.post("/drafts", async (request, reply) => {
    const draftService = await import("../services/draft.service.js");
    const { saveDraftSchema } = await import("../schemas/draft.schema.js");
    const input = saveDraftSchema.parse(request.body);
    const draft = await draftService.saveDraft(request.account.id, input);
    return reply.status(201).send({ data: draftService.formatDraftResponse(draft) });
  });

  app.get<{ Params: { id: string } }>("/drafts/:id", async (request) => {
    const draftService = await import("../services/draft.service.js");
    const draft = await draftService.getDraft(request.account.id, request.params.id);
    return { data: draftService.formatDraftResponse(draft) };
  });

  app.patch<{ Params: { id: string } }>("/drafts/:id", async (request) => {
    const draftService = await import("../services/draft.service.js");
    const { updateDraftSchema } = await import("../schemas/draft.schema.js");
    const input = updateDraftSchema.parse(request.body);
    const updated = await draftService.updateDraft(request.account.id, request.params.id, input);
    return { data: draftService.formatDraftResponse(updated) };
  });

  app.post<{ Params: { id: string } }>("/drafts/:id/send", async (request) => {
    const draftService = await import("../services/draft.service.js");
    const sent = await draftService.sendDraft(request.account.id, request.params.id);
    return { data: emailService.formatEmailResponse(sent) };
  });

  app.delete<{ Params: { id: string } }>("/drafts/:id", async (request) => {
    const draftService = await import("../services/draft.service.js");
    const deleted = await draftService.deleteDraft(request.account.id, request.params.id);
    return { data: draftService.formatDraftResponse(deleted) };
  });

  // --- Threads ---
  app.get("/threads", async (request) => {
    const threadService = await import("../services/thread.service.js");
    const query = z.object({
      folder_id: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }).parse(request.query);
    return threadService.listThreads(request.account.id, {
      folderId: query.folder_id,
      limit: query.limit,
      cursor: query.cursor,
    });
  });

  app.get<{ Params: { threadId: string } }>("/threads/:threadId", async (request) => {
    const threadService = await import("../services/thread.service.js");
    const thread = await threadService.getThread(request.account.id, request.params.threadId);
    return { data: thread };
  });

  // --- Signatures ---
  app.get("/signatures", async (request) => {
    const signatureService = await import("../services/signature.service.js");
    const list = await signatureService.listSignatures(request.account.id);
    return { data: list.map(signatureService.formatSignatureResponse) };
  });

  app.post("/signatures", async (request, reply) => {
    const signatureService = await import("../services/signature.service.js");
    const { createSignatureSchema } = await import("../schemas/signature.schema.js");
    const input = createSignatureSchema.parse(request.body);
    const signature = await signatureService.createSignature(request.account.id, input);
    return reply.status(201).send({ data: signatureService.formatSignatureResponse(signature) });
  });

  app.patch<{ Params: { id: string } }>("/signatures/:id", async (request) => {
    const signatureService = await import("../services/signature.service.js");
    const { updateSignatureSchema } = await import("../schemas/signature.schema.js");
    const input = updateSignatureSchema.parse(request.body);
    const updated = await signatureService.updateSignature(request.account.id, request.params.id, input);
    return { data: signatureService.formatSignatureResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/signatures/:id", async (request) => {
    const signatureService = await import("../services/signature.service.js");
    const deleted = await signatureService.deleteSignature(request.account.id, request.params.id);
    return { data: signatureService.formatSignatureResponse(deleted) };
  });

  // --- Address Book ---
  app.get("/address-book/autocomplete", async (request) => {
    const addressBookService = await import("../services/address-book.service.js");
    const query = z.object({ q: z.string().min(1) }).parse(request.query);
    const results = await addressBookService.autocomplete(request.account.id, query.q);
    return { data: results };
  });

  app.get("/address-book", async (request) => {
    const addressBookService = await import("../services/address-book.service.js");
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    const list = await addressBookService.listContacts(request.account.id, query.search);
    return { data: list.map(addressBookService.formatAddressBookContactResponse) };
  });

  app.post("/address-book", async (request, reply) => {
    const addressBookService = await import("../services/address-book.service.js");
    const { createAddressBookContactSchema } = await import("../schemas/address-book.schema.js");
    const input = createAddressBookContactSchema.parse(request.body);
    const contact = await addressBookService.addContact(request.account.id, input);
    return reply.status(201).send({ data: addressBookService.formatAddressBookContactResponse(contact) });
  });

  app.get<{ Params: { id: string } }>("/address-book/:id", async (request) => {
    const addressBookService = await import("../services/address-book.service.js");
    const contact = await addressBookService.getContact(request.account.id, request.params.id);
    return { data: addressBookService.formatAddressBookContactResponse(contact) };
  });

  app.patch<{ Params: { id: string } }>("/address-book/:id", async (request) => {
    const addressBookService = await import("../services/address-book.service.js");
    const { updateAddressBookContactSchema } = await import("../schemas/address-book.schema.js");
    const input = updateAddressBookContactSchema.parse(request.body);
    const updated = await addressBookService.updateContact(request.account.id, request.params.id, input);
    return { data: addressBookService.formatAddressBookContactResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/address-book/:id", async (request) => {
    const addressBookService = await import("../services/address-book.service.js");
    const deleted = await addressBookService.deleteContact(request.account.id, request.params.id);
    return { data: addressBookService.formatAddressBookContactResponse(deleted) };
  });

  // --- Team Management ---
  app.get<{ Params: { id: string } }>("/domains/:id/members", async (request) => {
    const teamService = await import("../services/team.service.js");
    const members = await teamService.listDomainMembers(request.account.id, request.params.id);
    return { data: members.map(teamService.formatMemberResponse) };
  });

  app.post<{ Params: { id: string } }>("/domains/:id/members", async (request, reply) => {
    const teamService = await import("../services/team.service.js");
    const { addMemberSchema } = await import("../schemas/team.schema.js");
    const input = addMemberSchema.parse(request.body);
    const result = await teamService.addDomainMember(request.account.id, request.params.id, input);
    if (result.type === "added") {
      return reply.status(201).send({ data: { type: "added", member_id: result.member.id } });
    }
    return reply.status(201).send({
      data: { type: "invited", invitation: teamService.formatInvitationResponse(result.invitation) },
    });
  });

  app.patch<{ Params: { id: string; memberId: string } }>("/domains/:id/members/:memberId", async (request) => {
    const teamService = await import("../services/team.service.js");
    const { updateMemberSchema } = await import("../schemas/team.schema.js");
    const input = updateMemberSchema.parse(request.body);
    const updated = await teamService.updateDomainMember(request.account.id, request.params.id, request.params.memberId, input);
    return { data: updated };
  });

  app.delete<{ Params: { id: string; memberId: string } }>("/domains/:id/members/:memberId", async (request) => {
    const teamService = await import("../services/team.service.js");
    await teamService.removeDomainMember(request.account.id, request.params.id, request.params.memberId);
    return { data: { success: true } };
  });

  app.get<{ Params: { id: string } }>("/domains/:id/invitations", async (request) => {
    const teamService = await import("../services/team.service.js");
    const invitations = await teamService.listInvitations(request.account.id, request.params.id);
    return { data: invitations.map(teamService.formatInvitationResponse) };
  });

  app.post<{ Params: { id: string } }>("/domains/:id/invitations", async (request, reply) => {
    const teamService = await import("../services/team.service.js");
    const { createInvitationSchema } = await import("../schemas/team.schema.js");
    const input = createInvitationSchema.parse(request.body);
    const invitation = await teamService.createInvitation(request.account.id, request.params.id, input);
    return reply.status(201).send({ data: teamService.formatInvitationResponse(invitation) });
  });

  app.delete<{ Params: { id: string; invitationId: string } }>("/domains/:id/invitations/:invitationId", async (request) => {
    const teamService = await import("../services/team.service.js");
    await teamService.revokeInvitation(request.account.id, request.params.id, request.params.invitationId);
    return { data: { success: true } };
  });

  app.get("/my-memberships", async (request) => {
    const teamService = await import("../services/team.service.js");
    const memberships = await teamService.getMyMemberships(request.account.id);
    return { data: memberships };
  });
}
