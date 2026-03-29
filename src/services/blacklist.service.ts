import dns from "dns/promises";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { blacklistChecks, domains } from "../db/schema/index.js";

const IP_BLACKLISTS = [
  { name: "Spamhaus ZEN", host: "zen.spamhaus.org" },
  { name: "Barracuda", host: "b.barracudacentral.org" },
  { name: "SpamCop", host: "bl.spamcop.net" },
  { name: "SORBS", host: "dnsbl.sorbs.net" },
  { name: "CBL", host: "cbl.abuseat.org" },
  { name: "PSBL", host: "psbl.surriel.com" },
  { name: "Mailspike", host: "bl.mailspike.net" },
  { name: "JustSpam", host: "dnsbl.justspam.org" },
];

const DOMAIN_BLACKLISTS = [
  { name: "Spamhaus DBL", host: "dbl.spamhaus.org" },
  { name: "SURBL", host: "multi.surbl.org" },
  { name: "URIBL", host: "multi.uribl.com" },
  { name: "Spamhaus ZRD", host: "zrd.spamhaus.org" },
];

function reverseIp(ip: string): string {
  return ip.split(".").reverse().join(".");
}

async function checkDnsbl(target: string, blacklistHost: string, isDomain: boolean): Promise<boolean> {
  const query = isDomain ? `${target}.${blacklistHost}` : `${reverseIp(target)}.${blacklistHost}`;
  try {
    const results = await dns.resolve4(query);
    return results.length > 0; // If A record exists, target is listed
  } catch {
    return false; // NXDOMAIN = not listed
  }
}

export interface BlacklistResult {
  blacklist_name: string;
  listed: boolean;
  target: string;
  target_type: "ip" | "domain";
}

export async function checkIpBlacklists(ip: string): Promise<BlacklistResult[]> {
  const results: BlacklistResult[] = [];
  const checks = IP_BLACKLISTS.map(async (bl) => {
    const listed = await checkDnsbl(ip, bl.host, false);
    results.push({ blacklist_name: bl.name, listed, target: ip, target_type: "ip" });
  });
  await Promise.allSettled(checks);
  return results;
}

export async function checkDomainBlacklists(domain: string): Promise<BlacklistResult[]> {
  const results: BlacklistResult[] = [];
  const checks = DOMAIN_BLACKLISTS.map(async (bl) => {
    const listed = await checkDnsbl(domain, bl.host, true);
    results.push({ blacklist_name: bl.name, listed, target: domain, target_type: "domain" });
  });
  await Promise.allSettled(checks);
  return results;
}

export async function runFullCheck(accountId: string, domainId: string): Promise<BlacklistResult[]> {
  const db = getDb();
  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
  if (!domain) return [];

  const domainName = domain.name;
  const allResults: BlacklistResult[] = [];

  // Check domain against domain blacklists
  const domainResults = await checkDomainBlacklists(domainName);
  allResults.push(...domainResults);

  // Try to resolve domain's MX/A for IP-based checks
  try {
    const mxRecords = await dns.resolveMx(domainName);
    if (mxRecords.length > 0) {
      const mxHost = mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange;
      try {
        const ips = await dns.resolve4(mxHost);
        if (ips.length > 0) {
          const ipResults = await checkIpBlacklists(ips[0]);
          allResults.push(...ipResults);
        }
      } catch {
        // MX host doesn't resolve to an IP — skip IP checks
      }
    }
  } catch {
    // No MX records — skip IP checks
  }

  // Store results
  for (const result of allResults) {
    await db.insert(blacklistChecks).values({
      accountId,
      domainId,
      target: result.target,
      targetType: result.target_type,
      blacklistName: result.blacklist_name,
      listed: result.listed,
      checkedAt: new Date(),
    });
  }

  return allResults;
}

export async function getLatestChecks(accountId: string, domainId?: string) {
  const db = getDb();
  const conditions = [eq(blacklistChecks.accountId, accountId)];
  if (domainId) conditions.push(eq(blacklistChecks.domainId, domainId));

  // Get the most recent check per blacklist
  const rows = await db.select().from(blacklistChecks)
    .where(and(...conditions))
    .orderBy(desc(blacklistChecks.checkedAt))
    .limit(100);

  // Deduplicate: keep only latest per blacklist name + target
  const seen = new Set<string>();
  const latest: typeof rows = [];
  for (const row of rows) {
    const key = `${row.blacklistName}:${row.target}`;
    if (!seen.has(key)) {
      seen.add(key);
      latest.push(row);
    }
  }
  return latest;
}

export function formatBlacklistCheckResponse(check: typeof blacklistChecks.$inferSelect) {
  return {
    id: check.id,
    domain_id: check.domainId,
    target: check.target,
    target_type: check.targetType,
    blacklist_name: check.blacklistName,
    listed: check.listed,
    listed_reason: check.listedReason,
    checked_at: check.checkedAt.toISOString(),
  };
}
