import { pgTable, uuid, date, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { domains } from "./domains.js";

export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").references(() => domains.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  sent: integer("sent").notNull().default(0),
  delivered: integer("delivered").notNull().default(0),
  bounced: integer("bounced").notNull().default(0),
  opened: integer("opened").notNull().default(0),
  uniqueOpened: integer("unique_opened").notNull().default(0),
  clicked: integer("clicked").notNull().default(0),
  uniqueClicked: integer("unique_clicked").notNull().default(0),
  complained: integer("complained").notNull().default(0),
  failed: integer("failed").notNull().default(0),
}, (table) => [
  uniqueIndex("idx_analytics_snapshots_unique").on(table.accountId, table.domainId, table.date),
  index("idx_analytics_snapshots_account_date").on(table.accountId, table.date),
]);
