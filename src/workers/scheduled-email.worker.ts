import { Worker, Job } from "bullmq";
import { lte, eq, and } from "drizzle-orm";
import { getRedisConnection, emailSendQueue, scheduledEmailQueue } from "../queues/index.js";
import { getDb } from "../db/index.js";
import { emails } from "../db/schema/index.js";

async function processScheduledEmails(_job: Job) {
  const db = getDb();

  // Find all queued emails whose scheduled_at has passed
  const dueEmails = await db
    .select()
    .from(emails)
    .where(
      and(
        eq(emails.status, "queued"),
        lte(emails.scheduledAt, new Date()),
      ),
    )
    .limit(100);

  for (const email of dueEmails) {
    await emailSendQueue.add("send", {
      emailId: email.id,
      accountId: email.accountId,
    });
  }

  return { processed: dueEmails.length };
}

export function createScheduledEmailWorker() {
  // Add a repeatable job that runs every 30 seconds
  scheduledEmailQueue.add(
    "check-scheduled",
    {},
    {
      repeat: { every: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  return new Worker("email:scheduled", processScheduledEmails, {
    connection: getRedisConnection(),
    concurrency: 1,
  });
}
