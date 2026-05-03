import dns from "node:dns/promises";
import { getMailHost } from "../config/index.js";

export interface DnsRecords {
  spfRecord: string;
  dmarcRecord: string;
}

export interface DnsRecordOptions {
  /** When set, appended to the DMARC record so aggregate reports are mailed here. */
  ruaEmail?: string | null;
}

export function generateDnsRecords(_domain: string, options: DnsRecordOptions = {}): DnsRecords {
  const mailHost = getMailHost();
  const isConfigured = mailHost !== "your-server-hostname.com";

  const dmarcParts = ["v=DMARC1", "p=quarantine", "adkim=s", "aspf=s", "pct=100"];
  if (options.ruaEmail) {
    dmarcParts.push(`rua=mailto:${options.ruaEmail}`);
  }

  return {
    // SPF: "a mx" authorizes the domain's own A/MX IPs to send.
    // If we have a real mail host, also include it.
    spfRecord: isConfigured
      ? `v=spf1 a mx include:${mailHost} -all`
      : `v=spf1 a mx -all`,
    dmarcRecord: dmarcParts.join("; "),
  };
}

/**
 * Generate the BIMI TXT record value for the default selector. The record
 * lives at `default._bimi.<domain>` and tells supporting mailbox providers
 * (Gmail, Apple Mail, Yahoo) to render the brand logo at the named URL.
 *
 * `vmcUrl` is the optional Verified Mark Certificate (issued by a CA) — the
 * "a=" tag. Gmail requires this for the logo to render. Without it, only
 * Yahoo and a handful of others will use the SVG.
 *
 * Eligibility additionally requires the domain's DMARC policy to be
 * `p=quarantine` or `p=reject` and `pct=100`. The caller (domain.service)
 * is responsible for that gating; this helper only formats the TXT.
 */
export function generateBimiRecord(logoUrl: string, vmcUrl?: string | null): string {
  const parts = ["v=BIMI1", `l=${logoUrl}`];
  if (vmcUrl) parts.push(`a=${vmcUrl}`);
  return parts.join("; ");
}

/**
 * MTA-STS (RFC 8461) advertises a TLS-required policy to sending servers.
 * Two records are published:
 *   1. `_mta-sts.<domain>` TXT — a versioned pointer (`v=STSv1; id=…`) that
 *      tells senders when the policy file changed.
 *   2. The policy file itself, served over HTTPS at
 *      `https://mta-sts.<domain>/.well-known/mta-sts.txt`.
 *
 * The `id` is a short opaque string; rotating it forces senders to refetch
 * the policy. Common pattern: a timestamp or content hash.
 */
export function generateMtaStsTxt(policyId: string): string {
  return `v=STSv1; id=${policyId}`;
}

export function generateMtaStsPolicyFile(
  mode: "enforce" | "testing" | "none",
  mxHost: string,
  maxAgeSeconds = 86400,
): string {
  // `mode: none` is a withdrawal signal — publish a policy file with mode:
  // none for at least max_age before removing the TXT, otherwise senders
  // that already cached the previous policy won't notice the change.
  return [
    "version: STSv1",
    `mode: ${mode}`,
    `mx: ${mxHost}`,
    `max_age: ${maxAgeSeconds}`,
    "",
  ].join("\n");
}

/**
 * TLS-RPT (RFC 8460): TXT record at `_smtp._tls.<domain>` listing where
 * receivers should mail aggregate TLS reports.
 */
export function generateTlsRptRecord(ruaEmail: string): string {
  return `v=TLSRPTv1; rua=mailto:${ruaEmail}`;
}

export interface DnsVerificationResult {
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  mxVerified: boolean;
}

/**
 * Parse a DKIM TXT record into its tag map. Handles real-world quirks we've
 * seen from registrars when long records are pasted/auto-split:
 *   - Literal `"` characters inside the joined string (some providers
 *     serialize multi-segment TXT records as `"part1" "part2"`).
 *   - Backslash-escaped semicolons (`\;`).
 *   - Whitespace inside the base64 of the public key (registrars that
 *     wrap long lines).
 *   - Tag names in mixed case — RFC 6376 says tag names are case-insensitive.
 */
