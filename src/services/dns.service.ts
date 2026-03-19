import dns from "node:dns/promises";

export interface DnsRecords {
  spfRecord: string;
  dmarcRecord: string;
}

export function generateDnsRecords(domain: string): DnsRecords {
  return {
    spfRecord: `v=spf1 include:${domain} ~all`,
    dmarcRecord: `v=DMARC1; p=none;`,
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

  // Check SPF
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const flat = txtRecords.map((r) => r.join(""));
    result.spfVerified = flat.some((r) => r.includes("v=spf1"));
  } catch {
    // DNS lookup failed — not verified
  }

  // Check DKIM
  try {
    const dkimDomain = `${dkimSelector}._domainkey.${domain}`;
    const txtRecords = await dns.resolveTxt(dkimDomain);
    const flat = txtRecords.map((r) => r.join(""));
    // Check that the DKIM record contains the expected public key
    const expectedKeyPart = expectedDkimDnsValue.split("p=")[1]?.substring(0, 40);
    result.dkimVerified = flat.some((r) => r.includes("v=DKIM1") && expectedKeyPart && r.includes(expectedKeyPart));
  } catch {
    // DNS lookup failed — not verified
  }

  // Check DMARC
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const txtRecords = await dns.resolveTxt(dmarcDomain);
    const flat = txtRecords.map((r) => r.join(""));
    result.dmarcVerified = flat.some((r) => r.includes("v=DMARC1"));
  } catch {
    // DNS lookup failed — not verified
  }

  // Check MX
  try {
    const mxRecords = await dns.resolveMx(domain);
    result.mxVerified = mxRecords.length > 0;
  } catch {
    // DNS lookup failed — not verified
  }

  return result;
}
