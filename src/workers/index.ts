import type { Worker } from "bullmq";
import { createEmailSendWorker } from "./email-send.worker.js";
import { createDnsVerifyWorker } from "./dns-verify.worker.js";
import { createWebhookDeliverWorker } from "./webhook-deliver.worker.js";
import { createInboundEmailWorker } from "./inbound-email.worker.js";
import { createScheduledEmailWorker } from "./scheduled-email.worker.js";
import { createWarmupWorker } from "./warmup.worker.js";
import { createTrashPurgeWorker } from "./trash-purge.worker.js";
import { createMailboxSyncWorker } from "./mailbox-sync.worker.js";
import { createBroadcastWorker } from "./broadcast.worker.js";

function attachErrorHandlers(worker: Worker, name: string) {
  worker.on("error", (err) => {
    console.error(`[worker:${name}] Error:`, err.message);
  });
  worker.on("failed", (job, err) => {
    console.error(`[worker:${name}] Job ${job?.id ?? "unknown"} failed:`, err.message);
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
  ];

  for (const { worker, name } of workerEntries) {
    attachErrorHandlers(worker, name);
  }

  const workers = workerEntries.map((e) => e.worker);

  console.log(`Started ${workers.length} workers:`);
  console.log("  - email.send (concurrency: 10)");
  console.log("  - dns.verify (concurrency: 3)");
  console.log("  - webhook.deliver (concurrency: 5)");
  console.log("  - email.inbound (concurrency: 5)");
  console.log("  - email.scheduled (concurrency: 1)");
  console.log("  - email.warmup (concurrency: 1, recurring: 60m)");
  console.log("  - trash.purge (concurrency: 1, recurring: 6h)");
  console.log("  - mailbox.sync (concurrency: 1, recurring: 5m)");

  return workers;
}
