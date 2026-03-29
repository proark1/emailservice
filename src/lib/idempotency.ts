import { eq, and, gt } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { idempotencyKeys } from "../db/schema/index.js";

const TTL_HOURS = 24;

export interface CachedResponse {
  status: number;
  body: unknown;
}

/**
 * Check if an idempotency key has already been used and has a cached response.
 * Returns the cached response if found, null otherwise.
 */
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

  if (existing && existing.responseStatus !== null) {
    return {
      status: existing.responseStatus,
      body: existing.responseBody,
    };
  }

  return null;
}

/**
 * Attempt to atomically claim an idempotency key. Returns true if claimed
 * (this request should proceed), false if already claimed by another request.
 */
export async function claimIdempotencyKey(
  accountId: string,
  key: string,
): Promise<boolean> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

  // Insert a placeholder row — if it already exists, another request owns it
  const result = await db.insert(idempotencyKeys).values({
    accountId,
    key,
    responseStatus: null as any,
    responseBody: null,
    expiresAt,
  }).onConflictDoNothing().returning({ id: idempotencyKeys.id });

  return result.length > 0;
}

export async function storeIdempotencyKey(
  accountId: string,
  key: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

  await db.update(idempotencyKeys)
    .set({ responseStatus, responseBody, expiresAt })
    .where(
      and(
        eq(idempotencyKeys.accountId, accountId),
        eq(idempotencyKeys.key, key),
      ),
    );
}
