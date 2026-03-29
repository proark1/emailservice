import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { warmupSchedules, warmupEmails } from "../db/schema/index.js";
import { domains } from "../db/schema/index.js";
import { NotFoundError, ValidationError, ConflictError } from "../lib/errors.js";
import { sendEmail } from "./email.service.js";

// ---------------------------------------------------------------------------
// Default 30-day ramp schedule (emails per day)
// ---------------------------------------------------------------------------
const DEFAULT_RAMP_SCHEDULE = [
  2, 2, 3, 3, 5,          // Week 1: 2-5/day — establish baseline
  5, 8, 8, 10, 10,        // Week 2: 5-10/day — build initial reputation
  15, 15, 20, 20, 25,     // Week 3: 15-25/day — ramp up
  25, 30, 35, 40, 50,     // Week 4: 25-50/day — aggressive growth
  50, 60, 70, 80, 90,     // Week 5: 50-90/day — near full volume
  100, 100, 100, 100, 100 // Week 6: 100/day — cruising
];

// Warmup email subjects — conversational, natural-looking
const WARMUP_SUBJECTS = [
  "Quick question about the project",
  "Following up on our conversation",
  "Re: Meeting notes from today",
  "Can you take a look at this?",
  "Thanks for the update",
  "Re: Schedule for next week",
  "Thoughts on the proposal?",
  "Just checking in",
  "Re: Quick favor",
  "Update on the timeline",
  "Got your message — here's my take",
  "Re: Sounds good to me",
  "One more thing I forgot to mention",
  "Circling back on this",
  "Re: Great idea, let's discuss",
  "Sharing this article with you",
  "Re: All set on my end",
  "Can we chat tomorrow?",
  "Re: Confirmed — see you then",
  "A few notes from the call",
];

// Warmup email bodies — short, natural, conversational
const WARMUP_BODIES = [
  "Hey, just wanted to follow up on our earlier conversation. Let me know when you get a chance to review.",
  "Thanks for getting back to me so quickly. I'll take a look at what you sent and circle back tomorrow.",
  "Sounds great — I think we're on the same page. Let me know if anything changes on your end.",
  "Appreciate the update! I'll forward this to the rest of the team and we can discuss at our next sync.",
  "Just wanted to check in and see how things are going. No rush on a reply, whenever you get a chance.",
  "Got it, thanks! I'll make those changes and send over the updated version by end of day.",
  "That works for me. Let's plan to connect next week to go over the details.",
  "Thanks for sharing — this is really helpful. I had a couple of quick thoughts I wanted to run by you.",
  "Good call on that. I was thinking the same thing. Let's move forward with that approach.",
  "All good on my end! Let me know if you need anything else from me.",
];

// Reply bodies — short, positive engagement signals
const REPLY_BODIES = [
  "Got it, thanks! Looks good to me.",
  "Great, I'll take a look. Thanks for sending this over!",
  "Makes sense — let's go with that approach.",
  "Thanks for the follow-up! I'll get back to you shortly.",
  "Sounds good. I'm available whenever works for you.",
  "Appreciate the quick turnaround on this!",
  "Perfect, that's exactly what I was looking for.",
  "Thanks! I'll review and circle back tomorrow morning.",
];

// Warmup recipient addresses — sent to the user's own domain so the
// inbound SMTP server receives them, creating real mail flow.
// This builds genuine sender reputation with receiving mail servers.
function getWarmupRecipients(domainName: string): string[] {
  return [
    `warmup-1@${domainName}`,
    `warmup-2@${domainName}`,
    `warmup-3@${domainName}`,
    `warmup-4@${domainName}`,
    `warmup-5@${domainName}`,
    `warmup-6@${domainName}`,
    `warmup-7@${domainName}`,
    `warmup-8@${domainName}`,
    `warmup-9@${domainName}`,
    `warmup-10@${domainName}`,
  ];
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export async function startWarmup(accountId: string, domainId: string, options?: {
  totalDays?: number;
  fromAddress?: string;
}) {
  const db = getDb();

  // Validate domain
  const [domain] = await db.select().from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.accountId, accountId)));

  if (!domain) throw new NotFoundError("Domain");
  if (domain.status !== "verified") {
    throw new ValidationError("Domain must be verified before starting warmup");
  }
  const mode = (domain as any).mode || "both";
  if (mode === "receive") {
    throw new ValidationError("Domain must be configured for sending to use warmup");
  }

  // Check for existing active warmup
  const [existing] = await db.select().from(warmupSchedules)
    .where(and(
      eq(warmupSchedules.domainId, domainId),
      eq(warmupSchedules.status, "active"),
    ));

  if (existing) {
    throw new ConflictError("An active warmup schedule already exists for this domain");
  }

  const totalDays = options?.totalDays || 30;
  const fromAddress = options?.fromAddress || `warmup@${domain.name}`;

  // Generate ramp schedule for the specified number of days
  const rampSchedule = [];
  for (let i = 0; i < totalDays; i++) {
    if (i < DEFAULT_RAMP_SCHEDULE.length) {
      rampSchedule.push(DEFAULT_RAMP_SCHEDULE[i]);
    } else {
      rampSchedule.push(DEFAULT_RAMP_SCHEDULE[DEFAULT_RAMP_SCHEDULE.length - 1]);
    }
  }

  const [schedule] = await db.insert(warmupSchedules).values({
    accountId,
    domainId,
    status: "active",
    currentDay: 1,
    totalDays,
    targetToday: rampSchedule[0],
    fromAddress,
    rampSchedule,
    startedAt: new Date(),
  }).returning();

  return schedule;
}

