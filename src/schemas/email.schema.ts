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
    filename: z.string(),
    content: z.string(), // base64 encoded
    content_type: z.string().optional(),
  })).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  scheduled_at: z.string().datetime().optional(),
  idempotency_key: z.string().max(255).optional(),
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
