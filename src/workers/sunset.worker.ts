import { Worker } from "bullmq";
import { getRedisConnection, getSunsetSweepQueue } from "../queues/index.js";
import { runSunsetSweep } from "../services/sunset.service.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger("sunset-worker");

export function createSunsetSweepWorker() {
  const queue = getSunsetSweepQueue();
  // Sweep daily — checking every account hourly is wasteful, and the policy
  // is by definition coarse-grained (180-day default).
  queue
    .upsertJobScheduler(
      "sunset-sweep-scheduler",
      { every: 24 * 60 * 60 * 1000 },
      { name: "sweep", data: {} },
    )
    .catch((err) => log.error({ err }, "failed to register scheduler"));

  return new Worker(
    "sunset.sweep",
    async () => {
      const result = await runSunsetSweep();
      log.info(result, "sunset sweep completed");
      return result;
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );
}
