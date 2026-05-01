import IORedis from "ioredis";
import { getConfig } from "../config/index.js";
import { isRedisConfigured, getRedisConnection } from "../queues/index.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger("events-pubsub");

export interface RealtimeEvent {
  type: string;
  created_at: string;
  data: Record<string, unknown>;
}

export type EventListener = (event: RealtimeEvent) => void;

/**
 * Per-account fan-out for realtime events. Built on Redis pub/sub so it
 * works across multiple API instances behind a load balancer.
 *
 * One channel per account: `events:{accountId}`. Subscribers (SSE
 * connections) subscribe to their own channel only — events for one
 * account never reach another account's stream.
 *
 * Local in-process listeners are also notified directly so unit tests and
 * single-process dev setups don't need Redis.
 */
const localListeners = new Map<string, Set<EventListener>>();
let _subClient: IORedis.default | null = null;
let _subClientReady = false;

function channelFor(accountId: string): string {
  return `events:${accountId}`;
}

function notifyLocal(accountId: string, event: RealtimeEvent) {
  const listeners = localListeners.get(accountId);
  if (!listeners || listeners.size === 0) return;
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "listener threw");
    }
  }
}

/**
 * Lazily start a single Redis subscriber connection (independent of the
 * main shared connection — IORedis subscriber connections are mode-locked
 * and can't run regular commands). Subscribes to `events:*` via psubscribe
 * and routes messages to the matching account's local listeners.
 */
async function ensureSubscriber() {
  if (!isRedisConfigured()) return;
  if (_subClientReady) return;
  if (_subClient) return;
  const url = getConfig().REDIS_URL!;
  _subClient = new IORedis.default(url, { maxRetriesPerRequest: null });
  _subClient.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const accountId = channel.slice("events:".length);
    if (!accountId) return;
    let event: RealtimeEvent | null = null;
    try {
      event = JSON.parse(message);
    } catch {
      return;
    }
    if (event) notifyLocal(accountId, event);
  });
  _subClient.on("error", (err: Error) => {
    log.warn({ err: err.message }, "subscriber error");
  });
  await _subClient.psubscribe("events:*");
  _subClientReady = true;
}

export async function publishEvent(accountId: string, event: RealtimeEvent): Promise<void> {
  // Same-process listeners (tests, single-instance dev) get the event
  // synchronously — no Redis hop required.
  notifyLocal(accountId, event);
  if (!isRedisConfigured()) return;
  try {
    await getRedisConnection().publish(channelFor(accountId), JSON.stringify(event));
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "publish failed");
  }
}

export async function subscribe(accountId: string, listener: EventListener): Promise<() => void> {
  await ensureSubscriber();
  let set = localListeners.get(accountId);
  if (!set) {
    set = new Set();
    localListeners.set(accountId, set);
  }
  set.add(listener);
  return () => {
    const s = localListeners.get(accountId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) localListeners.delete(accountId);
  };
}

/**
 * Test-only: clear all in-process listeners. Production code never calls
 * this — listeners are removed via the disposer returned from `subscribe`.
 */
export function _resetForTests() {
  localListeners.clear();
}
