import { FastifyInstance } from "fastify";
import { createTemplateSchema, updateTemplateSchema } from "../schemas/template.schema.js";
import * as templateService from "../services/template.service.js";

export default async function templateRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/templates
  app.post("/", async (request, reply) => {
    const input = createTemplateSchema.parse(request.body);
    const template = await templateService.createTemplate(request.account.id, input);
    return reply.status(201).send({ data: templateService.formatTemplateResponse(template) });
  });

  // GET /v1/templates
  app.get("/", async (request) => {
    const list = await templateService.listTemplates(request.account.id);
    return { data: list.map(templateService.formatTemplateResponse) };
  });

  // GET /v1/templates/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const template = await templateService.getTemplate(request.account.id, request.params.id);
    return { data: templateService.formatTemplateResponse(template) };
  });

  // PATCH /v1/templates/:id
  app.patch<{ Params: { id: string } }>("/:id", async (request) => {
    const input = updateTemplateSchema.parse(request.body);
    const updated = await templateService.updateTemplate(request.account.id, request.params.id, input);
    return { data: templateService.formatTemplateResponse(updated) };
  });

  // DELETE /v1/templates/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await templateService.deleteTemplate(request.account.id, request.params.id);
    return { data: templateService.formatTemplateResponse(deleted) };
  });

  // POST /v1/templates/:id/render
  app.post<{ Params: { id: string } }>("/:id/render", async (request) => {
    const { renderTemplateSchema } = await import("../schemas/template.schema.js");
    const input = renderTemplateSchema.parse(request.body);
    const template = await templateService.getTemplate(request.account.id, request.params.id);
    const rendered = await templateService.renderAdvancedTemplate(request.account.id, template, input.variables);
    return { data: rendered };
  });

  // GET /v1/templates/:id/versions
  app.get<{ Params: { id: string } }>("/:id/versions", async (request) => {
    const versions = await templateService.listTemplateVersions(request.account.id, request.params.id);
    return { data: versions.map(templateService.formatTemplateVersionResponse) };
  });

  // POST /v1/templates/:id/versions/:versionId/restore
  app.post<{ Params: { id: string; versionId: string } }>("/:id/versions/:versionId/restore", async (request) => {
    const restored = await templateService.restoreTemplateVersion(request.account.id, request.params.id, request.params.versionId);
    return { data: templateService.formatTemplateResponse(restored) };
  });
}
