import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "../types/webhook-events.js";

const httpUrl = z.string().url().max(2048).refine(
  (url) => url.startsWith("http://") || url.startsWith("https://"),
  { message: "Webhook URL must use http:// or https:// scheme" },
);

export const createWebhookSchema = z.object({
  url: httpUrl,
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
});

export const updateWebhookSchema = z.object({
  url: httpUrl.optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
  active: z.boolean().optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
