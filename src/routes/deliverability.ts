import { FastifyInstance } from "fastify";
import { z } from "zod";
import { lintEmail } from "../services/deliverability-lint.service.js";

const lintSchema = z.object({
  subject: z.string().max(998).default(""),
  html: z.string().max(10_000_000).optional(),
  text: z.string().max(10_000_000).optional(),
  from: z.string().max(320).optional(),
});

export default async function deliverabilityRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/deliverability/lint — pre-flight scan, no side effects
  app.post("/lint", async (request) => {
    const body = lintSchema.parse(request.body);
    const result = lintEmail(body);
    return { data: result };
  });
}
