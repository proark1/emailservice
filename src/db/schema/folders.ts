import { pgTable, uuid, varchar, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const folderTypeEnum = ["system", "custom"] as const;
export type FolderType = (typeof folderTypeEnum)[number];

export const SYSTEM_FOLDER_SLUGS = ["inbox", "sent", "drafts", "trash", "spam", "archive"] as const;
export type SystemFolderSlug = (typeof SYSTEM_FOLDER_SLUGS)[number];

export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().$type<FolderType>().default("custom"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_folders_account_slug").on(table.accountId, table.slug),
  index("idx_folders_account").on(table.accountId),
]);
