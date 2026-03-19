export const WEBHOOK_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.soft_bounced",
  "email.opened",
  "email.clicked",
  "email.complained",
  "email.failed",
  "email.received",
  "domain.verified",
  "contact.created",
  "contact.updated",
  "contact.deleted",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookPayload {
  type: WebhookEventType;
  created_at: string;
  data: Record<string, unknown>;
}
