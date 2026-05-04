import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createFolderSchema, updateFolderSchema } from "../schemas/folder.schema.js";
import * as folderService from "../services/folder.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const folderResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable().optional(),
  created_at: z.string(),
}).passthrough();

const folderWithUnread = folderResponse.extend({ unread_count: z.number() });

export default async function folderRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.get("/", {
    schema: {
      summary: "List inbox folders",
      description: "Returns all folders along with each folder's unread message count.",
      response: { 200: dataEnvelope(z.array(folderWithUnread)) },
    },
  }, async (request) => {
    const folders = await folderService.listFolders(request.account.id);
    const unreadCounts = await folderService.getUnreadCounts(request.account.id);
    return {
      data: folders.map((f) => ({
        ...folderService.formatFolderResponse(f),
        unread_count: unreadCounts[f.id] || 0,
      })),
    };
  });

  app.post("/", {
    schema: {
      summary: "Create a folder",
      body: createFolderSchema,
      response: { 201: dataEnvelope(folderResponse), 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createFolderSchema.parse(request.body);
    const folder = await folderService.createFolder(request.account.id, input);
    return reply.status(201).send({ data: folderService.formatFolderResponse(folder) });
  });

  app.patch<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Update a folder",
      params: idParam,
      body: updateFolderSchema,
      response: { 200: dataEnvelope(folderResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateFolderSchema.parse(request.body);
    const updated = await folderService.updateFolder(request.account.id, request.params.id, input);
    return { data: folderService.formatFolderResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Delete a folder",
      params: idParam,
      response: { 200: dataEnvelope(folderResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await folderService.deleteFolder(request.account.id, request.params.id);
    return { data: folderService.formatFolderResponse(deleted!) };
  });
}
