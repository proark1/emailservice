import { pgTable, uuid, varchar, timestamp, integer, text, jsonb, index } from "drizzle-orm/pg-core";
import { webhooks } from "./webhooks.js";
import { emailEvents } from "./email-events.js";

export const deliveryStatusEnum = ["pending", "success", "failed", "exhausted"] as const;
export type DeliveryStatus = (typeof deliveryStatusEnum)[number];

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  webhookId: uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  emailEventId: uuid("email_event_id").notNull().references(() => emailEvents.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 2048 }).notNull(),
  requestBody: jsonb("request_body"),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  attempt: integer("attempt").notNull().default(1),
  maxAttempts: integer("max_attempts").notNull().default(5),
  status: varchar("status", { length: 20 }).notNull().$type<DeliveryStatus>().default("pending"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_webhook_deliveries_webhook_id").on(table.webhookId),
  index("idx_webhook_deliveries_status").on(table.status),
  index("idx_webhook_deliveries_webhook_status").on(table.webhookId, table.status),
  index("idx_webhook_deliveries_status_retry").on(table.status, table.nextRetryAt),
  // Used by the retention-purge worker to drop terminal-status rows older
  // than the retention window in batches. Composite (status, created_at)
  // matches the cleanup predicate exactly.
  index("idx_webhook_deliveries_retention").on(table.status, table.createdAt),
]);
