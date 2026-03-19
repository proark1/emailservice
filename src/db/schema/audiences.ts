import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const audiences = pgTable("audiences", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_audiences_account_id").on(table.accountId),
]);
