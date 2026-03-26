import dns from "node:dns/promises";
import { getMailHost } from "../config/index.js";

export interface DnsRecords {
  spfRecord: string;
  dmarcRecord: string;
}

export function generateDnsRecords(_domain: string): DnsRecords {
  const mailHost = getMailHost();
  const isConfigured = mailHost !== "your-server-hostname.com";

  return {
    // SPF: "a mx" authorizes the domain's own A/MX IPs to send.
    // If we have a real mail host, also include it.
    spfRecord: isConfigured
      ? `v=spf1 a mx include:${mailHost} ~all`
      : `v=spf1 a mx ~all`,
    dmarcRecord: `v=DMARC1; p=none; adkim=s; aspf=s`,
  };
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

  // Check MX
  try {
    const mxRecords = await dns.resolveMx(domain);
    result.mxVerified = mxRecords.length > 0;
  } catch {}

  return result;
}
