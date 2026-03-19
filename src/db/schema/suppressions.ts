import { pgTable, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { emails } from "./emails.js";

export const suppressionReasonEnum = ["bounce", "complaint", "unsubscribe", "manual"] as const;
export type SuppressionReason = (typeof suppressionReasonEnum)[number];

export const suppressions = pgTable("suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  reason: varchar("reason", { length: 20 }).notNull().$type<SuppressionReason>(),
  sourceEmailId: uuid("source_email_id").references(() => emails.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_suppressions_account_email").on(table.accountId, table.email),
]);
