import { pgTable, uuid, varchar, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";
import { audiences } from "./audiences.js";

export const importStatusEnum = ["pending", "processing", "completed", "failed"] as const;
export type ImportStatus = (typeof importStatusEnum)[number];

export const duplicateStrategyEnum = ["skip", "update"] as const;
export type DuplicateStrategy = (typeof duplicateStrategyEnum)[number];

export const contactImports = pgTable("contact_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  audienceId: uuid("audience_id").notNull().references(() => audiences.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull().$type<ImportStatus>().default("pending"),
  fileName: varchar("file_name", { length: 255 }),
  totalRows: integer("total_rows").notNull().default(0),
  processedRows: integer("processed_rows").notNull().default(0),
  createdRows: integer("created_rows").notNull().default(0),
  updatedRows: integer("updated_rows").notNull().default(0),
  skippedRows: integer("skipped_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  columnMapping: jsonb("column_mapping").$type<Record<string, string>>(),
  duplicateStrategy: varchar("duplicate_strategy", { length: 20 }).$type<DuplicateStrategy>().default("skip"),
  errors: jsonb("errors").$type<Array<{ row: number; message: string }>>().default([]),
  csvData: jsonb("csv_data").$type<string[][]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("idx_contact_imports_account_id").on(table.accountId),
  index("idx_contact_imports_account_status").on(table.accountId, table.status),
]);
