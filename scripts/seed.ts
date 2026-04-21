import crypto from "node:crypto";
import * as argon2 from "argon2";
import { loadConfig } from "../src/config/index.js";
import { getDb, closeDb } from "../src/db/index.js";
import { accounts, apiKeys } from "../src/db/schema/index.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../src/lib/crypto.js";

/**
 * Seeds a single admin account + API key.
 *
 * The admin password is taken from SEED_ADMIN_PASSWORD, or a random 24-char
 * URL-safe string is generated and printed once to stdout. We refuse to run in
 * production entirely — production accounts should be created via /auth/register.
 */
async function seed() {
  const config = loadConfig();
  if (config.NODE_ENV === "production") {
    throw new Error("Refusing to run db:seed in production. Create accounts via /auth/register.");
  }
  const db = getDb();

  console.log("Seeding database...\n");

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@localhost";
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ||
    crypto.randomBytes(18).toString("base64url"); // ~24 chars

  const passwordHash = await argon2.hash(adminPassword);

  const [account] = await db
    .insert(accounts)
    .values({
      name: "Admin",
      email: adminEmail,
      passwordHash,
      role: "admin",
    })
    .onConflictDoNothing()
    .returning();

  if (!account) {
    console.log(`Account ${adminEmail} already exists; skipping seed.`);
    console.log("To reset, delete the account row and re-run, or set SEED_ADMIN_EMAIL to a new address.");
    await closeDb();
    return;
  }

  const fullKey = generateApiKey();
  const keyHash = await hashApiKey(fullKey);
  const keyPrefix = getKeyPrefix(fullKey);

  await db
    .insert(apiKeys)
    .values({
      accountId: account.id,
      name: "Default API Key",
      keyPrefix,
      keyHash,
      permissions: { sending: true, domains: true, webhooks: true, audiences: true },
      rateLimit: 100,
    });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Admin login: ${adminEmail} / ${adminPassword}`);
  console.log(`  API key:     ${fullKey}`);
  console.log(`${"=".repeat(60)}`);
  console.log("Store these now — the password is not recoverable.\n");

  await closeDb();
  console.log("Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
