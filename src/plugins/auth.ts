import { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { apiKeys, accounts } from "../db/schema/index.js";
import { verifyApiKey, getKeyPrefix } from "../lib/crypto.js";
import { UnauthorizedError } from "../lib/errors.js";

// Throttle lastUsedAt updates: only write once per key per 5 minutes
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;
const lastUsedCache = new Map<string, number>();

async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("account", undefined as any);
  app.decorateRequest("apiKey", undefined as any);

  app.decorate("authenticate", async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
    }

    const token = authHeader.slice(7);
    if (!token.startsWith("es_")) {
      throw new UnauthorizedError("Invalid API key format");
    }

    const prefix = getKeyPrefix(token);
    const db = getDb();

    // Find API keys matching the prefix
    const candidates = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyPrefix, prefix));

    // Find the matching key by verifying the hash
    let matchedKey = null;
    for (const candidate of candidates) {
      if (candidate.revokedAt) continue;
      if (candidate.expiresAt && candidate.expiresAt < new Date()) continue;
      if (await verifyApiKey(token, candidate.keyHash)) {
        matchedKey = candidate;
        break;
      }
    }

    if (!matchedKey) {
      throw new UnauthorizedError();
    }

    // Load the account
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, matchedKey.accountId));

    if (!account) {
      throw new UnauthorizedError("Account not found");
    }

    // Update last used timestamp (throttled — at most once per 5 minutes per key)
    const now = Date.now();
    const lastUpdated = lastUsedCache.get(matchedKey.id) ?? 0;
    if (now - lastUpdated > LAST_USED_THROTTLE_MS) {
      lastUsedCache.set(matchedKey.id, now);
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, matchedKey.id))
        .execute()
        .catch(() => {});
    }

    request.account = account;
    request.apiKey = matchedKey;
  });
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export default fp(authPlugin, { name: "auth" });
