import { eq, and, gt } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { idempotencyKeys } from "../db/schema/index.js";

const TTL_HOURS = 24;
/** Placeholder status written into the reserved row until the handler fills it in. */
const STATUS_PENDING = 0;

export interface CachedResponse {
  status: number;
  body: unknown;
}

export async function checkIdempotencyKey(
  accountId: string,
  key: string,
): Promise<CachedResponse | null> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.accountId, accountId),
        eq(idempotencyKeys.key, key),
        gt(idempotencyKeys.expiresAt, new Date()),
      ),
    );

  if (!existing || existing.responseStatus === STATUS_PENDING) return null;
  return {
    status: existing.responseStatus,
    body: existing.responseBody,
  };
}

/**
 * Atomically claim an idempotency key before running the handler.
 *
 * Returns:
 * - `{ status: "reserved" }` — this caller owns the key; run the handler and
 *   finalize via {@link storeIdempotencyKey}.
 * - `{ status: "cached", response }` — a previous successful response exists;
 *   return it without re-running the handler.
 * - `{ status: "in_flight" }` — a concurrent caller is mid-handler; retry.
 *
 * This closes the double-send race where two simultaneous requests with the
 * same key both miss the check and both execute the handler.
 */
export async function reserveIdempotencyKey(
  accountId: string,
  key: string,
): Promise<
  | { status: "reserved" }
  | { status: "cached"; response: CachedResponse }
  | { status: "in_flight" }
> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

  // Transactional read-with-lock then insert/refresh. The previous two-step
  // (INSERT … ON CONFLICT DO NOTHING; then SELECT WHERE expires_at > NOW())
  // had a bug: if a stale row existed for the same key, the insert was a
  // no-op and the select returned nothing, so the function returned
  // "reserved" without actually claiming the key — letting two concurrent
  // callers both run the handler. Holding a row-level lock through the
  // upsert closes that gap.
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.accountId, accountId), eq(idempotencyKeys.key, key)))
      .for("update");

    const now = new Date();
    if (existing && existing.expiresAt > now) {
      if (existing.responseStatus === STATUS_PENDING) return { status: "in_flight" } as const;
      return {
        status: "cached",
        response: { status: existing.responseStatus, body: existing.responseBody },
      } as const;
    }

    // No live row — claim it. onConflictDoUpdate covers the case where a
    // stale row existed (overwrites it) and the case where no row existed
    // (insert). Either way we now own the reservation.
    await tx
      .insert(idempotencyKeys)
      .values({
        accountId,
        key,
        responseStatus: STATUS_PENDING,
        responseBody: null,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [idempotencyKeys.accountId, idempotencyKeys.key],
        set: {
          responseStatus: STATUS_PENDING,
          responseBody: null,
          expiresAt,
        },
      });

    return { status: "reserved" } as const;
  });
}

/**
 * Finalize a previously-reserved idempotency key with the real response.
 * Uses `onConflictDoUpdate` so that a reserved row is always filled in, and
 * retries within the TTL window get a consistent response.
 */
export async function storeIdempotencyKey(
  accountId: string,
  key: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

  await db
    .insert(idempotencyKeys)
    .values({ accountId, key, responseStatus, responseBody, expiresAt })
    .onConflictDoUpdate({
      target: [idempotencyKeys.accountId, idempotencyKeys.key],
      set: { responseStatus, responseBody, expiresAt },
    });
}
