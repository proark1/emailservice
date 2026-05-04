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
}).meta({
  description:
    "Schedule a one-to-many send to an audience. Optionally include an `ab_test` config " +
    "to split-test subject + body across two variants.",
  examples: [
    {
      audience_id: "00000000-0000-0000-0000-000000000000",
      name: "Q4 product update",
      from: "Acme <hello@yourdomain.com>",
      subject: "What's new in Q4",
      html: "<h1>New features</h1>",
      scheduled_at: "2026-12-01T15:00:00Z",
    },
  ],
}).refine((d) => d.html || d.text || d.ab_test, {
  message: "At least one of html, text, or ab_test is required",
  path: ["html"],
});

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
export type AbTestConfigInput = z.infer<typeof abTestConfigSchema>;
