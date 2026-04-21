import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emails, emailEvents, domains, suppressions } from "../db/schema/index.js";
import { isRedisConfigured, getEmailSendQueue, getRedisConnection } from "../queues/index.js";
import { transformHtml } from "../lib/html-transform.js";
import { reserveIdempotencyKey, storeIdempotencyKey } from "../lib/idempotency.js";
import { ValidationError, NotFoundError, ForbiddenError, RateLimitError, ConflictError } from "../lib/errors.js";
import type { SendEmailInput } from "../schemas/email.schema.js";

/**
 * Per-domain outbound rate limit. Shared-IP pools suffer when one domain
 * bursts — this is the safety valve. Redis INCR keyed per minute. When Redis
 * isn't configured at all we skip (this is a feature of deployments that opt
 * out of Redis entirely). When Redis IS configured but unreachable we fail
 * the send instead of silently bypassing — a misconfigured Redis must not
 * turn a 100-per-min cap into unlimited.
 */
async function checkDomainRateLimit(domainId: string, limitPerMinute: number): Promise<void> {
  if (!isRedisConfigured()) return;
  const redis = getRedisConnection();
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `rl:send:${domainId}:${bucket}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 65);
    if (count > limitPerMinute) {
      throw new RateLimitError();
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    throw new RateLimitError();
  }
}

/**
 * Fire-and-forget direct send with exponential backoff. Used when Redis is
 * unavailable (either unconfigured or unreachable) and we need to attempt
 * delivery without the queue worker pipeline.
 *
 * Three attempts at 0 / 2s / 4s. After that we mark the email as failed and
 * stop — a caller can re-send with a fresh idempotency key.
 */
function sendDirectlyWithRetry(emailId: string, accountId: string): void {
  const maxAttempts = 3;
  const run = async () => {
    const { sendEmailDirect } = await import("./email-sender.js");
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await sendEmailDirect(emailId, accountId);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        }
      }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    console.error(`[email-send] Direct send failed after ${maxAttempts} attempts for email ${emailId}: ${msg}`);
    try {
      await getDb().update(emails).set({ status: "failed" }).where(eq(emails.id, emailId));
    } catch {}
  };
  run().catch(() => {});
}

export interface SendEmailOptions {
  /**
   * When set, the send is scoped to a specific company: the `from` domain must
   * be linked to this company. Used to prevent a company-scoped API key from
   * sending mail via another tenant's domain on the same owner account.
   */
  companyScopeId?: string | null;
}

function parseFromAddress(from: string): { address: string; name?: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { address: from.trim() };
}

export async function sendEmail(accountId: string, input: SendEmailInput, options: SendEmailOptions = {}) {
  const db = getDb();

  // Check + atomically reserve the idempotency key. Two concurrent requests
  // with the same key can no longer both execute the handler — the second
  // observes `in_flight` and is told to retry, or `cached` once we finalize.
  if (input.idempotency_key) {
    const reservation = await reserveIdempotencyKey(accountId, input.idempotency_key);
    if (reservation.status === "cached") {
      return { cached: true, response: reservation.response };
    }
    if (reservation.status === "in_flight") {
      throw new ConflictError("A request with this idempotency_key is still being processed. Retry after it completes.");
    }
  }

  // Resolve template if template_id is provided
  if (input.template_id) {
    const { getTemplate, renderTemplate } = await import("./template.service.js");
    const template = await getTemplate(accountId, input.template_id);
    const rendered = renderTemplate(template, input.template_variables || {});
    if (rendered.subject && !input.subject) {
      (input as any).subject = rendered.subject;
    }
    if (rendered.html && !input.html) {
      (input as any).html = rendered.html;
    }
    if (rendered.text && !input.text) {
      (input as any).text = rendered.text;
    }
  }

  // Parse "from" address
  const from = parseFromAddress(input.from);
  const fromDomain = from.address.split("@")[1]?.toLowerCase();
  if (!fromDomain) {
    throw new ValidationError("Invalid 'from' address — must contain a valid email (e.g., user@example.com)");
  }

  // Validate sender domain — check team membership (not just ownership)
  const [domain] = await db
    .select()
    .from(domains)
    .where(eq(domains.name, fromDomain));

  if (!domain) {
    throw new ValidationError(`Domain ${fromDomain} is not registered`);
  }

  // Company-scoped API keys may only send from domains linked to their company.
  // This is the hard isolation boundary between tenants that share one root account.
  if (options.companyScopeId && domain.companyId !== options.companyScopeId) {
    throw new ForbiddenError(`Domain ${fromDomain} is not linked to this company`);
  }

  // Enforce per-domain send rate limit if configured
  if (domain.sendRatePerMinute && domain.sendRatePerMinute > 0) {
    await checkDomainRateLimit(domain.id, domain.sendRatePerMinute);
  }

  // Verify team access to this domain
  const { hasDomainAccess, getMemberMailboxes } = await import("./team.service.js");
  const hasAccess = await hasDomainAccess(accountId, domain.id);
  if (!hasAccess) {
    throw new ValidationError(`You do not have access to domain ${fromDomain}`);
  }

  // Check mailbox restriction for members
  const allowedMailboxes = await getMemberMailboxes(accountId, domain.id);
  if (allowedMailboxes && !allowedMailboxes.includes(from.address)) {
    throw new ValidationError(`You are not authorized to send from ${from.address}. Allowed: ${allowedMailboxes.join(", ")}`);
  }

  if (domain.status !== "verified") {
    throw new ValidationError(`Domain ${fromDomain} is not verified yet`);
  }

  // Check domain is configured for sending
  const mode = domain.mode || "both";
  if (mode === "receive") {
    throw new ValidationError(`Domain ${fromDomain} is configured for receiving only. Update domain mode to "send" or "both" to send emails.`);
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

  // Append signature if requested
  let htmlBody = input.html;
  let textBody = input.text;
  if (input.signature_id) {
    const { getSignature } = await import("./signature.service.js");
    const sig = await getSignature(accountId, input.signature_id);
    if (htmlBody) {
      htmlBody = htmlBody + `<br/><div class="email-signature">${sig.htmlBody}</div>`;
    }
    if (textBody) {
      textBody = textBody + "\n\n-- \n" + (sig.textBody || "");
    }
  }

  // Compute thread ID for reply chains
  const { computeThreadId } = await import("./thread.service.js");
  const threadId = computeThreadId(null, input.in_reply_to, input.references, input.subject);

  // Get sent folder for this account
  let sentFolderId: string | null = null;
  try {
    const { getFolderBySlug } = await import("./folder.service.js");
    const sentFolder = await getFolderBySlug(accountId, "sent");
    sentFolderId = sentFolder.id;
  } catch {
    // Folders not yet seeded — that's OK
  }

  // Create email record
  const [email] = await db
    .insert(emails)
    .values({
      accountId,
      domainId: domain.id,
      folderId: sentFolderId,
      idempotencyKey: input.idempotency_key,
      fromAddress: from.address,
      fromName: from.name,
      toAddresses: input.to,
      ccAddresses: input.cc,
      bccAddresses: input.bcc,
      replyTo: input.reply_to,
      subject: input.subject,
      htmlBody: htmlBody,
      textBody: textBody,
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
      inReplyTo: input.in_reply_to,
      references: input.references,
      threadId,
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
      sendDirectlyWithRetry(email.id, accountId);
    }
  } else if (delay > 0 && isRedisConfigured()) {
    // Scheduled emails need the queue
    await getEmailSendQueue().add("send", { emailId: email.id, accountId }, { delay });
  } else if (delay === 0) {
    // No Redis, immediate send — send directly (async, don't block the response)
    sendDirectlyWithRetry(email.id, accountId);
  } else {
    // Scheduled email but no Redis — leave in "queued" status for later processing
    console.warn(`[email-send] Email ${email.id} is scheduled but Redis is unavailable. Left in queued status.`);
  }

  const response = formatEmailResponse(email);

  // Store idempotency key
  if (input.idempotency_key) {
    await storeIdempotencyKey(accountId, input.idempotency_key, 201, { data: response });
  }

  return { cached: false, response };
}

/**
 * Constrain a query to the domains belonging to a company-scoped API key. When
 * the key is user-scoped (companyScopeId is null/undefined) we don't filter on
 * company at all and the caller sees every email on their account.
 */
async function companyScopeCondition(accountId: string, companyScopeId: string | null | undefined) {
  if (!companyScopeId) return null;
  const db = getDb();
  const companyDomainIds = (
    await db
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.accountId, accountId), eq(domains.companyId, companyScopeId)))
  ).map((d) => d.id);
  // No domains for this company — return an unconditionally-false predicate
  // so the caller sees an empty result set. Using `sql\`false\`` instead of a
  // sentinel UUID keeps the isolation boundary bulletproof even if a domain
  // with the nil UUID were ever inserted.
  if (companyDomainIds.length === 0) return sql`false`;
  return inArray(emails.domainId, companyDomainIds);
}

