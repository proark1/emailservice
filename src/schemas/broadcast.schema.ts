import { z } from "zod";

const abTestVariantSchema = z.object({
  id: z.enum(["A", "B"]),
  subject: z.string().min(1).max(998),
  html: z.string().optional(),
  text: z.string().optional(),
}).refine((d) => d.html || d.text, {
  message: "Each variant must have at least html or text",
  path: ["html"],
});

const abTestConfigSchema = z.object({
  test_percentage: z.number().int().min(10).max(50),
  variants: z.array(abTestVariantSchema).length(2),
  winner_criteria: z.enum(["open_rate", "click_rate"]),
  wait_hours: z.number().int().min(1).max(72),
});

export const createBroadcastSchema = z.object({
  audience_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  from: z.string().min(1),
  subject: z.string().min(1).max(998),
  html: z.string().optional(),
  text: z.string().optional(),
  reply_to: z.array(z.string().email()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  scheduled_at: z.string().datetime().optional(),
  ab_test: abTestConfigSchema.optional(),
}).refine((d) => d.html || d.text || d.ab_test, {
  message: "At least one of html, text, or ab_test is required",
  path: ["html"],
});

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
export type AbTestConfigInput = z.infer<typeof abTestConfigSchema>;
