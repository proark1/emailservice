import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as threadService from "../services/thread.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const threadIdParam = z.object({ threadId: z.string().uuid() });

const listThreadsQuery = z.object({
  folder_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const threadSummary = z.object({
  id: z.string().uuid(),
  subject: z.string(),
  message_count: z.number(),
  last_message_at: z.string().nullable(),
  participants: z.array(z.string()),
  unread_count: z.number().optional(),
}).passthrough();

const threadListResponse = z.object({
  data: z.array(threadSummary),
  pagination: z.object({ cursor: z.string().nullable(), has_more: z.boolean() }),
}).passthrough();

const threadDetail = threadSummary.extend({
  messages: z.array(z.any()),
});

export default async function threadRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.get("/", {
    schema: {
      summary: "List threads",
      description: "Conversation threads grouping inbound + outbound messages by `Message-ID` / `In-Reply-To` / `References`.",
      querystring: listThreadsQuery,
      response: { 200: threadListResponse },
    },
  }, async (request) => {
    const query = listThreadsQuery.parse(request.query);
    return threadService.listThreads(request.account.id, {
      folderId: query.folder_id,
      limit: query.limit,
      cursor: query.cursor,
    });
  });

  app.get<{ Params: { threadId: string } }>("/:threadId", {
    schema: {
      summary: "Get a thread with all messages",
      params: threadIdParam,
      response: { 200: dataEnvelope(threadDetail), 404: errorResponseSchema },
    },
  }, async (request) => {
    const thread = await threadService.getThread(request.account.id, request.params.threadId);
    return { data: thread };
  });
}
