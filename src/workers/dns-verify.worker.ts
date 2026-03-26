import { Worker, Job } from "bullmq";
import { getRedisConnection, getDnsVerifyQueue } from "../queues/index.js";
import { getDomain, updateDomainVerification } from "../services/domain.service.js";
import { verifyDnsRecords } from "../services/dns.service.js";
import { getDb } from "../db/index.js";
import { domains } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

export interface DnsVerifyJobData {
  domainId: string;
  attempt: number;
  startedAt: number;
}

const MAX_POLLING_HOURS = 72;
const POLL_INTERVALS_MS = [
  60_000,      // 1 min
  300_000,     // 5 min (repeat for first hour)
  300_000,
  300_000,
  300_000,
  300_000,
  300_000,
  300_000,
  300_000,
  300_000,
  300_000,
  300_000,
  1_800_000,   // 30 min (after first hour)
];

async function processDnsVerify(job: Job<DnsVerifyJobData>) {
  const { domainId, attempt } = job.data;
  const db = getDb();

  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
  if (!domain) return;
  if (domain.status === "verified") return;

  const result = await verifyDnsRecords(
    domain.name,
    domain.spfRecord || "",
    domain.dkimSelector || "es1",
    domain.dkimDnsValue || "",
  );

  const allVerified = result.spfVerified && result.dkimVerified && result.dmarcVerified;
  const newStatus = allVerified ? "verified" as const : "pending" as const;

  await updateDomainVerification(domainId, {
    spfVerified: result.spfVerified,
    dkimVerified: result.dkimVerified,
    dmarcVerified: result.dmarcVerified,
    mxVerified: result.mxVerified,
    status: newStatus,
  });

  // If not yet fully verified, schedule next check
  if (!allVerified) {
    const elapsedMs = Date.now() - job.data.startedAt;
    if (elapsedMs < MAX_POLLING_HOURS * 3_600_000) {
      const delayIndex = Math.min(attempt, POLL_INTERVALS_MS.length - 1);
      const delay = POLL_INTERVALS_MS[delayIndex];

      await getDnsVerifyQueue().add("dns-verify", {
        domainId,
        attempt: attempt + 1,
        startedAt: job.data.startedAt,
      }, { delay });
    } else {
      // Max polling exceeded — mark as failed
      await updateDomainVerification(domainId, { status: "failed" });
    }
  }
}

export function createDnsVerifyWorker() {
  return new Worker("dns:verify", processDnsVerify, {
    connection: getRedisConnection(),
    concurrency: 3,
  });
}
