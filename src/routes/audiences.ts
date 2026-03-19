import { FastifyInstance } from "fastify";
import { createAudienceSchema } from "../schemas/audience.schema.js";
import { createContactSchema, updateContactSchema } from "../schemas/contact.schema.js";
import * as audienceService from "../services/audience.service.js";

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
    const list = await audienceService.listContacts(request.account.id, request.params.id);
    return { data: list.map(audienceService.formatContactResponse) };
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
}
