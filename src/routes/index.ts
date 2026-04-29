import { FastifyInstance } from "fastify";
import { z } from "zod";
import apiKeyRoutes from "./api-keys.js";
import domainRoutes from "./domains.js";
import emailRoutes from "./emails.js";
import batchRoutes from "./batch.js";
import webhookRoutes from "./webhooks.js";
import audienceRoutes from "./audiences.js";
import broadcastRoutes from "./broadcasts.js";
import warmupRoutes from "./warmup.js";
import templateRoutes from "./templates.js";
import trackingRoutes from "./tracking.js";
import authRoutes from "./auth.js";
import adminRoutes from "./admin.js";
import dashboardRoutes from "./dashboard.js";
import folderRoutes from "./folders.js";
import inboxRoutes from "./inbox.js";
import draftRoutes from "./drafts.js";
import threadRoutes from "./threads.js";
import signatureRoutes from "./signatures.js";
import addressBookRoutes from "./address-book.js";
import teamRoutes from "./team.js";
import mailboxRoutes from "./mailboxes.js";
import sequenceRoutes from "./sequences.js";
import companyRoutes from "./companies.js";
import { addSuppression, listSuppressions, removeSuppression, formatSuppressionResponse } from "../services/suppression.service.js";
import { getAccountAnalytics } from "../services/analytics.service.js";

export async function registerRoutes(app: FastifyInstance) {
  // Health check (liveness) — fast, cache-unfriendly. 200 = process is up.
  app.get("/health", async (_request, reply) => {
    return reply.send({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Readiness — deeper check that DB (and Redis if configured) are reachable.
  // Used by orchestrators to gate traffic. Returns 503 on any dependency failure.
  app.get("/readyz", async (_request, reply) => {
    const checks: Record<string, { ok: boolean; error?: string }> = {};
    try {
      const { getDb } = await import("../db/index.js");
      await getDb().execute("SELECT 1" as any);
      checks.database = { ok: true };
    } catch (error) {
      checks.database = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    try {
      const { isRedisConfigured, getRedisConnection } = await import("../queues/index.js");
      if (isRedisConfigured()) {
        await getRedisConnection().ping();
        checks.redis = { ok: true };
      }
    } catch (error) {
      checks.redis = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const allOk = Object.values(checks).every((c) => c.ok);
    return reply.status(allOk ? 200 : 503).send({ status: allOk ? "ready" : "not_ready", checks, timestamp: new Date().toISOString() });
  });

  // Tracking routes (no auth, public)
  await app.register(trackingRoutes);

  // Web auth routes
  await app.register(authRoutes, { prefix: "/auth" });

  // Dashboard API (cookie auth)
  await app.register(dashboardRoutes, { prefix: "/dashboard" });

  // Admin panel API (cookie auth + admin role)
  await app.register(adminRoutes, { prefix: "/admin" });

  // API v1 routes (API key auth)
  await app.register(apiKeyRoutes, { prefix: "/v1/api-keys" });
  await app.register(domainRoutes, { prefix: "/v1/domains" });
  await app.register(emailRoutes, { prefix: "/v1/emails" });
  await app.register(batchRoutes, { prefix: "/v1/emails/batch" });
  await app.register(webhookRoutes, { prefix: "/v1/webhooks" });
  await app.register(audienceRoutes, { prefix: "/v1/audiences" });
  await app.register(broadcastRoutes, { prefix: "/v1/broadcasts" });
  await app.register(warmupRoutes, { prefix: "/v1/warmup" });
  await app.register(templateRoutes, { prefix: "/v1/templates" });
  await app.register(folderRoutes, { prefix: "/v1/folders" });
  await app.register(inboxRoutes, { prefix: "/v1/inbox" });
  await app.register(draftRoutes, { prefix: "/v1/drafts" });
  await app.register(threadRoutes, { prefix: "/v1/threads" });
  await app.register(signatureRoutes, { prefix: "/v1/signatures" });
  await app.register(addressBookRoutes, { prefix: "/v1/address-book" });
  await app.register(teamRoutes, { prefix: "/v1/team" });
  await app.register(mailboxRoutes, { prefix: "/v1/mailboxes" });
  await app.register(sequenceRoutes, { prefix: "/v1/sequences" });
  await app.register(companyRoutes, { prefix: "/v1/companies" });

  // Suppression routes
  await app.register(async (suppApp) => {
    suppApp.addHook("onRequest", async (request) => {
      await app.authenticate(request);
      const { assertNotCompanyScoped } = await import("../plugins/auth.js");
      assertNotCompanyScoped(request);
    });

    suppApp.get("/", async (request) => {
      const query = z.object({
        cursor: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }).parse(request.query);
      const result = await listSuppressions(request.account.id, query);
      return { data: result.data.map(formatSuppressionResponse), pagination: result.pagination };
    });

    suppApp.post("/", async (request, reply) => {
      const body = z.object({
        email: z.string().email(),
        reason: z.enum(["bounce", "complaint", "unsubscribe", "manual"]).default("manual"),
      }).parse(request.body);

      const suppression = await addSuppression(request.account.id, body.email, body.reason);
      return reply.status(201).send({ data: formatSuppressionResponse(suppression) });
    });

    suppApp.delete<{ Params: { id: string } }>("/:id", async (request) => {
      const deleted = await removeSuppression(request.account.id, request.params.id);
      return { data: formatSuppressionResponse(deleted) };
    });
  }, { prefix: "/v1/suppressions" });

  // Analytics endpoint
  await app.register(async (analyticsApp) => {
    analyticsApp.addHook("onRequest", async (request) => {
      await app.authenticate(request);
      const { assertNotCompanyScoped } = await import("../plugins/auth.js");
      assertNotCompanyScoped(request);
    });

    analyticsApp.get("/", async (request) => {
      const query = z.object({
        start_date: z.string().datetime().optional(),
        end_date: z.string().datetime().optional(),
      }).parse(request.query);

      const analytics = await getAccountAnalytics(
        request.account.id,
        query.start_date ? new Date(query.start_date) : undefined,
        query.end_date ? new Date(query.end_date) : undefined,
      );
      return { data: analytics };
    });
  }, { prefix: "/v1/analytics" });
}
