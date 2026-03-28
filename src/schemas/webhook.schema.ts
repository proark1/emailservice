import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "../types/webhook-events.js";

// Block private/internal IPs to prevent SSRF attacks
const PRIVATE_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "169.254.169.254", "metadata.google.internal"];
const PRIVATE_PREFIXES = ["10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "192.168."];

const httpUrl = z.string().url().max(2048).refine(
  (url) => url.startsWith("http://") || url.startsWith("https://"),
  { message: "Webhook URL must use http:// or https:// scheme" },
).refine(
  (url) => {
    try {
      const hostname = new URL(url).hostname;
      if (PRIVATE_HOSTS.includes(hostname)) return false;
      if (PRIVATE_PREFIXES.some((p) => hostname.startsWith(p))) return false;
      return true;
    } catch { return false; }
  },
  { message: "Webhook URL cannot target private or internal addresses" },
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
