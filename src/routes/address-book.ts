import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createAddressBookContactSchema, updateAddressBookContactSchema } from "../schemas/address-book.schema.js";
import * as addressBookService from "../services/address-book.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";

export default async function addressBookRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // GET /v1/address-book/autocomplete
  app.get("/autocomplete", async (request) => {
    const query = z.object({ q: z.string().min(1) }).parse(request.query);
    const results = await addressBookService.autocomplete(request.account.id, query.q);
    return { data: results };
  });

  // GET /v1/address-book
  app.get("/", async (request) => {
    const query = z.object({ search: z.string().optional() }).parse(request.query);
    const list = await addressBookService.listContacts(request.account.id, query.search);
    return { data: list.map(addressBookService.formatAddressBookContactResponse) };
  });

  // POST /v1/address-book
  app.post("/", async (request, reply) => {
    const input = createAddressBookContactSchema.parse(request.body);
    const contact = await addressBookService.addContact(request.account.id, input);
    return reply.status(201).send({ data: addressBookService.formatAddressBookContactResponse(contact) });
  });

  // GET /v1/address-book/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const contact = await addressBookService.getContact(request.account.id, request.params.id);
    return { data: addressBookService.formatAddressBookContactResponse(contact) };
  });

  // PATCH /v1/address-book/:id
  app.patch<{ Params: { id: string } }>("/:id", async (request) => {
    const input = updateAddressBookContactSchema.parse(request.body);
    const updated = await addressBookService.updateContact(request.account.id, request.params.id, input);
    return { data: addressBookService.formatAddressBookContactResponse(updated) };
  });

  // DELETE /v1/address-book/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await addressBookService.deleteContact(request.account.id, request.params.id);
    return { data: addressBookService.formatAddressBookContactResponse(deleted) };
  });
}
