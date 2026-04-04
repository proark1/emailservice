import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import { getConfig } from "../config/index.js";

let _connection: any = null;

/**
 * Shared Redis connection for Queue instances (non-blocking operations).
 * Do NOT use this for Worker instances — use createWorkerConnection() instead.
 */
export function getRedisConnection() {
  if (!_connection) {
    const config = getConfig();
    if (!config.REDIS_URL) {
      throw new Error("REDIS_URL is required for queue operations");
    }
    _connection = new IORedis.default(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

const _workerConnections: IORedis.default[] = [];

/**
 * Create a dedicated Redis connection for a BullMQ Worker.
 * Workers use blocking commands (BLPOP/BRPOP) which require their own connection
 * to avoid deadlocking the shared queue connection.
 */
export function createWorkerConnection(): any {
  const config = getConfig();
  if (!config.REDIS_URL) {
    throw new Error("REDIS_URL is required for queue operations");
  }
  const conn = new IORedis.default(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  _workerConnections.push(conn);
  return conn;
}

export function isRedisConfigured(): boolean {
  const config = getConfig();
  return !!config.REDIS_URL;
}

const _queues = new Map<string, Queue>();

function getQueue(name: string, opts?: Partial<QueueOptions>): Queue {
  let queue = _queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: getRedisConnection(),
      ...opts,
    });
    _queues.set(name, queue);
  }
  return queue;
}

export function getEmailSendQueue() {
  return getQueue("email.send", {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
}
export function getWebhookDeliverQueue() {
  return getQueue("webhook.deliver", {
    defaultJobOptions: {
      attempts: 6,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
}
export function getDnsVerifyQueue() {
  return getQueue("dns.verify", {
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { age: 72 * 3600 },
    },
  });
}
export function getScheduledEmailQueue() {
  return getQueue("email.scheduled", {
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 10 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
}
export function getInboundEmailQueue() {
  return getQueue("email.inbound", {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
}
export function getWarmupQueue() {
  return getQueue("email.warmup", {
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
}
export function getTrashPurgeQueue() {
  return getQueue("trash.purge", {
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 10 },
      removeOnFail: { age: 24 * 3600 },
    },
  });
}
export function getMailboxSyncQueue() {
  return getQueue("mailbox.sync", {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
}

export function getBroadcastQueue() {
  return getQueue("broadcast.execute", {
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
}

export async function closeQueues() {
  const closePromises = Array.from(_queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  _queues.clear();
  // Close dedicated worker connections
  await Promise.all(_workerConnections.map((c) => c.quit().catch(() => {})));
  _workerConnections.length = 0;
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
