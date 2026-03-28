import { pgTable, uuid, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { inboundEmails } from "./inbound-emails.js";

export const inboundAttachments = pgTable("inbound_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  inboundEmailId: uuid("inbound_email_id").notNull().references(() => inboundEmails.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 500 }).notNull(),
  contentType: varchar("content_type", { length: 255 }).notNull(),
  size: integer("size").notNull(),
  storagePath: varchar("storage_path", { length: 1000 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_inbound_attachments_email").on(table.inboundEmailId),
]);
