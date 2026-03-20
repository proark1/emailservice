import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emails, emailEvents, domains, suppressions } from "../db/schema/index.js";
import { isRedisConfigured, getEmailSendQueue } from "../queues/index.js";
import { transformHtml } from "../lib/html-transform.js";
import { checkIdempotencyKey, storeIdempotencyKey } from "../lib/idempotency.js";
import { ValidationError, NotFoundError } from "../lib/errors.js";
import type { SendEmailInput } from "../schemas/email.schema.js";

function parseFromAddress(from: string): { address: string; name?: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { address: from.trim() };
}

export async function sendEmail(accountId: string, input: SendEmailInput) {
  const db = getDb();

  // Check idempotency
  if (input.idempotency_key) {
    const cached = await checkIdempotencyKey(accountId, input.idempotency_key);
    if (cached) {
      return { cached: true, response: cached };
    }
  }

  // Parse "from" address
  const from = parseFromAddress(input.from);
  const fromDomain = from.address.split("@")[1];

  // Validate sender domain belongs to account and is verified
  const [domain] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.accountId, accountId), eq(domains.name, fromDomain)));

  if (!domain) {
    throw new ValidationError(`Domain ${fromDomain} is not registered to your account`);
  }

  if (domain.status !== "verified") {
    throw new ValidationError(`Domain ${fromDomain} is not verified yet`);
  }

  // Check suppression list — only query addresses actually in the recipient list
  const allRecipients = [...input.to, ...(input.cc || []), ...(input.bcc || [])].map((r) => r.toLowerCase());
  const suppressedRows = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(and(eq(suppressions.accountId, accountId), inArray(suppressions.email, allRecipients)));

  if (suppressedRows.length > 0) {
    throw new ValidationError(`Suppressed addresses: ${suppressedRows.map((r) => r.email).join(", ")}`);
  }

  // Validate scheduling
  if (input.scheduled_at) {
    const scheduledDate = new Date(input.scheduled_at);
    const maxSchedule = new Date(Date.now() + 72 * 3_600_000);
    if (scheduledDate > maxSchedule) {
      throw new ValidationError("Cannot schedule more than 72 hours in advance");
    }
    if (scheduledDate < new Date()) {
      throw new ValidationError("Scheduled time must be in the future");
    }
  }

  // Create email record
  const [email] = await db
    .insert(emails)
    .values({
      accountId,
      domainId: domain.id,
      idempotencyKey: input.idempotency_key,
      fromAddress: from.address,
      fromName: from.name,
      toAddresses: input.to,
      ccAddresses: input.cc,
      bccAddresses: input.bcc,
      replyTo: input.reply_to,
      subject: input.subject,
      htmlBody: input.html,
      textBody: input.text,
      headers: input.headers,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.content_type || "application/octet-stream",
        size: Buffer.from(a.content, "base64").length,
        content: a.content,
      })),
      tags: input.tags,
      status: "queued",
      scheduledAt: input.scheduled_at ? new Date(input.scheduled_at) : null,
    })
    .returning();

  // Record the "queued" event
  await db.insert(emailEvents).values({
    emailId: email.id,
    accountId,
    type: "queued",
    data: {},
  });

  // Send: try queue first, fall back to direct send
  const delay = input.scheduled_at
    ? Math.max(0, new Date(input.scheduled_at).getTime() - Date.now())
    : 0;

  if (isRedisConfigured() && delay === 0) {
    try {
      await getEmailSendQueue().add("send", { emailId: email.id, accountId });
    } catch {
      // Queue failed, send directly
      const { sendEmailDirect } = await import("./email-sender.js");
      sendEmailDirect(email.id, accountId).catch(() => {});
    }
  } else if (delay > 0 && isRedisConfigured()) {
    // Scheduled emails need the queue
    await getEmailSendQueue().add("send", { emailId: email.id, accountId }, { delay });
  } else {
    // No Redis — send directly (async, don't block the response)
    const { sendEmailDirect } = await import("./email-sender.js");
    sendEmailDirect(email.id, accountId).catch(() => {});
  }

  const response = formatEmailResponse(email);

  // Store idempotency key
  if (input.idempotency_key) {
    await storeIdempotencyKey(accountId, input.idempotency_key, 201, { data: response });
  }

  return { cached: false, response };
}

export async function getEmail(accountId: string, emailId: string) {
  const db = getDb();
  const [email] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.id, emailId), eq(emails.accountId, accountId)));

  if (!email) throw new NotFoundError("Email");
  return email;
}

export async function listEmails(accountId: string, options: { limit: number; status?: string }) {
  const db = getDb();
  return db
    .select()
    .from(emails)
    .where(eq(emails.accountId, accountId))
    .orderBy(desc(emails.createdAt))
    .limit(options.limit);
}

export async function cancelScheduledEmail(accountId: string, emailId: string) {
  const db = getDb();
  const [email] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.id, emailId), eq(emails.accountId, accountId)));

  if (!email) throw new NotFoundError("Email");
  if (email.status !== "queued" || !email.scheduledAt) {
    throw new ValidationError("Only scheduled emails in queued status can be cancelled");
  }

  const [updated] = await db
    .update(emails)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(emails.id, emailId))
    .returning();

  await db.insert(emailEvents).values({
    emailId: email.id,
    accountId,
    type: "failed",
    data: { reason: "cancelled" },
  });

  return updated;
}

export function formatEmailResponse(email: typeof emails.$inferSelect) {
  return {
    id: email.id,
    from: email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress,
    to: email.toAddresses,
    cc: email.ccAddresses,
    bcc: email.bccAddresses,
    subject: email.subject,
    status: email.status,
    scheduled_at: email.scheduledAt?.toISOString() ?? null,
    sent_at: email.sentAt?.toISOString() ?? null,
    open_count: email.openCount,
    click_count: email.clickCount,
    tags: email.tags,
    created_at: email.createdAt.toISOString(),
  };
}
