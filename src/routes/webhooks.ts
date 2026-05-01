import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createWebhookSchema, updateWebhookSchema } from "../schemas/webhook.schema.js";
import * as webhookService from "../services/webhook.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";

export default async function webhookRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  // POST /v1/webhooks
  app.post("/", async (request, reply) => {
    const input = createWebhookSchema.parse(request.body);
    const webhook = await webhookService.createWebhook(request.account.id, input);
    return reply.status(201).send({ data: webhookService.formatWebhookResponse(webhook) });
  });

  // GET /v1/webhooks
  app.get("/", async (request) => {
    const list = await webhookService.listWebhooks(request.account.id);
    return { data: list.map(webhookService.formatWebhookResponse) };
  });

  // GET /v1/webhooks/:id
  app.get<{ Params: { id: string } }>("/:id", async (request) => {
    const webhook = await webhookService.getWebhook(request.account.id, request.params.id);
    return { data: webhookService.formatWebhookResponse(webhook) };
  });

  // PATCH /v1/webhooks/:id
  app.patch<{ Params: { id: string } }>("/:id", async (request) => {
    const input = updateWebhookSchema.parse(request.body);
    const updated = await webhookService.updateWebhook(request.account.id, request.params.id, input);
    return { data: webhookService.formatWebhookResponse(updated) };
  });

  // DELETE /v1/webhooks/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request) => {
    const deleted = await webhookService.deleteWebhook(request.account.id, request.params.id);
    return { data: webhookService.formatWebhookResponse(deleted) };
  });

  // GET /v1/webhooks/:id/deliveries
  app.get<{ Params: { id: string } }>("/:id/deliveries", async (request) => {
    const query = z
      .object({
        cursor: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        status: z.enum(["pending", "success", "failed", "exhausted"]).optional(),
      })
      .parse(request.query);
    const result = await webhookService.listDeliveries(request.account.id, request.params.id, query);
    return { data: result.data.map(webhookService.formatDeliveryResponse), pagination: result.pagination };
  });

  // POST /v1/webhooks/:id/deliveries/:deliveryId/replay — re-enqueue a single delivery
  app.post<{ Params: { id: string; deliveryId: string } }>(
    "/:id/deliveries/:deliveryId/replay",
    async (request) => {
      const result = await webhookService.replayDelivery(
        request.account.id,
        request.params.id,
        request.params.deliveryId,
      );
      return { data: result };
    },
  );

  // POST /v1/webhooks/:id/replay — bulk re-enqueue dead-lettered or in-flight failures
  app.post<{ Params: { id: string } }>("/:id/replay", async (request) => {
    const body = z
      .object({
        status: z.enum(["exhausted", "failed"]).default("exhausted"),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(request.body ?? {});
    const result = await webhookService.replayDeliveriesBulk(
      request.account.id,
      request.params.id,
      body,
    );
    return { data: result };
  });

  // GET /v1/webhooks/dead-letters — account-wide DLQ view
  app.get("/dead-letters", async (request) => {
    const query = z
      .object({
        cursor: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);
    const result = await webhookService.listDeadLetters(request.account.id, query);
    return {
      data: result.data.map(webhookService.formatDeliveryResponse),
      pagination: result.pagination,
    };
  });
}
