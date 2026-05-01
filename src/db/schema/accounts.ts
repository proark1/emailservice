import { pgTable, uuid, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const roleEnum = ["user", "admin"] as const;
export type Role = (typeof roleEnum)[number];

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().$type<Role>().default("user"),
  // Sunset policy: auto-suppress recipients with no engagement (open/click)
  // within `sunsetPolicyDays`, after they've received at least
  // `sunsetPolicyMinEmails`. Disabled by default — enabling on a noisy list
  // can suppress thousands of addresses on first run.
  sunsetPolicyEnabled: boolean("sunset_policy_enabled").notNull().default(false),
  sunsetPolicyDays: integer("sunset_policy_days").notNull().default(180),
  sunsetPolicyMinEmails: integer("sunset_policy_min_emails").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
