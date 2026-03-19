import { pgTable, uuid, varchar, timestamp, text, jsonb, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { domains } from "./domains.js";

export const emailStatusEnum = ["queued", "sending", "sent", "delivered", "bounced", "failed", "complained"] as const;
export type EmailStatus = (typeof emailStatusEnum)[number];

export const emails = pgTable("emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").references(() => domains.id),
  idempotencyKey: varchar("idempotency_key", { length: 255 }),
  fromAddress: varchar("from_address", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 255 }),
  toAddresses: jsonb("to_addresses").$type<string[]>().notNull(),
  ccAddresses: jsonb("cc_addresses").$type<string[]>(),
  bccAddresses: jsonb("bcc_addresses").$type<string[]>(),
  replyTo: jsonb("reply_to").$type<string[]>(),
  subject: varchar("subject", { length: 998 }).notNull(),
  htmlBody: text("html_body"),
  textBody: text("text_body"),
  headers: jsonb("headers").$type<Record<string, string>>(),
  attachments: jsonb("attachments").$type<Array<{ filename: string; contentType: string; size: number; content: string }>>(),
  tags: jsonb("tags").$type<Record<string, string>>(),
  status: varchar("status", { length: 20 }).notNull().$type<EmailStatus>().default("queued"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  batchId: uuid("batch_id"),
  openCount: integer("open_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  messageId: varchar("message_id", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_emails_account_status").on(table.accountId, table.status),
  index("idx_emails_message_id").on(table.messageId),
  index("idx_emails_idempotency").on(table.accountId, table.idempotencyKey),
  index("idx_emails_scheduled_at").on(table.scheduledAt),
]);
