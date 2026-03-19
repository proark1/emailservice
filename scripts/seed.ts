import { loadConfig } from "../src/config/index.js";
import { getDb, closeDb } from "../src/db/index.js";
import { accounts, apiKeys } from "../src/db/schema/index.js";
import { generateApiKey, getKeyPrefix, hashApiKey } from "../src/lib/crypto.js";

async function seed() {
  loadConfig();
  const db = getDb();

  console.log("Seeding database...\n");

  // Create a default account
  const [account] = await db
    .insert(accounts)
    .values({
      name: "Default Account",
      email: "admin@localhost",
    })
    .onConflictDoNothing()
    .returning();

  if (!account) {
    console.log("Account already exists, skipping seed.");
    await closeDb();
    return;
  }

  console.log(`Created account: ${account.name} (${account.id})`);

  // Create an API key
  const fullKey = generateApiKey();
  const keyHash = await hashApiKey(fullKey);
  const keyPrefix = getKeyPrefix(fullKey);

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      accountId: account.id,
      name: "Default API Key",
      keyPrefix,
      keyHash,
      permissions: { sending: true, domains: true, webhooks: true, audiences: true },
      rateLimit: 100,
    })
    .returning();

  console.log(`Created API key: ${apiKey.name}`);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Your API key (save this, it won't be shown again):`);
  console.log(`  ${fullKey}`);
  console.log(`${"=".repeat(60)}\n`);

  await closeDb();
  console.log("Seed complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
