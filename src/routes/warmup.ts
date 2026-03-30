import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as warmupService from "../services/warmup.service.js";

export default async function warmupRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/warmup — start warmup for a domain
  app.post("/", async (request, reply) => {
    const input = z.object({
      domain_id: z.string().uuid(),
      total_days: z.number().int().min(7).max(90).optional(),
      from_address: z.string().optional(),
      // Optional list of real external mailboxes (e.g. personal Gmail, Yahoo) to
      // include alongside the internal mbox-N@ pool. These broaden the reputation
      // signal and test deliverability to the major mail providers.
      extra_recipients: z.array(z.string().email()).max(20).optional(),
    }).parse(request.body);

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

  // GET /v1/warmup — list all warmup schedules
  app.get("/", async (request) => {
    const list = await warmupService.listWarmups(request.account.id);
    return { data: list.map(warmupService.formatWarmupResponse) };
  });

  // GET /v1/warmup/:id — get warmup details
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const schedule = await warmupService.getWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  // GET /v1/warmup/:id/stats — get warmup stats with daily breakdown
  app.get<{ Params: { id: string } }>("/:id/stats", async (request) => {
    const stats = await warmupService.getWarmupStats(request.account.id, request.params.id);
    return { data: stats };
  });

  // POST /v1/warmup/:id/pause — pause warmup
  app.post<{ Params: { id: string } }>("/:id/pause", async (request) => {
    const schedule = await warmupService.pauseWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  // POST /v1/warmup/:id/resume — resume warmup
  app.post<{ Params: { id: string } }>("/:id/resume", async (request) => {
    const schedule = await warmupService.resumeWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });

  // DELETE /v1/warmup/:id — cancel warmup
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const schedule = await warmupService.cancelWarmup(request.account.id, request.params.id);
    return { data: warmupService.formatWarmupResponse(schedule) };
  });
}
