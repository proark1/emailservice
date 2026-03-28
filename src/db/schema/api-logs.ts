import { pgTable, uuid, varchar, timestamp, integer, text, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const apiLogs = pgTable("api_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  apiKeyId: uuid("api_key_id"),
  method: varchar("method", { length: 10 }).notNull(),
  path: varchar("path", { length: 2048 }).notNull(),
  statusCode: integer("status_code").notNull(),
  responseTime: integer("response_time"), // ms
  userAgent: varchar("user_agent", { length: 500 }),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_api_logs_account").on(table.accountId),
  index("idx_api_logs_created").on(table.createdAt),
]);
