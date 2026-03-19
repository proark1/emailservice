import dns from "node:dns/promises";
import { getConfig } from "../config/index.js";

export interface DnsRecords {
  spfRecord: string;
  dmarcRecord: string;
}

export function generateDnsRecords(domain: string): DnsRecords {
  const config = getConfig();
  const baseUrl = new URL(config.BASE_URL).hostname;

  return {
    // SPF: authorize the service's mail servers to send on behalf of this domain
    spfRecord: `v=spf1 include:${baseUrl} ~all`,
    // DMARC: policy for handling authentication failures
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

  // Check SPF — look for any v=spf1 record on the domain
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const flat = txtRecords.map((r) => r.join(""));
    // Accept if there's a valid SPF record (user may have customized it)
    result.spfVerified = flat.some((r) => r.startsWith("v=spf1"));
  } catch {
    // NXDOMAIN or lookup failure
  }

  // Check DKIM — verify the public key is published
  try {
    const dkimDomain = `${dkimSelector}._domainkey.${domain}`;
    const txtRecords = await dns.resolveTxt(dkimDomain);
    const flat = txtRecords.map((r) => r.join(""));
    // Check that a DKIM record exists with a public key
    result.dkimVerified = flat.some((r) => r.includes("v=DKIM1") && r.includes("p="));
  } catch {
    // NXDOMAIN or lookup failure
  }

  // Check DMARC
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const txtRecords = await dns.resolveTxt(dmarcDomain);
    const flat = txtRecords.map((r) => r.join(""));
    result.dmarcVerified = flat.some((r) => r.startsWith("v=DMARC1"));
  } catch {
    // NXDOMAIN or lookup failure
  }

  // Check MX
  try {
    const mxRecords = await dns.resolveMx(domain);
    result.mxVerified = mxRecords.length > 0;
  } catch {
    // NXDOMAIN or lookup failure
  }

  return result;
}
