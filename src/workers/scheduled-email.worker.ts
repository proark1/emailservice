import { Worker, Job } from "bullmq";
import { lte, eq, and, isNotNull } from "drizzle-orm";
import { getRedisConnection, getEmailSendQueue, getScheduledEmailQueue } from "../queues/index.js";
import { getDb } from "../db/index.js";
import { emails } from "../db/schema/index.js";
import { processScheduledBroadcasts } from "../services/broadcast.service.js";

async function processScheduledEmails(_job: Job) {
  const db = getDb();

  // Atomically claim due scheduled emails — prevents duplicate sends across concurrent workers
  const dueEmails = await db
    .update(emails)
    .set({ status: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(emails.status, "queued"),
        isNotNull(emails.scheduledAt),
        lte(emails.scheduledAt, new Date()),
      ),
    )
    .returning();

  for (const email of dueEmails) {
    await getEmailSendQueue().add("send", {
      emailId: email.id,
      accountId: email.accountId,
    });
  }

  // Also process any scheduled broadcasts that are due
  const broadcastResult = await processScheduledBroadcasts();

  return {
    processed: dueEmails.length,
    broadcasts_processed: broadcastResult.processed,
  };
}

export function createScheduledEmailWorker() {
  // Add a repeatable job that runs every 30 seconds
  getScheduledEmailQueue().add(
    "check-scheduled",
    {},
    {
      repeat: { every: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  ).catch((err) => {
    console.error("[scheduled-email] Failed to register repeating job:", err);
  });

  return new Worker("email.scheduled", processScheduledEmails, {
    connection: getRedisConnection(),
    concurrency: 1,
  });
}
