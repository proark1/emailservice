import { pgTable, uuid, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { emails } from "./emails.js";
import { accounts } from "./accounts.js";

export const emailEventTypeEnum = [
  "queued", "sent", "delivered", "bounced", "soft_bounced",
  "opened", "clicked", "complained", "failed", "deferred", "cancelled",
] as const;
export type EmailEventType = (typeof emailEventTypeEnum)[number];

export const emailEvents = pgTable("email_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailId: uuid("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull().$type<EmailEventType>(),
  data: jsonb("data").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_email_events_email_id").on(table.emailId),
  index("idx_email_events_account_type_created").on(table.accountId, table.type, table.createdAt),
]);
