import { eq, and, desc, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { broadcasts } from "../db/schema/index.js";
import { contacts } from "../db/schema/index.js";
import { domains } from "../db/schema/index.js";
import { audiences } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { sendEmail } from "./email.service.js";
import type { CreateBroadcastInput } from "../schemas/broadcast.schema.js";

function parseFromAddress(from: string): { address: string; name?: string } {
  const match = from.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { address: from.trim() };
}

export async function createBroadcast(accountId: string, input: CreateBroadcastInput) {
  const db = getDb();

  // Parse "from" address and validate domain
  const from = parseFromAddress(input.from);
  const fromDomain = from.address.split("@")[1];
  if (!fromDomain) {
    throw new ValidationError("Invalid 'from' address — must contain a valid email (e.g., user@example.com)");
  }

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

  // Validate audience belongs to account
  const [audience] = await db
    .select()
    .from(audiences)
    .where(and(eq(audiences.id, input.audience_id), eq(audiences.accountId, accountId)));

  if (!audience) {
    throw new NotFoundError("Audience");
  }

  // Get all subscribed contacts in the audience
  const subscribedContacts = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.audienceId, input.audience_id), eq(contacts.subscribed, true)));

  if (subscribedContacts.length === 0) {
    throw new ValidationError("No subscribed contacts in this audience");
  }

  const MAX_BROADCAST_RECIPIENTS = 10_000;
  if (subscribedContacts.length > MAX_BROADCAST_RECIPIENTS) {
    throw new ValidationError(`Broadcast cannot exceed ${MAX_BROADCAST_RECIPIENTS.toLocaleString()} contacts. This audience has ${subscribedContacts.length.toLocaleString()}.`);
  }

  // If scheduled_at is in the future, save as "scheduled" and don't send yet
  const isScheduled = input.scheduled_at && new Date(input.scheduled_at) > new Date();

  // Create broadcast record
  const [broadcast] = await db
    .insert(broadcasts)
    .values({
      accountId,
      audienceId: input.audience_id,
      name: input.name,
      fromAddress: from.address,
      fromName: from.name,
      subject: input.subject,
      htmlBody: input.html,
      textBody: input.text,
      replyTo: input.reply_to,
      headers: input.headers,
      tags: input.tags,
      status: isScheduled ? "scheduled" : "sending",
      totalCount: subscribedContacts.length,
      scheduledAt: input.scheduled_at ? new Date(input.scheduled_at) : null,
    })
    .returning();

  // If scheduled for the future, return without sending
  if (isScheduled) {
    return broadcast;
  }

  // Send immediately
  return executeBroadcast(broadcast.id);
}

/**
 * Execute a broadcast by sending emails to all subscribed contacts.
 * Used both for immediate sends and when scheduled broadcasts become due.
 */
export async function executeBroadcast(broadcastId: string) {
  const db = getDb();

  const [broadcast] = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.id, broadcastId));

  if (!broadcast) throw new NotFoundError("Broadcast");

  // Mark as sending
  await db
    .update(broadcasts)
    .set({ status: "sending", updatedAt: new Date() })
    .where(eq(broadcasts.id, broadcastId));

  // Get all subscribed contacts in the audience
  const subscribedContacts = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.audienceId, broadcast.audienceId), eq(contacts.subscribed, true)));

  // Reconstruct the "from" string
  const fromString = broadcast.fromName
    ? `${broadcast.fromName} <${broadcast.fromAddress}>`
    : broadcast.fromAddress;

  let sentCount = 0;
  let failedCount = 0;

  for (const contact of subscribedContacts) {
    try {
      await sendEmail(broadcast.accountId, {
        from: fromString,
        to: [contact.email],
        subject: broadcast.subject,
        html: broadcast.htmlBody ?? undefined,
        text: broadcast.textBody ?? undefined,
        reply_to: broadcast.replyTo ?? undefined,
        headers: broadcast.headers ?? undefined,
        tags: broadcast.tags ?? undefined,
      });
      sentCount++;
    } catch {
      failedCount++;
    }
  }

  // Update broadcast with final counts and status
  const finalStatus = failedCount === 0
    ? "sent"
    : sentCount === 0
      ? "failed"
      : "partial_failure";

  const [updated] = await db
    .update(broadcasts)
    .set({
      sentCount,
      failedCount,
      status: finalStatus,
      totalCount: subscribedContacts.length,
      sentAt: new Date(),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(broadcasts.id, broadcastId))
    .returning();

  return updated;
}

/**
 * Process scheduled broadcasts that are due.
 * Called periodically by the scheduled-email worker.
 */
export async function processScheduledBroadcasts() {
  const db = getDb();

  // Find all broadcasts with status "scheduled" and scheduledAt <= now
  const dueBroadcasts = await db
    .select()
    .from(broadcasts)
    .where(
      and(
        eq(broadcasts.status, "scheduled"),
        lte(broadcasts.scheduledAt, new Date()),
      ),
    );

  let processed = 0;
  for (const broadcast of dueBroadcasts) {
    try {
      await executeBroadcast(broadcast.id);
      processed++;
    } catch (err) {
      console.error(`Failed to execute scheduled broadcast ${broadcast.id}:`, err);
    }
  }

  return { processed };
}

export async function getBroadcast(accountId: string, id: string) {
  const db = getDb();
  const [broadcast] = await db
    .select()
    .from(broadcasts)
    .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, accountId)));

  if (!broadcast) throw new NotFoundError("Broadcast");
  return broadcast;
}

export async function listBroadcasts(accountId: string) {
  const db = getDb();
  return db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.accountId, accountId))
    .orderBy(desc(broadcasts.createdAt));
}

export async function deleteBroadcast(accountId: string, id: string) {
  const db = getDb();
  const [broadcast] = await db
    .select()
    .from(broadcasts)
    .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, accountId)));

  if (!broadcast) throw new NotFoundError("Broadcast");

  if (broadcast.status === "sending") {
    throw new ValidationError("Cannot delete a broadcast that is currently sending");
  }

  const [deleted] = await db
    .delete(broadcasts)
    .where(and(eq(broadcasts.id, id), eq(broadcasts.accountId, accountId)))
    .returning();

  if (!deleted) throw new NotFoundError("Broadcast");
  return deleted;
}

export function formatBroadcastResponse(broadcast: typeof broadcasts.$inferSelect) {
  return {
    id: broadcast.id,
    audience_id: broadcast.audienceId,
    name: broadcast.name,
    from: broadcast.fromName ? `${broadcast.fromName} <${broadcast.fromAddress}>` : broadcast.fromAddress,
    subject: broadcast.subject,
    html: broadcast.htmlBody,
    text: broadcast.textBody,
    reply_to: broadcast.replyTo,
    headers: broadcast.headers,
    tags: broadcast.tags,
    status: broadcast.status,
    total_count: broadcast.totalCount,
    sent_count: broadcast.sentCount,
    failed_count: broadcast.failedCount,
    scheduled_at: broadcast.scheduledAt?.toISOString() ?? null,
    sent_at: broadcast.sentAt?.toISOString() ?? null,
    completed_at: broadcast.completedAt?.toISOString() ?? null,
    created_at: broadcast.createdAt.toISOString(),
    updated_at: broadcast.updatedAt.toISOString(),
  };
}
