import { pgTable, uuid, varchar, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  keyHash: varchar("key_hash", { length: 255 }).notNull(),
  permissions: jsonb("permissions").$type<Record<string, boolean>>().notNull().default({}),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  rateLimit: integer("rate_limit").notNull().default(60),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_api_keys_key_prefix").on(table.keyPrefix),
  index("idx_api_keys_account_id").on(table.accountId),
]);
