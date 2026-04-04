import { FastifyInstance } from "fastify";
import { createBroadcastSchema } from "../schemas/broadcast.schema.js";
import * as broadcastService from "../services/broadcast.service.js";
import { paginationSchema } from "../lib/pagination.js";

export default async function broadcastRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/broadcasts
  app.post("/", async (request, reply) => {
    const input = createBroadcastSchema.parse(request.body);
    const broadcast = await broadcastService.createBroadcast(request.account.id, input);
    return reply.status(201).send({ data: broadcastService.formatBroadcastResponse(broadcast) });
  });

  // GET /v1/broadcasts
  app.get("/", async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await broadcastService.listBroadcasts(request.account.id, pagination);
    return { data: result.data.map(broadcastService.formatBroadcastResponse), pagination: result.pagination };
  });

  // GET /v1/broadcasts/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const broadcast = await broadcastService.getBroadcast(request.account.id, request.params.id);
    return { data: broadcastService.formatBroadcastResponse(broadcast) };
  });

  // DELETE /v1/broadcasts/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await broadcastService.deleteBroadcast(request.account.id, request.params.id);
    return { data: broadcastService.formatBroadcastResponse(deleted) };
  });

  // GET /v1/broadcasts/:id/variants — A/B test variant analytics
  app.get<{ Params: { id: string } }>("/:id/variants", async (request) => {
    const stats = await broadcastService.getAbTestVariantStats(request.account.id, request.params.id);
    return { data: stats };
  });

  // POST /v1/broadcasts/:id/select-winner — Manually select A/B test winner
  app.post<{ Params: { id: string } }>("/:id/select-winner", async (request) => {
    const body = request.body as any;
    const winnerId = body?.winner_id;
    if (!winnerId || !["A", "B"].includes(winnerId)) {
      throw new (await import("../lib/errors.js")).ValidationError("winner_id must be 'A' or 'B'");
    }
    const updated = await broadcastService.selectAbTestWinner(request.params.id, winnerId);
    return { data: broadcastService.formatBroadcastResponse(updated!) };
  });
}
