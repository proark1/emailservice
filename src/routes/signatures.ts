import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createSignatureSchema, updateSignatureSchema } from "../schemas/signature.schema.js";
import * as signatureService from "../services/signature.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const signatureResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  html: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  is_default: z.boolean().optional(),
  created_at: z.string(),
}).passthrough();

export default async function signatureRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.get("/", {
    schema: {
      summary: "List signatures",
      response: { 200: dataEnvelope(z.array(signatureResponse)) },
    },
  }, async (request) => {
    const list = await signatureService.listSignatures(request.account.id);
    return { data: list.map(signatureService.formatSignatureResponse) };
  });

  app.post("/", {
    schema: {
      summary: "Create a signature",
      description: "Reusable signature (HTML and/or plain-text). Reference by `signature_id` on `POST /v1/emails`.",
      body: createSignatureSchema,
      response: { 201: dataEnvelope(signatureResponse), 400: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = createSignatureSchema.parse(request.body);
    const signature = await signatureService.createSignature(request.account.id, input);
    return reply.status(201).send({ data: signatureService.formatSignatureResponse(signature) });
  });

  app.get<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Get a signature",
      params: idParam,
      response: { 200: dataEnvelope(signatureResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const signature = await signatureService.getSignature(request.account.id, request.params.id);
    return { data: signatureService.formatSignatureResponse(signature) };
  });

  app.patch<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Update a signature",
      params: idParam,
      body: updateSignatureSchema,
      response: { 200: dataEnvelope(signatureResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const input = updateSignatureSchema.parse(request.body);
    const updated = await signatureService.updateSignature(request.account.id, request.params.id, input);
    return { data: signatureService.formatSignatureResponse(updated) };
  });

  app.delete<{ Params: { id: string } }>("/:id", {
    schema: {
      summary: "Delete a signature",
      params: idParam,
      response: { 200: dataEnvelope(signatureResponse), 404: errorResponseSchema },
    },
  }, async (request) => {
    const deleted = await signatureService.deleteSignature(request.account.id, request.params.id);
    return { data: signatureService.formatSignatureResponse(deleted) };
  });
}
