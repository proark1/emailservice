import { Worker, Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import { getRedisConnection, getMailboxSyncQueue } from "../queues/index.js";
import { getDb } from "../db/index.js";
import { connectedMailboxes, inboundEmails } from "../db/schema/index.js";
import { getDecryptedPassword } from "../services/mailbox.service.js";

/**
 * Mailbox sync worker — polls connected IMAP mailboxes for new messages and
 * stores them in inbound_emails so they appear in the unified inbox.
 *
 * Runs every 5 minutes. Processes each active mailbox incrementally using
 * the lastUid field so only new messages are fetched on each run.
 */
async function processMailboxSync(_job: Job) {
  const db = getDb();

  const activeMailboxes = await db.select()
    .from(connectedMailboxes)
    .where(eq(connectedMailboxes.status, "active"));

  for (const mailbox of activeMailboxes) {
    try {
      await syncMailbox(mailbox);
    } catch (err: any) {
      console.error(`[mailbox-sync] Failed for mailbox ${mailbox.id} (${mailbox.email}):`, err);
      // Mark mailbox as error so the user sees feedback in the UI
      await db.update(connectedMailboxes)
        .set({
          status: "error",
          errorMessage: err.message ?? "Unknown IMAP error",
          updatedAt: new Date(),
        })
        .where(eq(connectedMailboxes.id, mailbox.id));
    }
  }
}

async function syncMailbox(mailbox: typeof connectedMailboxes.$inferSelect) {
  const { ImapFlow } = await import("imapflow");
  const db = getDb();
  const password = getDecryptedPassword(mailbox);

  const client = new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapSecure,
    auth: { user: mailbox.username, pass: password },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    let highestUid = mailbox.lastUid;

    try {
      // Fetch all messages with UID > lastUid (incremental sync)
      const searchCriteria = mailbox.lastUid > 0
        ? { uid: `${mailbox.lastUid + 1}:*` }
        : { all: true };

      // Limit to last 50 on first sync to avoid overwhelming the system
      const messages: any[] = [];
      for await (const msg of client.fetch(searchCriteria as any, {
        uid: true,
        envelope: true,
        source: true,
        bodyStructure: true,
      })) {
        messages.push(msg);
        if (mailbox.lastUid === 0 && messages.length >= 50) break;
      }

      for (const msg of messages) {
        if (!msg.envelope) continue;
        if (msg.uid <= mailbox.lastUid) continue;

        const from = msg.envelope.from?.[0];
        const to = msg.envelope.to?.[0];

        const fromAddress = from
          ? `${from.mailbox}@${from.host}`
          : "unknown@unknown";
        const fromName = from?.name ?? null;
        const toAddress = to
          ? `${to.mailbox}@${to.host}`
          : mailbox.email;

        const subject = msg.envelope.subject ?? "(no subject)";
        const messageId = msg.envelope.messageId ?? null;
        const inReplyTo = msg.envelope.inReplyTo ?? null;
        const date = msg.envelope.date ?? new Date();

        // Parse text/html from source if available
        let textBody: string | null = null;
        let htmlBody: string | null = null;

        if (msg.source) {
          const raw = msg.source.toString("utf8");
          // Very basic body extraction — just capture text after headers
          const headerEnd = raw.indexOf("\r\n\r\n");
          if (headerEnd !== -1) {
            const body = raw.slice(headerEnd + 4);
            // Determine content type from headers
            const headers = raw.slice(0, headerEnd).toLowerCase();
            if (headers.includes("content-type: text/html")) {
              htmlBody = body;
            } else {
              textBody = body;
            }
          }
        }

        // Skip duplicates by messageId
        if (messageId) {
          const [existing] = await db.select({ id: inboundEmails.id })
            .from(inboundEmails)
            .where(and(
              eq(inboundEmails.accountId, mailbox.accountId),
              eq(inboundEmails.messageId, messageId),
            ));
          if (existing) {
            highestUid = Math.max(highestUid, msg.uid);
            continue;
          }
        }

        await db.insert(inboundEmails).values({
          accountId: mailbox.accountId,
          fromAddress,
          fromName,
          toAddress,
          subject,
          textBody,
          htmlBody,
          messageId,
          inReplyTo,
          headers: {},
          createdAt: date instanceof Date ? date : new Date(),
        });

        highestUid = Math.max(highestUid, msg.uid);
      }
    } finally {
      lock.release();
    }

    // Update sync state
    await db.update(connectedMailboxes)
      .set({
        lastSyncAt: new Date(),
        lastUid: highestUid,
        status: "active",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(connectedMailboxes.id, mailbox.id));
  } finally {
    await client.logout();
  }
}

export function createMailboxSyncWorker() {
  const worker = new Worker("mailbox.sync", processMailboxSync, {
    connection: getRedisConnection(),
    concurrency: 1,
  });

  // Run every 5 minutes
  getMailboxSyncQueue().add("mailbox-sync-check", {}, {
    repeat: { every: 5 * 60_000 },
    jobId: "mailbox-sync-recurring",
  }).catch(() => {});

  return worker;
}
