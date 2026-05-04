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
import sunsetRoutes from "./sunset.js";
import compatRoutes from "./compat.js";
import { audienceTopicRoutes, publicPreferenceRoutes } from "./preferences.js";
import dsrRoutes from "./dsr.js";
import deliverabilityRoutes from "./deliverability.js";
import eventsRoutes from "./events.js";
import wellKnownRoutes from "./well-known.js";
import { addSuppression, listSuppressions, removeSuppression, formatSuppressionResponse } from "../services/suppression.service.js";
import { getAccountAnalytics } from "../services/analytics.service.js";
import { dataEnvelope, paginatedEnvelope, errorResponseSchema } from "../lib/openapi.js";

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

  // Public preference center (no auth, token-based)
  await app.register(publicPreferenceRoutes, { prefix: "/preferences" });

  // Public well-known: MTA-STS policy file (host-matched on `mta-sts.<domain>`)
  await app.register(wellKnownRoutes, { prefix: "/.well-known" });

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
  await app.register(sunsetRoutes, { prefix: "/v1/sunset" });
  await app.register(compatRoutes, { prefix: "/v1/compat" });
  // Topics + per-contact preferences are mounted under /v1/audiences so the
  // routes are discoverable next to the audience they belong to.
  await app.register(audienceTopicRoutes, { prefix: "/v1/audiences" });
  await app.register(dsrRoutes, { prefix: "/v1/privacy" });
  await app.register(deliverabilityRoutes, { prefix: "/v1/deliverability" });
  await app.register(eventsRoutes, { prefix: "/v1/events" });

  // Suppression routes
  const suppressionResponse = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    reason: z.enum(["bounce", "complaint", "unsubscribe", "manual"]),
    created_at: z.string(),
  }).passthrough();
  await app.register(async (suppApp) => {
    suppApp.addHook("onRequest", async (request) => {
      await app.authenticate(request);
      const { assertNotCompanyScoped } = await import("../plugins/auth.js");
      assertNotCompanyScoped(request);
    });

    const listSuppressionsQuery = z.object({
      cursor: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    });
    const addSuppressionBody = z.object({
      email: z.string().email(),
      reason: z.enum(["bounce", "complaint", "unsubscribe", "manual"]).default("manual"),
    });

    suppApp.get("/", {
      schema: {
        summary: "List suppressions",
        description: "Account-wide suppression list. Bounces, complaints, and unsubscribes are added automatically; `manual` entries are user-added.",
        querystring: listSuppressionsQuery,
        response: { 200: paginatedEnvelope(suppressionResponse) },
      },
    }, async (request) => {
      const query = listSuppressionsQuery.parse(request.query);
      const result = await listSuppressions(request.account.id, query);
      return { data: result.data.map(formatSuppressionResponse), pagination: result.pagination };
    });

    suppApp.post("/", {
      schema: {
        summary: "Add a suppression",
        description: "Manually add an email to the suppression list. Future sends to this address will be skipped.",
        body: addSuppressionBody,
        response: { 201: dataEnvelope(suppressionResponse), 400: errorResponseSchema },
      },
    }, async (request, reply) => {
      const body = addSuppressionBody.parse(request.body);
      const suppression = await addSuppression(request.account.id, body.email, body.reason);
      return reply.status(201).send({ data: formatSuppressionResponse(suppression) });
    });

    suppApp.delete<{ Params: { id: string } }>("/:id", {
      schema: {
        summary: "Remove a suppression",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: dataEnvelope(suppressionResponse), 404: errorResponseSchema },
      },
    }, async (request) => {
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

    const analyticsQuery = z.object({
      start_date: z.string().datetime().optional(),
      end_date: z.string().datetime().optional(),
    });
    const analyticsResponse = z.object({
      sent: z.number(),
      delivered: z.number(),
      bounced: z.number(),
      complained: z.number(),
      opened: z.number(),
      clicked: z.number(),
      unsubscribed: z.number(),
    }).passthrough();

    analyticsApp.get("/", {
      schema: {
        summary: "Account analytics",
        description: "Aggregate counts (sent, delivered, bounced, complained, opened, clicked, unsubscribed) over the requested date range. Defaults to all time when dates are omitted.",
        querystring: analyticsQuery,
        response: { 200: dataEnvelope(analyticsResponse) },
      },
    }, async (request) => {
      const query = analyticsQuery.parse(request.query);
      const analytics = await getAccountAnalytics(
        request.account.id,
        query.start_date ? new Date(query.start_date) : undefined,
        query.end_date ? new Date(query.end_date) : undefined,
      );
      return { data: analytics };
    });
  }, { prefix: "/v1/analytics" });
}
