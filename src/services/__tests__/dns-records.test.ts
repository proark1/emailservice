import { describe, it, expect } from "vitest";
import {
  generateBimiRecord,
  generateMtaStsTxt,
  generateMtaStsPolicyFile,
  generateTlsRptRecord,
} from "../dns.service.js";

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
