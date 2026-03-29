import { eq, and, gte, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emailEvents, domains, blacklistChecks } from "../db/schema/index.js";

interface ScoreBreakdown {
  score: number;
  components: {
    bounce_rate: { score: number; weight: number; value: number };
    complaint_rate: { score: number; weight: number; value: number };
    blacklist_status: { score: number; weight: number; listings: number };
    dns_config: { score: number; weight: number; details: string };
  };
}

export async function calculateReputationScore(accountId: string, domainId?: string): Promise<ScoreBreakdown> {
  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get event counts for last 30 days
  const eventConditions: any[] = [
    eq(emailEvents.accountId, accountId),
    gte(emailEvents.createdAt, thirtyDaysAgo),
  ];

  const eventRows = await db
    .select({
      type: emailEvents.type,
      count: sql<number>`count(*)::int`,
    })
    .from(emailEvents)
    .where(and(...eventConditions))
    .groupBy(emailEvents.type);

  const counts: Record<string, number> = {};
  for (const r of eventRows) counts[r.type] = r.count;

  const sent = counts.sent || 0;
  const bounced = (counts.bounced || 0) + (counts.soft_bounced || 0);
  const complained = counts.complained || 0;

  // Bounce rate scoring (weight: 30)
  const bounceRate = sent > 0 ? bounced / sent : 0;
  let bounceScore = 100;
  if (bounceRate > 0.1) bounceScore = 0;
  else if (bounceRate > 0.05) bounceScore = 30;
  else if (bounceRate > 0.02) bounceScore = 60;
  else if (bounceRate > 0.01) bounceScore = 80;

  // Complaint rate scoring (weight: 25)
  const complaintRate = sent > 0 ? complained / sent : 0;
  let complaintScore = 100;
  if (complaintRate > 0.005) complaintScore = 0;
  else if (complaintRate > 0.003) complaintScore = 20;
  else if (complaintRate > 0.001) complaintScore = 50;
  else if (complaintRate > 0.0005) complaintScore = 80;

  // Blacklist scoring (weight: 20)
  let blacklistListings = 0;
  const blacklistRows = await db.select().from(blacklistChecks)
    .where(and(eq(blacklistChecks.accountId, accountId), eq(blacklistChecks.listed, true)))
    .limit(50);
  // Deduplicate
  const seenBl = new Set<string>();
  for (const r of blacklistRows) {
    const key = `${r.blacklistName}:${r.target}`;
    if (!seenBl.has(key)) { seenBl.add(key); blacklistListings++; }
  }
  let blacklistScore = 100;
  if (blacklistListings > 3) blacklistScore = 0;
  else if (blacklistListings > 1) blacklistScore = 40;
  else if (blacklistListings > 0) blacklistScore = 70;

  // DNS config scoring (weight: 25)
  let dnsScore = 0;
  let dnsDetails = "";
  if (domainId) {
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
    if (domain) {
      const checks = [
        domain.spfVerified, domain.dkimVerified, domain.dmarcVerified,
        domain.mxVerified, domain.returnPathVerified,
      ];
      const verified = checks.filter(Boolean).length;
      dnsScore = Math.round((verified / 5) * 100);
      const labels = ["SPF", "DKIM", "DMARC", "MX", "Return-Path"];
      dnsDetails = labels.filter((_, i) => checks[i]).join(", ") || "None verified";
    }
  } else {
    dnsScore = 75; // Default if no specific domain
    dnsDetails = "Check individual domains";
  }

  const totalScore = Math.round(
    (bounceScore * 0.30) + (complaintScore * 0.25) + (blacklistScore * 0.20) + (dnsScore * 0.25)
  );

  return {
    score: Math.min(100, Math.max(0, totalScore)),
    components: {
      bounce_rate: { score: bounceScore, weight: 30, value: bounceRate },
      complaint_rate: { score: complaintScore, weight: 25, value: complaintRate },
      blacklist_status: { score: blacklistScore, weight: 20, listings: blacklistListings },
      dns_config: { score: dnsScore, weight: 25, details: dnsDetails },
    },
  };
}
