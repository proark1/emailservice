import { eq, and, desc, lte, lt, inArray, count, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { broadcasts, broadcastVariantSends, emails, emailEvents } from "../db/schema/index.js";
import { contacts } from "../db/schema/index.js";
import { domains } from "../db/schema/index.js";
import { audiences } from "../db/schema/index.js";
import type { AbTestConfig } from "../db/schema/broadcasts.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { buildPaginatedResponse, type PaginationParams } from "../lib/pagination.js";
import { sendEmail } from "./email.service.js";
import { isRedisConfigured } from "../queues/index.js";
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
  const fromDomain = from.address.split("@")[1]?.toLowerCase();
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

  // Build A/B test config if provided
  const abTestEnabled = !!input.ab_test;
  let abTestConfig: AbTestConfig | undefined;
  if (input.ab_test) {
    abTestConfig = {
      test_percentage: input.ab_test.test_percentage,
      variants: input.ab_test.variants.map((v) => ({
        id: v.id,
        subject: v.subject,
        htmlBody: v.html,
        textBody: v.text,
      })),
      winner_criteria: input.ab_test.winner_criteria,
      wait_hours: input.ab_test.wait_hours,
      winner_id: null,
    };
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
      status: isScheduled ? "scheduled" : "sending",
      totalCount: subscribedContacts.length,
      scheduledAt: input.scheduled_at ? new Date(input.scheduled_at) : null,
      abTestEnabled,
      abTestConfig: abTestConfig ?? null,
      abTestStatus: abTestEnabled ? "testing" : null,
    })
    .returning();

  // If scheduled for the future, return without sending
  if (isScheduled) {
    return broadcast;
  }

  // Enqueue to background worker if Redis is available, otherwise fall back to inline execution
  if (isRedisConfigured()) {
    const { getBroadcastQueue } = await import("../queues/index.js");
    await getBroadcastQueue().add("execute", { broadcastId: broadcast.id });
    return broadcast;
  }

  // Fallback: execute inline (blocks the request — used only when Redis is unavailable)
  return executeBroadcast(broadcast.id);
}

/**
 * Execute a broadcast by sending emails to all subscribed contacts.
 * Used both for immediate sends and when scheduled broadcasts become due.
 * Handles A/B testing by splitting the audience when abTestEnabled is true.
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
    .select({ id: contacts.id, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.audienceId, broadcast.audienceId), eq(contacts.subscribed, true)));

  // Reconstruct the "from" string
  const fromString = broadcast.fromName
    ? `${broadcast.fromName} <${broadcast.fromAddress}>`
    : broadcast.fromAddress;

  // If A/B test, only send to test portion; rest waits for winner
  if (broadcast.abTestEnabled && broadcast.abTestConfig) {
    return executeAbTestBroadcast(broadcast, subscribedContacts, fromString);
  }

  let sentCount = 0;
  let failedCount = 0;

  // Process contacts in batches to avoid overwhelming the queue/DB
  const BATCH_SIZE = 50;
  for (let i = 0; i < subscribedContacts.length; i += BATCH_SIZE) {
    const batch = subscribedContacts.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((contact) =>
        sendEmail(broadcast.accountId, {
          from: fromString,
          to: [contact.email],
          subject: broadcast.subject,
          html: broadcast.htmlBody ?? undefined,
          text: broadcast.textBody ?? undefined,
          reply_to: broadcast.replyTo ?? undefined,
          headers: broadcast.headers ?? undefined,
          tags: broadcast.tags ?? undefined,
        }),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") sentCount++;
      else failedCount++;
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
 * Execute A/B test: send variants to test portion, schedule winner selection.
 */
