import { pgTable, uuid, integer, date, uniqueIndex } from "drizzle-orm/pg-core";

export const usageRecords = pgTable("usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull(),
  date: date("date").notNull(),
  emailsSent: integer("emails_sent").default(0).notNull(),
  apiCalls: integer("api_calls").default(0).notNull(),
}, (table) => [
  uniqueIndex("usage_records_account_date_idx").on(table.accountId, table.date),
]);
