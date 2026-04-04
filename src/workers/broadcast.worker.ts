import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queues/index.js";
import { executeBroadcast } from "../services/broadcast.service.js";

export interface BroadcastJobData {
  broadcastId: string;
}

async function processBroadcast(job: Job<BroadcastJobData>) {
  await executeBroadcast(job.data.broadcastId);
}

export function createBroadcastWorker() {
  return new Worker("broadcast.execute", processBroadcast, {
    connection: getRedisConnection(),
    concurrency: 2,
  });
}
