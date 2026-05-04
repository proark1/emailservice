import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createBroadcastSchema } from "../schemas/broadcast.schema.js";
import * as broadcastService from "../services/broadcast.service.js";
import { paginationSchema } from "../lib/pagination.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { lintEmail } from "../services/deliverability-lint.service.js";
import { dataEnvelope, paginatedEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const broadcastResponse = z.object({
  id: z.string().uuid(),
  audience_id: z.string().uuid(),
  name: z.string(),
  from: z.string(),
  subject: z.string(),
  status: z.string(),
  scheduled_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  created_at: z.string(),
}).passthrough();

const lintFinding = z.object({
  severity: z.enum(["info", "warn", "error"]),
  rule: z.string(),
  message: z.string(),
}).passthrough();

const createBroadcastResponse = z.object({
  data: broadcastResponse,
  deliverability: z.object({
    score: z.number(),
    ok: z.boolean(),
    findings: z.array(lintFinding),
  }),
});

const variantStats = z.object({
  variant: z.enum(["A", "B"]),
  sent: z.number(),
  delivered: z.number(),
  opened: z.number(),
  clicked: z.number(),
}).passthrough();

const selectWinnerBody = z.object({ winner_id: z.enum(["A", "B"]) });

export default async function broadcastRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // POST /v1/broadcasts
  app.post("/", {
    schema: {
      summary: "Create a broadcast",
      description: "Schedule a one-to-many send to an audience. Optionally include an `ab_test` config to split-test subject + body across two variants. The response includes a deliverability lint score.",
      body: createBroadcastSchema,
      response: { 201: createBroadcastResponse, 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createBroadcastSchema.parse(request.body);
    const broadcast = await broadcastService.createBroadcast(request.account.id, input);
    const lint = lintEmail({
      subject: input.subject,
      html: input.html,
      text: input.text,
      from: input.from,
    });
    return reply.status(201).send({
      data: broadcastService.formatBroadcastResponse(broadcast),
      deliverability: {
        score: lint.score,
        ok: lint.ok,
        findings: lint.findings,
      },
    });
  });

  // GET /v1/broadcasts
  app.get("/", {
    schema: {
      summary: "List broadcasts",
      querystring: paginationSchema,
      response: { 200: paginatedEnvelope(broadcastResponse) },
    },
  }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await broadcastService.listBroadcasts(request.account.id, pagination);
    return { data: result.data.map(broadcastService.formatBroadcastResponse), pagination: result.pagination };
  });

  // GET /v1/broadcasts/:id
  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get a broadcast",
      params: idParam,
      response: { 200: dataEnvelope(broadcastResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const broadcast = await broadcastService.getBroadcast(request.account.id, request.params.id);
    return { data: broadcastService.formatBroadcastResponse(broadcast) };
  });

  // DELETE /v1/broadcasts/:id
  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Delete a broadcast",
      params: idParam,
      response: { 200: dataEnvelope(broadcastResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await broadcastService.deleteBroadcast(request.account.id, request.params.id);
    return { data: broadcastService.formatBroadcastResponse(deleted) };
  });

  // GET /v1/broadcasts/:id/variants — A/B test variant analytics
  app.get<{ Params: { id: string } }>("/:id/variants", {
    schema: {
      summary: "Get A/B test variant analytics",
      params: idParam,
      response: { 200: dataEnvelope(z.array(variantStats)), 404: errorResponseSchema },
    },
  }, async (request) => {
    const stats = await broadcastService.getAbTestVariantStats(request.account.id, request.params.id);
    return { data: stats };
  });

  // POST /v1/broadcasts/:id/select-winner — Manually select A/B test winner
  app.post<{ Params: { id: string } }>("/:id/select-winner", {
    schema: {
      summary: "Manually select an A/B test winner",
      description: "Force the winning variant rather than waiting for the automatic selection at the end of the test window.",
      params: idParam,
      body: selectWinnerBody,
      response: { 200: dataEnvelope(broadcastResponse), 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    const body = selectWinnerBody.parse(request.body);
    const updated = await broadcastService.selectAbTestWinner(request.params.id, body.winner_id);
    return { data: broadcastService.formatBroadcastResponse(updated!) };
  });
}
