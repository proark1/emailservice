import { FastifyInstance } from "fastify";
import { createFolderSchema, updateFolderSchema } from "../schemas/folder.schema.js";
import * as folderService from "../services/folder.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";

export default async function folderRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // GET /v1/folders
  app.get("/", async (request) => {
    const folders = await folderService.listFolders(request.account.id);
    const unreadCounts = await folderService.getUnreadCounts(request.account.id);
    return {
      data: folders.map((f) => ({
        ...folderService.formatFolderResponse(f),
        unread_count: unreadCounts[f.id] || 0,
      })),
    };
  });

  // POST /v1/folders
  app.post("/", async (request, reply) => {
    const input = createFolderSchema.parse(request.body);
    const folder = await folderService.createFolder(request.account.id, input);
    return reply.status(201).send({ data: folderService.formatFolderResponse(folder) });
  });

  // PATCH /v1/folders/:id
  app.patch<{ Params: { id: string } }>("/:id", async (request) => {
    const input = updateFolderSchema.parse(request.body);
    const updated = await folderService.updateFolder(request.account.id, request.params.id, input);
    return { data: folderService.formatFolderResponse(updated) };
  });

  // DELETE /v1/folders/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await folderService.deleteFolder(request.account.id, request.params.id);
    return { data: folderService.formatFolderResponse(deleted!) };
  });
}
