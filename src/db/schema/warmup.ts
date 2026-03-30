import { pgTable, uuid, varchar, timestamp, text, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { domains } from "./domains.js";

export const warmupStatusEnum = ["active", "paused", "completed", "cancelled"] as const;
export type WarmupStatus = (typeof warmupStatusEnum)[number];

/**
 * Warmup schedule for a domain — controls the daily ramp-up plan.
 */
export const warmupSchedules = pgTable("warmup_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().$type<WarmupStatus>().default("active"),
  /** Current day in the warmup plan (1-based) */
  currentDay: integer("current_day").notNull().default(1),
  /** Total planned warmup days */
  totalDays: integer("total_days").notNull().default(30),
  /** Emails sent today so far */
  sentToday: integer("sent_today").notNull().default(0),
  /** Target emails for today */
  targetToday: integer("target_today").notNull().default(2),
  /** Total emails sent across the entire warmup */
  totalSent: integer("total_sent").notNull().default(0),
  /** Total opens recorded */
  totalOpens: integer("total_opens").notNull().default(0),
  /** Total replies recorded */
  totalReplies: integer("total_replies").notNull().default(0),
  /** From address used for warmup emails */
  fromAddress: varchar("from_address", { length: 255 }).notNull(),
  /** Custom ramp schedule: array of daily targets [day1, day2, ...] */
  rampSchedule: jsonb("ramp_schedule").$type<number[]>().notNull(),
  /** Optional external email addresses to include in the warmup send pool.
   *  These are real mailboxes outside the domain (e.g. a Gmail test account).
   *  Including external providers broadens the reputation signal beyond
   *  the domain's own MX and tests deliverability to real mail providers. */
  externalRecipients: jsonb("external_recipients").$type<string[]>(),
  /** True when the ramp was held this cycle due to low engagement (open rate < 10%) */
  rampHeld: boolean("ramp_held").notNull().default(false),
  /** When the warmup last ran (to prevent double-runs) */
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_warmup_schedules_account").on(table.accountId),
  index("idx_warmup_schedules_domain").on(table.domainId),
  index("idx_warmup_schedules_status").on(table.status),
]);

/**
 * Individual warmup emails — tracks each email sent during warmup.
 */
export const warmupEmails = pgTable("warmup_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleId: uuid("schedule_id").notNull().references(() => warmupSchedules.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  /** The actual email record ID (in the emails table) */
  emailId: uuid("email_id"),
  day: integer("day").notNull(),
  fromAddress: varchar("from_address", { length: 255 }).notNull(),
  toAddress: varchar("to_address", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 998 }).notNull(),
  /** Whether this warmup email was opened (by the warmup pool) */
  opened: boolean("opened").notNull().default(false),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  /** Whether a reply was sent back (positive engagement signal) */
  replied: boolean("replied").notNull().default(false),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  /** Whether the email landed in inbox vs spam */
  inboxPlacement: varchar("inbox_placement", { length: 20 }).$type<"inbox" | "spam" | "unknown">().default("unknown"),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_warmup_emails_schedule").on(table.scheduleId),
  index("idx_warmup_emails_account_day").on(table.accountId, table.day),
  index("idx_warmup_emails_email_id").on(table.emailId),
]);
