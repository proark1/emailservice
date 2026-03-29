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
  references?: string[];
  headers: Record<string, unknown>;
  attachments?: Array<{ filename: string; contentType: string; size: number; content: string }>;
}

async function processInboundEmail(job: Job<InboundEmailJobData>) {
  const data = job.data;
  const db = getDb();

  // Compute thread ID
  const { computeThreadId } = await import("../services/thread.service.js");
  const threadId = computeThreadId(data.messageId, data.inReplyTo, data.references, data.subject);

  // Get inbox folder for this account
  let inboxFolderId: string | null = null;
  try {
    const { getFolderBySlug } = await import("../services/folder.service.js");
    const inboxFolder = await getFolderBySlug(data.accountId, "inbox");
    inboxFolderId = inboxFolder.id;
  } catch {
    // Folders not yet seeded — email will have null folderId (treated as inbox)
  }

  const hasAttachments = !!data.attachments && data.attachments.length > 0;

  // Store the inbound email
  const [stored] = await db.insert(inboundEmails).values({
    accountId: data.accountId,
    domainId: data.domainId || null,
    folderId: inboxFolderId,
    fromAddress: data.from,
    fromName: data.fromName,
    toAddress: data.to,
    ccAddresses: data.cc || null,
    subject: data.subject || "(no subject)",
    textBody: data.text || null,
    htmlBody: data.html || null,
    messageId: data.messageId,
    inReplyTo: data.inReplyTo,
    threadId,
    references: data.references || null,
    hasAttachments,
    headers: (data.headers as Record<string, string>) || null,
  }).returning();

  // Store attachments
  if (data.attachments && data.attachments.length > 0) {
    try {
      const { storeInboundAttachment } = await import("../services/attachment.service.js");
      for (const att of data.attachments) {
        await storeInboundAttachment(data.accountId, stored.id, {
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          content: Buffer.from(att.content, "base64"),
        });
      }
    } catch (err) {
      console.error(`[inbound-email] Failed to store attachments for ${stored.id}:`, err);
      // Correct the hasAttachments flag since storage failed
      await db.update(inboundEmails).set({ hasAttachments: false }).where(eq(inboundEmails.id, stored.id)).catch(() => {});
    }
  }

  // Auto-learn sender contact
  try {
    const { autoLearnContact } = await import("../services/address-book.service.js");
    await autoLearnContact(data.accountId, data.from, data.fromName);
  } catch {}


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
  return new Worker("email.inbound", processInboundEmail, {
    connection: getRedisConnection(),
    concurrency: 5,
  });
}
