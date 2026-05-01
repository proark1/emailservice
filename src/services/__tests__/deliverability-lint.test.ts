import { describe, it, expect } from "vitest";
import { lintEmail } from "../deliverability-lint.service.js";

describe("lintEmail", () => {
  it("flags an empty subject as an error", () => {
    const r = lintEmail({ subject: "", text: "hello" });
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.rule === "subject_empty")).toBe(true);
  });

  it("flags shouting subjects", () => {
    const r = lintEmail({ subject: "BUY NOW THIS IS LIMITED", text: "hi" });
    expect(r.findings.some((f) => f.rule === "subject_shouting")).toBe(true);
  });

  it("flags missing text alternative on HTML-only sends", () => {
    const r = lintEmail({ subject: "Hello", html: "<p>Hi</p>" });
    expect(r.findings.some((f) => f.rule === "missing_text_alternative")).toBe(true);
  });

  it("flags hidden text in HTML", () => {
    const r = lintEmail({
      subject: "Hi",
      text: "hi",
      html: '<div style="display:none">spam</div><p>visible</p>',
    });
    expect(r.findings.some((f) => f.rule === "hidden_text")).toBe(true);
  });

  it("flags raw-IP href links", () => {
    const r = lintEmail({
      subject: "Hi",
      text: "hi",
      html: '<a href="http://10.1.2.3/page">click</a>',
    });
    expect(r.findings.some((f) => f.rule === "naked_ip_link")).toBe(true);
  });

  it("flags long marketing-style HTML without unsubscribe", () => {
    const long = "<p>" + "Buy our amazing product. ".repeat(40) + "</p>";
    const r = lintEmail({ subject: "Update", text: "hi", html: long });
    expect(r.findings.some((f) => f.rule === "no_unsubscribe_text")).toBe(true);
  });

  it("returns ok=true on a clean transactional send", () => {
    const r = lintEmail({
      subject: "Your receipt",
      text: "Thanks for your order #12345.",
      html: "<p>Thanks for your order #12345.</p><p><a href='https://example.com/unsubscribe'>Unsubscribe</a></p>",
    });
    expect(r.ok).toBe(true);
  });
});
