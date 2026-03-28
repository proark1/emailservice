import { z } from "zod";

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().max(998).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
}).refine((d) => d.html || d.text, {
  message: "At least one of html or text is required",
  path: ["html"],
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().max(998).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
}).refine((d) => d.html !== undefined || d.text !== undefined || d.name !== undefined || d.subject !== undefined, {
  message: "At least one field must be provided",
  path: [],
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
