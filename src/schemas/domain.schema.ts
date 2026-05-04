import { z } from "zod";
import net from "node:net";

// Reserved names that should never be registered as a sending domain. They
// don't resolve via public DNS so SPF/DKIM/DMARC verification can't pass,
// and they pollute the dashboard / DNS records output.
const RESERVED_DOMAIN_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "local",
  "broadcasthost",
  "ip6-localhost",
  "ip6-loopback",
]);

export const createDomainSchema = z.object({
  name: z.string().min(1).max(255).regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
    "Invalid domain name",
  ).refine((name) => {
    const lower = name.toLowerCase();
    // Reject IP literals — `net.isIP` returns 4 / 6 for IPv4 / IPv6 and 0
    // otherwise. The regex above rejects ":" so IPv6 can't get here, but
    // dotted-quad IPv4 (e.g. "127.0.0.1") would otherwise match.
    if (net.isIP(lower) > 0) return false;
    if (RESERVED_DOMAIN_NAMES.has(lower)) return false;
    // Require at least one dot AND a TLD that is at least 2 chars long and
    // not purely numeric. The outer regex on the whole name already
    // restricts to alphanumerics + hyphens, so we don't need to re-check
    // the alphabet here. Allowing IDN punycode TLDs like `.xn--p1ai` is the
    // reason this only excludes numeric-only TLDs.
    if (!lower.includes(".")) return false;
    const tld = lower.split(".").pop() ?? "";
    if (tld.length < 2 || /^\d+$/.test(tld)) return false;
    return true;
  }, "Domain must be a public, dotted hostname (no IPs, localhost, or numeric TLDs)"),
  mode: z.enum(["send", "receive", "both"]).optional().default("both"),
  dmarc_rua_email: z.string().email().optional(),
  return_path_domain: z.string().min(1).max(255).optional(),
  send_rate_per_minute: z.number().int().min(1).max(100_000).optional(),
}).meta({
  description:
    "Register a sending domain. The response includes the SPF / DKIM / DMARC / MX records " +
    "to add at your DNS host. Verification is queued automatically (60s delay) and retries " +
    "with exponential backoff for up to 72 hours.",
  examples: [
    {
      name: "yourdomain.com",
      mode: "both",
      dmarc_rua_email: "dmarc-reports@yourdomain.com",
    },
  ],
});

// Restrict BIMI URLs to https — the spec requires it (Gmail rejects http
// logo URLs outright) and it stops `javascript:`/`data:` smuggling tricks.
const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://"), "Must be an https:// URL");

export const updateDomainSchema = z.object({
  dmarc_rua_email: z.string().email().nullable().optional(),
  return_path_domain: z.string().min(1).max(255).nullable().optional(),
  send_rate_per_minute: z.number().int().min(1).max(100_000).nullable().optional(),
  bimi_logo_url: httpsUrl.nullable().optional(),
  bimi_vmc_url: httpsUrl.nullable().optional(),
  mta_sts_mode: z.enum(["none", "testing", "enforce"]).optional(),
  tls_rpt_rua_email: z.string().email().nullable().optional(),
});

export const domainResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(["pending", "verified", "failed"]),
  records: z.array(z.object({
    type: z.string(),
    name: z.string(),
    value: z.string(),
    purpose: z.string(),
    verified: z.boolean(),
  })),
  created_at: z.string(),
});

export type CreateDomainInput = z.infer<typeof createDomainSchema>;
