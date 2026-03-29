import { FastifyInstance } from "fastify";
import { validateEmailSchema, validateBatchSchema } from "../schemas/email-validation.schema.js";
import * as validationService from "../services/email-validation.service.js";

export default async function emailValidationRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/email-validations
  app.post("/", async (request) => {
    const { email } = validateEmailSchema.parse(request.body);
    const result = await validationService.validateEmail(email, request.account.id);
    return { data: result };
  });

  // POST /v1/email-validations/batch
  app.post("/batch", async (request) => {
    const { emails } = validateBatchSchema.parse(request.body);
    const results = await validationService.validateBatch(emails, request.account.id);
    return { data: results };
  });
}
