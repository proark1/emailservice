import { z, ZodTypeAny } from "zod";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

export { serializerCompiler, validatorCompiler };

/**
 * Tag definitions surfaced in the OpenAPI document. Order here drives the
 * order that Swagger UI groups operations. Tag names must match what the
 * `openapiTransform` below derives from URL prefixes (capitalised resource
 * names like "Emails", "Domains", "Api Keys").
 */
export const OPENAPI_TAGS = [
  { name: "Emails", description: "Send transactional and one-off email; list, fetch, or cancel scheduled sends." },
  { name: "Batch", description: "Send up to 100 emails in a single request." },
  { name: "Domains", description: "Verify and manage sending domains. Tunes DKIM, DMARC, return-path, BIMI, MTA-STS, and per-domain rate limits." },
  { name: "Api Keys", description: "Mint, list, and revoke API keys for the authenticated account." },
  { name: "Webhooks", description: "Subscribe to delivery, bounce, complaint, open, click, and inbound events. Includes delivery introspection and replay." },
  { name: "Audiences", description: "Group contacts into audiences. CSV import / export, per-contact CRUD." },
  { name: "Suppressions", description: "Account-wide suppression list — bounces, complaints, unsubscribes." },
  { name: "Broadcasts", description: "One-to-many marketing sends to an audience, with scheduling and A/B testing." },
  { name: "Templates", description: "Reusable email templates with variable substitution." },
  { name: "Sequences", description: "Multi-step automated email sequences with branching logic." },
  { name: "Warmup", description: "Gradually ramp send volume on a fresh domain." },
  { name: "Companies", description: "Multi-tenant sub-accounts. Each company has its own domains, members, and API keys under a root account." },
  { name: "Analytics", description: "Open / click / bounce / complaint stats for the account." },
  { name: "Deliverability", description: "Per-domain deliverability summary and TLS-RPT reports." },
  { name: "Events", description: "Stream email events (sent, delivered, bounced, opened, clicked, complained, unsubscribed)." },
  { name: "Inbox", description: "Read inbound email — folders, threads, messages, drafts." },
  { name: "Privacy", description: "GDPR / CCPA data subject requests (export, delete)." },
] as const;

/**
 * Common reusable response shapes. Re-export Zod schemas; the response
 * schemas in routes wrap a resource in one of these envelopes so the OpenAPI
 * spec consistently models responses as `{ data }` / `{ data, pagination }` /
 * `{ error }`.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    type: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const paginationResponseSchema = z.object({
  cursor: z.string().nullable(),
  has_more: z.boolean(),
});

export const dataEnvelope = <T extends ZodTypeAny>(inner: T) =>
  z.object({ data: inner });

export const paginatedEnvelope = <T extends ZodTypeAny>(inner: T) =>
  z.object({ data: z.array(inner), pagination: paginationResponseSchema });

/**
 * Standard error responses every authenticated `/v1/*` route can produce.
 * Spread into `schema.response` so the spec documents 4xx outcomes too.
 */
export const standardErrorResponses = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  429: errorResponseSchema,
  500: errorResponseSchema,
};

/**
 * Routes that should NOT appear in the public OpenAPI document. These are
 * either internal (admin, dashboard cookie-auth UI), public unauthenticated
 * (tracking pixels, click redirects, unsubscribe), or non-API (health probes,
 * static-asset SPA fallback).
 */
const HIDDEN_PREFIXES = [
  "/health",
  "/readyz",
  "/auth/",
  "/dashboard/",
  "/admin/",
  "/t/",
  "/c/",
  "/unsubscribe/",
  "/preferences/",
  "/.well-known/",
];

/**
 * Auto-derive a tag from the URL of a `/v1/{resource}/...` route so we don't
 * have to repeat the tag on every single `schema:` block. Multi-word resource
 * names (api-keys, address-book) are title-cased ("Api Keys", "Address Book").
 */
function deriveTag(url: string): string | null {
  const match = url.match(/^\/v1\/([^/]+)/);
  if (!match) return null;
  const resource = match[1];
  // Special cases where the URL slug doesn't match the user-facing tag name.
  const overrides: Record<string, string> = {
    "api-keys": "Api Keys",
    "address-book": "Address Book",
    suppressions: "Suppressions",
    privacy: "Privacy",
    deliverability: "Deliverability",
  };
  if (overrides[resource]) return overrides[resource];
  return resource
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Transform passed to `@fastify/swagger`. Runs the Zod-to-JSON-Schema
 * conversion first, then:
 *  - hides non-public routes (auth, dashboard, admin, tracking…)
 *  - auto-tags `/v1/{resource}` routes when the route didn't set `tags`
 *  - drops the `HEAD` operations that Fastify auto-generates for every GET
 */
export const openapiTransform: typeof jsonSchemaTransform = (input) => {
  const result = jsonSchemaTransform(input);
  const url = result.url;
  // jsonSchemaTransform returns FastifySchema; cast so we can mutate the
  // OpenAPI extensions (tags, hide) without TS griping at us.
  const schema = { ...(result.schema as Record<string, unknown>) };

  if (HIDDEN_PREFIXES.some((p) => url.startsWith(p))) {
    schema.hide = true;
  }

  const method = (input as { route?: { method?: string | string[] } }).route?.method;
  if (method === "HEAD" || (Array.isArray(method) && method.length === 1 && method[0] === "HEAD")) {
    schema.hide = true;
  }

  if (!schema.tags || (Array.isArray(schema.tags) && schema.tags.length === 0)) {
    const tag = deriveTag(url);
    if (tag) schema.tags = [tag];
  }

  return { schema: schema as typeof result.schema, url };
};
