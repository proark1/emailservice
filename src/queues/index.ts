import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import { getConfig } from "../config/index.js";

let _connection: any = null;

export function getRedisConnection() {
  if (!_connection) {
    const config = getConfig();
    _connection = new IORedis.default(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

function createQueue(name: string, opts?: Partial<QueueOptions>): Queue {
  return new Queue(name, {
    connection: getRedisConnection(),
    ...opts,
  });
}

export const emailSendQueue = createQueue("email:send");
export const webhookDeliverQueue = createQueue("webhook:deliver");
export const dnsVerifyQueue = createQueue("dns:verify");
export const scheduledEmailQueue = createQueue("email:scheduled");
export const inboundEmailQueue = createQueue("email:inbound");

export async function closeQueues() {
  await Promise.all([
    emailSendQueue.close(),
    webhookDeliverQueue.close(),
    dnsVerifyQueue.close(),
    scheduledEmailQueue.close(),
    inboundEmailQueue.close(),
  ]);
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
