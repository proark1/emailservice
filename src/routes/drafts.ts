import { FastifyInstance } from "fastify";
import { z } from "zod";
import { saveDraftSchema, updateDraftSchema } from "../schemas/draft.schema.js";
import * as draftService from "../services/draft.service.js";
import { formatEmailResponse } from "../services/email.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const draftResponse = z.object({
  id: z.string().uuid(),
  from: z.string().nullable(),
  to: z.array(z.string()).nullable(),
  cc: z.array(z.string()).nullable().optional(),
  bcc: z.array(z.string()).nullable().optional(),
  subject: z.string().nullable(),
  html: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  thread_id: z.string().uuid().nullable().optional(),
  in_reply_to: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
}).passthrough();

const sentEmailResponse = z.object({
  id: z.string().uuid(),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  status: z.string(),
  created_at: z.string(),
}).passthrough();

const listDraftsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const draftListResponse = z.object({
  data: z.array(draftResponse),
  pagination: z.object({ cursor: z.string().nullable(), has_more: z.boolean() }),
}).passthrough();

export default async function draftRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.get("/", {
    schema: {
      summary: "List drafts",
      querystring: listDraftsQuery,
      response: { 200: draftListResponse },
    },
  }, async (request) => {
    const query = listDraftsQuery.parse(request.query);
    return draftService.listDrafts(request.account.id, query);
  });

  app.post("/", {
    schema: {
      summary: "Save a draft",
      body: saveDraftSchema,
      response: { 201: dataEnvelope(draftResponse), 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = saveDraftSchema.parse(request.body);
    const draft = await draftService.saveDraft(request.account.id, input);
    return reply.status(201).send({ data: draftService.formatDraftResponse(draft) });
  });

  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get a draft",
      params: idParam,
      response: { 200: dataEnvelope(draftResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const draft = await draftService.getDraft(request.account.id, request.params.id);
    return { data: draftService.formatDraftResponse(draft) };
  });

  app.patch<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Update a draft",
      params: idParam,
      body: updateDraftSchema,
      response: { 200: dataEnvelope(draftResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateDraftSchema.parse(request.body);
    const updated = await draftService.updateDraft(request.account.id, request.params.id, input);
    return { data: draftService.formatDraftResponse(updated) };
  });

  app.post<{ Params: { id: string } }>("/:id/send", {
    schema: {
      summary: "Send a draft",
      description: "Submits the draft for delivery via the same pipeline as `POST /v1/emails`. Returns the resulting email record.",
      params: idParam,
      response: { 200: dataEnvelope(sentEmailResponse), 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    const sent = await draftService.sendDraft(request.account.id, request.params.id);
    return { data: formatEmailResponse(sent) };
  });

  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Delete a draft",
      params: idParam,
      response: { 200: dataEnvelope(draftResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await draftService.deleteDraft(request.account.id, request.params.id);
    return { data: draftService.formatDraftResponse(deleted) };
  });
}
