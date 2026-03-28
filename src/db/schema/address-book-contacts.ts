import { pgTable, uuid, varchar, timestamp, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const addressBookContacts = pgTable("address_book_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  company: varchar("company", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_address_book_account_email").on(table.accountId, table.email),
  index("idx_address_book_account_name").on(table.accountId, table.name),
]);
