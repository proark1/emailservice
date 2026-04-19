import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { companyMailboxes, companyMembers, domains, domainMembers } from "../db/schema/index.js";
import { NotFoundError, ConflictError, ValidationError } from "../lib/errors.js";
import { requireCompanyRole } from "./company.service.js";

/**
 * Create a handle -> member mapping. The domain must belong to the company,
 * and the target account must be a company member.
 */
export async function assignMailbox(
  callerAccountId: string,
  companyId: string,
  { accountId, domainId, localPart }: { accountId: string; domainId: string; localPart: string },
) {
  await requireCompanyRole(callerAccountId, companyId, "admin");
  const db = getDb();

  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
  if (!domain) throw new NotFoundError("Domain");
  if (domain.companyId !== companyId) {
    throw new ValidationError("Domain is not linked to this company");
  }

  const [member] = await db
    .select()
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.accountId, accountId)));
  if (!member) throw new ValidationError("Target account is not a member of this company");

  const normalizedLocal = localPart.toLowerCase();

  try {
    const [mailbox] = await db
      .insert(companyMailboxes)
      .values({ companyId, domainId, accountId, localPart: normalizedLocal })
      .returning();

    // Mirror into domain_members so outbound send permission checks still work.
    // The member is scoped to exactly this mailbox on this domain.
    await db
      .insert(domainMembers)
      .values({
        domainId,
        accountId,
        role: "member",
        mailboxes: [`${normalizedLocal}@${domain.name}`],
      })
      .onConflictDoNothing();

    return mailbox;
  } catch (err: any) {
    if (err.code === "23505") {
      throw new ConflictError(`The handle ${normalizedLocal}@${domain.name} is already assigned`);
    }
    throw err;
  }
}

export async function listMailboxes(
  callerAccountId: string,
  companyId: string,
  filters: { domainId?: string; accountId?: string } = {},
) {
  await requireCompanyRole(callerAccountId, companyId, "member");
  const db = getDb();

  const conditions = [eq(companyMailboxes.companyId, companyId)];
  if (filters.domainId) conditions.push(eq(companyMailboxes.domainId, filters.domainId));
  if (filters.accountId) conditions.push(eq(companyMailboxes.accountId, filters.accountId));

  return db
    .select({
      id: companyMailboxes.id,
      companyId: companyMailboxes.companyId,
      domainId: companyMailboxes.domainId,
      accountId: companyMailboxes.accountId,
      localPart: companyMailboxes.localPart,
      domainName: domains.name,
      createdAt: companyMailboxes.createdAt,
    })
    .from(companyMailboxes)
    .innerJoin(domains, eq(domains.id, companyMailboxes.domainId))
    .where(and(...conditions))
    .orderBy(companyMailboxes.localPart);
}

export async function removeMailbox(callerAccountId: string, companyId: string, mailboxId: string) {
  await requireCompanyRole(callerAccountId, companyId, "admin");
  const db = getDb();

  const [mailbox] = await db
    .select()
    .from(companyMailboxes)
    .where(and(eq(companyMailboxes.id, mailboxId), eq(companyMailboxes.companyId, companyId)));
  if (!mailbox) throw new NotFoundError("Mailbox");

  const [deleted] = await db.delete(companyMailboxes).where(eq(companyMailboxes.id, mailboxId)).returning();
  return deleted;
}

/**
 * Used by inbound SMTP routing: resolve (domainId, localPart) -> owning member account.
 * Returns null when no mapping exists — caller falls back to domain owner.
 */
export async function resolveMailbox(domainId: string, localPart: string) {
  const db = getDb();
  const [row] = await db
    .select({ accountId: companyMailboxes.accountId, mailboxId: companyMailboxes.id })
    .from(companyMailboxes)
    .where(and(eq(companyMailboxes.domainId, domainId), eq(companyMailboxes.localPart, localPart.toLowerCase())));
  return row ?? null;
}

export function formatMailboxResponse(row: {
  id: string;
  companyId: string;
  domainId: string;
  accountId: string;
  localPart: string;
  domainName?: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    company_id: row.companyId,
    domain_id: row.domainId,
    account_id: row.accountId,
    local_part: row.localPart,
    address: row.domainName ? `${row.localPart}@${row.domainName}` : undefined,
    created_at: row.createdAt.toISOString(),
  };
}
