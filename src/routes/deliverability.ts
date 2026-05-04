import { FastifyInstance } from "fastify";
import { z } from "zod";
import { lintEmail } from "../services/deliverability-lint.service.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const lintSchema = z.object({
  subject: z.string().max(998).default(""),
  html: z.string().max(10_000_000).optional(),
  text: z.string().max(10_000_000).optional(),
  from: z.string().max(320).optional(),
});

const lintResponse = z.object({
  score: z.number(),
  ok: z.boolean(),
  findings: z.array(z.object({
    severity: z.enum(["info", "warn", "error"]),
    rule: z.string(),
    message: z.string(),
  }).passthrough()),
}).passthrough();

export default async function deliverabilityRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  app.post("/lint", {
    schema: {
      summary: "Pre-flight deliverability lint",
      description: "Scans subject + body + sender for deliverability red flags (spam-trigger words, link-to-text ratio, missing alt text, link without unsubscribe, etc) without sending. Use this from a compose UI before showing a 'Send' button.",
      body: lintSchema,
      response: { 200: dataEnvelope(lintResponse), 400: errorResponseSchema },
    },
  }, async (request) => {
    const body = lintSchema.parse(request.body);
    const result = lintEmail(body);
    return { data: result };
  });
}
