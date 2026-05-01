import { pgTable, uuid, varchar, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { domains } from "./domains.js";

/**
 * TLS-RPT (RFC 8460) aggregate report rows. Receivers send a daily JSON
 * report to the address in the `_smtp._tls.<domain>` TXT record; we ingest
 * those reports as inbound mail and persist one row per
 * (policy, failure-type) bucket so the dashboard can show TLS handshake
 * health over time.
 */
export const tlsReports = pgTable("tls_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").references(() => domains.id, { onDelete: "cascade" }),
  domainName: varchar("domain_name", { length: 255 }).notNull(),
  // Report metadata
  organizationName: varchar("organization_name", { length: 255 }),
  reportId: varchar("report_id", { length: 255 }),
  contactInfo: varchar("contact_info", { length: 512 }),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  // One row per (policy_type, policy_string) bucket for compactness.
  policyType: varchar("policy_type", { length: 32 }).notNull(),
  policyString: jsonb("policy_string").$type<string[]>(),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  failureDetails: jsonb("failure_details").$type<Array<Record<string, unknown>>>(),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_tls_reports_domain").on(table.domainId, table.createdAt),
  index("idx_tls_reports_domain_name").on(table.domainName),
]);