async function executeAbTestBroadcast(
  broadcast: typeof broadcasts.$inferSelect,
  allContacts: Array<{ id: string; email: string }>,
  fromString: string,
) {
  const db = getDb();
  const config = broadcast.abTestConfig!;
  const testSize = Math.ceil(allContacts.length * (config.test_percentage / 100));

  // Shuffle contacts randomly for fair split
  const shuffled = [...allContacts].sort(() => Math.random() - 0.5);
  const testContacts = shuffled.slice(0, testSize);
  const halfTest = Math.ceil(testContacts.length / 2);
  const groupA = testContacts.slice(0, halfTest);
  const groupB = testContacts.slice(halfTest);

  let sentCount = 0;
  let failedCount = 0;

  // Send variant A
  for (const contact of groupA) {
    try {
      const result = await sendEmail(broadcast.accountId, {
        from: fromString,
        to: [contact.email],
        subject: config.variants[0].subject,
        html: config.variants[0].htmlBody ?? undefined,
        text: config.variants[0].textBody ?? undefined,
        reply_to: broadcast.replyTo ?? undefined,
        headers: broadcast.headers ?? undefined,
        tags: { ...broadcast.tags, ab_variant: "A" },
      });
      await db.insert(broadcastVariantSends).values({
        broadcastId: broadcast.id,
        variantId: "A",
        contactId: contact.id,
        emailId: result.cached ? null : (result as any).response?.id ?? null,
      });
      sentCount++;
    } catch {
      failedCount++;
    }
  }

  // Send variant B
  for (const contact of groupB) {
    try {
      const result = await sendEmail(broadcast.accountId, {
        from: fromString,
        to: [contact.email],
        subject: config.variants[1].subject,
        html: config.variants[1].htmlBody ?? undefined,
        text: config.variants[1].textBody ?? undefined,
        reply_to: broadcast.replyTo ?? undefined,
        headers: broadcast.headers ?? undefined,
        tags: { ...broadcast.tags, ab_variant: "B" },
      });
      await db.insert(broadcastVariantSends).values({
        broadcastId: broadcast.id,
        variantId: "B",
        contactId: contact.id,
        emailId: result.cached ? null : (result as any).response?.id ?? null,
      });
      sentCount++;
    } catch {
      failedCount++;
    }
  }

  // Update broadcast — still "sending" until winner is selected
  await db
    .update(broadcasts)
    .set({
      sentCount,
      failedCount,
      abTestStatus: "testing",
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(broadcasts.id, broadcast.id));

  // Schedule winner selection after wait_hours
  if (isRedisConfigured()) {
    const { getAbTestQueue } = await import("../queues/index.js");
    await getAbTestQueue().add(
      "select-winner",
      { broadcastId: broadcast.id },
      { delay: config.wait_hours * 60 * 60 * 1000 },
    );
  }

  const [updated] = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.id, broadcast.id));
  return updated;
}

/**
 * Select the winning A/B variant and send to remaining audience.
 */
export async function selectAbTestWinner(broadcastId: string, manualWinnerId?: string) {
  const db = getDb();

  const [broadcast] = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.id, broadcastId));

  if (!broadcast || !broadcast.abTestConfig) throw new NotFoundError("Broadcast");
  if (broadcast.abTestStatus === "completed") {
    throw new ValidationError("A/B test has already completed");
  }

  const config = broadcast.abTestConfig;
  let winnerId = manualWinnerId;

  if (!winnerId) {
    // Calculate metrics for each variant
    const variantSends = await db
      .select()
      .from(broadcastVariantSends)
      .where(eq(broadcastVariantSends.broadcastId, broadcastId));

    const variantEmailIds: Record<string, string[]> = { A: [], B: [] };
    for (const send of variantSends) {
      if (send.emailId && variantEmailIds[send.variantId]) {
        variantEmailIds[send.variantId].push(send.emailId);
      }
    }

    const getRate = async (emailIds: string[], eventType: "opened" | "clicked") => {
      if (emailIds.length === 0) return 0;
      const [result] = await db
        .select({ cnt: count() })
        .from(emailEvents)
        .where(and(
          inArray(emailEvents.emailId, emailIds),
          eq(emailEvents.type, eventType),
        ));
      return (Number(result?.cnt) || 0) / emailIds.length;
    };

    const metric = config.winner_criteria === "open_rate" ? "opened" : "clicked";
    const rateA = await getRate(variantEmailIds.A, metric);
    const rateB = await getRate(variantEmailIds.B, metric);

    winnerId = rateA >= rateB ? "A" : "B";
  }

  // Find the winning variant content
  const winnerVariant = config.variants.find((v) => v.id === winnerId);
  if (!winnerVariant) throw new ValidationError("Invalid winner variant ID");

  // Update config with winner
  config.winner_id = winnerId;
  await db
    .update(broadcasts)
    .set({
      abTestConfig: config,
      abTestStatus: "sending_winner",
      updatedAt: new Date(),
    })
    .where(eq(broadcasts.id, broadcastId));

  // Get contacts who already received a test email
  const alreadySent = await db
    .select({ contactId: broadcastVariantSends.contactId })
    .from(broadcastVariantSends)
    .where(eq(broadcastVariantSends.broadcastId, broadcastId));

  const sentContactIds = new Set(alreadySent.map((s) => s.contactId));

  // Get remaining contacts
  const allContacts = await db
    .select({ id: contacts.id, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.audienceId, broadcast.audienceId), eq(contacts.subscribed, true)));

  const remainingContacts = allContacts.filter((c) => !sentContactIds.has(c.id));

  const fromString = broadcast.fromName
    ? `${broadcast.fromName} <${broadcast.fromAddress}>`
    : broadcast.fromAddress;

  let additionalSent = 0;
  let additionalFailed = 0;

  // Send winner to remaining contacts
  const BATCH_SIZE = 50;
  for (let i = 0; i < remainingContacts.length; i += BATCH_SIZE) {
    const batch = remainingContacts.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((contact) =>
        sendEmail(broadcast.accountId, {
          from: fromString,
          to: [contact.email],
          subject: winnerVariant.subject,
          html: winnerVariant.htmlBody ?? undefined,
          text: winnerVariant.textBody ?? undefined,
          reply_to: broadcast.replyTo ?? undefined,
          headers: broadcast.headers ?? undefined,
          tags: { ...broadcast.tags, ab_variant: "winner" },
        }),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") additionalSent++;
      else additionalFailed++;
    }
  }

  const totalSent = broadcast.sentCount + additionalSent;
  const totalFailed = broadcast.failedCount + additionalFailed;
  const finalStatus = totalFailed === 0 ? "sent" : totalSent === 0 ? "failed" : "partial_failure";

  const [updated] = await db
    .update(broadcasts)
    .set({
      sentCount: totalSent,
      failedCount: totalFailed,
      totalCount: allContacts.length,
      status: finalStatus,
      abTestStatus: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(broadcasts.id, broadcastId))
    .returning();

  return updated;
}

