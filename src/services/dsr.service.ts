import { eq, and, sql, inArray, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  contacts,
  audiences,
  suppressions,
  emails,
  emailEvents,
  inboundEmails,
  addressBookContacts,
} from "../db/schema/index.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger("dsr");

/**
 * Data Subject Request handlers for GDPR Art. 15 (export) and Art. 17
 * (erasure). Operates on a single email address scoped to one account — a
 * data controller can fulfill an "all data about me" request from one of
 * their recipients without exposing other customers' data.
 *
 * The exported / erased shape covers every table that stores personal data
 * tied to that email address: contacts, suppressions, inbound emails the
 * recipient sent us, outbound emails we sent to the recipient, the
 * tracking events those produced, and address-book entries. Idempotent —
 * running export twice returns identical data; running delete twice is a
 * no-op the second time.
 */

export interface DsrExport {
  email: string;
  account_id: string;
  generated_at: string;
  contacts: any[];
  suppressions: any[];
  outbound_emails: any[];
  outbound_events: any[];
  inbound_emails: any[];
  address_book: any[];
}

export async function exportPersonalData(accountId: string, email: string): Promise<DsrExport> {
  const db = getDb();
  const lower = email.toLowerCase();

  // Find audiences for the account (so we can scope contact lookups).
  const accountAudiences = await db
    .select({ id: audiences.id })
    .from(audiences)
    .where(eq(audiences.accountId, accountId));
  const audienceIds = accountAudiences.map((a) => a.id);

  const contactRows = audienceIds.length > 0
    ? await db
        .select()
        .from(contacts)
        .where(and(inArray(contacts.audienceId, audienceIds), eq(contacts.email, lower)))
    : [];

  const suppRows = await db
    .select()
    .from(suppressions)
    .where(and(eq(suppressions.accountId, accountId), eq(suppressions.email, lower)));

  // Outbound emails: any email whose to/cc/bcc array contains this address.
  // Postgres `?` operator on jsonb arrays returns true when the element
  // exists in the array, regardless of position. Scoped to accountId.
  const outboundRows = await db.execute<typeof emails.$inferSelect>(sql`
    SELECT * FROM ${emails}
    WHERE ${emails.accountId} = ${accountId}
      AND (
        ${emails.toAddresses}::jsonb ? ${lower}
        OR ${emails.ccAddresses}::jsonb ? ${lower}
        OR ${emails.bccAddresses}::jsonb ? ${lower}
      )
  `);
  const outboundList: any[] = Array.isArray(outboundRows)
    ? outboundRows
    : (outboundRows as any).rows ?? [];

  const outboundIds = outboundList.map((e: any) => e.id);
  const outboundEvents = outboundIds.length > 0
    ? await db
        .select()
        .from(emailEvents)
        .where(inArray(emailEvents.emailId, outboundIds))
    : [];

  const inboundRows = await db
    .select()
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.accountId, accountId),
        or(
          eq(sql`lower(${inboundEmails.fromAddress})`, lower),
          eq(sql`lower(${inboundEmails.toAddress})`, lower),
        ),
      ),
    );

  const addressBookRows = await db
    .select()
    .from(addressBookContacts)
    .where(
      and(
        eq(addressBookContacts.accountId, accountId),
        eq(sql`lower(${addressBookContacts.email})`, lower),
      ),
    );

  return {
    email: lower,
    account_id: accountId,
    generated_at: new Date().toISOString(),
    contacts: contactRows,
    suppressions: suppRows,
    outbound_emails: outboundList,
    outbound_events: outboundEvents,
    inbound_emails: inboundRows,
    address_book: addressBookRows,
  };
}

export interface DsrErasure {
  email: string;
  account_id: string;
  erased_at: string;
  contacts: number;
  outbound_emails_redacted: number;
  inbound_emails_deleted: number;
  address_book: number;
  // Suppressions are intentionally retained — under GDPR Art. 17(3)(b) and
  // CAN-SPAM, we may keep a minimal record needed for compliance with the
  // legal obligation not to email this address again. Returned for
  // transparency.
  suppressions_retained: number;
}

