import { Worker, type Job } from "bullmq";
import { getRedisConnection, getAnalyticsRollupQueue } from "../queues/index.js";
import { rollupDailyAnalytics } from "../services/user-analytics.service.js";

export interface RollupJobData {
  date: string;
}

export function createAnalyticsRollupWorker() {
  const queue = getAnalyticsRollupQueue();
  queue.upsertJobScheduler("analytics-rollup-scheduler", {
    every: 24 * 60 * 60 * 1000, // every 24 hours
  }, {
    name: "rollup",
    data: {},
  });

  return new Worker<RollupJobData>("analytics.rollup", async (job: Job<RollupJobData>) => {
    // If no date provided (recurring job), roll up yesterday
    const date = job.data.date || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split("T")[0];
    })();
    await rollupDailyAnalytics(date);
  }, {
    connection: getRedisConnection(),
    concurrency: 1,
  });
}
