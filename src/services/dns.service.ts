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
  _expectedSpf: string,
  dkimSelector: string,
  _expectedDkimDnsValue: string,
): Promise<DnsVerificationResult> {
  const result: DnsVerificationResult = {
    spfVerified: false,
    dkimVerified: false,
    dmarcVerified: false,
    mxVerified: false,
  };

  // Check SPF
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const flat = txtRecords.map((r) => r.join(""));
    result.spfVerified = flat.some((r) => r.startsWith("v=spf1"));
  } catch {}

  // Check DKIM
  try {
    const dkimDomain = `${dkimSelector}._domainkey.${domain}`;
    const txtRecords = await dns.resolveTxt(dkimDomain);
    const flat = txtRecords.map((r) => r.join(""));
    result.dkimVerified = flat.some((r) => r.includes("v=DKIM1") && r.includes("p="));
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
