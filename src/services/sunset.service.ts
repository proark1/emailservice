import { sql, eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { accounts, emails, emailEvents, suppressions } from "../db/schema/index.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger("sunset");

export interface SunsetCandidate {
  email: string;
  emails_sent: number;
  last_sent_at: Date;
}

/**
 * Find unengaged recipients for an account: addresses that have received at
 * least `minEmails` messages whose most recent send is older than `days`,
 * with zero `opened`/`clicked` events across all of those sends.
 *
 * Returns the candidate list — does not insert suppressions. Caller decides
 * whether this is a dry run (preview) or a real apply.
 */
export async function findStaleRecipients(
  accountId: string,
  days: number,
  minEmails: number,
  limit = 1000,
): Promise<SunsetCandidate[]> {
  const db = getDb();

  // Postgres-flavored — we use sql`` for the subquery because Drizzle's
  // builder doesn't express "no event of type X exists for this email" as
  // cleanly as a NOT EXISTS clause. The composite index on
  // (account_id, type, created_at) keeps the inner scan cheap.
  const cutoff = new Date(Date.now() - days * 86_400_000);

  const rows = await db.execute<{
    recipient: string;
    emails_sent: number;
    last_sent_at: Date;
  }>(sql`
    SELECT
      lower(e.recipient) AS recipient,
      COUNT(*)::int AS emails_sent,
      MAX(e.created_at) AS last_sent_at
    FROM (
      SELECT
        -- emails.to_addresses is jsonb. unnest() only handles native arrays;
        -- jsonb_array_elements_text expands a jsonb string-array into rows.
        jsonb_array_elements_text(${emails.toAddresses}) AS recipient,
        ${emails.createdAt} AS created_at,
        ${emails.id} AS email_id
      FROM ${emails}
      WHERE ${emails.accountId} = ${accountId}
        AND ${emails.status} IN ('sent', 'delivered')
        AND ${emails.createdAt} >= ${new Date(Date.now() - days * 4 * 86_400_000)}
    ) e
    WHERE NOT EXISTS (
      SELECT 1 FROM ${emailEvents} ev
      WHERE ev.email_id = e.email_id
        AND ev.type IN ('opened', 'clicked')
    )
    GROUP BY lower(e.recipient)
    HAVING COUNT(*) >= ${minEmails}
       AND MAX(e.created_at) <= ${cutoff}
       AND lower(e.recipient) NOT IN (
         SELECT lower(email) FROM ${suppressions} WHERE ${suppressions.accountId} = ${accountId}
       )
    ORDER BY MAX(e.created_at) ASC
    LIMIT ${limit}
  `);

  // Drizzle returns either an array or { rows } depending on the driver;
  // normalize so callers don't have to.
  const list: any[] = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
  return list.map((r) => ({
    email: String(r.recipient),
    emails_sent: Number(r.emails_sent),
    last_sent_at: r.last_sent_at instanceof Date ? r.last_sent_at : new Date(r.last_sent_at),
  }));
}

/**
 * Apply the sunset policy for one account: insert `stale` suppressions for
 * every candidate. Returns the count actually inserted (duplicates are
 * silently skipped via ON CONFLICT DO NOTHING).
 */
export async function applySunsetPolicy(
  accountId: string,
  days: number,
  minEmails: number,
  limit = 1000,
): Promise<{ candidates: number; suppressed: number }> {
  const candidates = await findStaleRecipients(accountId, days, minEmails, limit);
  if (candidates.length === 0) return { candidates: 0, suppressed: 0 };

  const db = getDb();
  const result = await db
    .insert(suppressions)
    .values(
      candidates.map((c) => ({
        accountId,
        email: c.email,
        reason: "stale" as const,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: suppressions.id });

  return { candidates: candidates.length, suppressed: result.length };
}

/**
 * Sweep all accounts that have the policy enabled. Called by the scheduled
 * worker. Errors on a single account are logged and skipped — one slow
 * account must not block the rest of the sweep.
 */
export async function runSunsetSweep(): Promise<{ accounts_processed: number; total_suppressed: number }> {
  const db = getDb();
  const enabled = await db
    .select({
      id: accounts.id,
      days: accounts.sunsetPolicyDays,
      minEmails: accounts.sunsetPolicyMinEmails,
    })
    .from(accounts)
    .where(eq(accounts.sunsetPolicyEnabled, true));

  let totalSuppressed = 0;
  for (const a of enabled) {
    try {
      const { suppressed } = await applySunsetPolicy(a.id, a.days, a.minEmails);
      totalSuppressed += suppressed;
      if (suppressed > 0) {
        log.info({ accountId: a.id, suppressed }, "applied sunset policy");
      }
    } catch (err) {
      log.error({ accountId: a.id, err: err instanceof Error ? err.message : String(err) }, "sunset sweep failed for account");
    }
  }

  return { accounts_processed: enabled.length, total_suppressed: totalSuppressed };
}
