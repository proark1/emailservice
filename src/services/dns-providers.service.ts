export type DnsProvider = "godaddy" | "cloudflare" | "namecheap" | "manual";

export interface DnsProviderCredentials {
  provider: DnsProvider;
  // GoDaddy
  godaddyKey?: string;
  godaddySecret?: string;
  // Cloudflare
  cloudflareToken?: string;
  cloudflareZoneId?: string;
  // Namecheap
  namecheapApiKey?: string;
  namecheapUsername?: string;
}

interface DnsRecord {
  type: "TXT" | "MX";
  name: string;
  value: string;
  priority?: number;
  ttl?: number;
}

// --- GoDaddy ---
async function addGoDaddyRecord(
  domain: string,
  record: DnsRecord,
  credentials: { key: string; secret: string },
) {
  // Extract the record name relative to the domain
  const recordName = record.name === domain ? "@" : record.name.replace(`.${domain}`, "");

  const body = record.type === "MX"
    ? [{ data: record.value, priority: record.priority || 10, ttl: record.ttl || 600 }]
    : [{ data: record.value, ttl: record.ttl || 600 }];

  const res = await fetch(
    `https://api.godaddy.com/v1/domains/${domain}/records/${record.type}/${recordName}`,
    {
      method: "PUT",
      headers: {
        Authorization: `sso-key ${credentials.key}:${credentials.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GoDaddy API error (${res.status}): ${err}`);
  }
}

// --- Cloudflare ---
async function addCloudflareRecord(
  record: DnsRecord,
  credentials: { token: string; zoneId: string },
) {
  const body: any = {
    type: record.type,
    name: record.name,
    content: record.value,
    ttl: record.ttl || 3600,
  };

  if (record.type === "MX") {
    body.priority = record.priority || 10;
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${credentials.zoneId}/dns_records`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Cloudflare API error (${res.status}): ${JSON.stringify(err)}`);
  }
}

// --- Main function ---
export async function setupDnsRecords(
  domain: string,
  records: Array<{ type: string; name: string; value: string; purpose: string }>,
  credentials: DnsProviderCredentials,
): Promise<{ success: boolean; results: Array<{ purpose: string; success: boolean; error?: string }> }> {
  const results: Array<{ purpose: string; success: boolean; error?: string }> = [];

  for (const record of records) {
    const dnsRecord: DnsRecord = {
      type: record.type as "TXT" | "MX",
      name: record.name,
      value: record.type === "MX" ? record.value.replace(/^\d+\s+/, "") : record.value,
      priority: record.type === "MX" ? parseInt(record.value) || 10 : undefined,
      ttl: 600,
    };

    try {
      switch (credentials.provider) {
        case "godaddy":
          if (!credentials.godaddyKey || !credentials.godaddySecret) {
            throw new Error("GoDaddy API key and secret required");
          }
          await addGoDaddyRecord(domain, dnsRecord, {
            key: credentials.godaddyKey,
            secret: credentials.godaddySecret,
          });
          break;

        case "cloudflare":
          if (!credentials.cloudflareToken || !credentials.cloudflareZoneId) {
            throw new Error("Cloudflare API token and zone ID required");
          }
          await addCloudflareRecord(dnsRecord, {
            token: credentials.cloudflareToken,
            zoneId: credentials.cloudflareZoneId,
          });
          break;

        default:
          throw new Error(`Provider ${credentials.provider} not supported for auto-setup`);
      }

      results.push({ purpose: record.purpose, success: true });
    } catch (error) {
      results.push({
        purpose: record.purpose,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    success: results.every((r) => r.success),
    results,
  };
}

// --- Detect provider from domain ---
export async function detectDnsProvider(domain: string): Promise<DnsProvider | null> {
  try {
    const dns = await import("node:dns/promises");
    const ns = await dns.resolveNs(domain);
    const nsStr = ns.join(" ").toLowerCase();

    if (nsStr.includes("domaincontrol.com") || nsStr.includes("godaddy")) return "godaddy";
    if (nsStr.includes("cloudflare")) return "cloudflare";
    if (nsStr.includes("registrar-servers.com") || nsStr.includes("namecheap")) return "namecheap";

    return null;
  } catch {
    return null;
  }
}
