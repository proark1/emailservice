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
import * as templateService from "../services/template.service.js";
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
      domain_id: z.string().uuid().optional(),
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

    if (query.domain_id) {
      conditions.push(eq(emails.domainId, query.domain_id));
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
      .orderBy(desc(emailEvents.createdAt));

    return { data: events.map(e => ({
      id: e.id,
      type: e.type,
      data: e.data,
      created_at: e.createdAt.toISOString(),
    })) };
  });

  // --- Inbox (inbound emails) ---
  app.get("/inbox", async (request) => {
    const db = getDb();
    const query = z.object({
      search: z.string().optional(),
      filter: z.enum(["all", "unread", "starred", "archived"]).optional().default("all"),
      domain_id: z.string().uuid().optional(),
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

    if (query.domain_id) {
      conditions.push(eq(inboundEmails.domainId, query.domain_id));
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

  // CSV Export
  app.get<{ Params: { id: string } }>("/audiences/:id/contacts/export", async (request, reply) => {
    const audience = await audienceService.getAudience(request.account.id, request.params.id);
    const contacts = await audienceService.listContacts(request.account.id, request.params.id);

    const header = "email,first_name,last_name,subscribed\n";
    const rows = contacts.map(c => {
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

    let imported = 0;
    let skipped = 0;

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(",").map(p => p.trim().replace(/^"|"$/g, ""));
      const email = parts[0];
      if (!email || !email.includes("@")) { skipped++; continue; }

      try {
        await audienceService.createContact(request.account.id, request.params.id, {
          email,
          first_name: parts[1] || undefined,
          last_name: parts[2] || undefined,
          subscribed: parts[3] !== "false",
        });
        imported++;
      } catch {
        skipped++;
      }
    }

    return reply.status(200).send({ data: { imported, skipped, total: lines.length - startIdx } });
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
    }).parse(request.body);
    const schedule = await warmupService.startWarmup(request.account.id, input.domain_id, { totalDays: input.total_days, fromAddress: input.from_address });
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

  // --- Templates ---
  app.get("/templates", async (request) => {
    const list = await templateService.listTemplates(request.account.id);
    return { data: list.map(templateService.formatTemplateResponse) };
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
    const pattern = `%${q}%`;
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
