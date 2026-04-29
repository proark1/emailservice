import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "../types/webhook-events.js";

// Block private/internal targets at create time. The webhook delivery worker
// also resolves DNS at delivery time and re-checks each resolved IP against
// the same predicate (defense-in-depth against DNS rebinding). Keeping these
// in sync matters: any address blocked at delivery should also be blocked at
// create so the customer gets a fast 400 instead of silent retry-exhaustion.
const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);
const PRIVATE_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost"];

// IPv4 private / reserved ranges. Mirrors the worker's isPrivateIP helper.
function isPrivateIPv4Literal(host: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const parts = host.split(".").map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → reject
  const [a, b] = parts;
  if (a === 0) return true;                                   // 0.0.0.0/8 (current network)
  if (a === 10) return true;                                  // 10.0.0.0/8
  if (a === 127) return true;                                 // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;                    // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;          // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true;                      // 192.0.0.0/24, 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true;       // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51) return true;                     // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0) return true;                      // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true;                                  // multicast + reserved
  return false;
}

function isPrivateIPv6Literal(host: string): boolean {
  // Accept either bare or bracketed IPv6
  const stripped = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!stripped.includes(":")) return false;
  if (stripped === "::1" || stripped === "::") return true;          // loopback / unspecified
  if (stripped.startsWith("fe80:") || stripped.startsWith("fe80::")) return true; // link-local
  if (stripped.startsWith("fec0:")) return true;                    // deprecated site-local
  // fc00::/7 — first byte hex is fc or fd (matches both fc.. and fd..)
  if (/^f[cd][0-9a-f]{0,2}:/.test(stripped)) return true;
  // IPv4-mapped IPv6 — extract the v4 portion and re-check
  const v4mapped = stripped.match(/^::ffff:([0-9a-f.:]+)$/);
  if (v4mapped) {
    const v4 = v4mapped[1];
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return isPrivateIPv4Literal(v4);
  }
  if (stripped.startsWith("ff")) return true;                       // multicast
  return false;
}

const httpUrl = z.string().url().max(2048).refine(
  (url) => url.startsWith("http://") || url.startsWith("https://"),
  { message: "Webhook URL must use http:// or https:// scheme" },
).refine(
  (url) => {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) return false;         // no creds-in-url
      const hostname = parsed.hostname.toLowerCase();
      if (PRIVATE_HOSTNAMES.has(hostname)) return false;
      if (PRIVATE_HOSTNAME_SUFFIXES.some((s) => hostname.endsWith(s))) return false;
      if (isPrivateIPv4Literal(hostname)) return false;
      if (isPrivateIPv6Literal(hostname)) return false;
      return true;
    } catch { return false; }
  },
  { message: "Webhook URL cannot target private or internal addresses" },
);

export const createWebhookSchema = z.object({
  url: httpUrl,
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
});

export const updateWebhookSchema = z.object({
  url: httpUrl.optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
  active: z.boolean().optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
