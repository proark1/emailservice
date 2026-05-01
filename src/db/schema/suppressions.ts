import { pgTable, uuid, varchar, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { emails } from "./emails.js";

export const suppressionReasonEnum = ["bounce", "complaint", "unsubscribe", "manual", "stale"] as const;
export type SuppressionReason = (typeof suppressionReasonEnum)[number];

export const suppressions = pgTable("suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  reason: varchar("reason", { length: 20 }).notNull().$type<SuppressionReason>(),
  // SET NULL on delete: when the originating email is purged (trash, account
  // delete cascade), the suppression itself must outlive it — we still want
  // future sends to that address blocked. Using NO ACTION (the default) would
  // turn the email delete into a constraint violation; SET NULL preserves the
  // suppression and just drops the back-reference.
  sourceEmailId: uuid("source_email_id").references(() => emails.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_suppressions_account_email").on(table.accountId, table.email),
  index("idx_suppressions_account_created").on(table.accountId, table.createdAt),
]);
