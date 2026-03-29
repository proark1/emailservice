import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "../queues/index.js";
import { getConfig } from "../config/index.js";

export interface BlacklistCheckJobData {
  accountId: string;
  domainId: string;
}

export function createBlacklistCheckWorker() {
  const config = getConfig();
  if (!config.REDIS_URL) return null;

  const worker = new Worker<BlacklistCheckJobData>(
    "blacklist:check",
    async (job: Job<BlacklistCheckJobData>) => {
      const { runFullCheck } = await import("../services/blacklist.service.js");
      await runFullCheck(job.data.accountId, job.data.domainId);
    },
    {
      connection: getRedisConnection(),
      concurrency: 2,
    },
  );

  return worker;
}
