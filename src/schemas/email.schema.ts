import { z } from "zod";

const emailAddress = z.string().email();

// Reject any line terminator that an MTA might treat as a CRLF: ASCII CR/LF,
// NEL (U+0085), and the Unicode line/paragraph separators U+2028 / U+2029.
// Used to block header smuggling via subject, headers, and attachment names.
const NO_LINE_TERMINATORS = /^[^\r\n\u0085\u2028\u2029]*$/;
const noLineTerm = (msg: string) =>
  z.string().regex(NO_LINE_TERMINATORS, msg);

// Per-email body cap. Caps each attachment at ~7.5 MB decoded × 10 = 75 MB
// max in attachments alone, plus arbitrary html / text. Adding a top-level
// refinement that sums everything keeps a single request from buffering
// 100 MB in the API process.
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export const sendEmailSchema = z.object({
  from: z.string().min(1), // "Name <email@example.com>" or "email@example.com"
  to: z.array(emailAddress).min(1).max(50),
  cc: z.array(emailAddress).optional(),
  bcc: z.array(emailAddress).optional(),
  reply_to: z.array(emailAddress).optional(),
  subject: noLineTerm("Subject must be a single line").min(1).max(998),
  html: z.string().optional(),
  text: z.string().optional(),
  // Header keys must be RFC 5322 tokens; values must not contain line
  // terminators. The runtime sender re-checks this as defense-in-depth.
  headers: z.record(
    z.string().regex(/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/, "Invalid header name"),
    noLineTerm("Header value must be a single line"),
  ).optional(),
  attachments: z.array(z.object({
    filename: noLineTerm("Filename must be a single line").max(255),
    content: z.string().max(10_485_760), // ~7.5 MB decoded
    content_type: noLineTerm("Content-Type must be a single line").optional(),
  })).max(10).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  scheduled_at: z.string().datetime().optional(),
  idempotency_key: z.string().max(255).optional(),
  template_id: z.string().uuid().optional(),
  template_variables: z.record(z.string(), z.string()).optional(),
  in_reply_to: z.string().max(500).optional(),
  references: z.array(z.string().max(500)).optional(),
  signature_id: z.string().uuid().optional(),
}).refine((d) => d.html || d.text || d.template_id, {
  message: "At least one of html, text, or template_id is required",
  path: ["html"],
}).refine((d) => {
  // Cap total request body content so one request can't buffer hundreds of
  // megabytes. We approximate the size as html + text + sum(attachment.content).
  // attachment.content is base64; we estimate decoded bytes as length * 3/4.
  const htmlBytes = d.html ? Buffer.byteLength(d.html, "utf8") : 0;
  const textBytes = d.text ? Buffer.byteLength(d.text, "utf8") : 0;
  const attBytes = (d.attachments ?? []).reduce(
    (n, a) => n + Math.ceil(a.content.length * 0.75),
    0,
  );
  return htmlBytes + textBytes + attBytes <= MAX_TOTAL_BYTES;
}, {
  message: `Total email size (html + text + attachments) exceeds ${MAX_TOTAL_BYTES} bytes`,
  path: ["attachments"],
});

export const emailResponseSchema = z.object({
  id: z.string().uuid(),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
