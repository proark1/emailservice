import { Worker } from "bullmq";
import { lt, and, isNotNull } from "drizzle-orm";
import { createWorkerConnection, getTrashPurgeQueue } from "../queues/index.js";
import { getDb } from "../db/index.js";
import { inboundEmails, emails, inboundAttachments } from "../db/schema/index.js";
import { eq, inArray } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function purgeTrash() {
  const db = getDb();
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  // Purge old inbound emails from trash
  const oldInbound = await db
    .select({ id: inboundEmails.id })
    .from(inboundEmails)
    .where(
      and(
        isNotNull(inboundEmails.deletedAt),
        lt(inboundEmails.deletedAt, cutoff),
      ),
    )
    .limit(500);

  if (oldInbound.length > 0) {
    const ids = oldInbound.map((e) => e.id);

    // Delete associated attachments from storage
    const attachments = await db
      .select({ id: inboundAttachments.id, storagePath: inboundAttachments.storagePath })
      .from(inboundAttachments)
      .where(inArray(inboundAttachments.inboundEmailId, ids));

    const storageDir = path.join(process.cwd(), "data", "attachments");
    for (const att of attachments) {
      try {
        fs.unlinkSync(path.join(storageDir, att.storagePath));
      } catch {}
    }

    // DB cascade will handle attachment records
    await db.delete(inboundEmails).where(inArray(inboundEmails.id, ids));
  }

  // Purge old outbound emails from trash
  const oldOutbound = await db
    .select({ id: emails.id })
    .from(emails)
    .where(
      and(
        isNotNull(emails.deletedAt),
        lt(emails.deletedAt, cutoff),
      ),
    )
    .limit(500);

  if (oldOutbound.length > 0) {
    const ids = oldOutbound.map((e) => e.id);
    await db.delete(emails).where(inArray(emails.id, ids));
  }

  const total = oldInbound.length + oldOutbound.length;
  if (total > 0) {
    console.log(`[trash-purge] Purged ${total} emails older than 30 days`);
  }
}

export function createTrashPurgeWorker() {
  // Set up the repeating job
  const queue = getTrashPurgeQueue();
  queue.upsertJobScheduler("trash-purge-scheduler", {
    every: 6 * 60 * 60 * 1000, // every 6 hours
  }, {
    name: "purge",
    data: {},
  });

  return new Worker("trash.purge", async () => {
    await purgeTrash();
  }, {
    connection: createWorkerConnection(),
    concurrency: 1,
  });
}
