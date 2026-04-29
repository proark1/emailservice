import { Worker, Job } from "bullmq";
import { lte, eq, and, isNotNull, sql } from "drizzle-orm";
import { getRedisConnection, getEmailSendQueue, getScheduledEmailQueue } from "../queues/index.js";
import { getDb } from "../db/index.js";
import { emails } from "../db/schema/index.js";
import { processScheduledBroadcasts } from "../services/broadcast.service.js";

const STUCK_SENDING_THRESHOLD_MINUTES = 10;

async function processScheduledEmails(_job: Job) {
  const db = getDb();

  // Recover emails stuck in "sending" for more than 10 minutes (likely worker crash)
  const stuckEmails = await db
    .update(emails)
    .set({ status: "queued", updatedAt: new Date() })
    .where(
      and(
        eq(emails.status, "sending"),
        lte(emails.updatedAt, sql`NOW() - INTERVAL '${sql.raw(String(STUCK_SENDING_THRESHOLD_MINUTES))} minutes'`),
      ),
    )
    .returning({ id: emails.id });

  if (stuckEmails.length > 0) {
    console.warn(`[scheduled-email] Recovered ${stuckEmails.length} stuck emails back to queued`);
  }

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

  // Use the email id as the BullMQ jobId so a re-claim after worker crash
  // (the recovery loop above resets stuck "sending" rows back to "queued"
  // and the next tick re-claims them) is deduplicated by BullMQ instead of
  // producing two send jobs for the same email. Also: enqueue best-effort
  // per email so a transient Redis hiccup on one job doesn't strand the
  // other claims in "sending" — anything that fails to enqueue here will
  // be picked up by the recovery loop on the next tick.
  for (const email of dueEmails) {
    try {
      await getEmailSendQueue().add(
        "send",
        { emailId: email.id, accountId: email.accountId },
        { jobId: `scheduled:${email.id}` },
      );
    } catch (err) {
      console.error(`[scheduled-email] Failed to enqueue ${email.id}:`, err);
    }
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
