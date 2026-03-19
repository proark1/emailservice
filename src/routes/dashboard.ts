import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, count, desc, and, isNull } from "drizzle-orm";
import * as authService from "../services/auth.service.js";
import * as domainService from "../services/domain.service.js";
import * as apiKeyService from "../services/api-key.service.js";
import * as webhookService from "../services/webhook.service.js";
import * as emailService from "../services/email.service.js";
import { getDb } from "../db/index.js";
import { emails, domains, apiKeys, webhooks, audiences } from "../db/schema/index.js";
import { ForbiddenError } from "../lib/errors.js";
import { getDnsVerifyQueue } from "../queues/index.js";
import { WEBHOOK_EVENT_TYPES } from "../types/webhook-events.js";

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
    const [e] = await db.select({ count: count() }).from(emails).where(eq(emails.accountId, id));
    const [d] = await db.select({ count: count() }).from(domains).where(eq(domains.accountId, id));
    const [a] = await db.select({ count: count() }).from(apiKeys).where(and(eq(apiKeys.accountId, id), isNull(apiKeys.revokedAt)));
    const [w] = await db.select({ count: count() }).from(webhooks).where(eq(webhooks.accountId, id));
    const [au] = await db.select({ count: count() }).from(audiences).where(eq(audiences.accountId, id));
    return { data: { emails: Number(e.count), domains: Number(d.count), api_keys: Number(a.count), webhooks: Number(w.count), audiences: Number(au.count) } };
  });

  // --- Emails ---
  app.get("/emails", async (request) => {
    const db = getDb();
    return { data: await db.select().from(emails).where(eq(emails.accountId, request.account.id)).orderBy(desc(emails.createdAt)).limit(50) };
  });

  app.post("/emails", async (request, reply) => {
    const input = z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      subject: z.string().min(1),
      html: z.string().optional(),
      text: z.string().optional(),
    }).parse(request.body);
    const result = await emailService.sendEmail(request.account.id, {
      from: input.from,
      to: input.to.split(",").map((e) => e.trim()),
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return reply.status(201).send({ data: result.response });
  });

  // --- Inbox (inbound emails) ---
  app.get("/inbox", async (request) => {
    const db = getDb();
    const { inboundEmails } = await import("../db/schema/index.js");
    const list = await db.select().from(inboundEmails)
      .where(eq(inboundEmails.accountId, request.account.id))
      .orderBy(desc(inboundEmails.createdAt))
      .limit(100);
    return { data: list };
  });

  app.get<{ Params: { id: string } }>("/inbox/:id", async (request) => {
    const db = getDb();
    const { inboundEmails } = await import("../db/schema/index.js");
    const [email] = await db.select().from(inboundEmails)
      .where(and(eq(inboundEmails.id, request.params.id), eq(inboundEmails.accountId, request.account.id)));
    if (!email) throw new ForbiddenError("Email not found");
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
    return { data: updated };
  });

  app.delete<{ Params: { id: string } }>("/inbox/:id", async (request) => {
    const db = getDb();
    const { inboundEmails } = await import("../db/schema/index.js");
    await db.delete(inboundEmails).where(and(eq(inboundEmails.id, request.params.id), eq(inboundEmails.accountId, request.account.id)));
    return { data: { success: true } };
  });

  // --- Domains ---
  app.get("/domains", async (request) => {
    const list = await domainService.listDomains(request.account.id);
    return { data: list.map(domainService.formatDomainResponse) };
  });

  app.post("/domains", async (request, reply) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(request.body);
    const domain = await domainService.createDomain(request.account.id, { name });
    try { await getDnsVerifyQueue().add("dns-verify", { domainId: domain.id, attempt: 0 }, { delay: 60_000 }); } catch {}
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
    return { data: { provider } };
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

    const { setupDnsRecords } = await import("../services/dns-providers.service.js");
    const result = await setupDnsRecords(domain.name, formatted.records, {
      provider: input.provider,
      godaddyKey: input.godaddy_key,
      godaddySecret: input.godaddy_secret,
      cloudflareToken: input.cloudflare_token,
      cloudflareZoneId: input.cloudflare_zone_id,
    });

    // Trigger verification after auto-setup
    if (result.success) {
      try { await getDnsVerifyQueue().add("dns-verify", { domainId: domain.id, attempt: 0 }, { delay: 10_000 }); } catch {}
    }

    return { data: result };
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
      url: z.string().url(),
      events: z.array(z.string()).min(1),
    }).parse(request.body);
    const webhook = await webhookService.createWebhook(request.account.id, { url: input.url, events: input.events as any });
    return reply.status(201).send({ data: webhookService.formatWebhookResponse(webhook) });
  });

  app.delete<{ Params: { id: string } }>("/webhooks/:id", async (request) => {
    const deleted = await webhookService.deleteWebhook(request.account.id, request.params.id);
    return { data: webhookService.formatWebhookResponse(deleted) };
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
}
