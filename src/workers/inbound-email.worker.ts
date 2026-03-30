import { Worker, Job } from "bullmq";
import { eq, and, sql } from "drizzle-orm";
import { getRedisConnection } from "../queues/index.js";
import { dispatchEvent } from "../services/webhook.service.js";
import { getDb } from "../db/index.js";
import { inboundEmails, domains, emails, warmupEmails, warmupSchedules } from "../db/schema/index.js";
import { REPLY_BODIES } from "../services/warmup.service.js";

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

  // Store attachments in parallel
  if (data.attachments && data.attachments.length > 0) {
    try {
      const { storeInboundAttachment } = await import("../services/attachment.service.js");
      await Promise.all(
        data.attachments.map((att) =>
          storeInboundAttachment(data.accountId, stored.id, {
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
            content: Buffer.from(att.content, "base64"),
          }),
        ),
      );
    } catch (err) {
      console.error(`[inbound-email] Failed to store attachments for ${stored.id}:`, err);
    }
  }

  // Auto-learn sender contact — skip warmup system addresses (noreply@, mbox-N@)
  if (!/^(noreply|mbox-\d+)@/i.test(data.from)) {
    try {
      const { autoLearnContact } = await import("../services/address-book.service.js");
      await autoLearnContact(data.accountId, data.from, data.fromName);
    } catch {}
  }

  // Detect replies to warmup emails (best-effort — don't fail the job)
  if (data.inReplyTo) {
    try {
      const db = getDb();
      const now = new Date();

      // Find the outbound warmup email this is replying to (single query)
      const [sentEmail] = await db
        .select({ id: emails.id, tags: emails.tags })
        .from(emails)
        .where(eq(emails.messageId, data.inReplyTo))
        .limit(1);

      if (sentEmail?.tags?.["_warmup"] === "true") {
        const [warmupEmail] = await db
          .update(warmupEmails)
          .set({ replied: true, repliedAt: now })
          .where(eq(warmupEmails.emailId, sentEmail.id))
          .returning({ scheduleId: warmupEmails.scheduleId });

        if (warmupEmail) {
          await db
            .update(warmupSchedules)
            .set({ totalReplies: sql`${warmupSchedules.totalReplies} + 1`, updatedAt: now })
            .where(eq(warmupSchedules.id, warmupEmail.scheduleId));
        }
      }
    } catch (err) {
      console.error(`[inbound-email] Failed to record warmup reply for ${stored.id}:`, err);
    }
  }

  // Detect inbox placement for warmup emails by reading SMTP spam headers.
  // SpamAssassin (and compatible filters) set X-Spam-Status / X-Spam-Flag on
  // every message — "Yes" means the mail was classified as spam before delivery.
  // We record this so the warmup stats surface real inbox vs. spam rates.
  const warmupInboundMatch = /^mbox-\d+@/i.test(data.to);
  if (warmupInboundMatch && data.messageId && !data.inReplyTo) {
    try {
      const h = data.headers as Record<string, string | string[]>;
      const spamStatus = String(h["x-spam-status"] ?? h["X-Spam-Status"] ?? "");
      const spamFlag   = String(h["x-spam-flag"]   ?? h["X-Spam-Flag"]   ?? "");
      const isSpam = spamStatus.toLowerCase().startsWith("yes") || spamFlag.toLowerCase() === "yes";

      const [sentEmail] = await db
        .select({ id: emails.id, tags: emails.tags })
        .from(emails)
        .where(eq(emails.messageId, data.messageId))
        .limit(1);

      if (sentEmail?.tags?.["_warmup"] === "true") {
        await db.update(warmupEmails)
          .set({ inboxPlacement: isSpam ? "spam" : "inbox" })
          .where(eq(warmupEmails.emailId, sentEmail.id));
      }
    } catch (err) {
      console.error(`[inbound-email] Failed to update warmup inbox placement for ${stored.id}:`, err);
    }
  }

  // Auto-reply to warmup emails — creates genuine two-way mail flow, the strongest
  // positive signal for inbox placement. Only reply to original sends (no inReplyTo),
  // not to the auto-replies themselves, preventing reply loops.
  const warmupToMatch = /^mbox-\d+@(.+)$/i.exec(data.to);
  if (warmupToMatch && !data.inReplyTo && data.messageId) {
    try {
      const { sendEmail } = await import("../services/email.service.js");
      const domainName = warmupToMatch[1];

      const [activeSchedule] = await db
        .select({ accountId: warmupSchedules.accountId })
        .from(warmupSchedules)
        .innerJoin(domains, eq(domains.id, warmupSchedules.domainId))
        .where(and(eq(domains.name, domainName), eq(warmupSchedules.status, "active")))
        .limit(1);

      if (activeSchedule) {
        // Random 5–30 min delay so the reply looks organic
        const delayMs = (5 + Math.floor(Math.random() * 25)) * 60_000;
        await sendEmail(activeSchedule.accountId, {
          from: data.to,
          to: [data.from],
          subject: `Re: ${data.subject || "(no subject)"}`,
          text: REPLY_BODIES[Math.floor(Math.random() * REPLY_BODIES.length)],
          in_reply_to: data.messageId,
          scheduled_at: new Date(Date.now() + delayMs).toISOString(),
          tags: { _warmup_reply: "true" },
        });
      }
    } catch (err) {
      console.error(`[inbound-email] Failed to send warmup auto-reply for ${stored.id}:`, err);
    }
  }

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
  const concurrency = Number(process.env.INBOUND_CONCURRENCY) || 5;
  return new Worker("email.inbound", processInboundEmail, {
    connection: getRedisConnection(),
    concurrency,
  });
}
