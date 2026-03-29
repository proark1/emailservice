import { pgTable, uuid, varchar, timestamp, text, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { templates } from "./templates.js";
import { accounts } from "./accounts.js";

export const templateVersions = pgTable("template_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  subject: varchar("subject", { length: 998 }),
  htmlBody: text("html_body"),
  textBody: text("text_body"),
  variables: text("variables"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_template_versions_tid_ver").on(table.templateId, table.version),
]);
