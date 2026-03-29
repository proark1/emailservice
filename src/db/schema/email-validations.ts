import { pgTable, uuid, varchar, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const emailValidations = pgTable("email_validations", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  result: varchar("result", { length: 20 }).notNull(), // valid, invalid, risky, unknown
  reason: varchar("reason", { length: 50 }), // invalid_syntax, no_mx, disposable, role_address, catch_all, smtp_rejected
  mxFound: boolean("mx_found"),
  isDisposable: boolean("is_disposable"),
  isRoleAddress: boolean("is_role_address"),
  isFreeProvider: boolean("is_free_provider"),
  suggestedCorrection: varchar("suggested_correction", { length: 255 }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_email_validations_email").on(table.email),
  index("idx_email_validations_account").on(table.accountId, table.createdAt),
]);
