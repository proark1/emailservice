import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "../types/webhook-events.js";

export const createWebhookSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
});

export const updateWebhookSchema = z.object({
  url: z.string().url().max(2048).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
  active: z.boolean().optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
