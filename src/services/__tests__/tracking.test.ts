import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";

const TRACKING_SECRET = "test-tracking-secret-key";

// Mock config and DB dependencies
vi.mock("../../config/index.js", () => ({
  getConfig: () => ({
    TRACKING_URL: "https://track.example.com",
    ENCRYPTION_KEY: "a".repeat(64),
  }),
  getTrackingSecret: () => TRACKING_SECRET,
}));
vi.mock("../../db/index.js", () => ({ getDb: () => ({}) }));
vi.mock("../../db/schema/index.js", () => ({
  emails: {},
  emailEvents: {},
  warmupEmails: {},
  warmupSchedules: {},
}));
vi.mock("../../queues/index.js", () => ({ isRedisConfigured: () => false }));

import { decodeClickTrackingData } from "../tracking.service.js";

function createSignedPayload(emailId: string, url: string): string {
  const payload = Buffer.from(JSON.stringify({ emailId, url })).toString("base64url");
  const sig = crypto.createHmac("sha256", TRACKING_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

describe("decodeClickTrackingData", () => {
  it("decodes a valid signed payload", () => {
    const encoded = createSignedPayload("email-123", "https://example.com");
    const result = decodeClickTrackingData(encoded);
    expect(result).toEqual({ emailId: "email-123", url: "https://example.com" });
  });

  it("returns null for tampered payload", () => {
    const encoded = createSignedPayload("email-123", "https://example.com");
    // Tamper with the payload portion
    const tampered = "AAAA" + encoded.slice(4);
    expect(decodeClickTrackingData(tampered)).toBeNull();
  });

  it("returns null for tampered signature", () => {
    const encoded = createSignedPayload("email-123", "https://example.com");
    const parts = encoded.split(".");
    parts[1] = "invalidsignature";
    expect(decodeClickTrackingData(parts.join("."))).toBeNull();
  });

  it("returns null for missing dot separator", () => {
    expect(decodeClickTrackingData("nodothere")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(decodeClickTrackingData("")).toBeNull();
  });

  it("preserves URLs with query parameters", () => {
    const url = "https://example.com/page?utm_source=email&utm_medium=click";
    const encoded = createSignedPayload("email-456", url);
    const result = decodeClickTrackingData(encoded);
    expect(result).toEqual({ emailId: "email-456", url });
  });
});
