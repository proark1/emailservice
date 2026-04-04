import { FastifyInstance } from "fastify";
import { createAudienceSchema } from "../schemas/audience.schema.js";
import { createContactSchema, updateContactSchema } from "../schemas/contact.schema.js";
import { confirmImportSchema } from "../schemas/import.schema.js";
import * as audienceService from "../services/audience.service.js";
import * as importService from "../services/import.service.js";
import { paginationSchema } from "../lib/pagination.js";
import { ValidationError } from "../lib/errors.js";

export default async function audienceRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // --- Audiences ---

  app.post("/", async (request, reply) => {
    const input = createAudienceSchema.parse(request.body);
    const audience = await audienceService.createAudience(request.account.id, input);
    return reply.status(201).send({ data: audienceService.formatAudienceResponse(audience) });
  });

  app.get("/", async (request) => {
    const list = await audienceService.listAudiences(request.account.id);
    return { data: list.map(audienceService.formatAudienceResponse) };
  });

  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const audience = await audienceService.getAudience(request.account.id, request.params.id);
    return { data: audienceService.formatAudienceResponse(audience) };
  });

  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await audienceService.deleteAudience(request.account.id, request.params.id);
    return { data: audienceService.formatAudienceResponse(deleted) };
  });

  // --- Contacts (nested under audiences) ---

  app.post<{ Params: { id: string } }>("/:id/contacts", async (request, reply) => {
    const input = createContactSchema.parse(request.body);
    const contact = await audienceService.createContact(request.account.id, request.params.id, input);
    return reply.status(201).send({ data: audienceService.formatContactResponse(contact) });
  });

  app.get<{ Params: { id: string } }>("/:id/contacts", async (request) => {
    const pagination = paginationSchema.parse(request.query);
    const result = await audienceService.listContacts(request.account.id, request.params.id, pagination);
    return { data: result.data.map(audienceService.formatContactResponse), pagination: result.pagination };
  });

  app.get<{ Params: { id: string; contactId: string } }>("/:id/contacts/:contactId", async (request) => {
    const contact = await audienceService.getContact(
      request.account.id, request.params.id, request.params.contactId,
    );
    return { data: audienceService.formatContactResponse(contact) };
  });

  app.patch<{ Params: { id: string; contactId: string } }>("/:id/contacts/:contactId", async (request) => {
    const input = updateContactSchema.parse(request.body);
    const updated = await audienceService.updateContact(
      request.account.id, request.params.id, request.params.contactId, input,
    );
    return { data: audienceService.formatContactResponse(updated) };
  });

  app.delete<{ Params: { id: string; contactId: string } }>("/:id/contacts/:contactId", async (request) => {
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
