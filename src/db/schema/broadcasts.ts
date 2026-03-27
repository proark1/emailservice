import { pgTable, uuid, varchar, timestamp, text, jsonb, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { audiences } from "./audiences.js";

export const broadcastStatusEnum = ["draft", "sending", "sent", "partial_failure", "failed"] as const;
export type BroadcastStatus = (typeof broadcastStatusEnum)[number];

export const broadcasts = pgTable("broadcasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  audienceId: uuid("audience_id").notNull().references(() => audiences.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  fromAddress: varchar("from_address", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 255 }),
  subject: varchar("subject", { length: 998 }).notNull(),
  htmlBody: text("html_body"),
  textBody: text("text_body"),
  replyTo: jsonb("reply_to").$type<string[]>(),
  headers: jsonb("headers").$type<Record<string, string>>(),
  tags: jsonb("tags").$type<Record<string, string>>(),
  status: varchar("status", { length: 20 }).notNull().$type<BroadcastStatus>().default("draft"),
  totalCount: integer("total_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_broadcasts_account_id").on(table.accountId),
  index("idx_broadcasts_account_status").on(table.accountId, table.status),
]);
