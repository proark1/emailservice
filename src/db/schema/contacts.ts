import { pgTable, uuid, varchar, timestamp, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
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
  // Hot path for broadcast / sequence / A-B fan-out:
  //   WHERE audience_id = $1 AND subscribed = true
  // The unique index on (audience_id, email) handles audience_id alone but
  // forces a row-by-row filter on `subscribed` afterward. A composite makes
  // the planner index-scan straight to the rows it needs.
  index("idx_contacts_audience_subscribed").on(table.audienceId, table.subscribed),
]);
