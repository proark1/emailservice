import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAddressBookContactSchema, updateAddressBookContactSchema } from "../schemas/address-book.schema.js";
import * as addressBookService from "../services/address-book.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const contactResponse = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string(),
}).passthrough();

const autocompleteResult = z.object({
  email: z.string().email(),
  name: z.string().nullable(),
}).passthrough();

export default async function addressBookRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.get("/autocomplete", {
    schema: {
      summary: "Autocomplete address-book entries",
      description: "Quick prefix search useful while composing — returns matches by email or name.",
      querystring: z.object({ q: z.string().min(1) }),
      response: { 200: dataEnvelope(z.array(autocompleteResult)) },
    },
  }, async (request) => {
    const query = z.object({ q: z.string().min(1) }).parse(request.query);
    const results = await addressBookService.autocomplete(request.account.id, query.q);
    return { data: results };
  });

  app.get("/", {
    schema: {
      summary: "List address-book contacts",
      querystring: z.object({ search: z.string().optional() }),
      response: { 200: dataEnvelope(z.array(contactResponse)) },
    },
  }, async (request) => {
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    const list = await addressBookService.listContacts(request.account.id, query.search);
    return { data: list.map(addressBookService.formatAddressBookContactResponse) };
  });

  app.post("/", {
    schema: {
      summary: "Add an address-book contact",
      body: createAddressBookContactSchema,
      response: { 201: dataEnvelope(contactResponse), 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createAddressBookContactSchema.parse(request.body);
    const contact = await addressBookService.addContact(request.account.id, input);
    return reply.status(201).send({ data: addressBookService.formatAddressBookContactResponse(contact) });
  });

  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get an address-book contact",
      params: idParam,
      response: { 200: dataEnvelope(contactResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const contact = await addressBookService.getContact(request.account.id, request.params.id);
    return { data: addressBookService.formatAddressBookContactResponse(contact) };
  });

  app.patch<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Update an address-book contact",
      params: idParam,
      body: updateAddressBookContactSchema,
      response: { 200: dataEnvelope(contactResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateAddressBookContactSchema.parse(request.body);
    const updated = await addressBookService.updateContact(request.account.id, request.params.id, input);
    return { data: addressBookService.formatAddressBookContactResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Delete an address-book contact",
      params: idParam,
      response: { 200: dataEnvelope(contactResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await addressBookService.deleteContact(request.account.id, request.params.id);
    return { data: addressBookService.formatAddressBookContactResponse(deleted) };
  });
}
