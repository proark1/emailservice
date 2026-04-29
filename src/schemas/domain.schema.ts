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
    // Require at least one dot AND a TLD of ≥2 alpha characters. A single
    // label ("localhost") or a numeric-only TLD (e.g. "example.123") isn't
    // valid for public mail delivery.
    if (!lower.includes(".")) return false;
    const tld = lower.split(".").pop() ?? "";
    if (tld.length < 2 || !/^[a-z]+$/.test(tld)) return false;
    return true;
  }, "Domain must be a public, dotted hostname (no IPs, localhost, or numeric TLDs)"),
  mode: z.enum(["send", "receive", "both"]).optional().default("both"),
  dmarc_rua_email: z.string().email().optional(),
  return_path_domain: z.string().min(1).max(255).optional(),
  send_rate_per_minute: z.number().int().min(1).max(100_000).optional(),
});

export const updateDomainSchema = z.object({
  dmarc_rua_email: z.string().email().nullable().optional(),
  return_path_domain: z.string().min(1).max(255).nullable().optional(),
  send_rate_per_minute: z.number().int().min(1).max(100_000).nullable().optional(),
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
