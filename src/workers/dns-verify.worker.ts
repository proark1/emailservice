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

  // Determine what needs to pass based on domain mode
  const mode = (domain as any).mode || "both";
  const needsSend = mode === "send" || mode === "both";
  const needsReceive = mode === "receive" || mode === "both";

  const sendVerified = !needsSend || (result.spfVerified && result.dkimVerified && result.dmarcVerified);
  const receiveVerified = !needsReceive || result.mxVerified;
  const allVerified = sendVerified && receiveVerified;
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
    // `startedAt` may be missing on older job payloads or manually-replayed
    // jobs. `Date.now() - undefined` is NaN, and `NaN < ...` is false, which
    // would silently skip the next-poll branch (no failure, no retry — the
    // domain just stays "pending" forever). Default to "now" so a missing
    // field gives the job a fresh 72h budget instead of dropping it.
    const startedAt = typeof job.data.startedAt === "number" ? job.data.startedAt : Date.now();
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs < MAX_POLLING_HOURS * 3_600_000) {
      const delayIndex = Math.min(attempt, POLL_INTERVALS_MS.length - 1);
      const delay = POLL_INTERVALS_MS[delayIndex];

      await getDnsVerifyQueue().add("dns-verify", {
        domainId,
        attempt: attempt + 1,
        startedAt,
      }, { delay });
    } else {
      // Max polling exceeded — mark as failed
      await updateDomainVerification(domainId, { status: "failed" });
    }
  }
}

export function createDnsVerifyWorker() {
  return new Worker("dns.verify", processDnsVerify, {
    connection: getRedisConnection(),
    concurrency: 3,
  });
}
