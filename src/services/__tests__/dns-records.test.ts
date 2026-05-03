import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  generateBimiRecord,
  generateMtaStsTxt,
  generateMtaStsPolicyFile,
  generateTlsRptRecord,
  matchDkimRecord,
} from "../dns.service.js";

function makeKey() {
  const { publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const b64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s/g, "");
  return { b64, dnsValue: `v=DKIM1; k=rsa; p=${b64}` };
}

describe("DNS records", () => {
  it("generates a BIMI record with logo only", () => {
    const r = generateBimiRecord("https://example.com/logo.svg");
    expect(r).toBe("v=BIMI1; l=https://example.com/logo.svg");
  });

  it("includes the VMC tag when provided", () => {
    const r = generateBimiRecord("https://e.com/l.svg", "https://e.com/vmc.pem");
    expect(r).toContain("a=https://e.com/vmc.pem");
  });

  it("formats an MTA-STS TXT pointer", () => {
    expect(generateMtaStsTxt("abc123")).toBe("v=STSv1; id=abc123");
  });

  it("formats the MTA-STS policy file with required fields", () => {
    const body = generateMtaStsPolicyFile("enforce", "mx.example.com", 3600);
    expect(body).toContain("version: STSv1");
    expect(body).toContain("mode: enforce");
    expect(body).toContain("mx: mx.example.com");
    expect(body).toContain("max_age: 3600");
  });

  it("formats TLS-RPT", () => {
    expect(generateTlsRptRecord("tls-reports@example.com")).toBe(
      "v=TLSRPTv1; rua=mailto:tls-reports@example.com",
    );
  });
});

describe("matchDkimRecord", () => {
  it("matches an exact, single-segment record", () => {
    const { dnsValue } = makeKey();
    expect(matchDkimRecord([dnsValue], dnsValue)).toBe(true);
  });

  it("matches when the DNS resolver returns multiple in-record segments joined", () => {
    // dns.resolveTxt(...).map(r => r.join("")) for a single TXT record
    // chunked at 255 bytes — already happens upstream; here we confirm
    // that the joined result still parses.
    const { dnsValue } = makeKey();
    const joined = dnsValue.slice(0, 255) + dnsValue.slice(255);
    expect(matchDkimRecord([joined], dnsValue)).toBe(true);
  });

  it("matches when tag order is rearranged", () => {
    const { b64, dnsValue } = makeKey();
    const reordered = `k=rsa; v=DKIM1; p=${b64}`;
    expect(matchDkimRecord([reordered], dnsValue)).toBe(true);
  });

  it("matches when extra DKIM tags are present after the public key", () => {
    const { b64, dnsValue } = makeKey();
    expect(matchDkimRecord([`v=DKIM1; k=rsa; p=${b64}; t=s`], dnsValue)).toBe(true);
  });

  it("matches with mixed-case tag names (RFC 6376 says they're case-insensitive)", () => {
    const { b64, dnsValue } = makeKey();
    expect(matchDkimRecord([`V=DKIM1; K=rsa; P=${b64}`], dnsValue)).toBe(true);
  });

  it("matches when whitespace is sprinkled inside the base64", () => {
    const { b64, dnsValue } = makeKey();
    const wrapped = `v=DKIM1; k=rsa; p=${b64.slice(0, 200)} ${b64.slice(200)}`;
    expect(matchDkimRecord([wrapped], dnsValue)).toBe(true);
  });

  it("matches when the registrar serializes segments with literal quote chars", () => {
    // Some providers' DNS queries return `"part1" "part2"` in the
    // joined form rather than splitting into separate strings.
    const { b64, dnsValue } = makeKey();
    const quoted = `"v=DKIM1; k=rsa; p=${b64.slice(0, 200)}" "${b64.slice(200)}"`;
    expect(matchDkimRecord([quoted], dnsValue)).toBe(true);
  });

  it("matches when the registrar splits a long DKIM into multiple TXT records", () => {
    // GoDaddy/Cloudflare occasionally end up with the prefix in one TXT
    // record and the rest of the base64 in a separate record at the same
    // name (especially when imports/migrations don't preserve segment
    // boundaries). Our verifier should fall back to concatenating.
    const { b64, dnsValue } = makeKey();
    const split = [
      `v=DKIM1; k=rsa; p=${b64.slice(0, 200)}`,
      b64.slice(200),
    ];
    expect(matchDkimRecord(split, dnsValue)).toBe(true);
  });

  it("does not match an unrelated key at the same name", () => {
    const { dnsValue } = makeKey();
    const other = makeKey().dnsValue;
    expect(matchDkimRecord([other], dnsValue)).toBe(false);
  });

  it("does not match a record with no p= tag", () => {
    const { dnsValue } = makeKey();
    expect(matchDkimRecord(["v=DKIM1; k=rsa"], dnsValue)).toBe(false);
  });

  it("does not match a record with the wrong DKIM version", () => {
    const { b64, dnsValue } = makeKey();
    expect(matchDkimRecord([`v=DKIM2; k=rsa; p=${b64}`], dnsValue)).toBe(false);
  });

  it("matches when the expected value contains whitespace inside the base64", () => {
    // Defensive: covers manually-entered or UI-wrapped expected values.
    const { b64, dnsValue } = makeKey();
    const wrappedExpected = `v=DKIM1; k=rsa; p=${b64.slice(0, 200)}\n  ${b64.slice(200)}`;
    expect(matchDkimRecord([dnsValue], wrappedExpected)).toBe(true);
  });

  it("accepts any DKIM record when no expected value is provided", () => {
    const { b64 } = makeKey();
    expect(matchDkimRecord([`v=DKIM1; k=rsa; p=${b64}`], "")).toBe(true);
    expect(matchDkimRecord(["v=DKIM1; k=rsa"], "")).toBe(false);
  });
});
