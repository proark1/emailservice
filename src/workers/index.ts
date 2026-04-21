import type { Worker } from "bullmq";
import { childLogger } from "../lib/logger.js";
import { createEmailSendWorker } from "./email-send.worker.js";
import { createDnsVerifyWorker } from "./dns-verify.worker.js";
import { createWebhookDeliverWorker } from "./webhook-deliver.worker.js";
import { createInboundEmailWorker } from "./inbound-email.worker.js";
import { createScheduledEmailWorker } from "./scheduled-email.worker.js";
import { createWarmupWorker } from "./warmup.worker.js";
import { createTrashPurgeWorker } from "./trash-purge.worker.js";
import { createMailboxSyncWorker } from "./mailbox-sync.worker.js";
import { createBroadcastWorker } from "./broadcast.worker.js";
import { createImportWorker } from "./import.worker.js";
import { createAbTestWorker } from "./abtest.worker.js";
import { createSequenceWorker } from "./sequence.worker.js";

function attachErrorHandlers(worker: Worker, name: string) {
  const log = childLogger(`worker:${name}`);
  worker.on("error", (err) => {
    log.error({ err: err.message }, "worker error");
  });
  worker.on("failed", (job, err) => {
    log.error(
      {
        jobId: job?.id ?? null,
        attemptsMade: job?.attemptsMade ?? null,
        maxAttempts: job?.opts?.attempts ?? null,
        err: err.message,
      },
      "job failed",
    );
  });
}

export function startAllWorkers() {
  const workerEntries: Array<{ worker: Worker; name: string }> = [
    { worker: createEmailSendWorker(), name: "email.send" },
    { worker: createDnsVerifyWorker(), name: "dns.verify" },
    { worker: createWebhookDeliverWorker(), name: "webhook.deliver" },
    { worker: createInboundEmailWorker(), name: "email.inbound" },
    { worker: createScheduledEmailWorker(), name: "email.scheduled" },
    { worker: createWarmupWorker(), name: "email.warmup" },
    { worker: createTrashPurgeWorker(), name: "trash.purge" },
    { worker: createMailboxSyncWorker(), name: "mailbox.sync" },
    { worker: createBroadcastWorker(), name: "broadcast.execute" },
    { worker: createImportWorker(), name: "contact.import" },
    { worker: createAbTestWorker(), name: "broadcast.abtest" },
    { worker: createSequenceWorker(), name: "sequence.process" },
  ];

  for (const { worker, name } of workerEntries) {
    attachErrorHandlers(worker, name);
  }

  const workers = workerEntries.map((e) => e.worker);

  childLogger("workers").info(
    { count: workers.length, names: workerEntries.map((e) => e.name) },
    "workers started",
  );

  return workers;
}
