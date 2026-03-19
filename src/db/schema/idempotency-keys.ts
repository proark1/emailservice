import { pgTable, uuid, varchar, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 255 }).notNull(),
  responseStatus: integer("response_status").notNull(),
  responseBody: jsonb("response_body"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_idempotency_keys_account_key").on(table.accountId, table.key),
]);
