/**
 * One-time migration: Create domain_members "owner" rows for all existing domains.
 * Run after applying the schema migration: pnpm tsx scripts/migrate-domain-owners.ts
 */
import { loadConfig } from "../src/config/index.js";
loadConfig();

import { getDb, runMigrations } from "../src/db/index.js";
import { domains, domainMembers } from "../src/db/schema/index.js";

async function main() {
  const db = getDb();

  const allDomains = await db.select({ id: domains.id, accountId: domains.accountId }).from(domains);
  console.log(`Found ${allDomains.length} domains to migrate`);

  let created = 0;
  for (const domain of allDomains) {
    try {
      await db
        .insert(domainMembers)
        .values({
          domainId: domain.id,
          accountId: domain.accountId,
          role: "owner",
        })
        .onConflictDoNothing();
      created++;
    } catch (err) {
      console.error(`Failed to create owner for domain ${domain.id}:`, err);
    }
  }

  console.log(`Created ${created} owner membership rows`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
