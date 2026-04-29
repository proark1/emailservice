import { Worker, Job } from "bullmq";
import dns from "node:dns/promises";
import { getRedisConnection } from "../queues/index.js";
import { getDb } from "../db/index.js";
import { webhookDeliveries } from "../db/schema/index.js";
import { signWebhookPayload } from "../lib/crypto.js";

function isPrivateIP(ip: string): boolean {
  // IPv4 private/reserved ranges. Kept in sync with the create-time check
  // in src/schemas/webhook.schema.ts so a URL that the API rejected can't
  // sneak past the worker via DNS rebinding (and vice versa).
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const a = parseInt(v4[1], 10);
    const b = parseInt(v4[2], 10);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;     // CGNAT
    if (a === 192 && b === 0) return true;                 // 192.0.0.0/24, 192.0.2.0/24
    if (a === 198 && (b === 18 || b === 19)) return true;  // benchmarking
    if (a === 198 && b === 51) return true;                // TEST-NET-2
    if (a === 203 && b === 0) return true;                 // TEST-NET-3
    if (a >= 224) return true;                             // multicast + reserved
    return false;
  }
  // IPv6 private/reserved
  if (ip === "::1" || ip === "::") return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true; // link-local
  if (lower.startsWith("fec0:")) return true;                                // deprecated site-local
  if (/^f[cd][0-9a-f]{0,2}:/.test(lower)) return true;                       // fc00::/7 unique local
  if (lower.startsWith("ff")) return true;                                   // multicast
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — extract and check the IPv4 portion
    return isPrivateIP(lower.slice(7));
  }
  return false;
}

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
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    // SSRF protection: block private/internal IPs by resolving DNS
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
    const blockedHostnames = ["localhost", "metadata.google.internal"];
    const blockedSuffixes = [".local", ".internal", ".localhost"];
    if (blockedHostnames.includes(hostname) || blockedSuffixes.some((s) => hostname.endsWith(s))) {
      throw new Error("Webhook URL targets a private/internal address");
    }
    // Resolve hostname to IPs and check each one
    try {
      const [v4addrs, v6addrs] = await Promise.allSettled([
        dns.resolve4(hostname),
        dns.resolve6(hostname),
      ]);
      const resolvedIPs = [
        ...(v4addrs.status === "fulfilled" ? v4addrs.value : []),
        ...(v6addrs.status === "fulfilled" ? v6addrs.value : []),
      ];
      // Reject if ANY resolved IP is private. `.every` was wrong: a DNS
      // round-robin returning [public, private] would have passed, letting
      // an attacker rebind to localhost via a host that initially resolved
      // public and now returns mixed results.
      if (resolvedIPs.some((ip) => isPrivateIP(ip))) {
        throw new Error("Webhook URL targets a private/internal address");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("private/internal")) throw err;
      // DNS resolution failed — allow the request to proceed and let fetch handle it
    }

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 30_000);

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
    clearTimeout(timeout);
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

/**
 * Jittered exponential backoff strategy. For attempt N we produce a delay of
 * `base * 2^(N-1)` multiplied by a random factor in [0.5, 1.5]. This spreads
 * retry storms when one endpoint flaps and decorrelates clients.
 */
const JITTER_EXPONENTIAL = "jitterExponential";
const MAX_BACKOFF_MS = 6 * 3_600_000; // 6 hours

function jitterExponentialBackoff(attemptsMade: number, _: Error, job: Job | undefined) {
  const base = (job?.opts?.backoff as { delay?: number } | undefined)?.delay ?? 30_000;
  const exp = Math.min(base * 2 ** Math.max(0, attemptsMade - 1), MAX_BACKOFF_MS);
  const factor = 0.5 + Math.random(); // 0.5–1.5
  return Math.floor(exp * factor);
}

export function createWebhookDeliverWorker() {
  const concurrency = Number(process.env.WEBHOOK_CONCURRENCY) || 5;
  return new Worker("webhook.deliver", processWebhookDeliver, {
    connection: getRedisConnection(),
    concurrency,
    settings: {
      backoffStrategy: (attemptsMade: number, _type: string, err: Error, job: Job | undefined) => {
        return jitterExponentialBackoff(attemptsMade, err, job);
      },
    } as any,
  });
}

export { JITTER_EXPONENTIAL };