export async function pauseWarmup(accountId: string, scheduleId: string) {
  const db = getDb();
  const [schedule] = await db.select().from(warmupSchedules)
    .where(and(eq(warmupSchedules.id, scheduleId), eq(warmupSchedules.accountId, accountId)));

  if (!schedule) throw new NotFoundError("Warmup schedule");
  if (schedule.status !== "active") throw new ValidationError("Warmup is not active");

  const [updated] = await db.update(warmupSchedules)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(warmupSchedules.id, scheduleId))
    .returning();

  return updated;
}

export async function resumeWarmup(accountId: string, scheduleId: string) {
  const db = getDb();
  const [schedule] = await db.select().from(warmupSchedules)
    .where(and(eq(warmupSchedules.id, scheduleId), eq(warmupSchedules.accountId, accountId)));

  if (!schedule) throw new NotFoundError("Warmup schedule");
  if (schedule.status !== "paused") throw new ValidationError("Warmup is not paused");

  // Reset lastRunAt so the next hourly worker check runs a round immediately
  // rather than waiting for the original pause time to become 20h old.
  const [updated] = await db.update(warmupSchedules)
    .set({ status: "active", lastRunAt: null, updatedAt: new Date() })
    .where(eq(warmupSchedules.id, scheduleId))
    .returning();

  return updated;
}

export async function cancelWarmup(accountId: string, scheduleId: string) {
  const db = getDb();
  const [schedule] = await db.select().from(warmupSchedules)
    .where(and(eq(warmupSchedules.id, scheduleId), eq(warmupSchedules.accountId, accountId)));

  if (!schedule) throw new NotFoundError("Warmup schedule");
  if (schedule.status === "completed" || schedule.status === "cancelled") {
    throw new ValidationError("Warmup is already finished");
  }

  const [updated] = await db.update(warmupSchedules)
    .set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(warmupSchedules.id, scheduleId))
    .returning();

  return updated;
}

export async function getWarmup(accountId: string, scheduleId: string) {
  const db = getDb();
  const [schedule] = await db.select().from(warmupSchedules)
    .where(and(eq(warmupSchedules.id, scheduleId), eq(warmupSchedules.accountId, accountId)));

  if (!schedule) throw new NotFoundError("Warmup schedule");
  return schedule;
}

export async function listWarmups(accountId: string) {
  const db = getDb();
  return db.select().from(warmupSchedules)
    .where(eq(warmupSchedules.accountId, accountId))
    .orderBy(desc(warmupSchedules.createdAt));
}

export async function getWarmupStats(accountId: string, scheduleId: string) {
  const db = getDb();
  const schedule = await getWarmup(accountId, scheduleId);

  // Get daily breakdown
  const dailyStats = await db.select({
    day: warmupEmails.day,
    sent: sql<number>`count(*)::int`,
    opened: sql<number>`count(*) filter (where ${warmupEmails.opened} = true)::int`,
    replied: sql<number>`count(*) filter (where ${warmupEmails.replied} = true)::int`,
    inbox: sql<number>`count(*) filter (where ${warmupEmails.inboxPlacement} = 'inbox')::int`,
    spam: sql<number>`count(*) filter (where ${warmupEmails.inboxPlacement} = 'spam')::int`,
  })
    .from(warmupEmails)
    .where(eq(warmupEmails.scheduleId, scheduleId))
    .groupBy(warmupEmails.day)
    .orderBy(warmupEmails.day);

  return {
    schedule: formatWarmupResponse(schedule),
    daily: dailyStats,
    summary: {
      total_sent: schedule.totalSent,
      total_opens: schedule.totalOpens,
      total_replies: schedule.totalReplies,
      open_rate: schedule.totalSent > 0 ? Math.round((schedule.totalOpens / schedule.totalSent) * 100) : 0,
      reply_rate: schedule.totalSent > 0 ? Math.round((schedule.totalReplies / schedule.totalSent) * 100) : 0,
      days_completed: schedule.currentDay - 1,
      days_remaining: Math.max(0, schedule.totalDays - schedule.currentDay + 1),
    },
  };
}

// ---------------------------------------------------------------------------
// Daily warmup execution — called by the warmup worker
// ---------------------------------------------------------------------------

