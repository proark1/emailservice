import { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendEmailSchema } from "../schemas/email.schema.js";
import { sendBatch } from "../services/batch.service.js";

const batchEmailSchema = z.object({
  emails: z.array(sendEmailSchema).min(1).max(100),
});

export default async function batchRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/emails/batch
  app.post("/", async (request, reply) => {
    const input = batchEmailSchema.parse(request.body);
    const result = await sendBatch(request.account.id, input.emails);
    return reply.status(201).send({ data: result });
  });
}
