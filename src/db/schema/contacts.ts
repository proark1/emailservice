import { pgTable, uuid, varchar, timestamp, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { audiences } from "./audiences.js";

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  audienceId: uuid("audience_id").notNull().references(() => audiences.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  subscribed: boolean("subscribed").notNull().default(true),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_contacts_audience_email").on(table.audienceId, table.email),
]);
