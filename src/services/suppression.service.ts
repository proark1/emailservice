import { eq, and, inArray, desc, lt, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { suppressions } from "../db/schema/index.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import { buildPaginatedResponse, type PaginationParams } from "../lib/pagination.js";

export async function addSuppression(
  accountId: string,
  email: string,
  reason: "bounce" | "complaint" | "unsubscribe" | "manual",
  sourceEmailId?: string,
) {
  const db = getDb();
  try {
    const [suppression] = await db
      .insert(suppressions)
      .values({
        accountId,
        email: email.toLowerCase(),
        reason,
        sourceEmailId: sourceEmailId || null,
      })
      .returning();
    return suppression;
  } catch (error: any) {
    if (error.code === "23505") {
      throw new ConflictError(`${email} is already suppressed`);
    }
    throw error;
  }
}

export async function listSuppressions(accountId: string, pagination?: PaginationParams) {
  const db = getDb();
  const limit = pagination?.limit ?? 100;
  const conditions = [eq(suppressions.accountId, accountId)];

  // Keyset pagination over (createdAt DESC, id DESC). Previous implementation
  // used `lt(id, cursor)` while ordering by createdAt, but UUIDv4 has no
  // relationship to creation order, so pages overlapped or skipped rows on
  // a compliance-critical resource. The cursor is still a suppression id; we
  // resolve it to its createdAt and ask for rows strictly older — or tied on
  // createdAt with a smaller id — so duplicate timestamps neither double-yield
  // nor skip.
  if (pagination?.cursor) {
    const [cursorRow] = await db
      .select({ createdAt: suppressions.createdAt, id: suppressions.id })
      .from(suppressions)
      .where(and(eq(suppressions.id, pagination.cursor), eq(suppressions.accountId, accountId)));
    if (cursorRow) {
      conditions.push(
        or(
          lt(suppressions.createdAt, cursorRow.createdAt),
          and(eq(suppressions.createdAt, cursorRow.createdAt), lt(suppressions.id, cursorRow.id))!,
        )!,
      );
    }
  }

  const items = await db
    .select()
    .from(suppressions)
    .where(and(...conditions))
    .orderBy(desc(suppressions.createdAt), desc(suppressions.id))
    .limit(limit + 1);

  return buildPaginatedResponse(items, limit);
}

export async function removeSuppression(accountId: string, suppressionId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(suppressions)
    .where(and(eq(suppressions.id, suppressionId), eq(suppressions.accountId, accountId)))
    .returning();
  if (!deleted) throw new NotFoundError("Suppression");
  return deleted;
}

export function formatSuppressionResponse(suppression: typeof suppressions.$inferSelect) {
  return {
    id: suppression.id,
    email: suppression.email,
    reason: suppression.reason,
    created_at: suppression.createdAt.toISOString(),
  };
}

export async function processDeliveryFailure(accountId: string, email: string, reason: "bounce" | "complaint") {
  const db = getDb();
  try { await addSuppression(accountId, email, reason); } catch {}
  try {
    const { contacts, audiences } = await import("../db/schema/index.js");
    const accts = await db.select({ id: audiences.id }).from(audiences).where(eq(audiences.accountId, accountId));
    if (accts.length > 0) {
      await db.update(contacts).set({ subscribed: false, unsubscribedAt: new Date() })
        .where(and(inArray(contacts.audienceId, accts.map(a => a.id)), eq(contacts.email, email)));
    }
  } catch {}
}
