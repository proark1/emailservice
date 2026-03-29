import { pgTable, uuid, varchar, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { domains } from "./domains.js";
import type { DomainRole } from "./domain-members.js";

export const domainInvitations = pgTable("domain_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().$type<DomainRole>().default("member"),
  mailboxes: jsonb("mailboxes").$type<string[] | null>(),
  invitedBy: uuid("invited_by").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_domain_invitations_domain").on(table.domainId),
  index("idx_domain_invitations_email").on(table.email),
  index("idx_domain_invitations_token").on(table.token),
]);
