import { and, eq, isNotNull, isNull, inArray, notInArray, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { companies, companyMailboxes, domains } from "../db/schema/index.js";
import { ForbiddenError } from "../lib/errors.js";

/**
 * GDPR isolation between a MailNowAPI platform owner and the company tenants
 * it provisions. The platform owner administers a company (creates it,
 * provisions members, links domains) but MUST NOT be able to read mail on
 * domains delegated to the company. The authoritative "I act at this address"
 * record is `company_mailboxes` — if you don't hold a mailbox on a
 * company-delegated domain, you can't see, send, or receive its mail.
 *
 * Visibility rule applied across every read path that surfaces email content
 * (subject / body / headers / sender / recipient):
 *
 *   For a row whose domain has `company_id IS NOT NULL`, the caller must
 *   have at least one `company_mailboxes` row on that domain to see it.
 *   The row's `account_id` is also enforced separately (== caller) — this
 *   helper closes the "owner happens to have an account_id-stamped row on
 *   a company domain" path (catch-all fallback, owner-initiated sends, etc).
 *
 * Implementation note: rather than thread a positive allowlist through every
 * query, we compute the NEGATIVE list — company-delegated domain IDs the
 * caller does NOT hold a mailbox on — and append `domain_id NOT IN (...)`.
 * That keeps the predicate cheap and composable with existing WHERE clauses.
 */
export async function getHiddenCompanyDomainIds(accountId: string): Promise<string[]> {
  const db = getDb();
  const callerMailboxDomains = await db
    .select({ id: companyMailboxes.domainId })
    .from(companyMailboxes)
    .where(eq(companyMailboxes.accountId, accountId));
  const allowed = callerMailboxDomains.map((r) => r.id);

  const hiddenRows = allowed.length === 0
    ? await db.select({ id: domains.id }).from(domains).where(isNotNull(domains.companyId))
    : await db
        .select({ id: domains.id })
        .from(domains)
        .where(and(isNotNull(domains.companyId), notInArray(domains.id, allowed)));

  return hiddenRows.map((r) => r.id);
}

/**
 * Build a `domain_id NOT IN (hidden...)` predicate for an arbitrary email
 * table column (used by both `emails` and `inbound_emails` queries).
 * Returns `null` when the caller has no hidden domains — caller should skip
 * appending the predicate in that case to avoid an always-true `NOT IN ()`.
 */
export async function buildCompanyDomainExclusion(
  accountId: string,
  domainIdColumn: any,
): Promise<SQL | null> {
  const hidden = await getHiddenCompanyDomainIds(accountId);
  if (hidden.length === 0) return null;
  // Treat NULL domain_id as "outside the hidden set" — once the domain row
  // is gone (ON DELETE SET NULL) we can no longer prove a company link.
  return or(isNull(domainIdColumn), notInArray(domainIdColumn, hidden))!;
}

/**
 * Send-time gate. Throws if the caller is trying to send from a
 * company-delegated domain but doesn't hold the specific mailbox they're
 * sending as. Owners / admins of the platform are NOT exempt — to send mail
 * on a company domain you must hold a `company_mailboxes` row for the exact
 * local part. Non-company domains are unaffected.
 */
export async function assertCanSendFromCompanyDomain(
  accountId: string,
  domain: { id: string; name: string; companyId: string | null },
  localPart: string,
): Promise<void> {
  if (!domain.companyId) return;
  const db = getDb();
  const [match] = await db
    .select({ id: companyMailboxes.id })
    .from(companyMailboxes)
    .where(
      and(
        eq(companyMailboxes.domainId, domain.id),
        eq(companyMailboxes.accountId, accountId),
        eq(companyMailboxes.localPart, localPart.toLowerCase()),
      ),
    );
  if (!match) {
    throw new ForbiddenError(
      `Sending from ${localPart}@${domain.name} requires a company mailbox assignment for this address. ` +
        `Platform owners cannot send mail on company-delegated domains without holding the mailbox themselves.`,
    );
  }
}

/**
 * Resolve the delivery account for inbound mail on a company-delegated
 * domain when no `company_mailboxes` mapping matches the recipient local
 * part. Falls through to the company's `default_mailbox_account_id`.
 * Returns `null` when the company has no default — caller MUST drop the
 * message in that case rather than fall back to the platform owner.
 */
export async function resolveCompanyDefaultMailbox(companyId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ accountId: companies.defaultMailboxAccountId })
    .from(companies)
    .where(eq(companies.id, companyId));
  return row?.accountId ?? null;
}

// Re-export `inArray` so callers don't need a separate drizzle import just to
// build the complementary `IN (allowed)` predicate.
export { inArray };
