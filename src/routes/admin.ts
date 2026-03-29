import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as authService from "../services/auth.service.js";
import * as adminAnalytics from "../services/admin-analytics.service.js";
import { getDb } from "../db/index.js";
import { emails, emailEvents, domains, accounts, apiKeys, webhooks, webhookDeliveries, apiLogs } from "../db/schema/index.js";
import { count, sql, desc, eq, and, ilike } from "drizzle-orm";
import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { getWebhookDeliverQueue } from "../queues/index.js";
import { RETRY_DELAYS } from "../workers/webhook-deliver.worker.js";

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
    if (request.params.id === request.account.id) {
      throw new ForbiddenError("Cannot delete your own account");
    }
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

  // --- Warmup management (admin can see all warmups across accounts) ---
  app.get("/warmups", async () => {
    const { warmupSchedules } = await import("../db/schema/index.js");
    const { desc, eq } = await import("drizzle-orm");
    const db = getDb();
    const schedules = await db.select({
      id: warmupSchedules.id,
      accountId: warmupSchedules.accountId,
      domainId: warmupSchedules.domainId,
      status: warmupSchedules.status,
      currentDay: warmupSchedules.currentDay,
      totalDays: warmupSchedules.totalDays,
      sentToday: warmupSchedules.sentToday,
      targetToday: warmupSchedules.targetToday,
      totalSent: warmupSchedules.totalSent,
      totalOpens: warmupSchedules.totalOpens,
      totalReplies: warmupSchedules.totalReplies,
      fromAddress: warmupSchedules.fromAddress,
      startedAt: warmupSchedules.startedAt,
      completedAt: warmupSchedules.completedAt,
      lastRunAt: warmupSchedules.lastRunAt,
      createdAt: warmupSchedules.createdAt,
      accountName: accounts.name,
      accountEmail: accounts.email,
      domainName: domains.name,
    })
      .from(warmupSchedules)
      .innerJoin(accounts, eq(warmupSchedules.accountId, accounts.id))
      .innerJoin(domains, eq(warmupSchedules.domainId, domains.id))
      .orderBy(desc(warmupSchedules.createdAt));

    return {
      data: schedules.map((s) => ({
        id: s.id,
        account_name: s.accountName,
        account_email: s.accountEmail,
        domain_name: s.domainName,
        status: s.status,
        current_day: s.currentDay,
        total_days: s.totalDays,
        sent_today: s.sentToday,
        target_today: s.targetToday,
        total_sent: s.totalSent,
        from_address: s.fromAddress,
        progress: Math.min(100, Math.round(((s.currentDay - 1) / s.totalDays) * 100)),
        started_at: s.startedAt?.toISOString(),
        completed_at: s.completedAt?.toISOString(),
        last_run_at: s.lastRunAt?.toISOString(),
        created_at: s.createdAt?.toISOString(),
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/warmups/:id/cancel", async (request) => {
    const { warmupSchedules } = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [updated] = await db.update(warmupSchedules)
      .set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(warmupSchedules.id, request.params.id))
      .returning();
    if (!updated) throw new ForbiddenError("Warmup not found");
    return { data: { success: true } };
  });

  // --- API Request Logs ---

  // POST /admin/webhooks/deliveries/:id/retry — re-dispatch a failed webhook delivery
  app.post<{ Params: { id: string } }>("/webhooks/deliveries/:id/retry", async (request) => {
    const db = getDb();

    const [delivery] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.id, request.params.id));

    if (!delivery) throw new NotFoundError("Webhook delivery");

    if (delivery.status === "success") {
      throw new (await import("../lib/errors.js")).ValidationError(
        "Cannot retry a successful delivery"
      );
    }

    // Look up the webhook to get the signing secret
    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, delivery.webhookId));

    if (!webhook) throw new NotFoundError("Webhook");

    const requestBody = delivery.requestBody as { type?: string; data?: Record<string, unknown> } | null;

    await getWebhookDeliverQueue().add("deliver", {
      webhookId: delivery.webhookId,
      emailEventId: delivery.emailEventId,
      eventType: requestBody?.type ?? "email.sent",
      payload: (requestBody?.data ?? {}) as Record<string, unknown>,
      signingSecret: webhook.signingSecret,
      url: delivery.url,
    }, {
      attempts: RETRY_DELAYS.length + 1,
      backoff: { type: "exponential", delay: 30_000 },
    });

    return { data: { success: true, delivery_id: delivery.id } };
  });

  // --- Plan management ---

  app.get("/plans", async () => {
    const { listPlans, formatPlanResponse } = await import("../services/billing.service.js");
    const planList = await listPlans(false);
    return { data: planList.map(formatPlanResponse) };
  });

  app.post("/plans", async (request, reply) => {
    const { createPlanSchema } = await import("../schemas/billing.schema.js");
    const { createPlan, formatPlanResponse } = await import("../services/billing.service.js");
    const input = createPlanSchema.parse(request.body);
    const plan = await createPlan(input);
    return reply.status(201).send({ data: formatPlanResponse(plan) });
  });

  app.patch<{ Params: { id: string } }>("/plans/:id", async (request) => {
    const { updatePlanSchema } = await import("../schemas/billing.schema.js");
    const { updatePlan, formatPlanResponse } = await import("../services/billing.service.js");
    const input = updatePlanSchema.parse(request.body);
    const plan = await updatePlan(request.params.id, input);
    return { data: formatPlanResponse(plan) };
  });

  app.post<{ Params: { id: string } }>("/accounts/:id/assign-plan", async (request) => {
    const { plan_id } = z.object({ plan_id: z.string().uuid() }).parse(request.body);
    const { subscriptions } = await import("../db/schema/index.js");
    const db = getDb();
    await db.insert(subscriptions).values({
      accountId: request.params.id,
      planId: plan_id,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).onConflictDoUpdate({
      target: [subscriptions.accountId],
      set: {
        planId: plan_id,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    });
    return { data: { success: true } };
  });

  app.get("/analytics/api-logs", async (request) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100),
      method: z.string().optional(),
      path: z.string().optional(),
      account_id: z.string().uuid().optional(),
    }).parse(request.query);

    const db = getDb();

    const conditions: any[] = [];
    if (query.account_id) conditions.push(eq(apiLogs.accountId, query.account_id));
    if (query.method) conditions.push(eq(apiLogs.method, query.method.toUpperCase()));
    if (query.path) conditions.push(ilike(apiLogs.path, `%${query.path}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db.select({
      id: apiLogs.id,
      method: apiLogs.method,
      path: apiLogs.path,
      statusCode: apiLogs.statusCode,
      responseTime: apiLogs.responseTime,
      ip: apiLogs.ip,
      createdAt: apiLogs.createdAt,
      accountName: accounts.name,
    })
      .from(apiLogs)
      .leftJoin(accounts, eq(apiLogs.accountId, accounts.id))
      .where(whereClause)
      .orderBy(desc(apiLogs.createdAt))
      .limit(query.limit);

    return { data: logs.map(l => ({
      id: l.id,
      method: l.method,
      path: l.path,
      status_code: l.statusCode,
      response_time: l.responseTime,
      ip: l.ip,
      account_name: l.accountName,
      created_at: l.createdAt?.toISOString(),
    })) };
  });
}
