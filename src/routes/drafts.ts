import { FastifyInstance } from "fastify";
import { z } from "zod";
import { saveDraftSchema, updateDraftSchema } from "../schemas/draft.schema.js";
import * as draftService from "../services/draft.service.js";
import { formatEmailResponse } from "../services/email.service.js";

export default async function draftRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // GET /v1/drafts
  app.get("/", async (request) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }).parse(request.query);
    return draftService.listDrafts(request.account.id, query);
  });

  // POST /v1/drafts
  app.post("/", async (request, reply) => {
    const input = saveDraftSchema.parse(request.body);
    const draft = await draftService.saveDraft(request.account.id, input);
    return reply.status(201).send({ data: draftService.formatDraftResponse(draft) });
  });

  // GET /v1/drafts/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const draft = await draftService.getDraft(request.account.id, request.params.id);
    return { data: draftService.formatDraftResponse(draft) };
  });

  // PATCH /v1/drafts/:id
  app.patch<{ Params: { id: string } }>("/:id", async (request) => {
    const input = updateDraftSchema.parse(request.body);
    const updated = await draftService.updateDraft(request.account.id, request.params.id, input);
    return { data: draftService.formatDraftResponse(updated) };
  });

  // POST /v1/drafts/:id/send
  app.post<{ Params: { id: string } }>("/:id/send", async (request) => {
    const sent = await draftService.sendDraft(request.account.id, request.params.id);
    return { data: formatEmailResponse(sent) };
  });

  // DELETE /v1/drafts/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await draftService.deleteDraft(request.account.id, request.params.id);
    return { data: draftService.formatDraftResponse(deleted) };
  });
}
