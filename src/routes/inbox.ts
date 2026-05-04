import { FastifyInstance } from "fastify";
import { z } from "zod";
import { listInboxSchema, updateInboxEmailSchema, moveEmailSchema, bulkActionSchema } from "../schemas/inbox.schema.js";
import * as inboxService from "../services/inbox.service.js";
import * as attachmentService from "../services/attachment.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });
const attachmentParam = z.object({ id: z.string().uuid(), aid: z.string().uuid() });

const inboxEmailResponse = z.object({
  id: z.string().uuid(),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  text: z.string().nullable().optional(),
  html: z.string().nullable().optional(),
  read: z.boolean(),
  starred: z.boolean(),
  folder_id: z.string().uuid().nullable().optional(),
  thread_id: z.string().uuid().nullable().optional(),
  in_trash: z.boolean().optional(),
  received_at: z.string(),
  created_at: z.string(),
}).passthrough();

const inboxListResponse = z.object({
  data: z.array(inboxEmailResponse),
  pagination: z.object({ cursor: z.string().nullable(), has_more: z.boolean() }),
}).passthrough();

const attachmentResponse = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  content_type: z.string(),
  size: z.number(),
}).passthrough();

const bulkActionResponse = z.object({
  affected: z.number(),
}).passthrough();

export default async function inboxRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.get("/", {
    schema: {
      summary: "List inbox messages",
      description: "Filter, paginate, and search inbound mail. Supports folder, thread, and read/unread filters.",
      querystring: listInboxSchema,
      response: { 200: inboxListResponse },
    },
  }, async (request) => {
    const input = listInboxSchema.parse(request.query);
    return inboxService.listInboxEmails(request.account.id, input);
  });

  app.post("/bulk", {
    schema: {
      summary: "Bulk update inbox messages",
      description: "Apply a single action (read/unread, star/unstar, move, trash) to many messages in one call.",
      body: bulkActionSchema,
      response: { 200: dataEnvelope(bulkActionResponse), 400: errorResponseSchema },
    },
  }, async (request) => {
    const input = bulkActionSchema.parse(request.body);
    return { data: await inboxService.bulkAction(request.account.id, input) };
  });

  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get an inbox message",
      params: idParam,
      response: { 200: dataEnvelope(inboxEmailResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const email = await inboxService.getInboxEmail(request.account.id, request.params.id);
    return { data: inboxService.formatInboxEmailResponse(email) };
  });

  app.patch<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Update an inbox message",
      description: "Toggle read/starred state or change folder.",
      params: idParam,
      body: updateInboxEmailSchema,
      response: { 200: dataEnvelope(inboxEmailResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateInboxEmailSchema.parse(request.body);
    const updated = await inboxService.updateInboxEmail(request.account.id, request.params.id, input);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Move a message to trash",
      description: "Soft delete. Use `POST /:id/restore` to undo, or `DELETE /:id/permanent` to delete forever.",
      params: idParam,
      response: { 200: dataEnvelope(inboxEmailResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const updated = await inboxService.moveToTrash(request.account.id, request.params.id);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  app.post<{ Params: { id: string } }>("/:id/move", {
    schema: {
      summary: "Move a message to a folder",
      params: idParam,
      body: moveEmailSchema,
      response: { 200: dataEnvelope(inboxEmailResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = moveEmailSchema.parse(request.body);
    const updated = await inboxService.moveToFolder(request.account.id, request.params.id, input.folder_id);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  app.post<{ Params: { id: string } }>("/:id/restore", {
    schema: {
      summary: "Restore a trashed message",
      params: idParam,
      response: { 200: dataEnvelope(inboxEmailResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const updated = await inboxService.restoreFromTrash(request.account.id, request.params.id);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/:id/permanent", {
    schema: {
      summary: "Permanently delete a message",
      params: idParam,
      response: { 200: dataEnvelope(inboxEmailResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await inboxService.permanentDelete(request.account.id, request.params.id);
    return { data: inboxService.formatInboxEmailResponse(deleted) };
  });

  app.get<{ Params: { id: string } }>("/:id/attachments", {
    schema: {
      summary: "List attachments on a message",
      params: idParam,
      response: { 200: dataEnvelope(z.array(attachmentResponse)), 404: errorResponseSchema },
    },
  }, async (request) => {
    const attachments = await attachmentService.listAttachments(request.account.id, request.params.id);
    return { data: attachments.map(attachmentService.formatAttachmentResponse) };
  });

  app.get<{ Params: { id: string; aid: string } }>("/:id/attachments/:aid", {
    schema: {
      summary: "Download an attachment",
      description: "Streams the raw attachment bytes with the original `Content-Type` and a `Content-Disposition: attachment` header.",
      params: attachmentParam,
      response: { 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const { metadata, stream } = await attachmentService.getAttachment(request.account.id, request.params.aid);
    reply.header("Content-Type", metadata.contentType);
    reply.header("Content-Disposition", `attachment; filename="${metadata.filename}"`);
    reply.header("Content-Length", metadata.size);
    return reply.send(stream);
  });
}
