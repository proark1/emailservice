import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as dsrService from "../services/dsr.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";

const requestSchema = z.object({
  email: z.string().email(),
});

export default async function dsrRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // POST /v1/privacy/export — fulfill GDPR Art. 15 / CCPA "right to know"
  app.post("/export", async (request) => {
    const body = requestSchema.parse(request.body);
    const data = await dsrService.exportPersonalData(request.account.id, body.email);
    return { data };
  });

  // POST /v1/privacy/delete — fulfill GDPR Art. 17 / CCPA "right to delete"
  app.post("/delete", async (request) => {
    const body = requestSchema.parse(request.body);
    const data = await dsrService.erasePersonalData(request.account.id, body.email);
    return { data };
  });
}
