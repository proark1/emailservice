import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import Fastify, { FastifyInstance } from "fastify";

const TRACKING_SECRET = "test-tracking-secret-key";

// Mock config
vi.mock("../../config/index.js", () => ({
  getConfig: () => ({
    TRACKING_URL: "https://track.example.com",
    ENCRYPTION_KEY: "a".repeat(64),
  }),
  getTrackingSecret: () => TRACKING_SECRET,
}));

// Mock DB — not needed for route-level tests, but tracking.service imports it
vi.mock("../../db/index.js", () => ({
  getDb: () => {
    throw new Error("DB should not be called in route tests");
  },
}));
vi.mock("../../db/schema/index.js", () => ({
  emails: {},
  emailEvents: {},
  warmupEmails: {},
  warmupSchedules: {},
}));
vi.mock("../../queues/index.js", () => ({ isRedisConfigured: () => false }));

// Stub suppression service (used by unsubscribe route)
vi.mock("../../services/suppression.service.js", () => ({
  addSuppression: vi.fn(),
}));

import trackingRoutes from "../tracking.js";
import { decodeClickTrackingData } from "../../services/tracking.service.js";

/** Build a valid HMAC-signed tracking payload (same format as html-transform). */
function createSignedPayload(emailId: string, url: string): string {
  const payload = Buffer.from(JSON.stringify({ emailId, url })).toString("base64url");
  const sig = crypto.createHmac("sha256", TRACKING_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

describe("tracking routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(trackingRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ----------------------------------------------------------------
  // GET /t/:trackingId — open tracking pixel
  // ----------------------------------------------------------------
  describe("GET /t/:trackingId", () => {
    it("returns a 1x1 transparent GIF", async () => {
      const res = await app.inject({ method: "GET", url: "/t/email-123" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("image/gif");
      expect(res.headers["cache-control"]).toContain("no-store");
      expect(res.rawPayload.length).toBeGreaterThan(0);
    });
  });

  // ----------------------------------------------------------------
  // GET /c/* — click tracking redirect
  // ----------------------------------------------------------------
  describe("GET /c/*", () => {
    it("redirects to the original URL for a valid tracking link", async () => {
      const encoded = createSignedPayload("email-abc", "https://example.com/page");
      const res = await app.inject({ method: "GET", url: `/c/${encoded}` });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("https://example.com/page");
    });

    it("preserves query parameters in the redirect URL", async () => {
      const targetUrl = "https://1tab.ai/auth/confirm?token_hash=pkce_abc123&type=signup";
      const encoded = createSignedPayload("email-456", targetUrl);
      const res = await app.inject({ method: "GET", url: `/c/${encoded}` });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe(targetUrl);
    });

    it("handles long auth token URLs (the 1tab.ai use case)", async () => {
      const longToken = "pkce_" + crypto.randomBytes(64).toString("hex");
      const targetUrl = `https://1tab.ai/auth/confirm?token_hash=${longToken}&type=signup&redirect_to=https://1tab.ai/dashboard`;
      const encoded = createSignedPayload("email-789", targetUrl);
      const res = await app.inject({ method: "GET", url: `/c/${encoded}` });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe(targetUrl);
    });

    it("handles URL-encoded tracking data", async () => {
      const encoded = createSignedPayload("email-enc", "https://example.com");
      // Simulate email client URL-encoding the base64url characters
      const urlEncoded = encoded.replace(/-/g, "%2D").replace(/_/g, "%5F");
      const res = await app.inject({ method: "GET", url: `/c/${urlEncoded}` });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("https://example.com");
    });

    it("returns 400 for invalid tracking data", async () => {
      const res = await app.inject({ method: "GET", url: "/c/invalid-garbage-data" });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.type).toBe("bad_request");
    });

    it("returns 400 for tampered signature", async () => {
      const encoded = createSignedPayload("email-tamper", "https://example.com");
      const tampered = encoded.slice(0, -5) + "XXXXX";
      const res = await app.inject({ method: "GET", url: `/c/${tampered}` });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for empty tracking path", async () => {
      const res = await app.inject({ method: "GET", url: "/c/" });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for non-http redirect URL", async () => {
      // Craft a valid signed payload with a javascript: URL
      const payload = Buffer.from(JSON.stringify({ emailId: "x", url: "javascript:alert(1)" })).toString("base64url");
      const sig = crypto.createHmac("sha256", TRACKING_SECRET).update(payload).digest("base64url");
      const encoded = `${payload}.${sig}`;
      const res = await app.inject({ method: "GET", url: `/c/${encoded}` });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toBe("Invalid redirect URL");
    });
  });

  // ----------------------------------------------------------------
  // Verify decodeClickTrackingData works end-to-end
  // ----------------------------------------------------------------
  describe("decodeClickTrackingData (integration)", () => {
    it("round-trips through encode and decode", () => {
      const url = "https://1tab.ai/auth/confirm?token_hash=pkce_test123&type=signup";
      const encoded = createSignedPayload("email-rt", url);
      const decoded = decodeClickTrackingData(encoded);
      expect(decoded).toEqual({ emailId: "email-rt", url });
    });
  });
});
