import { Worker, Job } from "bullmq";
import { getRedisConnection, getSequenceQueue } from "../queues/index.js";
import { processSequenceSteps } from "../services/sequence.service.js";

async function processSequence(_job: Job) {
  return processSequenceSteps();
}

export function createSequenceWorker() {
  // Add a repeatable job that runs every 60 seconds
  getSequenceQueue().add(
    "process-due-steps",
    {},
    {
      repeat: { every: 60_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  ).catch((err) => {
    console.error("[sequence] Failed to register repeating job:", err);
  });

  return new Worker("sequence.process", processSequence, {
    connection: getRedisConnection(),
    concurrency: 1,
  });
}
