/**
 * Pre-flight deliverability lint. Scans the parts of a send that most often
 * trip Gmail/Outlook/Apple spam filters or hurt sender reputation. Output
 * is a list of findings with a severity (info / warning / error) and a
 * cumulative score; callers can decide whether to block the send (only
 * `error`-severity findings auto-block) or just surface warnings to the
 * user.
 *
 * Heuristic only — this is not a SpamAssassin reimplementation. The goal
 * is "catch the obvious mistakes" (all-caps subject, money-symbol stuffing,
 * naked-IP links, no plain-text alternative, missing list-unsubscribe-able
 * structure) before they hit a real provider's filter.
 */

export type LintSeverity = "info" | "warning" | "error";

export interface LintFinding {
  rule: string;
  severity: LintSeverity;
  message: string;
  /**
   * Numeric score contribution. The total score is the sum of contributions;
   * a final score above 30 is roughly equivalent to "this will land in spam".
   * Tuned by hand against a small corpus, not statistically validated.
   */
  score: number;
}

export interface LintInput {
  subject: string;
  html?: string | null;
  text?: string | null;
  from?: string | null;
}

export interface LintResult {
  ok: boolean;
  score: number;
  findings: LintFinding[];
}

/**
 * Long-standing list of high-spam phrases. Not exhaustive — chosen for low
 * false-positive rates on legitimate transactional traffic.
 */
const SPAMMY_PHRASES = [
  "100% free", "100% guaranteed", "act now", "amazing deal", "as seen on",
  "buy direct", "cheap", "click here", "click below", "credit card offers",
  "earn extra cash", "free access", "free gift", "free money", "guaranteed income",
  "increase sales", "lowest price", "make money fast", "no catch", "no obligation",
  "online biz opportunity", "order now", "risk free", "this is not spam",
  "winner", "you have been selected", "viagra", "lottery", "casino",
];

const RE_NAKED_IP_LINK = /href\s*=\s*["']\s*https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i;
const RE_INLINE_STYLE_HIDDEN = /style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|color\s*:\s*#?fff(?:fff)?\s*;\s*background[^;]*#?fff)/i;

function ratioUpper(s: string): number {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return 0;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length;
}

function countMatches(s: string, re: RegExp): number {
  return (s.match(re) || []).length;
}

export function lintEmail(input: LintInput): LintResult {
  const findings: LintFinding[] = [];
  const subject = input.subject || "";
  const html = input.html || "";
  const text = input.text || "";

  // ---- Subject line ----
  if (subject.length === 0) {
    findings.push({ rule: "subject_empty", severity: "error", message: "Subject is empty.", score: 30 });
  } else {
    if (subject.length > 78) {
      findings.push({
        rule: "subject_too_long",
        severity: "info",
        message: `Subject is ${subject.length} chars; many clients truncate above ~70.`,
        score: 2,
      });
    }
    if (ratioUpper(subject) > 0.6) {
      findings.push({
        rule: "subject_shouting",
        severity: "warning",
        message: "Subject is mostly UPPERCASE — common spam signal.",
        score: 8,
      });
    }
    const exclamations = countMatches(subject, /!/g);
    if (exclamations >= 3) {
      findings.push({
        rule: "subject_exclamation_pileup",
        severity: "warning",
        message: `Subject contains ${exclamations} exclamation marks.`,
        score: 5,
      });
    }
    if (/[$€£¥]\s*\d/.test(subject)) {
      findings.push({
        rule: "subject_money",
        severity: "info",
        message: "Subject contains a currency amount — slight reputation hit on cold lists.",
        score: 2,
      });
    }
    if (/\b(?:re:|fwd?:)\s*(?!.*[a-z])/i.test(subject)) {
      findings.push({
        rule: "subject_fake_thread",
        severity: "warning",
        message: 'Subject begins with "Re:" or "Fwd:" but body does not look like a reply.',
        score: 6,
      });
    }
  }

  // ---- Body presence ----
  if (!html && !text) {
    findings.push({
      rule: "body_missing",
      severity: "error",
      message: "Email has neither HTML nor text body.",
      score: 30,
    });
  } else if (html && !text) {
    findings.push({
      rule: "missing_text_alternative",
      severity: "warning",
      message:
        "HTML-only email — providing a `text` alternative improves inbox placement and accessibility.",
      score: 6,
    });
  }

  // ---- HTML content ----
  if (html) {
    const lower = html.toLowerCase();

    if (RE_NAKED_IP_LINK.test(html)) {
      findings.push({
        rule: "naked_ip_link",
        severity: "warning",
        message: "HTML contains a link pointing to a raw IP address.",
        score: 10,
      });
    }
    if (RE_INLINE_STYLE_HIDDEN.test(html)) {
      findings.push({
        rule: "hidden_text",
        severity: "warning",
        message: "HTML contains hidden text (display:none, font-size:0, white-on-white). Filters flag this.",
        score: 8,
      });
    }
    // Naive image:text ratio. If most of the body is <img> with little
    // surrounding text, providers treat it as suspicious.
    const imgCount = countMatches(lower, /<img\b/g);
    const textOnly = html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (imgCount > 0 && textOnly.length < 200) {
      findings.push({
        rule: "image_heavy",
        severity: "warning",
        message: `Body has ${imgCount} image(s) but only ${textOnly.length} chars of text — image-heavy emails often land in spam.`,
        score: 8,
      });
    }
    // List-Unsubscribe is a header, not body — but flag if the marketing-style
    // body lacks any visible unsubscribe link, which is a CAN-SPAM violation.
    if (textOnly.length > 400 && !/unsubscribe/i.test(html)) {
      findings.push({
        rule: "no_unsubscribe_text",
        severity: "warning",
        message: 'No visible "unsubscribe" link in HTML — required by CAN-SPAM for commercial mail.',
        score: 7,
      });
    }
    // Spammy phrase scan (case-insensitive). Each match contributes a small
    // score; capped at 12 so a long sales page doesn't auto-block.
    let phraseHits: string[] = [];
    for (const p of SPAMMY_PHRASES) {
      if (lower.includes(p)) phraseHits.push(p);
    }
    if (phraseHits.length > 0) {
      findings.push({
        rule: "spammy_phrases",
        severity: phraseHits.length > 3 ? "warning" : "info",
        message: `Body contains spam-trigger phrase(s): ${phraseHits.slice(0, 5).join(", ")}${phraseHits.length > 5 ? "…" : ""}.`,
        score: Math.min(phraseHits.length * 2, 12),
      });
    }
  }

  // ---- From address ----
  if (input.from) {
    if (/no[-_]?reply@/i.test(input.from)) {
      findings.push({
        rule: "no_reply_from",
        severity: "info",
        message: 'Sending from a "noreply" address — Gmail reports lower reply rates and downgrades reputation.',
        score: 2,
      });
    }
  }

  const score = findings.reduce((acc, f) => acc + f.score, 0);
  const ok = !findings.some((f) => f.severity === "error");
  return { ok, score, findings };
}
