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
    // SSRF protection: block private/internal IPs
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "169.254.169.254", "metadata.google.internal"];
    const privatePrefixes = ["10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "192.168.", "fc00:", "fd", "fe80:", "::ffff:10.", "::ffff:172.", "::ffff:192.168.", "::ffff:127."];
    const blockedSuffixes = [".local", ".internal", ".localhost"];
    if (blocked.includes(hostname) || privatePrefixes.some((p) => hostname.startsWith(p)) || blockedSuffixes.some((s) => hostname.endsWith(s))) {
      throw new Error("Webhook URL targets a private/internal address");
    }

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
  const concurrency = Number(process.env.WEBHOOK_CONCURRENCY) || 5;
  return new Worker("webhook.deliver", processWebhookDeliver, {
    connection: getRedisConnection(),
    concurrency,
  });
}
