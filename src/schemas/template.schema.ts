import { z } from "zod";

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().max(998).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  type: z.enum(["standard", "partial", "layout"]).default("standard"),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((d) => d.html || d.text, {
  message: "At least one of html or text is required",
  path: ["html"],
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().max(998).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  type: z.enum(["standard", "partial", "layout"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((d) => d.html !== undefined || d.text !== undefined || d.name !== undefined || d.subject !== undefined || d.type !== undefined || d.metadata !== undefined, {
  message: "At least one field must be provided",
  path: [],
});

export const renderTemplateSchema = z.object({
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.record(z.string(), z.any())), z.record(z.string(), z.any())])),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type RenderTemplateInput = z.infer<typeof renderTemplateSchema>;
