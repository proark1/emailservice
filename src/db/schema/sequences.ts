import { pgTable, uuid, varchar, timestamp, text, integer, index, jsonb } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { audiences } from "./audiences.js";
import { contacts } from "./contacts.js";
import { templates } from "./templates.js";
import { emails } from "./emails.js";

export const sequenceStatusEnum = ["draft", "active", "paused", "completed"] as const;
export type SequenceStatus = (typeof sequenceStatusEnum)[number];

export const triggerTypeEnum = ["audience_join", "manual"] as const;
export type TriggerType = (typeof triggerTypeEnum)[number];

export const sequences = pgTable("sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  audienceId: uuid("audience_id").notNull().references(() => audiences.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  fromAddress: varchar("from_address", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 255 }),
  status: varchar("status", { length: 20 }).notNull().$type<SequenceStatus>().default("draft"),
  triggerType: varchar("trigger_type", { length: 20 }).notNull().$type<TriggerType>().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_sequences_account_id").on(table.accountId),
  index("idx_sequences_account_status").on(table.accountId, table.status),
  index("idx_sequences_audience_trigger").on(table.audienceId, table.triggerType, table.status),
]);

export const sequenceSteps = pgTable("sequence_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  delayMinutes: integer("delay_minutes").notNull().default(1440), // Default 24 hours
  subject: varchar("subject", { length: 998 }),
  htmlBody: text("html_body"),
  textBody: text("text_body"),
  templateId: uuid("template_id").references(() => templates.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_sequence_steps_sequence_id").on(table.sequenceId),
  index("idx_sequence_steps_sequence_position").on(table.sequenceId, table.position),
]);

export const enrollmentStatusEnum = ["active", "completed", "paused", "unsubscribed", "failed"] as const;
export type EnrollmentStatus = (typeof enrollmentStatusEnum)[number];

export const sequenceEnrollments = pgTable("sequence_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().$type<EnrollmentStatus>().default("active"),
  currentStep: integer("current_step").notNull().default(0), // 0 = hasn't received first step yet
  nextStepAt: timestamp("next_step_at", { withTimezone: true }),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_sequence_enrollments_sequence").on(table.sequenceId),
  index("idx_sequence_enrollments_status_next").on(table.status, table.nextStepAt),
  index("idx_sequence_enrollments_contact").on(table.contactId),
]);

export const sequenceSends = pgTable("sequence_sends", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => sequenceEnrollments.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull().references(() => sequenceSteps.id, { onDelete: "cascade" }),
  emailId: uuid("email_id").references(() => emails.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_sequence_sends_enrollment").on(table.enrollmentId),
  index("idx_sequence_sends_step").on(table.stepId),
]);
