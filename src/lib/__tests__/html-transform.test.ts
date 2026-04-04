import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config before importing the module under test
vi.mock("../../config/index.js", () => ({
  getConfig: () => ({
    TRACKING_URL: "https://track.example.com",
    ENCRYPTION_KEY: "a".repeat(64),
  }),
  getTrackingSecret: () => "test-tracking-secret-key",
}));

import { injectTrackingPixel, rewriteLinks, transformHtml } from "../html-transform.js";

describe("injectTrackingPixel", () => {
  it("inserts pixel before </body>", () => {
    const html = "<html><body><p>Hello</p></body></html>";
    const result = injectTrackingPixel(html, "email-123");
    expect(result).toContain('<img src="https://track.example.com/t/email-123"');
    expect(result).toMatch(/<img[^>]+\/><\/body>/);
  });

  it("appends pixel if no </body> tag", () => {
    const html = "<p>Hello</p>";
    const result = injectTrackingPixel(html, "email-123");
    expect(result).toContain('<img src="https://track.example.com/t/email-123"');
    expect(result).toMatch(/<p>Hello<\/p><img/);
  });
});

describe("rewriteLinks", () => {
  it("rewrites http links to tracked URLs", () => {
    const html = '<a href="https://example.com">Click</a>';
    const result = rewriteLinks(html, "email-123");
    expect(result).toContain("https://track.example.com/c/");
    expect(result).not.toContain("https://example.com");
  });

  it("preserves mailto: links", () => {
    const html = '<a href="mailto:user@example.com">Email</a>';
    const result = rewriteLinks(html, "email-123");
    expect(result).toContain("mailto:user@example.com");
  });

  it("preserves tel: links", () => {
    const html = '<a href="tel:+1234567890">Call</a>';
    const result = rewriteLinks(html, "email-123");
    expect(result).toContain("tel:+1234567890");
  });

  it("preserves anchor links", () => {
    const html = '<a href="#section">Jump</a>';
    const result = rewriteLinks(html, "email-123");
    expect(result).toContain('href="#section"');
  });

  it("preserves unsubscribe links", () => {
    const html = '<a href="https://example.com/unsubscribe/abc">Unsub</a>';
    const result = rewriteLinks(html, "email-123");
    expect(result).toContain("/unsubscribe/");
    expect(result).not.toContain("/c/");
  });

  it("respects data-no-track attribute", () => {
    const html = '<a data-no-track href="https://example.com">Click</a>';
    const result = rewriteLinks(html, "email-123");
    expect(result).toContain("https://example.com");
    expect(result).not.toContain("/c/");
  });

  it("decodes HTML entities in href", () => {
    const html = '<a href="https://example.com?a=1&amp;b=2">Click</a>';
    const result = rewriteLinks(html, "email-123");
    // The original URL with &amp; should be decoded to & in the tracked payload
    expect(result).toContain("/c/");
  });

  it("handles multiple links", () => {
    const html = '<a href="https://a.com">A</a> <a href="https://b.com">B</a>';
    const result = rewriteLinks(html, "email-123");
    const matches = result.match(/\/c\//g);
    expect(matches).toHaveLength(2);
  });
});

describe("transformHtml", () => {
  it("applies both link rewriting and tracking pixel", () => {
    const html = '<html><body><a href="https://example.com">Click</a></body></html>';
    const result = transformHtml(html, "email-123");
    expect(result).toContain("/c/"); // link rewritten
    expect(result).toContain("/t/email-123"); // pixel injected
  });
});
