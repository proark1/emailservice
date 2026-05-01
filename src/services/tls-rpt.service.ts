import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains, tlsReports } from "../db/schema/index.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger("tls-rpt");

/**
 * RFC 8460 TLS-RPT ingestion. Receivers email a JSON report (sometimes
 * gzipped) once a day; the inbound mail handler hands the JSON body off
 * here and we persist one row per (policy, failure-type) bucket.
 *
 * We don't validate the report against the spec strictly — a few large
 * receivers send slight variations and rejecting on schema would lose
 * data. Instead we extract the fields we know about and store the raw
 * JSON for forensic lookup.
 */

interface TlsReportPolicy {
  policy?: {
    "policy-type"?: string;
    "policy-string"?: string[];
    "policy-domain"?: string;
  };
  summary?: {
    "total-successful-session-count"?: number;
    "total-failure-session-count"?: number;
  };
  "failure-details"?: Array<Record<string, unknown>>;
}

interface TlsReport {
  "organization-name"?: string;
  "date-range"?: { "start-datetime"?: string; "end-datetime"?: string };
  "contact-info"?: string;
  "report-id"?: string;
  policies?: TlsReportPolicy[];
}

export async function ingestTlsReport(rawJson: string | Buffer): Promise<{ stored: number }> {
  const text = typeof rawJson === "string" ? rawJson : rawJson.toString("utf8");
  let report: TlsReport;
  try {
    report = JSON.parse(text);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "invalid TLS report JSON");
    return { stored: 0 };
  }

  const db = getDb();
  const policies = report.policies ?? [];
  if (policies.length === 0) return { stored: 0 };

  const startDate = report["date-range"]?.["start-datetime"]
    ? new Date(report["date-range"]["start-datetime"])
    : null;
  const endDate = report["date-range"]?.["end-datetime"]
    ? new Date(report["date-range"]["end-datetime"])
    : null;

  let stored = 0;
  for (const p of policies) {
    const policyDomain = (p.policy?.["policy-domain"] || "").toLowerCase();
    if (!policyDomain) continue;

    // Match the report to one of our domains. We store rows even when no
    // match is found (domainId will be null) so operators can audit
    // unexpected reports — useful when migrating between mailservers.
    const [domain] = await db.select().from(domains).where(eq(domains.name, policyDomain));

    await db.insert(tlsReports).values({
      domainId: domain?.id ?? null,
      domainName: policyDomain,
      organizationName: report["organization-name"] ?? null,
      reportId: report["report-id"] ?? null,
      contactInfo: report["contact-info"] ?? null,
      startDate,
      endDate,
      policyType: p.policy?.["policy-type"] ?? "unknown",
      policyString: p.policy?.["policy-string"] ?? null,
      successCount: Number(p.summary?.["total-successful-session-count"] ?? 0),
      failureCount: Number(p.summary?.["total-failure-session-count"] ?? 0),
      failureDetails: p["failure-details"] ?? null,
      raw: report as any,
    });
    stored++;
  }
  return { stored };
}

/**
 * Inbound message hook: detect whether a parsed inbound email is a
 * TLS-RPT report and ingest it if so. RFC 8460 §3 requires the report to
 * be sent as `application/tlsrpt+json` or `application/tlsrpt+gzip`.
 *
 * Returns true when the message was a TLS-RPT report (handled here, not
 * stored as a normal inbound email).
 */
export async function maybeIngestInboundTlsReport(
  attachments: Array<{ contentType?: string | null; content: Buffer }>,
): Promise<boolean> {
  if (!attachments || attachments.length === 0) return false;
  const tlsAttachment = attachments.find((a) => {
    const ct = (a.contentType ?? "").toLowerCase();
    return ct.includes("tlsrpt+json") || ct.includes("tlsrpt+gzip");
  });
  if (!tlsAttachment) return false;
  // Gzipped variant: decompress before parsing. We use node's zlib instead
  // of pulling pako/another dep in.
  const ct = (tlsAttachment.contentType ?? "").toLowerCase();
  let body: string | Buffer = tlsAttachment.content;
  if (ct.includes("gzip")) {
    const { gunzipSync } = await import("node:zlib");
    try {
      body = gunzipSync(tlsAttachment.content).toString("utf8");
    } catch (err) {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "failed to gunzip TLS report");
      return true; // we recognized the type; consume the message
    }
  }
  try {
    const result = await ingestTlsReport(body);
    log.info({ stored: result.stored }, "TLS-RPT report ingested");
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "TLS-RPT ingest failed");
  }
  return true;
}
