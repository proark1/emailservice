import { pgTable, uuid, varchar, boolean, text, timestamp, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { domains } from "./domains.js";

export const blacklistChecks = pgTable("blacklist_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").references(() => domains.id, { onDelete: "cascade" }),
  target: varchar("target", { length: 255 }).notNull(), // IP or domain
  targetType: varchar("target_type", { length: 10 }).notNull(), // "ip" or "domain"
  blacklistName: varchar("blacklist_name", { length: 100 }).notNull(),
  listed: boolean("listed").notNull().default(false),
  listedReason: text("listed_reason"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_blacklist_checks_account").on(table.accountId, table.target, table.checkedAt),
  index("idx_blacklist_checks_domain").on(table.domainId, table.checkedAt),
]);
