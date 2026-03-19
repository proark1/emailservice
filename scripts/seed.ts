import * as argon2 from "argon2";
import { loadConfig } from "../src/config/index.js";
import { getDb, closeDb } from "../src/db/index.js";
import { accounts, apiKeys } from "../src/db/schema/index.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../src/lib/crypto.js";

async function seed() {
  loadConfig();
  const db = getDb();

  console.log("Seeding database...\n");

  // Create an admin account
  const passwordHash = await argon2.hash("admin123");

  const [account] = await db
    .insert(accounts)
    .values({
      name: "Admin",
      email: "admin@localhost",
      passwordHash,
      role: "admin",
    })
    .onConflictDoNothing()
    .returning();

  if (!account) {
    console.log("Account already exists, skipping seed.");
    await closeDb();
    return;
  }

  console.log(`Created admin account: ${account.email} (password: admin123)`);

  // Create an API key
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
  console.log(`  Admin login: admin@localhost / admin123`);
  console.log(`  API key: ${fullKey}`);
  console.log(`${"=".repeat(60)}\n`);

  await closeDb();
  console.log("Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
