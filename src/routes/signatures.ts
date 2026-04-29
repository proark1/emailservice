import { FastifyInstance } from "fastify";
import { createSignatureSchema, updateSignatureSchema } from "../schemas/signature.schema.js";
import * as signatureService from "../services/signature.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";

export default async function signatureRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // GET /v1/signatures
  app.get("/", async (request) => {
    const list = await signatureService.listSignatures(request.account.id);
    return { data: list.map(signatureService.formatSignatureResponse) };
  });

  // POST /v1/signatures
  app.post("/", async (request, reply) => {
    const input = createSignatureSchema.parse(request.body);
    const signature = await signatureService.createSignature(request.account.id, input);
    return reply.status(201).send({ data: signatureService.formatSignatureResponse(signature) });
  });

  // GET /v1/signatures/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const signature = await signatureService.getSignature(request.account.id, request.params.id);
    return { data: signatureService.formatSignatureResponse(signature) };
  });

  // PATCH /v1/signatures/:id
  app.patch<{ Params: { id: string } }>("/:id", async (request) => {
    const input = updateSignatureSchema.parse(request.body);
    const updated = await signatureService.updateSignature(request.account.id, request.params.id, input);
    return { data: signatureService.formatSignatureResponse(updated) };
  });

  // DELETE /v1/signatures/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await signatureService.deleteSignature(request.account.id, request.params.id);
    return { data: signatureService.formatSignatureResponse(deleted) };
  });
}
