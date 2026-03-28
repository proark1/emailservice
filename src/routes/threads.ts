import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as threadService from "../services/thread.service.js";

export default async function threadRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // GET /v1/threads
  app.get("/", async (request) => {
    const query = z.object({
      folder_id: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }).parse(request.query);
    return threadService.listThreads(request.account.id, {
      folderId: query.folder_id,
      limit: query.limit,
      cursor: query.cursor,
    });
  });

  // GET /v1/threads/:threadId
  app.get<{ Params: { threadId: string } }>("/:threadId", async (request) => {
    const thread = await threadService.getThread(request.account.id, request.params.threadId);
    return { data: thread };
  });
}
