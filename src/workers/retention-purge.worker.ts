import { Worker } from "bullmq";
import { lt, eq, and, inArray, sql } from "drizzle-orm";
import { getRedisConnection, getRetentionPurgeQueue } from "../queues/index.js";
import { getDb } from "../db/index.js";
import { apiLogs, idempotencyKeys, emailEvents, webhookDeliveries } from "../db/schema/index.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger("retention-purge");

/**
 * Per-table retention windows. Tunable here without touching the worker
 * code. Keep these aligned with the legal/operational obligations:
 * - api_logs: 30d — sufficient for "what happened last month" debugging
 *   while bounding the table on busy accounts.
 * - idempotency_keys: dropped as soon as they're past their TTL (the
 *   reservation logic stops trusting them at expiresAt anyway).
 * - email_events: 90d — long enough for analytics and billing reconciliation.
 * - webhook_deliveries: 30d for terminal-status (success / exhausted) rows
 *   so we keep room for a recent-deliveries view in the dashboard.
 */
const RETENTION = {
  apiLogsDays: 30,
  emailEventsDays: 90,
  webhookDeliveriesDays: 30,
};

/** Bounded delete batch size — prevents long-running transactions. */
const BATCH_SIZE = 1000;

/** Drop rows older than `cutoff` from `table`, in BATCH_SIZE chunks, until none remain. */
async function deleteOlderThan(
  table: { id: any; createdAt: any },
  cutoff: Date,
  label: string,
  extraConditions: any[] = [],
): Promise<number> {
  const db = getDb();
  let total = 0;
  while (true) {
    // Pick a batch of ids by the indexed `created_at` predicate, then delete
    // them by primary key. This shape is friendlier to query plans on large
    // tables than DELETE … WHERE created_at < $1 LIMIT N which Postgres
    // doesn't natively support without a CTE.
    const conditions = [lt(table.createdAt, cutoff), ...extraConditions];
    const rows = await db
      .select({ id: table.id })
      .from(table as any)
      .where(and(...conditions))
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;
    const ids = rows.map((r) => r.id as string);
    await db.delete(table as any).where(inArray(table.id, ids));
    total += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }
  if (total > 0) log.info({ table: label, deleted: total }, "purged rows");
  return total;
}

async function purgeRetention() {
  const db = getDb();
  const now = Date.now();

  await deleteOlderThan(apiLogs as any, new Date(now - RETENTION.apiLogsDays * 86400_000), "api_logs");
  await deleteOlderThan(
    emailEvents as any,
    new Date(now - RETENTION.emailEventsDays * 86400_000),
    "email_events",
  );

  // Idempotency keys: just check expiresAt, not createdAt. Once expired, they
  // serve no purpose — the reservation logic treats expired rows as absent.
  let idempDeleted = 0;
  while (true) {
    const rows = await db
      .select({ id: idempotencyKeys.id })
      .from(idempotencyKeys)
      .where(lt(idempotencyKeys.expiresAt, new Date()))
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;
    const ids = rows.map((r) => r.id);
    await db.delete(idempotencyKeys).where(inArray(idempotencyKeys.id, ids));
    idempDeleted += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }
  if (idempDeleted > 0) log.info({ table: "idempotency_keys", deleted: idempDeleted }, "purged rows");

  // Webhook deliveries: only purge rows in a terminal status. In-flight
  // ("pending" / "failed"-with-retries-remaining) rows must stay or the
  // retry pipeline loses its work queue.
  let webhookDeleted = 0;
  while (true) {
    const rows = await db
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .where(
        and(
          lt(webhookDeliveries.createdAt, new Date(now - RETENTION.webhookDeliveriesDays * 86400_000)),
          inArray(webhookDeliveries.status, ["success", "exhausted"]),
        ),
      )
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;
    const ids = rows.map((r) => r.id);
    await db.delete(webhookDeliveries).where(inArray(webhookDeliveries.id, ids));
    webhookDeleted += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }
  if (webhookDeleted > 0) log.info({ table: "webhook_deliveries", deleted: webhookDeleted }, "purged rows");
}

export function createRetentionPurgeWorker() {
  // Repeating job: run every 6h. The tables are big enough that we don't
  // want to do this hourly, but small enough that 6h prevents a many-hour
  // cleanup window from blocking other operations.
  const queue = getRetentionPurgeQueue();
  queue.upsertJobScheduler(
    "retention-purge-scheduler",
    { every: 6 * 60 * 60 * 1000 },
    { name: "purge", data: {} },
  ).catch((err) => log.error({ err }, "failed to register scheduler"));

  return new Worker(
    "retention.purge",
    async () => {
      await purgeRetention();
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );
}
