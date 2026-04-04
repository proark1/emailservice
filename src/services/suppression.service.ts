import { eq, and, inArray, desc, lt } from "drizzle-orm";
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

  if (pagination?.cursor) {
    conditions.push(lt(suppressions.id, pagination.cursor));
  }

  const items = await db
    .select()
    .from(suppressions)
    .where(and(...conditions))
    .orderBy(desc(suppressions.createdAt))
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
