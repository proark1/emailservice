import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queues/index.js";
import { dispatchEvent } from "../services/webhook.service.js";
import { getDb } from "../db/index.js";
import { emailEvents } from "../db/schema/index.js";

export interface InboundEmailJobData {
  accountId: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, unknown>;
}

async function processInboundEmail(job: Job<InboundEmailJobData>) {
  const { accountId, from, to, subject, text, html, headers } = job.data;

  // Fire webhook event for inbound email
  // Create a synthetic event ID for tracking
  const db = getDb();
  const [event] = await db
    .insert(emailEvents)
    .values({
      emailId: "00000000-0000-0000-0000-000000000000", // No email record for inbound
      accountId,
      type: "delivered", // closest standard type
      data: { inbound: true, from, to, subject },
    })
    .returning();

  await dispatchEvent(accountId, "email.received", event.id, {
    from,
    to,
    subject,
    text,
    html: html.substring(0, 50_000), // Truncate large HTML
  });
}

export function createInboundEmailWorker() {
  return new Worker("email:inbound", processInboundEmail, {
    connection: getRedisConnection(),
    concurrency: 5,
  });
}