/**
 * Get A/B test variant analytics for a broadcast.
 */
export async function getAbTestVariantStats(accountId: string, broadcastId: string) {
  const db = getDb();

  const [broadcast] = await db
    .select()
    .from(broadcasts)
    .where(and(eq(broadcasts.id, broadcastId), eq(broadcasts.accountId, accountId)));

  if (!broadcast) throw new NotFoundError("Broadcast");
  if (!broadcast.abTestEnabled) throw new ValidationError("This broadcast does not have A/B testing enabled");

  const variantSends = await db
    .select()
    .from(broadcastVariantSends)
    .where(eq(broadcastVariantSends.broadcastId, broadcastId));

  const stats: Record<string, { sent: number; emailIds: string[] }> = {};
  for (const send of variantSends) {
    if (!stats[send.variantId]) {
      stats[send.variantId] = { sent: 0, emailIds: [] };
    }
    stats[send.variantId].sent++;
    if (send.emailId) stats[send.variantId].emailIds.push(send.emailId);
  }

  const result: Array<{
    variant_id: string;
    sent: number;
    opens: number;
    clicks: number;
    open_rate: number;
    click_rate: number;
  }> = [];

  for (const [variantId, data] of Object.entries(stats)) {
    let opens = 0;
    let clicks = 0;
    if (data.emailIds.length > 0) {
      const events = await db
        .select({ type: emailEvents.type, cnt: count() })
        .from(emailEvents)
        .where(and(
          inArray(emailEvents.emailId, data.emailIds),
          inArray(emailEvents.type, ["opened", "clicked"]),
        ))
        .groupBy(emailEvents.type);

      for (const e of events) {
        if (e.type === "opened") opens = Number(e.cnt);
        if (e.type === "clicked") clicks = Number(e.cnt);
      }
    }

    result.push({
      variant_id: variantId,
      sent: data.sent,
      opens,
      clicks,
      open_rate: data.sent > 0 ? Math.min(opens / data.sent, 1) : 0,
      click_rate: data.sent > 0 ? Math.min(clicks / data.sent, 1) : 0,
    });
  }

  return {
    broadcast_id: broadcastId,
    winner_id: broadcast.abTestConfig?.winner_id ?? null,
    status: broadcast.abTestStatus,
    variants: result,
  };
}

/**
 * Process scheduled broadcasts that are due.
 * Called periodically by the scheduled-email worker.
 */
export async function processScheduledBroadcasts() {
  const db = getDb();

  // Atomically claim due scheduled broadcasts — prevents duplicate sends across concurrent workers
  const dueBroadcasts = await db
    .update(broadcasts)
    .set({ status: "sending", updatedAt: new Date() })
    .where(
      and(
        eq(broadcasts.status, "scheduled"),
        lte(broadcasts.scheduledAt, new Date()),
      ),
    )
    .returning();

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

export async function listBroadcasts(accountId: string, pagination: PaginationParams) {
  const db = getDb();
  const conditions = pagination.cursor
    ? and(eq(broadcasts.accountId, accountId), lt(broadcasts.id, pagination.cursor))
    : eq(broadcasts.accountId, accountId);
  const rows = await db
    .select()
    .from(broadcasts)
    .where(conditions)
    .orderBy(desc(broadcasts.createdAt))
    .limit(pagination.limit + 1);
  return buildPaginatedResponse(rows, pagination.limit);
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
    ab_test_enabled: broadcast.abTestEnabled,
    ab_test_config: broadcast.abTestConfig,
    ab_test_status: broadcast.abTestStatus,
    scheduled_at: broadcast.scheduledAt?.toISOString() ?? null,
    sent_at: broadcast.sentAt?.toISOString() ?? null,
    completed_at: broadcast.completedAt?.toISOString() ?? null,
    created_at: broadcast.createdAt.toISOString(),
    updated_at: broadcast.updatedAt.toISOString(),
  };
}
