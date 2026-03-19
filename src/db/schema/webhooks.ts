import { pgTable, uuid, varchar, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 2048 }).notNull(),
  events: jsonb("events").$type<string[]>().notNull(),
  signingSecret: varchar("signing_secret", { length: 255 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_webhooks_account_id").on(table.accountId),
]);
