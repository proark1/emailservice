import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
  monthlyEmailLimit: integer("monthly_email_limit"), // null = unlimited
  domainsLimit: integer("domains_limit").default(1),
  apiKeysLimit: integer("api_keys_limit").default(2),
  templatesLimit: integer("templates_limit").default(10),
  features: jsonb("features").default("{}"),
  rateLimit: integer("rate_limit").default(60),
  price: integer("price").default(0), // cents per month
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
