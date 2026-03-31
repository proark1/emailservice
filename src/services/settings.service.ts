import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { systemSettings } from "../db/schema/index.js";
import { getConfig } from "../config/index.js";

// In-memory cache — avoids a DB round-trip on every request
let cachedRateLimitMax: number | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function getRateLimitMax(): Promise<number> {
  const now = Date.now();
  if (cachedRateLimitMax !== null && now < cacheExpiry) {
    return cachedRateLimitMax;
  }
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "rate_limit_max"));
    const parsed = row ? parseInt(row.value, 10) : NaN;
    cachedRateLimitMax = isNaN(parsed) ? getConfig().RATE_LIMIT_MAX : parsed;
  } catch {
    cachedRateLimitMax = getConfig().RATE_LIMIT_MAX;
  }
  cacheExpiry = now + CACHE_TTL_MS;
  return cachedRateLimitMax;
}

export async function setRateLimitMax(value: number): Promise<void> {
  const db = getDb();
  await db
    .insert(systemSettings)
    .values({ key: "rate_limit_max", value: String(value), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: String(value), updatedAt: new Date() },
    });
  // Update cache immediately so next request picks up the new value
  cachedRateLimitMax = value;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
}
