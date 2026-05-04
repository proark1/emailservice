import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as dsrService from "../services/dsr.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { dataEnvelope, errorResponseSchema } from "../lib/openapi.js";

const requestSchema = z.object({
  email: z.string().email(),
});

const exportResponse = z.object({
  email: z.string().email(),
  exported_at: z.string(),
  emails: z.array(z.any()),
  contacts: z.array(z.any()),
  suppressions: z.array(z.any()),
}).passthrough();

const deleteResponse = z.object({
  email: z.string().email(),
  deleted_at: z.string(),
  records_removed: z.number(),
}).passthrough();

export default async function dsrRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.post("/export", {
    schema: {
      summary: "Export personal data (GDPR Art. 15 / CCPA right-to-know)",
      description: "Returns all personal data the account holds for the given email — sent emails, contacts, suppressions. Use this to fulfill a data-subject access request.",
      body: requestSchema,
      response: { 200: dataEnvelope(exportResponse), 400: errorResponseSchema },
    },
  }, async (request) => {
    const body = requestSchema.parse(request.body);
    const data = await dsrService.exportPersonalData(request.account.id, body.email);
    return { data };
  });

  app.post("/delete", {
    schema: {
      summary: "Erase personal data (GDPR Art. 17 / CCPA right-to-delete)",
      description: "Permanently deletes all personal data the account holds for the given email. Returns a count of records removed.",
      body: requestSchema,
      response: { 200: dataEnvelope(deleteResponse), 400: errorResponseSchema },
    },
  }, async (request) => {
    const body = requestSchema.parse(request.body);
    const data = await dsrService.erasePersonalData(request.account.id, body.email);
    return { data };
  });
}
