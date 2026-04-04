import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queues/index.js";
import { selectAbTestWinner } from "../services/broadcast.service.js";

export interface AbTestJobData {
  broadcastId: string;
}

async function processAbTest(job: Job<AbTestJobData>) {
  await selectAbTestWinner(job.data.broadcastId);
}

export function createAbTestWorker() {
  return new Worker("broadcast.abtest", processAbTest, {
    connection: getRedisConnection(),
    concurrency: 2,
  });
}
