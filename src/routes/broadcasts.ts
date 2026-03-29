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
}
