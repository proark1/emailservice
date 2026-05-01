import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  audiences,
  contacts,
  preferenceTopics,
  contactTopicSubscriptions,
} from "../db/schema/index.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { encryptPrivateKey, decryptPrivateKey } from "../lib/crypto.js";
import { getConfig } from "../config/index.js";

export interface CreateTopicInput {
  key: string;
  label: string;
  description?: string;
  default_subscribed?: boolean;
}

export interface PreferenceTokenPayload {
  /** Account id — scope check on apply. */
  a: string;
  /** Audience id. */
  au: string;
  /** Contact email — looked up against the audience to find the contact row. */
  e: string;
}

const KEY_REGEX = /^[a-z0-9_-]{1,64}$/;

async function requireAudience(accountId: string, audienceId: string) {
  const db = getDb();
  const [aud] = await db
    .select()
    .from(audiences)
    .where(and(eq(audiences.id, audienceId), eq(audiences.accountId, accountId)));
  if (!aud) throw new NotFoundError("Audience");
  return aud;
}

export async function listTopics(accountId: string, audienceId: string) {
  await requireAudience(accountId, audienceId);
  const db = getDb();
  return db
    .select()
    .from(preferenceTopics)
    .where(eq(preferenceTopics.audienceId, audienceId));
}

export async function createTopic(accountId: string, audienceId: string, input: CreateTopicInput) {
  await requireAudience(accountId, audienceId);
  if (!KEY_REGEX.test(input.key)) {
    throw new ValidationError(
      "Topic key must be 1-64 chars, lowercase letters, digits, underscore or hyphen",
    );
  }
  const db = getDb();
  try {
    const [topic] = await db
      .insert(preferenceTopics)
      .values({
        audienceId,
        key: input.key,
        label: input.label,
        description: input.description ?? null,
        defaultSubscribed: input.default_subscribed ?? true,
      })
      .returning();
    return topic;
  } catch (err: any) {
    if (err.code === "23505") {
      throw new ConflictError(`Topic with key '${input.key}' already exists in this audience`);
    }
    throw err;
  }
}

export async function deleteTopic(accountId: string, audienceId: string, topicId: string) {
  await requireAudience(accountId, audienceId);
  const db = getDb();
  const [deleted] = await db
    .delete(preferenceTopics)
    .where(and(eq(preferenceTopics.id, topicId), eq(preferenceTopics.audienceId, audienceId)))
    .returning();
  if (!deleted) throw new NotFoundError("Topic");
  return deleted;
}

/**
 * Resolve a contact's effective subscriptions: every topic in the audience
 * paired with the contact's stored preference (or the topic's default if
 * absent). The default-fallback shape avoids a backfill when topics are added.
 */
export async function getContactPreferences(
  accountId: string,
  audienceId: string,
  contactEmail: string,
) {
  const aud = await requireAudience(accountId, audienceId);
  const db = getDb();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.audienceId, aud.id), eq(contacts.email, contactEmail.toLowerCase())));
  if (!contact) throw new NotFoundError("Contact");

  const topics = await db
    .select()
    .from(preferenceTopics)
    .where(eq(preferenceTopics.audienceId, audienceId));

  if (topics.length === 0) {
    return {
      contact: { id: contact.id, email: contact.email, subscribed: contact.subscribed },
      topics: [],
    };
  }

  const subs = await db
    .select()
    .from(contactTopicSubscriptions)
    .where(
      and(
        eq(contactTopicSubscriptions.contactId, contact.id),
        inArray(contactTopicSubscriptions.topicId, topics.map((t) => t.id)),
      ),
    );
  const subByTopic = new Map(subs.map((s) => [s.topicId, s]));

  return {
    contact: {
      id: contact.id,
      email: contact.email,
      subscribed: contact.subscribed,
    },
    topics: topics.map((t) => {
      const sub = subByTopic.get(t.id);
      return {
        id: t.id,
        key: t.key,
        label: t.label,
        description: t.description,
        subscribed: sub ? sub.subscribed : t.defaultSubscribed,
        changed_at: sub?.changedAt.toISOString() ?? null,
      };
    }),
  };
}

/**
 * Apply a partial update to a contact's per-topic state. `master_unsubscribe`
 * is a convenience: when true, sets contacts.subscribed = false (the global
 * opt-out, equivalent to RFC 8058 one-click). Topic updates are upserted.
 */
export async function updateContactPreferences(
  accountId: string,
  audienceId: string,
  contactEmail: string,
  updates: {
    topics?: Array<{ key: string; subscribed: boolean }>;
    master_unsubscribe?: boolean;
  },
) {
  const aud = await requireAudience(accountId, audienceId);
  const db = getDb();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.audienceId, aud.id), eq(contacts.email, contactEmail.toLowerCase())));
  if (!contact) throw new NotFoundError("Contact");

  if (updates.master_unsubscribe) {
    await db
      .update(contacts)
      .set({ subscribed: false, unsubscribedAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, contact.id));
  }

  if (updates.topics && updates.topics.length > 0) {
    const keys = updates.topics.map((t) => t.key);
    const topicRows = await db
      .select()
      .from(preferenceTopics)
      .where(
        and(
          eq(preferenceTopics.audienceId, audienceId),
          inArray(preferenceTopics.key, keys),
        ),
      );
    const byKey = new Map(topicRows.map((t) => [t.key, t]));
    for (const upd of updates.topics) {
      const topic = byKey.get(upd.key);
      if (!topic) {
        throw new ValidationError(`Unknown topic key: ${upd.key}`);
      }
      // Upsert: insert or update (subscribed, changedAt) on conflict.
      await db
        .insert(contactTopicSubscriptions)
        .values({
          contactId: contact.id,
          topicId: topic.id,
          subscribed: upd.subscribed,
          changedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [contactTopicSubscriptions.contactId, contactTopicSubscriptions.topicId],
          set: { subscribed: upd.subscribed, changedAt: new Date() },
        });
    }
  }

  return getContactPreferences(accountId, audienceId, contactEmail);
}

/**
 * Build a signed token that lets the bearer view + edit a single contact's
 * preferences on the public preference-center page. Reuses the same
 * AES-256-GCM primitive as the unsubscribe token so we don't introduce a
 * new key.
 */
export function generatePreferenceToken(accountId: string, audienceId: string, email: string): string {
  const config = getConfig();
  const payload: PreferenceTokenPayload = { a: accountId, au: audienceId, e: email.toLowerCase() };
  return encryptPrivateKey(JSON.stringify(payload), config.ENCRYPTION_KEY);
}

export function decodePreferenceToken(token: string): PreferenceTokenPayload | null {
  const config = getConfig();
  try {
    const decrypted = decryptPrivateKey(decodeURIComponent(token), config.ENCRYPTION_KEY);
    const parsed = JSON.parse(decrypted);
    if (typeof parsed.a !== "string" || typeof parsed.au !== "string" || typeof parsed.e !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function preferenceCenterUrl(accountId: string, audienceId: string, email: string): string {
  const token = generatePreferenceToken(accountId, audienceId, email);
  return `${getConfig().BASE_URL}/preferences/${encodeURIComponent(token)}`;
}
