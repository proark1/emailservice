import { Worker, Job } from "bullmq";
import { getRedisConnection, getWarmupQueue } from "../queues/index.js";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { warmupSchedules } from "../db/schema/index.js";
import { executeWarmupRound } from "../services/warmup.service.js";

/**
 * Warmup worker — runs daily warmup rounds for all active schedules.
 * Uses a recurring BullMQ job that fires every 60 minutes.
 * Each run checks all active schedules and executes any that haven't run today.
 */
async function processWarmup(_job: Job) {
  const db = getDb();

  // Get all active warmup schedules
  const activeSchedules = await db.select()
    .from(warmupSchedules)
    .where(eq(warmupSchedules.status, "active"));

  for (const schedule of activeSchedules) {
    try {
      await executeWarmupRound(schedule.id);
    } catch (err) {
      // Log but don't fail the entire job for one schedule's error
      console.error(`Warmup failed for schedule ${schedule.id}:`, err);
    }
  }
}

export function createWarmupWorker() {
  const worker = new Worker("email.warmup", processWarmup, {
    connection: getRedisConnection(),
    concurrency: 1,
  });

  // Add a recurring job that runs every hour to check for warmup rounds
  getWarmupQueue().upsertJobScheduler("warmup-recurring", {
    every: 3_600_000, // every 60 minutes
  }, {
    name: "warmup-check",
    data: {},
  }).catch(() => {});

  return worker;
}
