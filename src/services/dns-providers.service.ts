export type DnsProvider = "godaddy" | "cloudflare" | "namecheap" | "manual";

export interface DnsProviderCredentials {
  provider: DnsProvider;
  godaddyKey?: string;
  godaddySecret?: string;
  cloudflareToken?: string;
  cloudflareZoneId?: string;
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
): Promise<string> {
  // GoDaddy wants the record name relative to the domain root
  // e.g., for "es1._domainkey.onepizza.io" on domain "onepizza.io" → "es1._domainkey"
  // e.g., for "_dmarc.onepizza.io" on domain "onepizza.io" → "_dmarc"
  // e.g., for "onepizza.io" on domain "onepizza.io" → "@"
  let recordName = "@";
  if (record.name !== domain) {
    // Strip the domain suffix
    const suffix = `.${domain}`;
    if (record.name.endsWith(suffix)) {
      recordName = record.name.slice(0, -suffix.length);
    } else {
      recordName = record.name;
    }
  }

  const body = record.type === "MX"
    ? [{ data: record.value, priority: record.priority || 10, ttl: record.ttl || 600 }]
    : [{ data: record.value, ttl: record.ttl || 600 }];

  // GoDaddy PUT /v1/domains/{domain}/records/{type}/{name} replaces all records of that type+name
  const url = `https://api.godaddy.com/v1/domains/${domain}/records/${record.type}/${recordName}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `sso-key ${credentials.key}:${credentials.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`GoDaddy API error (${res.status}): ${responseText}`);
  }

  return `OK (${res.status}) recordName=${recordName}`;
}

// --- Cloudflare ---
async function addCloudflareRecord(
  record: DnsRecord,
  credentials: { token: string; zoneId: string },
): Promise<string> {
  const body: any = {
    type: record.type,
    name: record.name,
    content: record.value,
    ttl: 3600,
  };

  if (record.type === "MX") {
    body.priority = record.priority || 10;
  }

  const url = `https://api.cloudflare.com/client/v4/zones/${credentials.zoneId}/dns_records`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`Cloudflare API error (${res.status}): ${JSON.stringify(responseBody)}`);
  }

  return `OK (${res.status})`;
}

// --- Main function ---
export async function setupDnsRecords(
  domain: string,
  records: Array<{ type: string; name: string; value: string; purpose: string }>,
  credentials: DnsProviderCredentials,
): Promise<{ success: boolean; results: Array<{ purpose: string; success: boolean; error?: string; detail?: string }> }> {
  const results: Array<{ purpose: string; success: boolean; error?: string; detail?: string }> = [];


  for (const record of records) {
    const dnsRecord: DnsRecord = {
      type: record.type as "TXT" | "MX",
      name: record.name,
      value: record.type === "MX" ? record.value.replace(/^\d+\s+/, "") : record.value,
      priority: record.type === "MX" ? parseInt(record.value) || 10 : undefined,
      ttl: 600,
    };

    try {
      let detail = "";
      switch (credentials.provider) {
        case "godaddy":
          if (!credentials.godaddyKey || !credentials.godaddySecret) {
            throw new Error("GoDaddy API key and secret required");
          }
          detail = await addGoDaddyRecord(domain, dnsRecord, {
            key: credentials.godaddyKey,
            secret: credentials.godaddySecret,
          });
          break;

        case "cloudflare":
          if (!credentials.cloudflareToken || !credentials.cloudflareZoneId) {
            throw new Error("Cloudflare API token and zone ID required");
          }
          detail = await addCloudflareRecord(dnsRecord, {
            token: credentials.cloudflareToken,
            zoneId: credentials.cloudflareZoneId,
          });
          break;

        default:
          throw new Error(`Provider ${credentials.provider} not supported for auto-setup`);
      }

      results.push({ purpose: record.purpose, success: true, detail });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[DNS Setup] Failed for ${record.purpose}: ${errorMsg}`);
      results.push({
        purpose: record.purpose,
        success: false,
        error: errorMsg,
      });
    }
  }

  const allSuccess = results.every((r) => r.success);

  return { success: allSuccess, results };
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
