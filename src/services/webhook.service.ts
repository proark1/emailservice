import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { webhooks, webhookDeliveries, emailEvents } from "../db/schema/index.js";
import { getWebhookDeliverQueue } from "../queues/index.js";
import { RETRY_DELAYS } from "../workers/webhook-deliver.worker.js";
import { generateWebhookSecret } from "../lib/crypto.js";
import { NotFoundError } from "../lib/errors.js";
import type { CreateWebhookInput, UpdateWebhookInput } from "../schemas/webhook.schema.js";
import type { WebhookEventType } from "../types/webhook-events.js";

export async function createWebhook(accountId: string, input: CreateWebhookInput) {
  const db = getDb();
  const [webhook] = await db
    .insert(webhooks)
    .values({
      accountId,
      url: input.url,
      events: input.events,
      signingSecret: generateWebhookSecret(),
    })
    .returning();
  return webhook;
}

export async function getWebhook(accountId: string, webhookId: string) {
  const db = getDb();
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.accountId, accountId)));
  if (!webhook) throw new NotFoundError("Webhook");
  return webhook;
}

export async function listWebhooks(accountId: string) {
  const db = getDb();
  return db.select().from(webhooks).where(eq(webhooks.accountId, accountId));
}

export async function updateWebhook(accountId: string, webhookId: string, input: UpdateWebhookInput) {
  const db = getDb();
  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (input.url !== undefined) updateData.url = input.url;
  if (input.events !== undefined) updateData.events = input.events;
  if (input.active !== undefined) updateData.active = input.active;

  const [updated] = await db
    .update(webhooks)
    .set(updateData)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.accountId, accountId)))
    .returning();
  if (!updated) throw new NotFoundError("Webhook");
  return updated;
}

export async function deleteWebhook(accountId: string, webhookId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.accountId, accountId)))
    .returning();
  if (!deleted) throw new NotFoundError("Webhook");
  return deleted;
}

export async function listDeliveries(accountId: string, webhookId: string) {
  const db = getDb();
  // Verify webhook belongs to account
  await getWebhook(accountId, webhookId);
  return db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(webhookDeliveries.createdAt)
    .limit(50);
}

/**
 * Dispatch a webhook event to all matching subscriptions for an account.
 */
export async function dispatchEvent(
  accountId: string,
  eventType: WebhookEventType,
  emailEventId: string,
  payload: Record<string, unknown>,
) {
  const db = getDb();

  // Find all active webhooks for this account that subscribe to this event type
  const accountWebhooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.accountId, accountId), eq(webhooks.active, true)));

  const matching = accountWebhooks.filter((wh) =>
    (wh.events as string[]).includes(eventType),
  );

  // Enqueue a delivery job for each matching webhook
  // Note: signingSecret is NOT included in job data — worker fetches it from DB at delivery time
  for (const webhook of matching) {
    await getWebhookDeliverQueue().add("deliver", {
      webhookId: webhook.id,
      emailEventId,
      eventType,
      payload,
      url: webhook.url,
    }, {
      attempts: RETRY_DELAYS.length + 1,
      backoff: { type: "exponential", delay: 30_000 },
    });
  }
}

export function formatWebhookResponse(webhook: typeof webhooks.$inferSelect) {
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    signing_secret: webhook.signingSecret,
    active: webhook.active,
    created_at: webhook.createdAt.toISOString(),
  };
}

export function formatDeliveryResponse(delivery: typeof webhookDeliveries.$inferSelect) {
  return {
    id: delivery.id,
    webhook_id: delivery.webhookId,
    url: delivery.url,
    status: delivery.status,
    attempt: delivery.attempt,
    response_status: delivery.responseStatus,
    created_at: delivery.createdAt.toISOString(),
  };
}
