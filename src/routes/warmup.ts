import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as warmupService from "../services/warmup.service.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const startWarmupBody = z.object({
  domain_id: z.string().uuid(),
  total_days: z.number().int().min(7).max(90).optional(),
  from_address: z.string().optional(),
  extra_recipients: z.array(z.string().email()).max(20).optional(),
});

const warmupResponse = z.object({
  id: z.string().uuid(),
  domain_id: z.string().uuid(),
  status: z.string(),
  total_days: z.number(),
  current_day: z.number(),
  daily_quota: z.number().nullable(),
  started_at: z.string().nullable(),
  created_at: z.string(),
}).passthrough();

const warmupStatsResponse = z.object({
  schedule: warmupResponse,
  daily: z.array(z.object({
    day: z.number(),
    target: z.number(),
    sent: z.number(),
    delivered: z.number(),
    bounced: z.number(),
  }).passthrough()),
}).passthrough();

export default async function warmupRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  app.post("/", {
    schema: {
      summary: "Start a domain warmup",
      description: "Gradually ramp send volume on a fresh domain over `total_days` (7–90, default 30). Optionally include external recipients (real Gmail / Yahoo / Outlook addresses) to broaden the reputation signal.",
      body: startWarmupBody,
      response: { 201: dataEnvelope(warmupResponse), 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = startWarmupBody.parse(request.body);
    const schedule = await warmupService.startWarmup(
      request.account.id,
      input.domain_id,
      {
        totalDays: input.total_days,
        fromAddress: input.from_address,
        externalRecipients: input.extra_recipients,
      },
    );
    return reply.status(201).send({ data: warmupService.formatWarmupResponse(schedule) });
  });

  app.get("/", {
    schema: {
      summary: "List warmup schedules",
      response: { 200: dataEnvelope(z.array(warmupResponse)) },
    },
  }, async (request) => {
    const list = await warmupService.listWarmups(request.account.id);
    return { data: list.map(warmupService.formatWarmupResponse) };
  });

  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get a warmup schedule",
      params: idParam,
      response: { 200: dataEnvelope(warmupResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const schedule = await warmupService.getWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  app.get<{ Params: { id: string } }>("/:id/stats", {
    schema: {
      summary: "Get warmup stats with a daily breakdown",
      params: idParam,
      response: { 200: dataEnvelope(warmupStatsResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const stats = await warmupService.getWarmupStats(request.account.id, request.params.id);
    return { data: stats };
  });

  app.post<{ Params: { id: string } }>("/:id/pause", {
    schema: {
      summary: "Pause warmup",
      params: idParam,
      response: { 200: dataEnvelope(warmupResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const schedule = await warmupService.pauseWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  app.post<{ Params: { id: string } }>("/:id/resume", {
    schema: {
      summary: "Resume warmup",
      params: idParam,
      response: { 200: dataEnvelope(warmupResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const schedule = await warmupService.resumeWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Cancel warmup",
      params: idParam,
      response: { 200: dataEnvelope(warmupResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const schedule = await warmupService.cancelWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });
}
