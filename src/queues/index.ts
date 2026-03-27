import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import { getConfig } from "../config/index.js";

let _connection: any = null;

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

export function getEmailSendQueue() { return getQueue("email.send"); }
export function getWebhookDeliverQueue() { return getQueue("webhook.deliver"); }
export function getDnsVerifyQueue() { return getQueue("dns.verify"); }
export function getScheduledEmailQueue() { return getQueue("email.scheduled"); }
export function getInboundEmailQueue() { return getQueue("email.inbound"); }
export function getWarmupQueue() { return getQueue("email.warmup"); }

export async function closeQueues() {
  const closePromises = Array.from(_queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  _queues.clear();
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
