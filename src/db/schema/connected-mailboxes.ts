import { pgTable, uuid, varchar, timestamp, boolean, text, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const mailboxProviderEnum = ["gmail", "outlook", "yahoo", "icloud", "custom"] as const;
export type MailboxProvider = (typeof mailboxProviderEnum)[number];

export const mailboxStatusEnum = ["active", "error", "disconnected"] as const;
export type MailboxStatus = (typeof mailboxStatusEnum)[number];

/**
 * Connected external mailboxes — SMTP + IMAP credentials for a real mailbox
 * (e.g. Gmail, Outlook) owned by the account holder.
 *
 * Emails sent from a connected mailbox use its SMTP server instead of the
 * platform's own transport. Inbound messages are fetched via IMAP and stored
 * in the inbound_emails table for a unified inbox experience.
 */
export const connectedMailboxes = pgTable("connected_mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),

  /** Display name shown in the UI (e.g. "Work Gmail") */
  displayName: varchar("display_name", { length: 255 }).notNull(),

  /** The email address of this mailbox */
  email: varchar("email", { length: 255 }).notNull(),

  /** Mail provider — drives SMTP/IMAP defaults in the UI */
  provider: varchar("provider", { length: 20 }).notNull().$type<MailboxProvider>().default("custom"),

  // ── SMTP (outbound) ──────────────────────────────────────────────────────
  smtpHost: varchar("smtp_host", { length: 255 }).notNull(),
  smtpPort: integer("smtp_port").notNull().default(587),
  /** Use SSL/TLS (port 465). False = STARTTLS (port 587) */
  smtpSecure: boolean("smtp_secure").notNull().default(false),

  // ── IMAP (inbound) ──────────────────────────────────────────────────────
  imapHost: varchar("imap_host", { length: 255 }).notNull(),
  imapPort: integer("imap_port").notNull().default(993),
  imapSecure: boolean("imap_secure").notNull().default(true),

  // ── Credentials ─────────────────────────────────────────────────────────
  /** IMAP/SMTP login username — usually the email address */
  username: varchar("username", { length: 255 }).notNull(),
  /** AES-256-GCM encrypted password / app-specific password / OAuth2 refresh token */
  encryptedPassword: text("encrypted_password").notNull(),

  // ── Status ──────────────────────────────────────────────────────────────
  status: varchar("status", { length: 20 }).notNull().$type<MailboxStatus>().default("active"),
  /** Last error message when status = 'error' */
  errorMessage: text("error_message"),

  // ── IMAP sync state ──────────────────────────────────────────────────────
  /** Last time IMAP was successfully synced */
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  /** Highest UID seen in the INBOX during last sync (for incremental fetch) */
  lastUid: integer("last_uid").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_connected_mailboxes_account").on(table.accountId),
  index("idx_connected_mailboxes_email").on(table.accountId, table.email),
  index("idx_connected_mailboxes_status").on(table.status),
]);
