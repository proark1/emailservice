import { pgTable, uuid, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const batchStatusEnum = ["processing", "completed", "partial_failure", "failed"] as const;
export type BatchStatus = (typeof batchStatusEnum)[number];

export const emailBatches = pgTable("email_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  totalCount: integer("total_count").notNull(),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().$type<BatchStatus>().default("processing"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_email_batches_account_status").on(table.accountId, table.status),
  index("idx_email_batches_account_created").on(table.accountId, table.createdAt),
]);