/**
 * Erasure handler. Deletes contacts, address-book rows, and inbound
 * emails. Outbound emails are *redacted* rather than dropped so analytics
 * counters and billing reconciliation aren't silently corrupted —
 * to/cc/bcc become `[redacted]@redacted` and bodies are nulled.
 *
 * Suppression rows are NOT removed: per CAN-SPAM and GDPR Art. 17(3)(b),
 * we have a legal-obligation basis for retaining a minimal record so we
 * don't accidentally re-mail a deleted address.
 */
export async function erasePersonalData(accountId: string, email: string): Promise<DsrErasure> {
  const db = getDb();
  const lower = email.toLowerCase();

  const accountAudiences = await db
    .select({ id: audiences.id })
    .from(audiences)
    .where(eq(audiences.accountId, accountId));
  const audienceIds = accountAudiences.map((a) => a.id);

  let contactsDeleted = 0;
  if (audienceIds.length > 0) {
    const deleted = await db
      .delete(contacts)
      .where(and(inArray(contacts.audienceId, audienceIds), eq(contacts.email, lower)))
      .returning({ id: contacts.id });
    contactsDeleted = deleted.length;
  }

  const addressBookDeleted = await db
    .delete(addressBookContacts)
    .where(
      and(
        eq(addressBookContacts.accountId, accountId),
        eq(sql`lower(${addressBookContacts.email})`, lower),
      ),
    )
    .returning({ id: addressBookContacts.id });

  const inboundDeleted = await db
    .delete(inboundEmails)
    .where(
      and(
        eq(inboundEmails.accountId, accountId),
        or(
          eq(sql`lower(${inboundEmails.fromAddress})`, lower),
          eq(sql`lower(${inboundEmails.toAddress})`, lower),
        ),
      ),
    )
    .returning({ id: inboundEmails.id });

  // Outbound: redact rather than delete. We rewrite the recipient arrays so
  // every occurrence of the lowercased target becomes `redacted@redacted`,
  // preserving array length and ordering for analytics. We also null the
  // bodies, which is where most personal data lived. A redaction marker is
  // saved in tags so future audits can identify redacted rows.
  const redactRes = await db.execute<{ id: string }>(sql`
    UPDATE ${emails}
    SET
      to_addresses = COALESCE((
        SELECT jsonb_agg(CASE WHEN value::text = ${`"${lower}"`} THEN to_jsonb('redacted@redacted'::text) ELSE value END)
        FROM jsonb_array_elements(${emails.toAddresses}::jsonb) AS value
      ), to_addresses),
      cc_addresses = CASE WHEN cc_addresses IS NULL THEN NULL ELSE (
        SELECT jsonb_agg(CASE WHEN value::text = ${`"${lower}"`} THEN to_jsonb('redacted@redacted'::text) ELSE value END)
        FROM jsonb_array_elements(cc_addresses::jsonb) AS value
      ) END,
      bcc_addresses = CASE WHEN bcc_addresses IS NULL THEN NULL ELSE (
        SELECT jsonb_agg(CASE WHEN value::text = ${`"${lower}"`} THEN to_jsonb('redacted@redacted'::text) ELSE value END)
        FROM jsonb_array_elements(bcc_addresses::jsonb) AS value
      ) END,
      html_body = NULL,
      text_body = NULL,
      tags = COALESCE(tags, '{}'::jsonb) || ${JSON.stringify({ dsr_redacted: "true" })}::jsonb,
      updated_at = NOW()
    WHERE ${emails.accountId} = ${accountId}
      AND (
        ${emails.toAddresses}::jsonb ? ${lower}
        OR ${emails.ccAddresses}::jsonb ? ${lower}
        OR ${emails.bccAddresses}::jsonb ? ${lower}
      )
    RETURNING id
  `);
  const redactedRows: any[] = Array.isArray(redactRes) ? redactRes : (redactRes as any).rows ?? [];

  const suppRetained = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(and(eq(suppressions.accountId, accountId), eq(suppressions.email, lower)));

  log.info(
    {
      accountId,
      email: lower,
      contacts: contactsDeleted,
      outbound: redactedRows.length,
      inbound: inboundDeleted.length,
    },
    "DSR erasure completed",
  );

  return {
    email: lower,
    account_id: accountId,
    erased_at: new Date().toISOString(),
    contacts: contactsDeleted,
    outbound_emails_redacted: redactedRows.length,
    inbound_emails_deleted: inboundDeleted.length,
    address_book: addressBookDeleted.length,
    suppressions_retained: suppRetained.length,
  };
}
