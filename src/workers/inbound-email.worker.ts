import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { getRedisConnection } from "../queues/index.js";
import { dispatchEvent } from "../services/webhook.service.js";
import { getDb } from "../db/index.js";
import { inboundEmails, domains } from "../db/schema/index.js";

export interface InboundEmailJobData {
  accountId: string;
  domainId?: string;
  from: string;
  fromName?: string;
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  html: string;
  messageId?: string;
  inReplyTo?: string;
  headers: Record<string, unknown>;
}

async function processInboundEmail(job: Job<InboundEmailJobData>) {
  const data = job.data;
  const db = getDb();

  // Store the inbound email
  const [stored] = await db.insert(inboundEmails).values({
    accountId: data.accountId,
    domainId: data.domainId || null,
    fromAddress: data.from,
    fromName: data.fromName,
    toAddress: data.to,
    ccAddresses: data.cc || null,
    subject: data.subject || "(no subject)",
    textBody: data.text || null,
    htmlBody: data.html || null,
    messageId: data.messageId,
    inReplyTo: data.inReplyTo,
  }).returning();

  // Fire webhook (best-effort — don't fail the job if dispatch errors)
  try {
    await dispatchEvent(data.accountId, "email.received", stored.id, {
      id: stored.id,
      from: data.from,
      to: data.to,
      subject: data.subject,
      text: data.text?.substring(0, 10_000),
      html: data.html?.substring(0, 50_000),
    });
  } catch (err) {
    console.error(`[inbound-email] Failed to dispatch webhook for ${stored.id}:`, err);
  }
}

export function createInboundEmailWorker() {
  return new Worker("email:inbound", processInboundEmail, {
    connection: getRedisConnection(),
    concurrency: 5,
  });
}
