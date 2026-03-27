import { eq, and, desc } from "drizzle-orm";
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
      status: "sending",
      totalCount: subscribedContacts.length,
      scheduledAt: input.scheduled_at ? new Date(input.scheduled_at) : null,
      sentAt: new Date(),
    })
    .returning();

  // Send to each contact
  let sentCount = 0;
  let failedCount = 0;

  for (const contact of subscribedContacts) {
    try {
      await sendEmail(accountId, {
        from: input.from,
        to: [contact.email],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.reply_to,
        headers: input.headers,
        tags: input.tags,
        scheduled_at: input.scheduled_at,
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
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(broadcasts.id, broadcast.id))
    .returning();

  return updated;
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
