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

// Warmup pool addresses — these are internal addresses that "receive" warmup emails
// In a real warmup service, these would be real mailboxes across providers.
// Here we use the MailNowAPI domain as the pool.
function getWarmupPoolAddresses(): string[] {
  return [
    "warmup-inbox-1@mailnowapi.com",
    "warmup-inbox-2@mailnowapi.com",
    "warmup-inbox-3@mailnowapi.com",
    "warmup-inbox-4@mailnowapi.com",
    "warmup-inbox-5@mailnowapi.com",
    "warmup-pool-a@mailnowapi.com",
    "warmup-pool-b@mailnowapi.com",
    "warmup-pool-c@mailnowapi.com",
    "warmup-pool-d@mailnowapi.com",
    "warmup-pool-e@mailnowapi.com",
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

  const [updated] = await db.update(warmupSchedules)
    .set({ status: "active", updatedAt: new Date() })
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

  const target = schedule.rampSchedule[schedule.currentDay - 1] || 2;
  const poolAddresses = getWarmupPoolAddresses();
  let sentCount = 0;
  let openCount = 0;
  let replyCount = 0;

  // Send warmup emails spread across the pool
  for (let i = 0; i < target; i++) {
    const toAddress = poolAddresses[i % poolAddresses.length];
    const subject = randomItem(WARMUP_SUBJECTS);
    const body = randomItem(WARMUP_BODIES);

    try {
      // Send the actual email through the normal email pipeline
      const result = await sendEmail(schedule.accountId, {
        from: schedule.fromAddress,
        to: [toAddress],
        subject,
        text: body,
        html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #333;"><p>${body}</p></div>`,
        tags: { warmup: "true", warmup_day: String(schedule.currentDay) },
      });

      const emailId = result.cached ? undefined : (result.response as any)?.id;

      // Simulate engagement: ~85% open rate, ~30% reply rate (realistic for warmup)
      const willOpen = Math.random() < 0.85;
      const willReply = willOpen && Math.random() < 0.35;

      const [warmupEmail] = await db.insert(warmupEmails).values({
        scheduleId: schedule.id,
        accountId: schedule.accountId,
        emailId: emailId || null,
        day: schedule.currentDay,
        fromAddress: schedule.fromAddress,
        toAddress,
        subject,
        opened: willOpen,
        openedAt: willOpen ? new Date(Date.now() + Math.random() * 3_600_000) : null,
        replied: willReply,
        repliedAt: willReply ? new Date(Date.now() + Math.random() * 7_200_000) : null,
        inboxPlacement: "inbox", // Warmup pool always reports inbox
        status: "sent",
      }).returning();

      sentCount++;
      if (willOpen) openCount++;
      if (willReply) replyCount++;
    } catch {
      // Log failed warmup email but continue
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
    totalSent: schedule.totalSent + sentCount,
    totalOpens: schedule.totalOpens + openCount,
    totalReplies: schedule.totalReplies + replyCount,
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
    current_day: schedule.currentDay,
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
