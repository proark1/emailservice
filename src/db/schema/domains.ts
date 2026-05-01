import { pgTable, uuid, varchar, timestamp, boolean, text, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { companies } from "./companies.js";

export const domainModeEnum = ["send", "receive", "both"] as const;
export type DomainMode = (typeof domainModeEnum)[number];

export const domainStatusEnum = ["pending", "verified", "failed"] as const;
export type DomainStatus = (typeof domainStatusEnum)[number];

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  mode: varchar("mode", { length: 10 }).notNull().$type<DomainMode>().default("both"),
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
  dmarcRuaEmail: varchar("dmarc_rua_email", { length: 255 }),
  sendRatePerMinute: integer("send_rate_per_minute"),
  // BIMI: brand logo + (optional) VMC certificate URL. The TXT record is
  // generated from these fields; eligibility additionally requires
  // DMARC enforcement (p=quarantine or p=reject) which we already publish.
  bimiLogoUrl: text("bimi_logo_url"),
  bimiVmcUrl: text("bimi_vmc_url"),
  bimiVerified: boolean("bimi_verified").notNull().default(false),
  // MTA-STS: published policy mode. "none" disables publishing the TXT and
  // policy file; "testing" advertises a policy but instructs receivers not
  // to apply it; "enforce" requires receivers to use TLS.
  mtaStsMode: varchar("mta_sts_mode", { length: 16 }).notNull().default("none"),
  mtaStsPolicyId: varchar("mta_sts_policy_id", { length: 64 }),
  // TLS-RPT (RFC 8460): SMTP TLS reporting endpoint — typically a
  // mailto: address that aggregates daily TLS handshake reports.
  tlsRptRuaEmail: varchar("tls_rpt_rua_email", { length: 255 }),
  // DNS provider credentials (encrypted)
  dnsProvider: varchar("dns_provider", { length: 20 }),
  dnsProviderKey: text("dns_provider_key"), // encrypted
  dnsProviderSecret: text("dns_provider_secret"), // encrypted
  dnsProviderZoneId: varchar("dns_provider_zone_id", { length: 255 }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_domains_account_name").on(table.accountId, table.name),
]);
