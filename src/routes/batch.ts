import { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendEmailSchema } from "../schemas/email.schema.js";
import { sendBatch } from "../services/batch.service.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const batchEmailSchema = z.object({
  emails: z.array(sendEmailSchema).min(1).max(100),
});

const batchEmailResult = z.object({
  ids: z.array(z.string().uuid()),
  count: z.number(),
}).passthrough();

export default async function batchRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  app.post("/", {
    schema: {
      summary: "Send up to 100 emails in one call",
      description: "Atomically queues up to 100 emails. Each item follows the same shape as `POST /v1/emails`. Per-email idempotency keys are honoured.",
      tags: ["Batch"],
      body: batchEmailSchema,
      response: { 201: dataEnvelope(batchEmailResult), 400: errorResponseSchema, 422: errorResponseSchema },
    },
  }, async (request, reply) => {
    const input = batchEmailSchema.parse(request.body);
    const companyScopeId = request.apiKey.companyId;
    const result = await sendBatch(request.account.id, input.emails, { companyScopeId });
    return reply.status(201).send({ data: result });
  });
}
