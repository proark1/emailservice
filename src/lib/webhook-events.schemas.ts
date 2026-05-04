/**
 * Zod schemas describing the payloads MailNowAPI sends to subscribed webhooks.
 *
 * Surfaced in the OpenAPI document under the top-level `webhooks` map so that
 * SDK codegen and IDE tooling can type-check webhook handlers the same way
 * they type-check API responses. Every payload follows the shared envelope
 *
 *     { type, created_at, data: { id, ...event-specific fields } }
 *
 * with `data.id` being the email-event id from `dispatchEvent`. Each
 * outgoing POST is signed with HMAC-SHA256 over the raw body using the
 * webhook's `signing_secret` (returned once on `POST /v1/webhooks`); verify
 * via the `X-Webhook-Signature` header before trusting the payload.
 */

import { z } from "zod";
import { WEBHOOK_EVENT_TYPES } from "../types/webhook-events.js";

const baseEnvelope = <Type extends string, Data extends z.ZodTypeAny>(
  type: Type,
  data: Data,
) =>
  z.object({
    type: z.literal(type),
    created_at: z.string().datetime(),
    data,
  });

const idAndEmail = z.object({
  id: z.string().uuid(),
  email_id: z.string().uuid(),
});

// --- Outbound email lifecycle ---

export const emailSentEvent = baseEnvelope(
  "email.sent",
  idAndEmail.extend({
    to: z.array(z.string().email()),
    subject: z.string(),
  }),
).meta({ description: "An email has been handed off to the SMTP transport." });

export const emailDeliveredEvent = baseEnvelope(
  "email.delivered",
  idAndEmail.extend({
    to: z.array(z.string().email()),
    smtp_response: z.string().optional(),
  }),
).meta({ description: "Receiving MTA accepted the message (250 OK / RCPT)." });

export const emailBouncedEvent = baseEnvelope(
  "email.bounced",
  idAndEmail.extend({
    recipient: z.string().email(),
    status: z.string().describe("RFC 3463 enhanced status code, e.g. `5.1.1`"),
    diagnostic: z.string().describe("Free-text diagnostic from the receiving MTA."),
    original_message_id: z.string().nullable().optional(),
  }),
).meta({
  description: "Permanent (5.x.x) bounce. The recipient has been auto-suppressed.",
});

export const emailSoftBouncedEvent = baseEnvelope(
  "email.soft_bounced",
  idAndEmail.extend({
    recipient: z.string().email(),
    status: z.string(),
    diagnostic: z.string(),
    original_message_id: z.string().nullable().optional(),
  }),
).meta({
  description: "Transient (4.x.x) bounce. Will retry; recipient is **not** suppressed.",
});

export const emailComplainedEvent = baseEnvelope(
  "email.complained",
  idAndEmail.extend({
    complainant: z.string().email(),
    feedback_type: z.string().describe("RFC 5965 ARF feedback type — usually `abuse`."),
    original_message_id: z.string().nullable().optional(),
  }),
).meta({
  description:
    "Recipient marked the message as spam (received via FBL / ARF). The complainant has been auto-suppressed.",
});

export const emailOpenedEvent = baseEnvelope(
  "email.opened",
  idAndEmail.extend({
    timestamp: z.string().datetime(),
    user_agent: z.string().nullable().optional(),
    ip: z.string().nullable().optional(),
  }),
).meta({ description: "Recipient loaded the open-tracking pixel." });

export const emailClickedEvent = baseEnvelope(
  "email.clicked",
  idAndEmail.extend({
    timestamp: z.string().datetime(),
    url: z.string().url(),
    user_agent: z.string().nullable().optional(),
    ip: z.string().nullable().optional(),
  }),
).meta({ description: "Recipient clicked a tracked link in the message." });

export const emailFailedEvent = baseEnvelope(
  "email.failed",
  idAndEmail.extend({
    error: z.string(),
    code: z.string().nullable().optional(),
  }),
).meta({
  description:
    "The send pipeline gave up — DKIM signing failed, transport rejected before MAIL FROM, or the worker exhausted retries.",
});

// --- Inbound ---

export const emailReceivedEvent = baseEnvelope(
  "email.received",
  z.object({
    id: z.string().uuid(),
    from: z.string().email(),
    to: z.array(z.string().email()),
    subject: z.string(),
    text: z.string().nullable().optional().describe("Truncated to 10 000 chars."),
    html: z.string().nullable().optional().describe("Truncated to 50 000 chars."),
  }),
).meta({ description: "An inbound message was accepted on the SMTP inbound server." });

// --- Domains ---

export const domainVerifiedEvent = baseEnvelope(
  "domain.verified",
  z.object({
    id: z.string().uuid(),
    domain_id: z.string().uuid(),
    name: z.string(),
  }),
).meta({ description: "DNS verification (SPF / DKIM / DMARC) passed for the domain." });

// --- Contacts ---

const contactPayload = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid(),
  audience_id: z.string().uuid(),
  email: z.string().email(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
});

export const contactCreatedEvent = baseEnvelope("contact.created", contactPayload).meta({
  description: "A contact was added to an audience.",
});

export const contactUpdatedEvent = baseEnvelope("contact.updated", contactPayload).meta({
  description: "A contact's fields or subscription state changed.",
});

export const contactDeletedEvent = baseEnvelope("contact.deleted", contactPayload).meta({
  description: "A contact was removed from an audience.",
});

/**
 * Map of webhook event name → its Zod payload schema. Used by the OpenAPI
 * generator to populate the spec's top-level `webhooks` map. Keys must
 * match the `WEBHOOK_EVENT_TYPES` constant — a runtime check below catches
 * drift between the two.
 */
export const WEBHOOK_EVENT_SCHEMAS = {
  "email.sent": emailSentEvent,
  "email.delivered": emailDeliveredEvent,
  "email.bounced": emailBouncedEvent,
  "email.soft_bounced": emailSoftBouncedEvent,
  "email.complained": emailComplainedEvent,
  "email.opened": emailOpenedEvent,
  "email.clicked": emailClickedEvent,
  "email.failed": emailFailedEvent,
  "email.received": emailReceivedEvent,
  "domain.verified": domainVerifiedEvent,
  "contact.created": contactCreatedEvent,
  "contact.updated": contactUpdatedEvent,
  "contact.deleted": contactDeletedEvent,
} satisfies Record<(typeof WEBHOOK_EVENT_TYPES)[number], z.ZodTypeAny>;

// Compile-time guard: every event in WEBHOOK_EVENT_TYPES has a schema, no extras.
const _eventSchemaKeys = Object.keys(WEBHOOK_EVENT_SCHEMAS) as (keyof typeof WEBHOOK_EVENT_SCHEMAS)[];
const _eventTypeKeys: readonly (typeof WEBHOOK_EVENT_TYPES)[number][] = WEBHOOK_EVENT_TYPES;
type AssertSameSet<A extends string, B extends string> =
  [Exclude<A, B>] extends [never] ? ([Exclude<B, A>] extends [never] ? true : never) : never;
type _Check = AssertSameSet<
  (typeof _eventTypeKeys)[number],
  (typeof _eventSchemaKeys)[number]
>;
const _typeCheck: _Check = true; // any drift triggers a TS error here.
void _typeCheck;
