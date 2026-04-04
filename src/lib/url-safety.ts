import dns from "node:dns/promises";
import net from "node:net";

/**
 * Check whether a resolved IP address is in a private/reserved range.
 * Blocks RFC 1918, loopback, link-local, multicast, metadata services, etc.
 */
function isPrivateIP(ip: string): boolean {
  // IPv4 private/reserved ranges
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;                               // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;        // 172.16.0.0/12
    if (a === 192 && b === 168) return true;                 // 192.168.0.0/16
    if (a === 127) return true;                              // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true;                 // 169.254.0.0/16 (link-local / cloud metadata)
    if (a === 0) return true;                                // 0.0.0.0/8
    if (a >= 224) return true;                               // 224.0.0.0+ (multicast & reserved)
    if (a === 100 && b >= 64 && b <= 127) return true;      // 100.64.0.0/10 (CGNAT)
    return false;
  }

  // IPv6 private/reserved
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;                   // loopback
    if (normalized === "::") return true;                    // unspecified
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;  // ULA
    if (normalized.startsWith("fe80")) return true;          // link-local
    if (normalized.startsWith("::ffff:")) {                  // IPv4-mapped IPv6
      const v4 = normalized.slice(7);
      if (net.isIPv4(v4)) return isPrivateIP(v4);
    }
    return false;
  }

  return true; // Unknown format — block by default
}

/**
 * Validate that a URL is safe to fetch (no SSRF to internal networks).
 * Resolves the hostname via DNS and checks all resulting IPs.
 */
export async function isUrlSafeForSSRF(urlString: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  // Only allow http(s)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname;

  // Block obvious localhost variants
  if (hostname === "localhost" || hostname === "[::1]") {
    return false;
  }

  // If hostname is already an IP, check directly
  if (net.isIP(hostname)) {
    return !isPrivateIP(hostname);
  }

  // Resolve DNS and check all addresses
  try {
    const addresses = await dns.resolve(hostname);
    if (addresses.length === 0) return false;
    return addresses.every((addr) => !isPrivateIP(addr));
  } catch {
    return false; // DNS resolution failed — block
  }
}
