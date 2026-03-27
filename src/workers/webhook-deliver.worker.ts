import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queues/index.js";
import { getDb } from "../db/index.js";
import { webhookDeliveries } from "../db/schema/index.js";
import { signWebhookPayload } from "../lib/crypto.js";

export interface WebhookDeliverJobData {
  webhookId: string;
  emailEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  signingSecret: string;
  url: string;
}

export const RETRY_DELAYS = [30_000, 120_000, 900_000, 3_600_000, 21_600_000]; // 30s, 2m, 15m, 1h, 6h

async function processWebhookDeliver(job: Job<WebhookDeliverJobData>) {
  const { webhookId, emailEventId, eventType, payload, signingSecret, url } = job.data;
  const db = getDb();
  const attempt = (job.attemptsMade || 0) + 1;

  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    type: eventType,
    created_at: new Date().toISOString(),
    data: payload,
  });

  const signature = signWebhookPayload(signingSecret, webhookId, timestamp, body);

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let status: "success" | "failed" = "failed";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": webhookId,
        "webhook-timestamp": timestamp.toString(),
        "webhook-signature": signature,
        "User-Agent": "EmailService-Webhook/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    responseStatus = response.status;
    responseBody = (await response.text()).substring(0, 1000); // Truncate

    if (response.ok) {
      status = "success";
    }
  } catch (error) {
    responseBody = error instanceof Error ? error.message : "Unknown error";
  }

  // Record delivery attempt
  await db.insert(webhookDeliveries).values({
    webhookId,
    emailEventId,
    url,
    requestBody: { type: eventType, data: payload },
    responseStatus,
    responseBody,
    attempt,
    maxAttempts: RETRY_DELAYS.length + 1,
    status: status === "success" ? "success" : (attempt > RETRY_DELAYS.length ? "exhausted" : "failed"),
  });

  if (status !== "success") {
    throw new Error(responseStatus
      ? `Webhook delivery failed with status ${responseStatus}`
      : `Webhook delivery failed: ${responseBody ?? "connection error"}`
    );
  }
}

export function createWebhookDeliverWorker() {
  return new Worker("webhook.deliver", processWebhookDeliver, {
    connection: getRedisConnection(),
    concurrency: 5,
  });
}
