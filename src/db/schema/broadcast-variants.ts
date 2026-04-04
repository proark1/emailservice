import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { broadcasts } from "./broadcasts.js";
import { contacts } from "./contacts.js";
import { emails } from "./emails.js";

export const broadcastVariantSends = pgTable("broadcast_variant_sends", {
  id: uuid("id").primaryKey().defaultRandom(),
  broadcastId: uuid("broadcast_id").notNull().references(() => broadcasts.id, { onDelete: "cascade" }),
  variantId: varchar("variant_id", { length: 20 }).notNull(), // "A", "B", or "winner"
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  emailId: uuid("email_id").references(() => emails.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_broadcast_variant_sends_broadcast").on(table.broadcastId),
  index("idx_broadcast_variant_sends_broadcast_variant").on(table.broadcastId, table.variantId),
]);
