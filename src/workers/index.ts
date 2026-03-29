import { createEmailSendWorker } from "./email-send.worker.js";
import { createDnsVerifyWorker } from "./dns-verify.worker.js";
import { createWebhookDeliverWorker } from "./webhook-deliver.worker.js";
import { createInboundEmailWorker } from "./inbound-email.worker.js";
import { createScheduledEmailWorker } from "./scheduled-email.worker.js";
import { createWarmupWorker } from "./warmup.worker.js";
import { createTrashPurgeWorker } from "./trash-purge.worker.js";
import { createAnalyticsRollupWorker } from "./analytics-rollup.worker.js";
import { createBlacklistCheckWorker } from "./blacklist-check.worker.js";

export function startAllWorkers() {
  const workers = [
    createEmailSendWorker(),
    createDnsVerifyWorker(),
    createWebhookDeliverWorker(),
    createInboundEmailWorker(),
    createScheduledEmailWorker(),
    createWarmupWorker(),
    createTrashPurgeWorker(),
    createAnalyticsRollupWorker(),
    createBlacklistCheckWorker(),
  ];

  console.log(`Started ${workers.length} workers:`);
  console.log("  - email.send (concurrency: 10)");
  console.log("  - dns.verify (concurrency: 3)");
  console.log("  - webhook.deliver (concurrency: 5)");
  console.log("  - email.inbound (concurrency: 5)");
  console.log("  - email.scheduled (concurrency: 1)");
  console.log("  - email.warmup (concurrency: 1, recurring: 60m)");
  console.log("  - trash.purge (concurrency: 1, recurring: 6h)");
  console.log("  - analytics.rollup (concurrency: 1, recurring: 24h)");
  console.log("  - blacklist:check (concurrency: 2)");

  return workers;
}