export async function executeWarmupRound(scheduleId: string) {
  const db = getDb();

  const [schedule] = await db.select().from(warmupSchedules)
    .where(and(eq(warmupSchedules.id, scheduleId), eq(warmupSchedules.status, "active")));

  if (!schedule) return;

  // Check if warmup is complete
  if (schedule.currentDay > schedule.totalDays) {
    await db.update(warmupSchedules)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(warmupSchedules.id, scheduleId));
    return;
  }

  // Check if we already ran today (within last 20 hours to allow some drift)
  if (schedule.lastRunAt) {
    const hoursSinceLastRun = (Date.now() - schedule.lastRunAt.getTime()) / 3_600_000;
    if (hoursSinceLastRun < 20) return;
  }

  // Look up the domain for recipient addresses
  const [domain] = await db.select().from(domains)
    .where(eq(domains.id, schedule.domainId));
  if (!domain) return;

  const target = schedule.rampSchedule[schedule.currentDay - 1] || 2;
  const recipients = getWarmupRecipients(domain.name);
  let sentCount = 0;

  // Spread sends across the day: up to 8 hours, min 20 min per email.
  // Each email is scheduled at an offset so ISPs see natural timing, not a burst.
  const spreadMs = Math.min(target * 20 * 60_000, 8 * 3_600_000);
  const intervalMs = target > 1 ? spreadMs / (target - 1) : 0;

  for (let i = 0; i < target; i++) {
    // Randomise which recipient gets this email
    const toAddress = recipients[Math.floor(Math.random() * recipients.length)];
    const subject = randomItem(WARMUP_SUBJECTS);
    const body = randomItem(WARMUP_BODIES);

    // Schedule each email staggered from now
    const scheduledAt = intervalMs > 0
      ? new Date(Date.now() + i * intervalMs)
      : undefined;

    try {
      // Send real email through the normal pipeline — goes out via SMTP,
      // comes back in via MX → Postfix → inbound server, creating genuine
      // mail flow that builds sender reputation with receiving MTAs.
      const result = await sendEmail(schedule.accountId, {
        from: schedule.fromAddress,
        to: [toAddress],
        subject,
        text: body,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#333;"><p>${body}</p></div>`,
        tags: { _warmup: "true", _warmup_schedule: schedule.id, _warmup_day: String(schedule.currentDay) },
        ...(scheduledAt ? { scheduled_at: scheduledAt.toISOString() } : {}),
      });

      const emailId = !result.cached ? (result.response as any)?.id : undefined;

      // Track the warmup email — engagement is recorded when the email
      // actually goes through the send pipeline (open/click tracking)
      await db.insert(warmupEmails).values({
        scheduleId: schedule.id,
        accountId: schedule.accountId,
        emailId: emailId || null,
        day: schedule.currentDay,
        fromAddress: schedule.fromAddress,
        toAddress,
        subject,
        opened: false,
        replied: false,
        inboxPlacement: "unknown",
        status: "sent",
      });

      sentCount++;
    } catch {
      await db.insert(warmupEmails).values({
        scheduleId: schedule.id,
        accountId: schedule.accountId,
        day: schedule.currentDay,
        fromAddress: schedule.fromAddress,
        toAddress,
        subject,
        status: "failed",
      }).catch(() => {});
    }
  }

  // Advance to next day
  const nextDay = schedule.currentDay + 1;
  const nextTarget = nextDay <= schedule.totalDays
    ? (schedule.rampSchedule[nextDay - 1] || 100)
    : 0;

  const isComplete = nextDay > schedule.totalDays;

  await db.update(warmupSchedules).set({
    currentDay: nextDay,
    sentToday: sentCount,
    targetToday: nextTarget,
    totalSent: sql`${warmupSchedules.totalSent} + ${sentCount}`,
    lastRunAt: new Date(),
    status: isComplete ? "completed" : "active",
    completedAt: isComplete ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(warmupSchedules.id, scheduleId));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatWarmupResponse(schedule: typeof warmupSchedules.$inferSelect) {
  const progressPercent = Math.min(100, Math.round(((schedule.currentDay - 1) / schedule.totalDays) * 100));

  return {
    id: schedule.id,
    domain_id: schedule.domainId,
    status: schedule.status,
    current_day: Math.min(schedule.currentDay, schedule.totalDays),
    total_days: schedule.totalDays,
    sent_today: schedule.sentToday,
    target_today: schedule.targetToday,
    total_sent: schedule.totalSent,
    total_opens: schedule.totalOpens,
    total_replies: schedule.totalReplies,
    open_rate: schedule.totalSent > 0 ? Math.round((schedule.totalOpens / schedule.totalSent) * 100) : 0,
    reply_rate: schedule.totalSent > 0 ? Math.round((schedule.totalReplies / schedule.totalSent) * 100) : 0,
    progress_percent: progressPercent,
    from_address: schedule.fromAddress,
    ramp_schedule: schedule.rampSchedule,
    started_at: schedule.startedAt.toISOString(),
    completed_at: schedule.completedAt?.toISOString() ?? null,
    created_at: schedule.createdAt.toISOString(),
  };
}
