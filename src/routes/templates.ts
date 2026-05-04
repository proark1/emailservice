import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createTemplateSchema, updateTemplateSchema } from "../schemas/template.schema.js";
import * as templateService from "../services/template.service.js";
import { paginationSchema } from "../lib/pagination.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, paginatedEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const templateResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  subject: z.string(),
  html: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  variables: z.array(z.string()).optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
}).passthrough();

export default async function templateRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.post("/", {
    schema: {
      summary: "Create a template",
      description: "Reusable email template with `{{variable}}` placeholders that you can fill via `template_variables` on `POST /v1/emails`.",
      body: createTemplateSchema,
      response: { 201: dataEnvelope(templateResponse), 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createTemplateSchema.parse(request.body);
    const template = await templateService.createTemplate(request.account.id, input);
    return reply.status(201).send({ data: templateService.formatTemplateResponse(template) });
  });

  app.get("/", {
    schema: {
      summary: "List templates",
      querystring: paginationSchema,
      response: { 200: paginatedEnvelope(templateResponse) },
    },
  }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await templateService.listTemplates(request.account.id, pagination);
    return { data: result.data.map(templateService.formatTemplateResponse), pagination: result.pagination };
  });

  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get a template",
      params: idParam,
      response: { 200: dataEnvelope(templateResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const template = await templateService.getTemplate(request.account.id, request.params.id);
    return { data: templateService.formatTemplateResponse(template) };
  });

  app.patch<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Update a template",
      params: idParam,
      body: updateTemplateSchema,
      response: { 200: dataEnvelope(templateResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateTemplateSchema.parse(request.body);
    const updated = await templateService.updateTemplate(request.account.id, request.params.id, input);
    return { data: templateService.formatTemplateResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Delete a template",
      params: idParam,
      response: { 200: dataEnvelope(templateResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await templateService.deleteTemplate(request.account.id, request.params.id);
    return { data: templateService.formatTemplateResponse(deleted) };
  });
}
