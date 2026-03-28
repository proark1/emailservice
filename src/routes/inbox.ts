import { FastifyInstance } from "fastify";
import { listInboxSchema, updateInboxEmailSchema, moveEmailSchema, bulkActionSchema } from "../schemas/inbox.schema.js";
import * as inboxService from "../services/inbox.service.js";
import * as attachmentService from "../services/attachment.service.js";

export default async function inboxRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // GET /v1/inbox
  app.get("/", async (request) => {
    const input = listInboxSchema.parse(request.query);
    return inboxService.listInboxEmails(request.account.id, input);
  });

  // POST /v1/inbox/bulk
  app.post("/bulk", async (request) => {
    const input = bulkActionSchema.parse(request.body);
    return { data: await inboxService.bulkAction(request.account.id, input) };
  });

  // GET /v1/inbox/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const email = await inboxService.getInboxEmail(request.account.id, request.params.id);
    return { data: inboxService.formatInboxEmailResponse(email) };
  });

  // PATCH /v1/inbox/:id
  app.patch<{ Params: { id: string } }>("/:id", async (request) => {
    const input = updateInboxEmailSchema.parse(request.body);
    const updated = await inboxService.updateInboxEmail(request.account.id, request.params.id, input);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  // DELETE /v1/inbox/:id (soft delete — move to trash)
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const updated = await inboxService.moveToTrash(request.account.id, request.params.id);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  // POST /v1/inbox/:id/move
  app.post<{ Params: { id: string } }>("/:id/move", async (request) => {
    const input = moveEmailSchema.parse(request.body);
    const updated = await inboxService.moveToFolder(request.account.id, request.params.id, input.folder_id);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  // POST /v1/inbox/:id/restore
  app.post<{ Params: { id: string } }>("/:id/restore", async (request) => {
    const updated = await inboxService.restoreFromTrash(request.account.id, request.params.id);
    return { data: inboxService.formatInboxEmailResponse(updated) };
  });

  // DELETE /v1/inbox/:id/permanent
  app.delete<{ Params: { id: string } }>("/:id/permanent", async (request) => {
    const deleted = await inboxService.permanentDelete(request.account.id, request.params.id);
    return { data: inboxService.formatInboxEmailResponse(deleted) };
  });

  // GET /v1/inbox/:id/attachments
  app.get<{ Params: { id: string } }>("/:id/attachments", async (request) => {
    const attachments = await attachmentService.listAttachments(request.account.id, request.params.id);
    return { data: attachments.map(attachmentService.formatAttachmentResponse) };
  });

  // GET /v1/inbox/:id/attachments/:aid
  app.get<{ Params: { id: string; aid: string } }>("/:id/attachments/:aid", async (request, reply) => {
    const { metadata, stream } = await attachmentService.getAttachment(request.account.id, request.params.aid);
    reply.header("Content-Type", metadata.contentType);
    reply.header("Content-Disposition", `attachment; filename="${metadata.filename}"`);
    reply.header("Content-Length", metadata.size);
    return reply.send(stream);
  });
}
