import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { accounts } from "../db/schema/index.js";
import { applySunsetPolicy, findStaleRecipients } from "../services/sunset.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { NotFoundError } from "../lib/errors.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  days: z.number().int().min(30).max(730).optional(),
  min_emails: z.number().int().min(1).max(1000).optional(),
});

const policyResponse = z.object({
  enabled: z.boolean(),
  days: z.number(),
  min_emails: z.number(),
});

const previewQuery = z.object({
  days: z.coerce.number().int().min(30).max(730).optional(),
  min_emails: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const previewResponse = z.object({
  days: z.number(),
  min_emails: z.number(),
  candidate_count: z.number(),
  candidates: z.array(z.object({
    email: z.string().email(),
    emails_sent: z.number(),
    last_sent_at: z.string(),
  })),
});

const applyResponse = z.object({
  suppressed: z.number(),
}).passthrough();

export default async function sunsetRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // GET /v1/sunset — read current policy
  app.get("/", {
    schema: {
      summary: "Get the sunset policy",
      description: "Sunset policy auto-suppresses recipients who haven't engaged after `days` days, given they received at least `min_emails` messages. Helps protect sender reputation by purging dead addresses.",
      response: { 200: dataEnvelope(policyResponse) },
    },
  }, async (request) => {
    const db = getDb();
    const [a] = await db
      .select({
        enabled: accounts.sunsetPolicyEnabled,
        days: accounts.sunsetPolicyDays,
        minEmails: accounts.sunsetPolicyMinEmails,
      })
      .from(accounts)
      .where(eq(accounts.id, request.account.id));
    if (!a) throw new NotFoundError("Account");
    return {
      data: {
        enabled: a.enabled,
        days: a.days,
        min_emails: a.minEmails,
      },
    };
  });

  // PATCH /v1/sunset — update policy
  app.patch("/", {
    schema: {
      summary: "Update the sunset policy",
      body: settingsSchema,
      response: { 200: dataEnvelope(policyResponse), 400: errorResponseSchema },
    },
  }, async (request) => {
    const body = settingsSchema.parse(request.body);
    const db = getDb();
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.enabled !== undefined) updates.sunsetPolicyEnabled = body.enabled;
    if (body.days !== undefined) updates.sunsetPolicyDays = body.days;
    if (body.min_emails !== undefined) updates.sunsetPolicyMinEmails = body.min_emails;
    const [updated] = await db
      .update(accounts)
      .set(updates)
      .where(eq(accounts.id, request.account.id))
      .returning({
        enabled: accounts.sunsetPolicyEnabled,
        days: accounts.sunsetPolicyDays,
        minEmails: accounts.sunsetPolicyMinEmails,
      });
    return {
      data: {
        enabled: updated.enabled,
        days: updated.days,
        min_emails: updated.minEmails,
      },
    };
  });

  // GET /v1/sunset/preview — dry-run, returns candidate addresses without
  // suppressing them. Always uses the persisted policy values; callers can
  // override via query for what-if exploration.
  app.get("/preview", {
    schema: {
      summary: "Preview candidates that would be sunset",
      description: "Dry-run — returns the addresses the policy would suppress. Override `days`/`min_emails` via query for what-if exploration.",
      querystring: previewQuery,
      response: { 200: dataEnvelope(previewResponse) },
    },
  }, async (request) => {
    const query = previewQuery.parse(request.query);
    const db = getDb();
    const [a] = await db
      .select({
        days: accounts.sunsetPolicyDays,
        minEmails: accounts.sunsetPolicyMinEmails,
      })
      .from(accounts)
      .where(eq(accounts.id, request.account.id));
    if (!a) throw new NotFoundError("Account");
    const days = query.days ?? a.days;
    const minEmails = query.min_emails ?? a.minEmails;
    const candidates = await findStaleRecipients(request.account.id, days, minEmails, query.limit);
    return {
      data: {
        days,
        min_emails: minEmails,
        candidate_count: candidates.length,
        candidates: candidates.map((c) => ({
          email: c.email,
          emails_sent: c.emails_sent,
          last_sent_at: c.last_sent_at.toISOString(),
        })),
      },
    };
  });

  // POST /v1/sunset/apply — apply the policy synchronously. Useful for
  // operators who don't want to wait 24h for the scheduled sweep.
  app.post("/apply", {
    schema: {
      summary: "Apply the sunset policy now",
      description: "Runs the suppression sweep synchronously rather than waiting for the next scheduled run.",
      response: { 200: dataEnvelope(applyResponse) },
    },
  }, async (request) => {
    const db = getDb();
    const [a] = await db
      .select({
        days: accounts.sunsetPolicyDays,
        minEmails: accounts.sunsetPolicyMinEmails,
      })
      .from(accounts)
      .where(eq(accounts.id, request.account.id));
    if (!a) throw new NotFoundError("Account");
    const result = await applySunsetPolicy(request.account.id, a.days, a.minEmails);
    return { data: result };
  });
}
