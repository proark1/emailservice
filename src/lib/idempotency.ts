import { eq, and, gt } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { idempotencyKeys } from "../db/schema/index.js";

const TTL_HOURS = 24;

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

  if (existing) {
    return {
      status: existing.responseStatus,
      body: existing.responseBody,
    };
  }

  return null;
}

export async function storeIdempotencyKey(
  accountId: string,
  key: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3_600_000);

  await db.insert(idempotencyKeys).values({
    accountId,
    key,
    responseStatus,
    responseBody,
    expiresAt,
  }).onConflictDoNothing();
}
