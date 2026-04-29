import { FastifyInstance } from "fastify";
import { createTemplateSchema, updateTemplateSchema } from "../schemas/template.schema.js";
import * as templateService from "../services/template.service.js";
import { paginationSchema } from "../lib/pagination.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";

export default async function templateRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // POST /v1/templates
  app.post("/", async (request, reply) => {
    const input = createTemplateSchema.parse(request.body);
    const template = await templateService.createTemplate(request.account.id, input);
    return reply.status(201).send({ data: templateService.formatTemplateResponse(template) });
  });

  // GET /v1/templates
  app.get("/", async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await templateService.listTemplates(request.account.id, pagination);
    return { data: result.data.map(templateService.formatTemplateResponse), pagination: result.pagination };
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
}
