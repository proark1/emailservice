import { z } from "zod";

const emailAddress = z.string().email();

export const sendEmailSchema = z.object({
  from: z.string().min(1), // "Name <email@example.com>" or "email@example.com"
  to: z.array(emailAddress).min(1).max(50),
  cc: z.array(emailAddress).optional(),
  bcc: z.array(emailAddress).optional(),
  reply_to: z.array(emailAddress).optional(),
  subject: z.string().min(1).max(998),
  html: z.string().optional(),
  text: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  attachments: z.array(z.object({
    filename: z.string().max(255),
    content: z.string().max(10_485_760), // ~7.5 MB decoded
    content_type: z.string().optional(),
  })).max(10).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  scheduled_at: z.string().datetime().optional(),
  idempotency_key: z.string().max(255).optional(),
  template_id: z.string().uuid().optional(),
  template_variables: z.record(z.string(), z.string()).optional(),
  in_reply_to: z.string().max(500).optional(),
  references: z.array(z.string().max(500)).optional(),
  signature_id: z.string().uuid().optional(),
  tracking: z.object({
    opens: z.boolean().default(true),
    clicks: z.boolean().default(true),
  }).optional(),
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
