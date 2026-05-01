import { pgTable, uuid, varchar, timestamp, boolean, text, uniqueIndex, index } from "drizzle-orm/pg-core";
import { audiences } from "./audiences.js";
import { contacts } from "./contacts.js";

/**
 * Per-audience topics ("Newsletter", "Product updates", "Billing"…). A
 * contact can be globally subscribed (contacts.subscribed = true) but opted
 * out of one or more topics. CAN-SPAM/GDPR-friendly: lets recipients reduce
 * volume without churning the whole list.
 *
 * Topics are scoped to an audience so two audiences can have the same
 * "Newsletter" label without collision.
 */
export const preferenceTopics = pgTable("preference_topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  audienceId: uuid("audience_id").notNull().references(() => audiences.id, { onDelete: "cascade" }),
  // Stable machine-friendly key, used in unsubscribe tokens and headers.
  key: varchar("key", { length: 64 }).notNull(),
  // Human-friendly label rendered in the preference center UI.
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  // When true the contact is subscribed to this topic by default — used at
  // contact-create time to seed the subscription rows.
  defaultSubscribed: boolean("default_subscribed").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_preference_topics_audience_key").on(table.audienceId, table.key),
]);

/**
 * Per-contact, per-topic subscription state. Stored as explicit rows
 * (instead of a JSONB blob on contacts) so we can index on
 * (contact, topic) and answer "is this contact subscribed to topic X" with
 * a single point lookup. Absent row = the topic's `defaultSubscribed` value
 * applies; this avoids backfilling all existing contacts when a new topic
 * is created.
 */
export const contactTopicSubscriptions = pgTable("contact_topic_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id").notNull().references(() => preferenceTopics.id, { onDelete: "cascade" }),
  subscribed: boolean("subscribed").notNull(),
  // When the user changed their preference. Useful for compliance audit
  // ("when did this contact opt out of marketing?").
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_contact_topic_unique").on(table.contactId, table.topicId),
  index("idx_contact_topic_topic").on(table.topicId),
]);
