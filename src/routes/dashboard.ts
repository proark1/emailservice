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
import { getDb } from "../db/index.js";
import { emails, domains, apiKeys, webhooks, audiences, inboundEmails } from "../db/schema/index.js";
import { ForbiddenError } from "../lib/errors.js";
import { getDnsVerifyQueue } from "../queues/index.js";
import { getConfig } from "../config/index.js";
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
    const query = z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    }).parse(request.query);

    const conditions: any[] = [eq(emails.accountId, request.account.id)];

    if (query.search) {
      const pattern = `%${query.search}%`;
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

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [totalResult] = await db.select({ count: count() }).from(emails).where(whereClause);
    const total = Number(totalResult.count);
    const data = await db.select().from(emails).where(whereClause).orderBy(desc(emails.createdAt)).limit(query.limit).offset(offset);

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

  // --- Inbox (inbound emails) ---
  app.get("/inbox", async (request) => {
    const db = getDb();
    const query = z.object({
      search: z.string().optional(),
      filter: z.enum(["all", "unread", "starred", "archived"]).optional().default("all"),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    }).parse(request.query);

    const conditions: any[] = [eq(inboundEmails.accountId, request.account.id)];

    if (query.search) {
      const pattern = `%${query.search}%`;
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

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;

    const [totalResult] = await db.select({ count: count() }).from(inboundEmails).where(whereClause);
    const total = Number(totalResult.count);
    const list = await db.select().from(inboundEmails).where(whereClause).orderBy(desc(inboundEmails.createdAt)).limit(query.limit).offset(offset);

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
    const { name } = z.object({ name: z.string().min(1) }).parse(request.body);
    const domain = await domainService.createDomain(request.account.id, { name });
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
    const list = await audienceService.listContacts(request.account.id, request.params.id);
    return { data: list.map(audienceService.formatContactResponse) };
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

  // --- Broadcasts ---
  app.get("/broadcasts", async (request) => {
    const list = await broadcastService.listBroadcasts(request.account.id);
    return { data: list.map(broadcastService.formatBroadcastResponse) };
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
