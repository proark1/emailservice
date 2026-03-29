import { z } from "zod";

const emailAddress = z.string().email();

export const saveDraftSchema = z.object({
  from: z.string().min(1).optional(),
  to: z.array(emailAddress).optional(),
  cc: z.array(emailAddress).max(50).optional(),
  bcc: z.array(emailAddress).max(50).optional(),
  reply_to: z.array(emailAddress).optional(),
  subject: z.string().max(998).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  attachments: z.array(z.object({
    filename: z.string().max(255),
    content: z.string().max(10_485_760),
    content_type: z.string().optional(),
  })).max(10).optional(),
  in_reply_to: z.string().max(500).optional(),
  references: z.array(z.string().max(500)).optional(),
  signature_id: z.string().uuid().optional(),
});

export const updateDraftSchema = saveDraftSchema;

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
