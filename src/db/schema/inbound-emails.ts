import { pgTable, uuid, varchar, timestamp, text, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { domains } from "./domains.js";
import { folders } from "./folders.js";

export const inboundEmails = pgTable("inbound_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").references(() => domains.id, { onDelete: "set null" }),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  fromAddress: varchar("from_address", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 255 }),
  toAddress: varchar("to_address", { length: 255 }).notNull(),
  ccAddresses: jsonb("cc_addresses").$type<string[]>(),
  subject: varchar("subject", { length: 998 }).notNull(),
  textBody: text("text_body"),
  htmlBody: text("html_body"),
  headers: jsonb("headers").$type<Record<string, string>>(),
  messageId: varchar("message_id", { length: 500 }),
  inReplyTo: varchar("in_reply_to", { length: 500 }),
  threadId: varchar("thread_id", { length: 500 }),
  references: jsonb("references").$type<string[]>(),
  isRead: boolean("is_read").notNull().default(false),
  isStarred: boolean("is_starred").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  hasAttachments: boolean("has_attachments").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_inbound_emails_account").on(table.accountId),
  index("idx_inbound_emails_to").on(table.toAddress),
  index("idx_inbound_emails_created").on(table.accountId, table.createdAt),
  index("idx_inbound_emails_folder").on(table.accountId, table.folderId, table.createdAt),
  index("idx_inbound_emails_thread").on(table.accountId, table.threadId),
  index("idx_inbound_emails_deleted").on(table.accountId, table.deletedAt),
]);
