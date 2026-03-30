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
 *
 * When a manual-sync job arrives with { mailboxId }, only that mailbox is
 * processed. Recurring checks process all active mailboxes.
 */
async function processMailboxSync(job: Job<{ mailboxId?: string }>) {
  const db = getDb();
  const { mailboxId } = job.data ?? {};

  let targets: (typeof connectedMailboxes.$inferSelect)[];

  if (mailboxId) {
    // Manual sync — process only the requested mailbox
    targets = await db.select()
      .from(connectedMailboxes)
      .where(and(
        eq(connectedMailboxes.id, mailboxId),
        eq(connectedMailboxes.status, "active"),
      ));
  } else {
    // Recurring sweep — process all active mailboxes
    targets = await db.select()
      .from(connectedMailboxes)
      .where(eq(connectedMailboxes.status, "active"));
  }

  for (const mailbox of targets) {
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
  const { simpleParser } = await import("mailparser");
  const db = getDb();
  const password = getDecryptedPassword(mailbox);

  const client = new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapSecure,
    auth: { user: mailbox.username, pass: password },
    logger: false,
    connectionTimeout: 15_000,
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    let highestUid = mailbox.lastUid;

    try {
      // Build UID range string: "lastUid+1:*" for incremental, "1:*" for first sync.
      // Pass { uid: true } as the options arg so ImapFlow treats the range as UIDs.
      const range = mailbox.lastUid > 0 ? `${mailbox.lastUid + 1}:*` : "1:*";
      const fetchOptions = { uid: true };

      // Limit to 50 messages on the very first sync to avoid OOM on large inboxes
      let count = 0;
      const isFirstSync = mailbox.lastUid === 0;

      for await (const msg of client.fetch(range, {
        uid: true,
        envelope: true,
        source: true,
      }, fetchOptions)) {
        if (isFirstSync && count >= 50) break;

        // Guard: skip any UIDs we already have (can happen if * resolves below our cursor)
        if (msg.uid <= mailbox.lastUid) continue;

        count++;
        highestUid = Math.max(highestUid, msg.uid);

        if (!msg.envelope) continue;

        // Parse the raw RFC 2822 source with mailparser for correct MIME handling
        // (multipart, base64, quoted-printable, etc.)
        let fromAddress = mailbox.email;
        let fromName: string | null = null;
        let toAddress = mailbox.email;
        let subject = "(no subject)";
        let textBody: string | null = null;
        let htmlBody: string | null = null;
        let messageId: string | null = null;
        let inReplyTo: string | null = null;
        let ccAddresses: string[] | null = null;
        let messageDate: Date = new Date();

        if (msg.source) {
          try {
            const parsed = await simpleParser(msg.source);

            // from.address is the full "user@host" string in mailparser/imapflow
            fromAddress = parsed.from?.value?.[0]?.address ?? mailbox.email;
            fromName = parsed.from?.value?.[0]?.name ?? null;
            toAddress = parsed.to
              ? (Array.isArray(parsed.to)
                ? parsed.to[0]?.value?.[0]?.address
                : parsed.to.value?.[0]?.address) ?? mailbox.email
              : mailbox.email;
            ccAddresses = parsed.cc
              ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
                .flatMap((a) => a.value.map((v) => v.address).filter(Boolean)) as string[]
              : null;
            subject = parsed.subject ?? "(no subject)";
            textBody = parsed.text ?? null;
            htmlBody = parsed.html || null;
            messageId = parsed.messageId ?? null;
            inReplyTo = parsed.inReplyTo ?? null;
            messageDate = parsed.date ?? new Date();
          } catch (parseErr) {
            console.warn(`[mailbox-sync] Failed to parse message uid=${msg.uid}:`, parseErr);
            // Fall back to envelope data
            const envFrom = msg.envelope.from?.[0] as any;
            fromAddress = envFrom?.address ?? envFrom?.name ?? mailbox.email;
            fromName = envFrom?.name ?? null;
            subject = msg.envelope.subject ?? "(no subject)";
            messageId = msg.envelope.messageId ?? null;
            inReplyTo = msg.envelope.inReplyTo ?? null;
          }
        } else {
          // No source — fall back to envelope only
          const envFrom = msg.envelope.from?.[0] as any;
          fromAddress = envFrom?.address ?? mailbox.email;
          fromName = envFrom?.name ?? null;
          subject = msg.envelope.subject ?? "(no subject)";
          messageId = msg.envelope.messageId ?? null;
          inReplyTo = msg.envelope.inReplyTo ?? null;
          messageDate = msg.envelope.date instanceof Date ? msg.envelope.date : new Date();
        }

        // Skip duplicates by messageId
        if (messageId) {
          const [existing] = await db.select({ id: inboundEmails.id })
            .from(inboundEmails)
            .where(and(
              eq(inboundEmails.accountId, mailbox.accountId),
              eq(inboundEmails.messageId, messageId),
            ));
          if (existing) continue;
        }

        // Resolve inbox folder for this account
        let inboxFolderId: string | null = null;
        try {
          const { getFolderBySlug } = await import("../services/folder.service.js");
          const inboxFolder = await getFolderBySlug(mailbox.accountId, "inbox");
          inboxFolderId = inboxFolder.id;
        } catch {
          // Folder not yet seeded — null folderId means "default inbox"
        }

        await db.insert(inboundEmails).values({
          accountId: mailbox.accountId,
          folderId: inboxFolderId,
          fromAddress,
          fromName: fromName || null,
          toAddress,
          ccAddresses: ccAddresses?.length ? ccAddresses : null,
          subject,
          textBody,
          htmlBody,
          messageId,
          inReplyTo,
          headers: {},
          createdAt: messageDate,
        });
      }
    } finally {
      lock.release();
    }

    // Update sync state regardless of how many messages were fetched
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
