import { z } from "zod";

const emailAddress = z.string().email();

// Reject strings containing CRLF characters (header injection prevention)
const noCRLF = z.string().refine((s) => !/[\r\n\x00]/.test(s), { message: "Must not contain CR, LF, or null characters" });

// Bounded key-value record: max 50 entries, keys/values max 500 chars, no CRLF
const boundedHeaders = z.record(
  z.string().max(500).refine((s) => !/[\r\n\x00]/.test(s), { message: "Header key must not contain CR/LF" }),
  z.string().max(2000).refine((s) => !/[\r\n\x00]/.test(s), { message: "Header value must not contain CR/LF" }),
).refine((obj) => Object.keys(obj).length <= 50, { message: "Maximum 50 custom headers" }).optional();

const boundedTags = z.record(
  z.string().max(100),
  z.string().max(500),
).refine((obj) => Object.keys(obj).length <= 50, { message: "Maximum 50 tags" }).optional();

export const sendEmailSchema = z.object({
  from: noCRLF.pipe(z.string().min(1).max(500)), // "Name <email@example.com>" or "email@example.com"
  to: z.array(emailAddress).min(1).max(50),
  cc: z.array(emailAddress).max(50).optional(),
  bcc: z.array(emailAddress).max(50).optional(),
  reply_to: z.array(emailAddress).max(10).optional(),
  subject: z.string().min(1).max(998),
  html: z.string().max(1_048_576).optional(), // 1 MB max HTML body
  text: z.string().max(524_288).optional(),    // 512 KB max text body
  headers: boundedHeaders,
  attachments: z.array(z.object({
    filename: z.string().max(255),
    content: z.string().max(10_485_760), // ~7.5 MB decoded
    content_type: z.string().max(255).regex(/^[\w.+-]+\/[\w.+-]+/, { message: "Invalid MIME type" }).optional(),
  })).max(10).optional(),
  tags: boundedTags,
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
