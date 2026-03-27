import { z } from "zod";

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
}).refine((d) => d.html || d.text, {
  message: "At least one of html or text is required",
  path: ["html"],
});

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
