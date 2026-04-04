import { z } from "zod";

export const createSequenceSchema = z.object({
  audience_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  from: z.string().min(1),
  trigger_type: z.enum(["audience_join", "manual"]).default("manual"),
});

export type CreateSequenceInput = z.infer<typeof createSequenceSchema>;

export const updateSequenceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  from: z.string().min(1).optional(),
  trigger_type: z.enum(["audience_join", "manual"]).optional(),
});

export type UpdateSequenceInput = z.infer<typeof updateSequenceSchema>;

export const createStepSchema = z.object({
  position: z.number().int().min(1),
  delay_minutes: z.number().int().min(1).default(1440), // Default 24h
  subject: z.string().min(1).max(998).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  template_id: z.string().uuid().optional(),
}).refine((d) => d.html || d.text || d.template_id, {
  message: "At least one of html, text, or template_id is required",
  path: ["html"],
});

export type CreateStepInput = z.infer<typeof createStepSchema>;

export const updateStepSchema = z.object({
  position: z.number().int().min(1).optional(),
  delay_minutes: z.number().int().min(1).optional(),
  subject: z.string().min(1).max(998).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  template_id: z.string().uuid().nullable().optional(),
});

export type UpdateStepInput = z.infer<typeof updateStepSchema>;

export const enrollContactsSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(1000),
});

export type EnrollContactsInput = z.infer<typeof enrollContactsSchema>;
