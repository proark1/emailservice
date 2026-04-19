import type { ParsedMail } from "mailparser";

/**
 * A single recipient extracted from a bounce report.
 * `permanent` is derived from the SMTP status class: 5.x.x = permanent, 4.x.x = transient.
 */
export interface DsnResult {
  recipient: string;
  status: string;
  permanent: boolean;
  diagnostic?: string;
  originalMessageId?: string;
}

export interface FblResult {
  complainant: string;
  feedbackType: string;
  originalMessageId?: string;
}

function normalizeContentType(value: string | string[] | undefined): string {
  if (!value) return "";
  const flat = Array.isArray(value) ? value.join("; ") : value;
  return flat.toLowerCase();
}

function getHeaderValue(parsed: ParsedMail, name: string): string | undefined {
  const raw = parsed.headers?.get(name.toLowerCase());
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.join("; ");
  if (typeof raw === "object" && "value" in (raw as any)) return String((raw as any).value ?? "");
  return String(raw);
}

/**
 * Concatenate the parsed text body and any attachment bodies (delivery-status
 * / rfc822 sub-parts come through as attachments in simpleParser). The RFC 3464
 * and RFC 5965 fields we care about appear as "Field-Name: value" lines in
 * those blocks regardless of part layout, so a single text scan handles both.
 */
function flattenBodyText(parsed: ParsedMail): string {
  const pieces: string[] = [];
  if (parsed.text) pieces.push(parsed.text);
  for (const att of parsed.attachments || []) {
    const ct = (att.contentType || "").toLowerCase();
    if (ct.startsWith("message/") || ct.startsWith("text/")) {
      try {
        pieces.push(att.content.toString("utf8"));
      } catch {}
    }
  }
  return pieces.join("\n\n");
}

/**
 * Heuristic: is this an RFC 3464 DSN (delivery status notification)?
 * Checks the top-level Content-Type first, then falls back to common "Mail
 * delivery failed" subjects and From patterns used by broken MTAs.
 */
export function isDsn(parsed: ParsedMail): boolean {
  const ct = normalizeContentType(getHeaderValue(parsed, "Content-Type"));
  if (ct.includes("multipart/report") && ct.includes("delivery-status")) return true;
  const subject = (parsed.subject || "").toLowerCase();
  if (/(undeliverable|undelivered mail|mail delivery (failed|subsystem)|delivery status notification|returned mail)/.test(subject)) {
    // Only treat as DSN if the body actually contains a final-recipient field —
    // otherwise we'll misclassify a user's mail about a failed delivery.
    return /final-recipient:\s*rfc822/i.test(flattenBodyText(parsed));
  }
  return false;
}

export function isFbl(parsed: ParsedMail): boolean {
  const ct = normalizeContentType(getHeaderValue(parsed, "Content-Type"));
  if (ct.includes("multipart/report") && ct.includes("feedback-report")) return true;
  // Some ISPs send ARF as text/plain — detect by the canonical header.
  return /feedback-type:\s*abuse/i.test(flattenBodyText(parsed));
}

/**
 * Extract every failed recipient + status code from a DSN. Returns an empty
 * array (not null) when nothing is parseable so callers can uniformly iterate.
 */
export function parseDsn(parsed: ParsedMail): DsnResult[] {
  const body = flattenBodyText(parsed);
  if (!body) return [];

  // RFC 3464 per-recipient fields come in stanzas separated by a blank line.
  // Split on blank lines and scan each stanza independently so multiple failed
  // recipients in one bounce are all captured.
  const stanzas = body.split(/\r?\n\r?\n/);
  const results: DsnResult[] = [];
  let originalMessageId: string | undefined;

  for (const stanza of stanzas) {
    const midMatch = stanza.match(/original-message-id:\s*(<[^>\s]+>)/i);
    if (midMatch) originalMessageId = midMatch[1];

    const recipient = stanza.match(/final-recipient:\s*rfc822\s*;\s*([^\s<>]+@[^\s<>]+)/i)?.[1];
    if (!recipient) continue;
    const status = stanza.match(/status:\s*([2-5]\.\d{1,3}\.\d{1,3})/i)?.[1];
    const diagnostic = stanza.match(/diagnostic-code:\s*([^\n\r]+)/i)?.[1]?.trim();

    if (!status) continue;
    results.push({
      recipient: recipient.toLowerCase(),
      status,
      permanent: status.startsWith("5"),
      diagnostic,
      originalMessageId,
    });
  }
  return results;
}

/**
 * Extract the complainant from an ARF feedback report. One FBL message maps
 * to one complaint in practice, but the return shape is an array for
 * symmetry with parseDsn.
 */
export function parseFbl(parsed: ParsedMail): FblResult[] {
  const body = flattenBodyText(parsed);
  if (!body) return [];
  const feedbackType = body.match(/feedback-type:\s*(\w+)/i)?.[1]?.toLowerCase() ?? "abuse";
  const complainant = body.match(/original-(?:rcpt-to|mail-from):\s*<?([^\s<>]+@[^\s<>]+)>?/i)?.[1];
  if (!complainant) return [];
  const originalMessageId = body.match(/message-id:\s*(<[^>\s]+>)/i)?.[1];
  return [{ complainant: complainant.toLowerCase(), feedbackType, originalMessageId }];
}
