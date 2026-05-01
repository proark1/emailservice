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
    if (expectedDkimDnsValue) {
      // Extract the public key portion from the expected value for comparison
      const expectedKeyMatch = expectedDkimDnsValue.match(/p=([A-Za-z0-9+/=]+)/);
      const expectedKey = expectedKeyMatch ? expectedKeyMatch[1] : null;
      result.dkimVerified = flat.some((r) => {
        if (!r.includes("v=DKIM1") || !r.includes("p=")) return false;
        if (expectedKey) {
          // Normalize whitespace and compare the public key
          const normalizedRecord = r.replace(/\s+/g, "");
          return normalizedRecord.includes(`p=${expectedKey}`);
        }
        return true;
      });
    } else {
      result.dkimVerified = flat.some((r) => r.includes("v=DKIM1") && r.includes("p="));
    }
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