export async function getEmail(accountId: string, emailId: string, options: SendEmailOptions = {}) {
  const db = getDb();
  const conditions = [eq(emails.id, emailId), eq(emails.accountId, accountId)];
  const scope = await companyScopeCondition(accountId, options.companyScopeId);
  if (scope) conditions.push(scope);

  const [email] = await db
    .select()
    .from(emails)
    .where(and(...conditions));

  if (!email) throw new NotFoundError("Email");
  return email;
}

export async function listEmails(
  accountId: string,
  options: { limit: number; cursor?: string; status?: string; companyScopeId?: string | null },
) {
  const db = getDb();
  const conditions = [eq(emails.accountId, accountId)];

  const scope = await companyScopeCondition(accountId, options.companyScopeId);
  if (scope) conditions.push(scope);

  // Keyset pagination over (createdAt DESC, id DESC). The cursor is the last
  // email id from the previous page; we look up its createdAt and then take
  // rows strictly before it OR tied on createdAt but with a smaller id. This
  // removes the duplicate-timestamp skip bug where two rows with identical
  // createdAt could either be visited twice or skipped.
  if (options.cursor) {
    const { lt, or } = await import("drizzle-orm");
    const [cursorEmail] = await db
      .select({ createdAt: emails.createdAt, id: emails.id })
      .from(emails)
      .where(and(eq(emails.id, options.cursor), eq(emails.accountId, accountId)));
    if (cursorEmail) {
      conditions.push(
        or(
          lt(emails.createdAt, cursorEmail.createdAt),
          and(eq(emails.createdAt, cursorEmail.createdAt), lt(emails.id, cursorEmail.id))!,
        )!,
      );
    }
  }

  if (options.status) {
    conditions.push(eq(emails.status, options.status as any));
  }

  return db
    .select()
    .from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.createdAt), desc(emails.id))
    .limit(options.limit + 1);
}

export async function cancelScheduledEmail(accountId: string, emailId: string, options: SendEmailOptions = {}) {
  const db = getDb();
  const conditions = [eq(emails.id, emailId), eq(emails.accountId, accountId)];
  const scope = await companyScopeCondition(accountId, options.companyScopeId);
  if (scope) conditions.push(scope);
  const [email] = await db
    .select()
    .from(emails)
    .where(and(...conditions));

  if (!email) throw new NotFoundError("Email");
  if (email.status !== "queued" || !email.scheduledAt) {
    throw new ValidationError("Only scheduled emails in queued status can be cancelled");
  }

  const [updated] = await db
    .update(emails)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(eq(emails.id, emailId), eq(emails.accountId, accountId)))
    .returning();

  if (!updated) throw new NotFoundError("Email");

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
