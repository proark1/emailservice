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
import { addSuppression, listSuppressions, removeSuppression, formatSuppressionResponse } from "../services/suppression.service.js";
import { getAccountAnalytics } from "../services/analytics.service.js";

export async function registerRoutes(app: FastifyInstance) {
  // Health check (no auth)
  app.get("/health", async (_request, reply) => {
    try {
      const { getDb } = await import("../db/index.js");
      const db = getDb();
      await db.execute("SELECT 1" as any);
      return reply.send({ status: "healthy", timestamp: new Date().toISOString() });
    } catch (error) {
      return reply.status(503).send({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
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
  await app.register(teamRoutes, { prefix: "/v1/domains" });

  // Suppression routes
  await app.register(async (suppApp) => {
    suppApp.addHook("onRequest", async (request) => {
      await app.authenticate(request);
    });

    suppApp.get("/", async (request) => {
      const list = await listSuppressions(request.account.id);
      return { data: list.map(formatSuppressionResponse) };
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
