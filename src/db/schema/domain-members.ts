import { pgTable, uuid, varchar, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { domains } from "./domains.js";

export const domainRoleEnum = ["owner", "admin", "member"] as const;
export type DomainRole = (typeof domainRoleEnum)[number];

export const domainMembers = pgTable("domain_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().$type<DomainRole>().default("member"),
  mailboxes: jsonb("mailboxes").$type<string[] | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_domain_members_unique").on(table.domainId, table.accountId),
  index("idx_domain_members_account").on(table.accountId),
]);
