import { describe, it, expect } from "vitest";
import { simpleParser } from "mailparser";
import { isDsn, isFbl, parseDsn, parseFbl } from "../bounce-parser.service.js";

async function parse(raw: string) {
  return simpleParser(raw);
}

const CRLF = "\r\n";

function dsn(body: string): string {
  return [
    `From: MAILER-DAEMON@mx.example.com`,
    `To: bounces@domain.com`,
    `Subject: Delivery Status Notification (Failure)`,
    `Content-Type: multipart/report; report-type=delivery-status; boundary="BOUND"`,
    ``,
    `--BOUND`,
    `Content-Type: text/plain; charset=us-ascii`,
    ``,
    `Your message could not be delivered.`,
    ``,
    `--BOUND`,
    `Content-Type: message/delivery-status`,
    ``,
    body,
    ``,
    `--BOUND--`,
  ].join(CRLF);
}

function fbl(body: string): string {
  return [
    `From: fbl@isp.example.com`,
    `To: abuse@domain.com`,
    `Subject: FW: abuse report`,
    `Content-Type: multipart/report; report-type=feedback-report; boundary="BOUND"`,
    ``,
    `--BOUND`,
    `Content-Type: text/plain`,
    ``,
    `This is an abuse report.`,
    ``,
    `--BOUND`,
    `Content-Type: message/feedback-report`,
    ``,
    body,
    ``,
    `--BOUND--`,
  ].join(CRLF);
}

describe("isDsn / parseDsn", () => {
  it("detects a permanent-failure DSN and extracts the recipient + status", async () => {
    const raw = dsn(
      [
        `Reporting-MTA: dns; mx.example.com`,
        `Original-Message-Id: <abc123@domain.com>`,
        ``,
        `Final-Recipient: rfc822; bounced@target.com`,
        `Action: failed`,
        `Status: 5.1.1`,
        `Diagnostic-Code: smtp; 550 5.1.1 User unknown`,
      ].join(CRLF),
    );
    const parsed = await parse(raw);
    expect(isDsn(parsed)).toBe(true);
    const bounces = parseDsn(parsed);
    expect(bounces).toHaveLength(1);
    expect(bounces[0].recipient).toBe("bounced@target.com");
    expect(bounces[0].status).toBe("5.1.1");
    expect(bounces[0].permanent).toBe(true);
    expect(bounces[0].originalMessageId).toBe("<abc123@domain.com>");
  });

  it("flags a 4.x.x DSN as transient, not permanent", async () => {
    const raw = dsn(
      [
        `Original-Message-Id: <xyz@domain.com>`,
        ``,
        `Final-Recipient: rfc822; soft@target.com`,
        `Status: 4.2.1`,
      ].join(CRLF),
    );
    const parsed = await parse(raw);
    expect(isDsn(parsed)).toBe(true);
    const bounces = parseDsn(parsed);
    expect(bounces[0].permanent).toBe(false);
  });

  it("extracts multiple recipients across stanzas", async () => {
    const raw = dsn(
      [
        `Original-Message-Id: <multi@domain.com>`,
        ``,
        `Final-Recipient: rfc822; one@target.com`,
        `Status: 5.1.1`,
        ``,
        `Final-Recipient: rfc822; two@target.com`,
        `Status: 5.7.1`,
      ].join(CRLF),
    );
    const parsed = await parse(raw);
    const bounces = parseDsn(parsed);
    expect(bounces.map((b) => b.recipient).sort()).toEqual(["one@target.com", "two@target.com"]);
  });

  it("does not misclassify user mail with a 'delivery failed' subject as a DSN", async () => {
    const raw = [
      `From: user@example.com`,
      `To: support@domain.com`,
      `Subject: Delivery failed? help!`,
      `Content-Type: text/plain`,
      ``,
      `I keep getting bounce messages, can you help?`,
    ].join(CRLF);
    const parsed = await parse(raw);
    expect(isDsn(parsed)).toBe(false);
  });
});

describe("isFbl / parseFbl", () => {
  it("detects an ARF complaint and extracts the complainant", async () => {
    const raw = fbl(
      [
        `Feedback-Type: abuse`,
        `User-Agent: SomeISP-Fbl/1.0`,
        `Version: 1`,
        `Original-Rcpt-To: spammed@isp.com`,
        `Message-Id: <fbl-orig@domain.com>`,
      ].join(CRLF),
    );
    const parsed = await parse(raw);
    expect(isFbl(parsed)).toBe(true);
    const complaints = parseFbl(parsed);
    expect(complaints).toHaveLength(1);
    expect(complaints[0].complainant).toBe("spammed@isp.com");
    expect(complaints[0].feedbackType).toBe("abuse");
  });
});

describe("memory safety", () => {
  it("does not blow up on a giant bogus attachment", async () => {
    const huge = "A".repeat(5 * 1024 * 1024); // 5 MB — above MAX_PART_BYTES
    const raw = [
      `From: junk@example.com`,
      `To: bounces@domain.com`,
      `Subject: Mail delivery failed`,
      `Content-Type: multipart/mixed; boundary="X"`,
      ``,
      `--X`,
      `Content-Type: text/plain`,
      ``,
      `Final-Recipient: rfc822; anything@anywhere.com`,
      `Status: 5.1.1`,
      ``,
      `--X`,
      `Content-Type: text/plain`,
      ``,
      huge,
      `--X--`,
    ].join(CRLF);
    const parsed = await parse(raw);
    // Regardless of what we detect, we must not OOM or hang. The small stanza
    // in the first part is still parseable, so isDsn should be true.
    expect(isDsn(parsed)).toBe(true);
    const bounces = parseDsn(parsed);
    expect(bounces[0]?.recipient).toBe("anything@anywhere.com");
  });
});
