import { and, eq, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
 */

/**
 * Build a `domain_id NOT IN (hidden...)` predicate for an email table
 * column. The `hidden` set is delivered as a correlated SQL subquery
 * rather than an in-memory array — important for the platform-owner case,
 * where the hidden set spans every tenant domain. Materializing it would
 * round-trip a large list and could brush against Postgres's 65,535
 * parameter cap on the subsequent `NOT IN`.
 */
export function buildCompanyDomainExclusion(
  accountId: string,
  domainIdColumn: AnyPgColumn,
): SQL {
  const db = getDb();
  // Domains the caller can see on company-delegated domains: those where
  // they hold at least one `company_mailboxes` row. We select the negative
  // — company-delegated domain IDs the caller does NOT hold a mailbox on
  // — via a LEFT JOIN + IS NULL pattern, which the query planner handles
  // efficiently against the existing indexes (`idx_company_mailboxes_account`
  // plus the `domains.company_id` filter).
  const hiddenDomainIds = db
    .select({ id: domains.id })
    .from(domains)
    .leftJoin(
      companyMailboxes,
      and(eq(companyMailboxes.domainId, domains.id), eq(companyMailboxes.accountId, accountId)),
    )
    .where(and(isNotNull(domains.companyId), isNull(companyMailboxes.id)));

  // Treat NULL domain_id as "outside the hidden set" — once the domain row
  // is gone (ON DELETE SET NULL) we can no longer prove a company link, so
  // the safer interpretation is to leave the row visible to its accountId.
  return or(isNull(domainIdColumn), notInArray(domainIdColumn, hiddenDomainIds))!;
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

// `sql` is imported for callers that need to compose around the returned SQL.
export { sql };
