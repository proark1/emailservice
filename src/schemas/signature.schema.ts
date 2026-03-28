import { z } from "zod";

export const createSignatureSchema = z.object({
  name: z.string().min(1).max(255),
  html_body: z.string().min(1),
  text_body: z.string().optional(),
  is_default: z.boolean().optional(),
});

export const updateSignatureSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  html_body: z.string().min(1).optional(),
  text_body: z.string().optional(),
  is_default: z.boolean().optional(),
});

export type CreateSignatureInput = z.infer<typeof createSignatureSchema>;
export type UpdateSignatureInput = z.infer<typeof updateSignatureSchema>;
