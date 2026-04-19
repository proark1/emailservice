import { pgTable, uuid, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { domains } from "./domains.js";

export const companyRoleEnum = ["owner", "admin", "member"] as const;
export type CompanyRole = (typeof companyRoleEnum)[number];

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerAccountId: uuid("owner_account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_companies_slug").on(table.slug),
  index("idx_companies_owner").on(table.ownerAccountId),
]);

export const companyMembers = pgTable("company_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().$type<CompanyRole>().default("member"),
  // True when the account was created by the provisioning flow (i.e. not a pre-existing user).
  // Used to decide whether hard-deleting the account on removal is safe.
  provisioned: varchar("provisioned", { length: 5 }).notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_company_members_unique").on(table.companyId, table.accountId),
  index("idx_company_members_account").on(table.accountId),
]);

export const companyMailboxes = pgTable("company_mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  localPart: varchar("local_part", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_company_mailboxes_handle").on(table.domainId, table.localPart),
  index("idx_company_mailboxes_account").on(table.accountId),
  index("idx_company_mailboxes_company").on(table.companyId),
]);
