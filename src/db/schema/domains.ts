import { pgTable, uuid, varchar, timestamp, boolean, text, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const domainStatusEnum = ["pending", "verified", "failed"] as const;
export type DomainStatus = (typeof domainStatusEnum)[number];

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().$type<DomainStatus>().default("pending"),
  spfRecord: text("spf_record"),
  spfVerified: boolean("spf_verified").notNull().default(false),
  dkimSelector: varchar("dkim_selector", { length: 63 }),
  dkimPublicKey: text("dkim_public_key"),
  dkimPrivateKey: text("dkim_private_key"),
  dkimDnsValue: text("dkim_dns_value"),
  dkimVerified: boolean("dkim_verified").notNull().default(false),
  dmarcRecord: text("dmarc_record"),
  dmarcVerified: boolean("dmarc_verified").notNull().default(false),
  mxVerified: boolean("mx_verified").notNull().default(false),
  returnPathDomain: varchar("return_path_domain", { length: 255 }),
  returnPathVerified: boolean("return_path_verified").notNull().default(false),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_domains_account_name").on(table.accountId, table.name),
]);
