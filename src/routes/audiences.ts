import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAudienceSchema } from "../schemas/audience.schema.js";
import { createContactSchema, updateContactSchema } from "../schemas/contact.schema.js";
import { confirmImportSchema } from "../schemas/import.schema.js";
import * as audienceService from "../services/audience.service.js";
import * as importService from "../services/import.service.js";
import { paginationSchema } from "../lib/pagination.js";
import { ValidationError } from "../lib/errors.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, paginatedEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });
const audienceContactParams = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
});

const audienceResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  contact_count: z.number().optional(),
  created_at: z.string(),
}).passthrough();

const contactResponse = z.object({
  id: z.string().uuid(),
  audience_id: z.string().uuid(),
  email: z.string().email(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  unsubscribed: z.boolean(),
  created_at: z.string(),
}).passthrough();

export default async function audienceRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // --- Audiences ---

  app.post("/", {
    schema: {
      summary: "Create an audience",
      body: createAudienceSchema,
      response: { 201: dataEnvelope(audienceResponse), 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createAudienceSchema.parse(request.body);
    const audience = await audienceService.createAudience(request.account.id, input);
    return reply.status(201).send({ data: audienceService.formatAudienceResponse(audience) });
  });

  app.get("/", {
    schema: {
      summary: "List audiences",
      response: { 200: dataEnvelope(z.array(audienceResponse)) },
    },
  }, async (request) => {
    const list = await audienceService.listAudiences(request.account.id);
    return { data: list.map(audienceService.formatAudienceResponse) };
  });

  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get an audience",
      params: idParam,
      response: { 200: dataEnvelope(audienceResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const audience = await audienceService.getAudience(request.account.id, request.params.id);
    return { data: audienceService.formatAudienceResponse(audience) };
  });

  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Delete an audience",
      params: idParam,
      response: { 200: dataEnvelope(audienceResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await audienceService.deleteAudience(request.account.id, request.params.id);
    return { data: audienceService.formatAudienceResponse(deleted) };
  });

  // --- Contacts (nested under audiences) ---

  app.post<{ Params: { id: string } }>("/:id/contacts", {
    schema: {
      summary: "Add a contact to an audience",
      params: idParam,
      body: createContactSchema,
      response: { 201: dataEnvelope(contactResponse), 400: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createContactSchema.parse(request.body);
    const contact = await audienceService.createContact(request.account.id, request.params.id, input);
    return reply.status(201).send({ data: audienceService.formatContactResponse(contact) });
  });

  app.get<{ Params: { id: string } }>("/:id/contacts", {
    schema: {
      summary: "List contacts in an audience",
      params: idParam,
      querystring: paginationSchema,
      response: { 200: paginatedEnvelope(contactResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await audienceService.listContacts(request.account.id, request.params.id, pagination);
    return { data: result.data.map(audienceService.formatContactResponse), pagination: result.pagination };
  });

  app.get<{ Params: { id: string; contactId: string } }>("/:id/contacts/:contactId", {
    schema: {
      summary: "Get a contact",
      params: audienceContactParams,
      response: { 200: dataEnvelope(contactResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const contact = await audienceService.getContact(
      request.account.id, request.params.id, request.params.contactId,
    );
    return { data: audienceService.formatContactResponse(contact) };
  });

  app.patch<{ Params: { id: string; contactId: string } }>("/:id/contacts/:contactId", {
    schema: {
      summary: "Update a contact",
      params: audienceContactParams,
      body: updateContactSchema,
      response: { 200: dataEnvelope(contactResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateContactSchema.parse(request.body);
    const updated = await audienceService.updateContact(
      request.account.id, request.params.id, request.params.contactId, input,
    );
    return { data: audienceService.formatContactResponse(updated) };
  });

  app.delete<{ Params: { id: string; contactId: string } }>("/:id/contacts/:contactId", {
    schema: {
      summary: "Remove a contact",
      params: audienceContactParams,
      response: { 200: dataEnvelope(contactResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await audienceService.deleteContact(
      request.account.id, request.params.id, request.params.contactId,
    );
    return { data: audienceService.formatContactResponse(deleted) };
  });

  // --- CSV Import ---

  // POST /v1/audiences/:id/imports — Upload CSV and get preview with suggested column mapping
  app.post<{ Params: { id: string } }>("/:id/imports", async (request, reply) => {
    const body = request.body as any;
    if (!body || !body.csv) {
      throw new ValidationError("Request body must include 'csv' field with CSV text content");
    }
    const result = await importService.createImport(
      request.account.id,
      request.params.id,
      body.csv,
      body.file_name,
    );
    return reply.status(201).send({
      data: {
        import: importService.formatImportResponse(result.import),
        headers: result.headers,
        suggested_mapping: result.suggested_mapping,
        preview: result.preview,
        total_rows: result.total_rows,
      },
    });
  });

  // POST /v1/audiences/:id/imports/:importId/confirm — Confirm mapping and start processing
  app.post<{ Params: { id: string; importId: string } }>(
    "/:id/imports/:importId/confirm",
    async (request) => {
      const input = confirmImportSchema.parse(request.body);
      const importRecord = await importService.confirmImport(
        request.account.id,
        request.params.id,
        request.params.importId,
        input,
      );
      return { data: importService.formatImportResponse(importRecord!) };
    },
  );

  // GET /v1/audiences/:id/imports/:importId — Get import status and progress
  app.get<{ Params: { id: string; importId: string } }>(
    "/:id/imports/:importId",
    async (request) => {
      const importRecord = await importService.getImport(
        request.account.id,
        request.params.id,
        request.params.importId,
      );
      return { data: importService.formatImportResponse(importRecord) };
    },
  );

  // --- CSV Export ---

  // GET /v1/audiences/:id/export — Download contacts as CSV
  app.get<{ Params: { id: string } }>("/:id/export", async (request, reply) => {
    const csv = await importService.exportContacts(request.account.id, request.params.id);
    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="contacts-${request.params.id}.csv"`)
      .send(csv);
  });
}
