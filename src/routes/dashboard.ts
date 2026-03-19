import { FastifyInstance } from "fastify";
import { eq, count, desc } from "drizzle-orm";
import * as authService from "../services/auth.service.js";
import { getDb } from "../db/index.js";
import { emails, domains, apiKeys, webhooks, audiences, emailEvents } from "../db/schema/index.js";
import { ForbiddenError } from "../lib/errors.js";

export default async function dashboardRoutes(app: FastifyInstance) {
  // Cookie-based auth for dashboard
  app.addHook("onRequest", async (request, reply) => {
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

  // GET /dashboard/stats — user's own stats
  app.get("/stats", async (request) => {
    const db = getDb();
    const accountId = request.account.id;

    const [emailCount] = await db.select({ count: count() }).from(emails).where(eq(emails.accountId, accountId));
    const [domainCount] = await db.select({ count: count() }).from(domains).where(eq(domains.accountId, accountId));
    const [apiKeyCount] = await db.select({ count: count() }).from(apiKeys).where(eq(apiKeys.accountId, accountId));
    const [webhookCount] = await db.select({ count: count() }).from(webhooks).where(eq(webhooks.accountId, accountId));
    const [audienceCount] = await db.select({ count: count() }).from(audiences).where(eq(audiences.accountId, accountId));

    return {
      data: {
        emails: Number(emailCount.count),
        domains: Number(domainCount.count),
        api_keys: Number(apiKeyCount.count),
        webhooks: Number(webhookCount.count),
        audiences: Number(audienceCount.count),
      },
    };
  });

  // GET /dashboard/emails — recent emails
  app.get("/emails", async (request) => {
    const db = getDb();
    const list = await db.select().from(emails)
      .where(eq(emails.accountId, request.account.id))
      .orderBy(desc(emails.createdAt))
      .limit(50);
    return { data: list };
  });

  // GET /dashboard/domains
  app.get("/domains", async (request) => {
    const db = getDb();
    const list = await db.select().from(domains).where(eq(domains.accountId, request.account.id));
    return { data: list };
  });

  // GET /dashboard/api-keys
  app.get("/api-keys", async (request) => {
    const db = getDb();
    const list = await db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      rateLimit: apiKeys.rateLimit,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    }).from(apiKeys).where(eq(apiKeys.accountId, request.account.id));
    return { data: list };
  });

  // GET /dashboard/webhooks
  app.get("/webhooks", async (request) => {
    const db = getDb();
    const list = await db.select().from(webhooks).where(eq(webhooks.accountId, request.account.id));
    return { data: list };
  });
}
