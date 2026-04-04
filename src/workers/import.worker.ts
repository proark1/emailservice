import { Worker, Job } from "bullmq";
import { getRedisConnection } from "../queues/index.js";
import { processImport } from "../services/import.service.js";

export interface ImportJobData {
  importId: string;
}

async function processImportJob(job: Job<ImportJobData>) {
  await processImport(job.data.importId);
}

export function createImportWorker() {
  return new Worker("contact.import", processImportJob, {
    connection: getRedisConnection(),
    concurrency: 2,
  });
}
