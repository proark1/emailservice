import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { apiKeys } from "../db/schema/index.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../lib/crypto.js";
import { NotFoundError } from "../lib/errors.js";
import type { CreateApiKeyInput } from "../schemas/api-key.schema.js";

export async function createApiKey(accountId: string, input: CreateApiKeyInput) {
  const db = getDb();
  const fullKey = generateApiKey();
  const keyHash = await hashApiKey(fullKey);
  const keyPrefix = getKeyPrefix(fullKey);

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      accountId,
      name: input.name,
      keyPrefix,
      keyHash,
      permissions: (input.permissions ?? {}) as Record<string, boolean>,
      rateLimit: input.rate_limit ?? 60,
      expiresAt: input.expires_at ? new Date(input.expires_at) : null,
    })
    .returning();

  return { apiKey, fullKey };
}

export async function listApiKeys(accountId: string) {
  const db = getDb();
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.accountId, accountId), isNull(apiKeys.revokedAt)));
}

export async function revokeApiKey(accountId: string, keyId: string) {
  const db = getDb();
  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.accountId, accountId), isNull(apiKeys.revokedAt)))
    .returning();

  if (!updated) {
    throw new NotFoundError("API key");
  }

  return updated;
}

export function formatApiKeyResponse(key: typeof apiKeys.$inferSelect) {
  return {
    id: key.id,
    name: key.name,
    key_prefix: key.keyPrefix,
    permissions: key.permissions,
    rate_limit: key.rateLimit,
    last_used_at: key.lastUsedAt?.toISOString() ?? null,
    expires_at: key.expiresAt?.toISOString() ?? null,
    created_at: key.createdAt.toISOString(),
  };
}
