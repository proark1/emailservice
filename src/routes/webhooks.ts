import { FastifyInstance } from "fastify";
import { createWebhookSchema, updateWebhookSchema } from "../schemas/webhook.schema.js";
import * as webhookService from "../services/webhook.service.js";

export default async function webhookRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
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
    const deliveries = await webhookService.listDeliveries(request.account.id, request.params.id);
    return { data: deliveries.map(webhookService.formatDeliveryResponse) };
  });
}
