import { FastifyInstance } from "fastify";
import { sendEmailSchema } from "../schemas/email.schema.js";
import * as emailService from "../services/email.service.js";
import { paginationSchema, buildPaginatedResponse } from "../lib/pagination.js";

export default async function emailRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/emails
  app.post("/", async (request, reply) => {
    const input = sendEmailSchema.parse(request.body);
    const result = await emailService.sendEmail(request.account.id, input);

    if (result.cached) {
      const cached = result.response as { status: number; body: unknown };
      return reply.status(cached.status).send(cached.body);
    }

    return reply.status(201).send({ data: result.response });
  });

  // GET /v1/emails
  app.get("/", async (request) => {
    const { cursor, limit } = paginationSchema.parse(request.query);
    const emailList = await emailService.listEmails(request.account.id, { limit });
    return buildPaginatedResponse(
      emailList.map(emailService.formatEmailResponse),
      limit,
    );
  });

  // GET /v1/emails/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const email = await emailService.getEmail(request.account.id, request.params.id);
    return { data: emailService.formatEmailResponse(email) };
  });

  // DELETE /v1/emails/:id (cancel scheduled)
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const cancelled = await emailService.cancelScheduledEmail(request.account.id, request.params.id);
    return { data: emailService.formatEmailResponse(cancelled!) };
  });
}
