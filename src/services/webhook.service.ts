import { eq, and, sql, desc, lt, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { webhooks, webhookDeliveries, emailEvents } from "../db/schema/index.js";
import { getWebhookDeliverQueue } from "../queues/index.js";
import { RETRY_DELAYS } from "../workers/webhook-deliver.worker.js";
import { generateWebhookSecret } from "../lib/crypto.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
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
  const [updated] = await db
    .update(webhooks)
    .set({ ...input, updatedAt: new Date() })
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

export async function listDeliveries(
  accountId: string,
  webhookId: string,
  opts?: { cursor?: string; limit?: number; status?: "pending" | "success" | "failed" | "exhausted" },
) {
  const db = getDb();
  // Verify webhook belongs to account
  await getWebhook(accountId, webhookId);
  const limit = opts?.limit ?? 50;
  const conditions = [eq(webhookDeliveries.webhookId, webhookId)];
  if (opts?.cursor) {
    conditions.push(lt(webhookDeliveries.id, opts.cursor));
  }
  if (opts?.status) {
    conditions.push(eq(webhookDeliveries.status, opts.status));
  }
  const items = await db
    .select()
    .from(webhookDeliveries)
    .where(and(...conditions))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit + 1);

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  return {
    data,
    pagination: {
      cursor: hasMore ? data[data.length - 1].id : null,
      has_more: hasMore,
    },
  };
}

/**
 * Re-enqueue a failed delivery. Loads the original delivery row, validates
 * ownership via the parent webhook, and pushes a fresh job to the
 * webhook.deliver queue. Each replay starts a brand-new attempt sequence —
 * we don't rewind the original row's attempt counter, we create new
 * delivery rows on each replay so the audit trail stays intact.
 */
export async function replayDelivery(accountId: string, webhookId: string, deliveryId: string) {
  const db = getDb();
  const webhook = await getWebhook(accountId, webhookId);

  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.webhookId, webhookId)));
  if (!delivery) throw new NotFoundError("Webhook delivery");

  if (delivery.status === "success") {
    throw new ValidationError("Cannot replay a successful delivery");
  }
  if (!delivery.requestBody || typeof delivery.requestBody !== "object") {
    throw new ValidationError("Delivery has no request body to replay");
  }

  const requestBody = delivery.requestBody as { type?: string; data?: Record<string, unknown> };
  if (!requestBody.type) {
    throw new ValidationError("Delivery is missing event type — cannot replay");
  }

  await getWebhookDeliverQueue().add(
    "deliver",
    {
      webhookId: webhook.id,
      emailEventId: delivery.emailEventId,
      eventType: requestBody.type,
      payload: requestBody.data ?? {},
      signingSecret: webhook.signingSecret,
      url: webhook.url,
    },
    {
      attempts: RETRY_DELAYS.length + 1,
      backoff: { type: "jitterExponential", delay: 30_000 },
    },
  );

  return { ok: true, replayed_delivery_id: delivery.id };
}

/**
 * Bulk replay for a webhook. Defaults to status="exhausted" (the dead-letter
 * pile). Operators can also replay "failed" rows (in-flight retries that
 * haven't given up yet) — useful when the downstream just came back online
 * and you don't want to wait for the next backoff tick.
 */
export async function replayDeliveriesBulk(
  accountId: string,
  webhookId: string,
  opts?: { status?: "exhausted" | "failed"; limit?: number },
) {
  const db = getDb();
  const webhook = await getWebhook(accountId, webhookId);
  const status = opts?.status ?? "exhausted";
  const limit = Math.min(opts?.limit ?? 100, 500);

  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.webhookId, webhookId), eq(webhookDeliveries.status, status)))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);

  let enqueued = 0;
  let skipped = 0;
  for (const delivery of rows) {
    const requestBody = delivery.requestBody as { type?: string; data?: Record<string, unknown> } | null;
    if (!requestBody || !requestBody.type) {
      skipped++;
      continue;
    }
    await getWebhookDeliverQueue().add(
      "deliver",
      {
        webhookId: webhook.id,
        emailEventId: delivery.emailEventId,
        eventType: requestBody.type,
        payload: requestBody.data ?? {},
        signingSecret: webhook.signingSecret,
        url: webhook.url,
      },
      {
        attempts: RETRY_DELAYS.length + 1,
        backoff: { type: "jitterExponential", delay: 30_000 },
      },
    );
    enqueued++;
  }

  return { enqueued, skipped, scanned: rows.length };
}

/**
 * Account-wide DLQ view: every delivery in `exhausted` status across all
 * webhooks the account owns. Mirrors the per-webhook listDeliveries shape.
 */
export async function listDeadLetters(accountId: string, opts?: { cursor?: string; limit?: number }) {
  const db = getDb();
  const limit = opts?.limit ?? 50;
  const ownedWebhooks = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(eq(webhooks.accountId, accountId));
  if (ownedWebhooks.length === 0) {
    return { data: [], pagination: { cursor: null, has_more: false } };
  }
  const conditions = [
    inArray(webhookDeliveries.webhookId, ownedWebhooks.map((w) => w.id)),
    eq(webhookDeliveries.status, "exhausted" as const),
  ];
  if (opts?.cursor) {
    conditions.push(lt(webhookDeliveries.id, opts.cursor));
  }
  const items = await db
    .select()
    .from(webhookDeliveries)
    .where(and(...conditions))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit + 1);
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  return {
    data,
    pagination: {
      cursor: hasMore ? data[data.length - 1].id : null,
      has_more: hasMore,
    },
  };
}

/**
 * Dispatch a webhook event to all matching subscriptions for an account.
 * Also fans the event out via Redis pub/sub so the SSE stream
 * (`/v1/events/stream`) can deliver it to dashboard clients in realtime.
 */
export async function dispatchEvent(
  accountId: string,
  eventType: WebhookEventType,
  emailEventId: string,
  payload: Record<string, unknown>,
) {
  const db = getDb();

  // Realtime fan-out via Redis pub/sub. Best-effort — if Redis is down or
  // unconfigured, webhook delivery still proceeds via the queue/inline path.
  try {
    const { publishEvent } = await import("./events-pubsub.service.js");
    await publishEvent(accountId, {
      type: eventType,
      created_at: new Date().toISOString(),
      data: { id: emailEventId, ...payload },
    });
  } catch {
    // Swallow — pub/sub is optional infrastructure.
  }

  // Find active webhooks that subscribe to this specific event type (filtered at DB level)
  const matching = await db
    .select()
    .from(webhooks)
    .where(and(
      eq(webhooks.accountId, accountId),
      eq(webhooks.active, true),
      sql`${webhooks.events}::jsonb @> ${JSON.stringify([eventType])}::jsonb`,
    ));

  // Enqueue a delivery job for each matching webhook
  for (const webhook of matching) {
    await getWebhookDeliverQueue().add("deliver", {
      webhookId: webhook.id,
      emailEventId,
      eventType,
      payload,
      signingSecret: webhook.signingSecret,
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
