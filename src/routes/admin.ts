import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as authService from "../services/auth.service.js";
import * as adminAnalytics from "../services/admin-analytics.service.js";
import { getDb } from "../db/index.js";
import { emails, emailEvents, domains, accounts, apiKeys, webhooks } from "../db/schema/index.js";
import { count, sql } from "drizzle-orm";
import { ForbiddenError } from "../lib/errors.js";

export default async function adminRoutes(app: FastifyInstance) {
  // Admin auth check on all routes
  app.addHook("onRequest", async (request, reply) => {
    try {
      const token = request.cookies.token;
      if (!token) throw new ForbiddenError();

      const decoded = app.jwt.verify<{ id: string; role: string }>(token);
      if (decoded.role !== "admin") throw new ForbiddenError();

      const account = await authService.getAccountById(decoded.id);
      if (!account || account.role !== "admin") throw new ForbiddenError();

      request.account = account;
    } catch {
      throw new ForbiddenError("Admin access required");
    }
  });

  // GET /admin/stats
  app.get("/stats", async () => {
    const db = getDb();

    const [accountCount] = await db.select({ count: count() }).from(accounts);
    const [domainCount] = await db.select({ count: count() }).from(domains);
    const [emailCount] = await db.select({ count: count() }).from(emails);
    const [apiKeyCount] = await db.select({ count: count() }).from(apiKeys);
    const [webhookCount] = await db.select({ count: count() }).from(webhooks);

    return {
      data: {
        accounts: Number(accountCount.count),
        domains: Number(domainCount.count),
        emails: Number(emailCount.count),
        api_keys: Number(apiKeyCount.count),
        webhooks: Number(webhookCount.count),
      },
    };
  });

  // GET /admin/accounts
  app.get("/accounts", async () => {
    const list = await authService.listAllAccounts();
    return { data: list };
  });

  // PATCH /admin/accounts/:id/role
  app.patch<{ Params: { id: string } }>("/:id/role", async (request) => {
    const { role } = z.object({ role: z.enum(["user", "admin"]) }).parse(request.body);
    const updated = await authService.updateAccountRole(request.params.id, role);
    return { data: updated };
  });

  // DELETE /admin/accounts/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await authService.deleteAccount(request.params.id);
    return { data: deleted };
  });

  // --- Analytics endpoints ---

  app.get("/analytics/overview", async () => {
    return { data: await adminAnalytics.getSystemOverview() };
  });

  app.get("/analytics/emails", async (request) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(request.query);
    return { data: await adminAnalytics.getEmailTimeSeries(days) };
  });

  app.get("/analytics/events", async (request) => {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(request.query);
    return { data: await adminAnalytics.getEventTimeSeries(days) };
  });

  app.get("/analytics/delivery-rates", async () => {
    return { data: await adminAnalytics.getDeliveryRates() };
  });

  app.get("/analytics/top-accounts", async (request) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }).parse(request.query);
    return { data: await adminAnalytics.getTopAccounts(limit) };
  });

  app.get("/analytics/top-domains", async (request) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }).parse(request.query);
    return { data: await adminAnalytics.getTopDomains(limit) };
  });

  app.get("/analytics/webhooks", async () => {
    return { data: await adminAnalytics.getWebhookHealth() };
  });

  app.get("/analytics/suppressions", async () => {
    return { data: await adminAnalytics.getSuppressionBreakdown() };
  });

  app.get("/analytics/activity", async (request) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return { data: await adminAnalytics.getRecentActivity(limit) };
  });

  app.get("/analytics/api-keys", async () => {
    return { data: await adminAnalytics.getApiKeyUsage() };
  });
}
