import { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendEmailSchema } from "../schemas/email.schema.js";
import * as emailService from "../services/email.service.js";
import { paginationSchema, buildPaginatedResponse } from "../lib/pagination.js";
import {
  dataEnvelope,
  paginatedEnvelope,
  errorResponseSchema,
} from "../lib/openapi.js";

const idParam = z.object({ id: z.string().uuid() });

const emailResponse = z.object({
  id: z.string().uuid(),
  from: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()).nullable().optional(),
  bcc: z.array(z.string()).nullable().optional(),
  subject: z.string(),
  status: z.string(),
  scheduled_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  open_count: z.number().nullable(),
  click_count: z.number().nullable(),
  tags: z.record(z.string(), z.string()).nullable().optional(),
  failure_reason: z.string().nullable(),
  failure_code: z.string().nullable(),
  failure_count: z.number(),
  created_at: z.string(),
});

export default async function emailRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
  });

  // POST /v1/emails
  app.post(
    "/",
    {
      schema: {
        summary: "Send an email",
        description: "Queue a transactional email for delivery. Pass `scheduled_at` to send later. Set `idempotency_key` to make the call safely retryable.",
        body: sendEmailSchema,
        response: {
          201: dataEnvelope(emailResponse),
          400: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const input = sendEmailSchema.parse(request.body);
      const companyScopeId = request.apiKey.companyId;
      const result = await emailService.sendEmail(request.account.id, input, { companyScopeId });

      if (result.cached) {
        const cached = result.response as { status: number; body: unknown };
        // Idempotent replay — replay the cached status verbatim. The status
        // may not match a documented code in `response`, hence the cast.
        return reply.status(cached.status as 201).send(cached.body as never);
      }

      return reply.status(201).send({ data: result.response });
    },
  );

  // GET /v1/emails
  app.get(
    "/",
    {
      schema: {
        summary: "List emails",
        description: "Paginated list of emails sent from the authenticated account, newest first.",
        querystring: paginationSchema,
        response: { 200: paginatedEnvelope(emailResponse) },
      },
    },
    async (request) => {
      const { cursor, limit } = paginationSchema.parse(request.query);
      const companyScopeId = request.apiKey.companyId;
      const emailList = await emailService.listEmails(request.account.id, { limit, cursor, companyScopeId });
      return buildPaginatedResponse(
        emailList.map(emailService.formatEmailResponse),
        limit,
      );
    },
  );

  // GET /v1/emails/:id
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        summary: "Get an email",
        params: idParam,
        response: { 200: dataEnvelope(emailResponse), 404: errorResponseSchema },
      },
    },
    async (request) => {
      const companyScopeId = request.apiKey.companyId;
      const email = await emailService.getEmail(request.account.id, request.params.id, { companyScopeId });
      return { data: emailService.formatEmailResponse(email) };
    },
  );

  // DELETE /v1/emails/:id (cancel scheduled)
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        summary: "Cancel a scheduled email",
        description: "Only emails that have not yet been sent (status `scheduled`) can be cancelled.",
        params: idParam,
        response: { 200: dataEnvelope(emailResponse), 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const companyScopeId = request.apiKey.companyId;
      const cancelled = await emailService.cancelScheduledEmail(request.account.id, request.params.id, { companyScopeId });
      return { data: emailService.formatEmailResponse(cancelled) };
    },
  );
}