function parseDkimTags(record: string): Record<string, string> {
  const cleaned = record.replace(/["\\]/g, "");
  const tags: Record<string, string> = {};
  for (const part of cleaned.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    // Strip whitespace inside the value — base64 has no whitespace and other
    // tag values like `k=rsa` shouldn't either.
    const v = part.slice(eq + 1).replace(/\s+/g, "");
    if (k) tags[k] = v;
  }
  return tags;
}

function extractExpectedDkimKey(expected: string): string | null {
  // Strip whitespace before extracting — `parseDkimTags` removes whitespace
  // from the resolved record's `p=` value, so a wrapped or manually-entered
  // expected value (e.g. `p=ABC DEF`) would otherwise capture only `ABC` and
  // never match the (whitespace-stripped) actual key.
  const normalized = expected.replace(/\s+/g, "");
  const m = normalized.match(/p=([A-Za-z0-9+/=]+)/);
  return m && m[1] ? m[1] : null;
}

/**
 * Match a set of TXT records (already concatenated per-record) against the
 * expected DKIM DNS value. A record matches when its parsed `p=` tag equals
 * the expected base64 public key. If no single record matches but multiple
 * records exist at the name (some registrars split a long DKIM value across
 * separate TXT records instead of segments within one record), retry with
 * the records concatenated.
 */
export function matchDkimRecord(records: string[], expectedDkimDnsValue: string): boolean {
  const expectedKey = expectedDkimDnsValue
    ? extractExpectedDkimKey(expectedDkimDnsValue)
    : null;

  const recordMatches = (raw: string): boolean => {
    const tags = parseDkimTags(raw);
    if (tags.v && tags.v.toLowerCase() !== "dkim1") return false;
    if (!tags.p) return false;
    if (!expectedKey) return true;
    return tags.p === expectedKey;
  };

  if (records.some(recordMatches)) return true;

  // Fallback: registrar split the record across multiple TXT entries.
  // Reorder so the entry with the DKIM header (`v=DKIM1`) comes first,
  // then concatenate the rest as raw key continuation.
  if (expectedKey && records.length > 1) {
    const headerIdx = records.findIndex((r) => /v\s*=\s*DKIM1/i.test(r));
    if (headerIdx !== -1) {
      const ordered = [records[headerIdx], ...records.filter((_, i) => i !== headerIdx)];
      if (recordMatches(ordered.join(""))) return true;
    }
  }

  return false;
}

export async function verifyDnsRecords(
  domain: string,
  expectedSpf: string,
  dkimSelector: string,
  expectedDkimDnsValue: string,
): Promise<DnsVerificationResult> {
  const result: DnsVerificationResult = {
    spfVerified: false,
    dkimVerified: false,
    dmarcVerified: false,
    mxVerified: false,
  };

  // Check SPF — verify the record contains our expected include/mechanism
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const flat = txtRecords.map((r) => r.join(""));
    if (expectedSpf) {
      // Extract the key parts from expected SPF (e.g., "include:mail.example.com")
      const expectedParts = expectedSpf.match(/include:\S+/g) || [];
      result.spfVerified = flat.some((r) => {
        if (!r.startsWith("v=spf1")) return false;
        // If we have specific includes to check, verify they're present
        if (expectedParts.length > 0) {
          return expectedParts.every((part) => r.includes(part));
        }
        // Otherwise just check a valid SPF record exists
        return true;
      });
    } else {
      result.spfVerified = flat.some((r) => r.startsWith("v=spf1"));
    }
  } catch {}

  // Check DKIM — verify the record matches our expected public key
  try {
    const dkimDomain = `${dkimSelector}._domainkey.${domain}`;
    const txtRecords = await dns.resolveTxt(dkimDomain);
    const flat = txtRecords.map((r) => r.join(""));
    result.dkimVerified = matchDkimRecord(flat, expectedDkimDnsValue);
  } catch {}

  // Check DMARC
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const txtRecords = await dns.resolveTxt(dmarcDomain);
    const flat = txtRecords.map((r) => r.join(""));
    result.dmarcVerified = flat.some((r) => r.startsWith("v=DMARC1"));
  } catch {}

  // Check MX — verify at least one MX record points to our mail host
  try {
    const mxRecords = await dns.resolveMx(domain);
    const mailHost = getMailHost().toLowerCase();
    if (mailHost && mailHost !== "your-server-hostname.com") {
      result.mxVerified = mxRecords.some(
        (mx) => mx.exchange.toLowerCase().replace(/\.$/, "") === mailHost,
      );
    } else {
      // No mail host configured — accept any MX record
      result.mxVerified = mxRecords.length > 0;
    }
  } catch {}

  return result;
}
