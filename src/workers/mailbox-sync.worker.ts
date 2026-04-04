import { Worker, Job } from "bullmq";
import { eq, and, inArray } from "drizzle-orm";
import { createWorkerConnection, getMailboxSyncQueue } from "../queues/index.js";
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

interface ParsedMessage {
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  ccAddresses: string[] | null;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[] | null;
  messageDate: Date;
}

async function syncMailbox(mailbox: typeof connectedMailboxes.$inferSelect) {
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const { computeThreadId } = await import("../services/thread.service.js");
  const db = getDb();
  const password = getDecryptedPassword(mailbox);

  // Resolve inbox folder once before the loop (eliminates N per-message queries)
  let inboxFolderId: string | null = null;
  try {
    const { getFolderBySlug } = await import("../services/folder.service.js");
    const inboxFolder = await getFolderBySlug(mailbox.accountId, "inbox");
    inboxFolderId = inboxFolder.id;
  } catch {
    // Folder not yet seeded — null folderId means "default inbox"
  }

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

      // Phase 1: Fetch and parse all messages into memory
      const parsedMessages: ParsedMessage[] = [];

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
        let fromAddress = mailbox.email;
        let fromName: string | null = null;
        let toAddress = mailbox.email;
        let subject = "(no subject)";
        let textBody: string | null = null;
        let htmlBody: string | null = null;
        let messageId: string | null = null;
        let inReplyTo: string | null = null;
        let references: string[] | null = null;
        let ccAddresses: string[] | null = null;
        let messageDate: Date = new Date();

        if (msg.source) {
          try {
            const parsed = await simpleParser(msg.source);

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
            const refsRaw = parsed.references;
            references = Array.isArray(refsRaw) ? refsRaw : refsRaw ? [refsRaw] : null;
            messageDate = parsed.date ?? new Date();
          } catch (parseErr) {
            console.warn(`[mailbox-sync] Failed to parse message uid=${msg.uid}:`, parseErr);
            const envFrom = msg.envelope.from?.[0] as any;
            fromAddress = envFrom?.address ?? envFrom?.name ?? mailbox.email;
            fromName = envFrom?.name ?? null;
            subject = msg.envelope.subject ?? "(no subject)";
            messageId = msg.envelope.messageId ?? null;
            inReplyTo = msg.envelope.inReplyTo ?? null;
          }
        } else {
          const envFrom = msg.envelope.from?.[0] as any;
          fromAddress = envFrom?.address ?? mailbox.email;
          fromName = envFrom?.name ?? null;
          subject = msg.envelope.subject ?? "(no subject)";
          messageId = msg.envelope.messageId ?? null;
          inReplyTo = msg.envelope.inReplyTo ?? null;
          messageDate = msg.envelope.date instanceof Date ? msg.envelope.date : new Date();
        }

        parsedMessages.push({ fromAddress, fromName, toAddress, ccAddresses, subject, textBody, htmlBody, messageId, inReplyTo, references, messageDate });
      }

      // Phase 2: Batch-check for existing messageIds (single query instead of N)
      const messageIdsToCheck = parsedMessages
        .map((m) => m.messageId)
        .filter((id): id is string => id !== null);

      const existingIds = new Set<string>();
      if (messageIdsToCheck.length > 0) {
        // Check in chunks of 100 to stay within reasonable query size
        const CHUNK = 100;
        for (let i = 0; i < messageIdsToCheck.length; i += CHUNK) {
          const chunk = messageIdsToCheck.slice(i, i + CHUNK);
          const rows = await db.select({ messageId: inboundEmails.messageId })
            .from(inboundEmails)
            .where(and(
              eq(inboundEmails.accountId, mailbox.accountId),
              inArray(inboundEmails.messageId, chunk),
            ));
          for (const r of rows) {
            if (r.messageId) existingIds.add(r.messageId);
          }
        }
      }

      // Phase 3: Batch-insert new messages (skip duplicates)
      const newMessages = parsedMessages.filter((m) => !m.messageId || !existingIds.has(m.messageId));

      if (newMessages.length > 0) {
        const rows = newMessages.map((m) => ({
          accountId: mailbox.accountId,
          folderId: inboxFolderId,
          fromAddress: m.fromAddress,
          fromName: m.fromName || null,
          toAddress: m.toAddress,
          ccAddresses: m.ccAddresses?.length ? m.ccAddresses : null,
          subject: m.subject,
          textBody: m.textBody,
          htmlBody: m.htmlBody,
          messageId: m.messageId,
          inReplyTo: m.inReplyTo,
          threadId: computeThreadId(m.messageId, m.inReplyTo, m.references, m.subject),
          references: m.references,
          hasAttachments: false as const,
          headers: {},
          createdAt: m.messageDate,
        }));

        // Insert in chunks of 50 to avoid overly large queries
        const INSERT_CHUNK = 50;
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          await db.insert(inboundEmails).values(rows.slice(i, i + INSERT_CHUNK)).onConflictDoNothing();
        }
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
    connection: createWorkerConnection(),
    concurrency: 1,
  });

  // Run every 5 minutes
  getMailboxSyncQueue().add("mailbox-sync-check", {}, {
    repeat: { every: 5 * 60_000 },
    jobId: "mailbox-sync-recurring",
  }).catch(() => {});

  return worker;
}
