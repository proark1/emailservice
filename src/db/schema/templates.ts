import { pgTable, uuid, varchar, timestamp, text, integer, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 998 }),
  htmlBody: text("html_body"),
  textBody: text("text_body"),
  variables: text("variables"), // JSON array of variable names like ["first_name", "company"]
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_templates_account").on(table.accountId),
]);
