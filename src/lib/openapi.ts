import { z, ZodTypeAny } from "zod";
import { toJSONSchema } from "zod/v4/core";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { WEBHOOK_EVENT_SCHEMAS } from "./webhook-events.schemas.js";

export { serializerCompiler, validatorCompiler };

/**
 * Tag definitions surfaced in the OpenAPI document. Order here drives the
 * order that Swagger UI groups operations. Tag names must match what the
 * `openapiTransform` below derives from URL prefixes (capitalised resource
 * names like "Emails", "Domains", "Api Keys").
 */
export const OPENAPI_TAGS = [
  { name: "Emails", description: "Send transactional and one-off email; list, fetch, or cancel scheduled sends." },
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
  { name: "Drafts", description: "Compose and manage draft emails." },
  { name: "Threads", description: "Conversation threads grouping inbound + outbound messages." },
  { name: "Folders", description: "Organize inbound mail into folders." },
  { name: "Signatures", description: "Reusable email signatures attached to outbound mail." },
  { name: "Address Book", description: "Saved sender / recipient contacts (separate from audiences)." },
  { name: "Team", description: "Per-domain team members and their access scope." },
  { name: "Mailboxes", description: "Account-level mailbox-handle administration." },
  { name: "Sunset", description: "Deprecated endpoints with end-of-life metadata." },
  { name: "Compat", description: "Drop-in compatibility shims for Resend and Postmark." },
  { name: "Batch", description: "Send up to 100 emails in a single request." },
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
 * Build the OpenAPI 3.1 `webhooks` map describing the events this service
 * sends to subscribed webhooks. Pass the result as `openapi.webhooks` in the
 * @fastify/swagger config.
 */
export function buildOpenapiWebhooks() {
  const webhooks: Record<string, unknown> = {};
  for (const [eventName, zodSchema] of Object.entries(WEBHOOK_EVENT_SCHEMAS)) {
    const schema = toJSONSchema(zodSchema, { target: "draft-2020-12" });
    webhooks[eventName] = {
      post: {
        summary: `${eventName} event`,
        description:
          (schema as { description?: string }).description ??
          `Sent to subscribed webhooks when \`${eventName}\` fires.`,
        tags: ["Webhook events"],
        operationId: `webhookEvent_${eventName.replace(/\./g, "_")}`,
        requestBody: {
          required: true,
          description:
            "HMAC-signed event payload. Verify the `X-Webhook-Signature` header before trusting.",
          content: { "application/json": { schema } },
        },
        responses: {
          "2XX": { description: "Acknowledge receipt with any 2xx. Non-2xx triggers retry with exponential backoff." },
        },
      },
    };
  }
  return webhooks;
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

  // Auto-derive operationId so codegen tools produce nice SDK method names
  // (`emailsCreate`, `domainsVerify`, `companiesAdoptDomains`, …) without us
  // having to hand-write it on every route. Routes that set their own
  // `operationId` win.
  if (!schema.operationId) {
    const methodArr = Array.isArray(method) ? method : method ? [method] : [];
    const m = (methodArr[0] || "GET").toLowerCase();
    schema.operationId = deriveOperationId(m, url);
  }

  return { schema: schema as typeof result.schema, url };
};

const VERB_BY_METHOD: Record<string, string> = {
  get: "list",
  post: "create",
  put: "update",
  patch: "update",
  delete: "delete",
};

/**
 * Build a stable, human-readable operationId from method + URL.
 *
 *   POST   /v1/emails                            → emailsCreate
 *   GET    /v1/emails                            → emailsList
 *   GET    /v1/emails/{id}                       → emailsGet
 *   DELETE /v1/emails/{id}                       → emailsDelete
 *   POST   /v1/domains/{id}/verify               → domainsVerify
 *   POST   /v1/companies/{companyId}/api-keys    → companiesApiKeysCreate
 *   POST   /v1/companies/{companyId}/adopt-domains → companiesAdoptDomains
 */
function deriveOperationId(method: string, url: string): string {
  const segments = url
    .replace(/^\/v1\/?/, "")
    .split("/")
    .filter((s) => s.length > 0);

  // URL params can arrive as Fastify-style `:id` or OpenAPI-style `{id}`
  // depending on whether the transform sees the raw or rewritten URL.
  const isParam = (s: string) =>
    s.startsWith(":") || (s.startsWith("{") && s.endsWith("}"));
  const lastSeg = segments[segments.length - 1];
  const lastIsParam = lastSeg ? isParam(lastSeg) : false;

  // Words: drop param segments; they become "Get"/"Update"/"Delete" verbs below.
  const words = segments.filter((s) => !isParam(s));
  if (words.length === 0) return method;

  const camel = (s: string) =>
    s
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^([A-Z])/, (m) => m.toLowerCase());
  const pascal = (s: string) => {
    const c = camel(s);
    return c.charAt(0).toUpperCase() + c.slice(1);
  };

  const head = camel(words[0]);
  const rest = words.slice(1).map(pascal).join("");

  // Decide the trailing verb. If the last URL segment is itself a verb-noun
  // (like `verify`, `replay`, `select-winner`, `adopt-domains`, `apply`,
  // `pause`, `resume`), keep it as the action and skip the generic verb.
  // URL tails that are themselves verbs/actions — the operationId uses them
  // as-is rather than appending a generic "Create"/"List"/"Get" verb. Pure
  // sub-resource nouns (`deliveries`, `members`, `api-keys`, …) are NOT in
  // here so they pick up a method-derived verb suffix instead.
  const ACTION_LIKE = new Set([
    "verify",
    "replay",
    "select-winner",
    "adopt-domains",
    "apply",
    "pause",
    "resume",
    "activate",
    "send",
    "test",
    "sync",
    "preview",
    "lint",
    "stream",
    "autocomplete",
    "export",
    "confirm",
    "enroll",
    "bulk",
    "move",
    "restore",
    "permanent",
    "my-memberships",
  ]);
  if (lastSeg && !lastIsParam && ACTION_LIKE.has(lastSeg.toLowerCase())) {
    // For these "action" tails, just use METHOD as-is when it's a POST/DELETE.
    if (method === "post") return head + rest;
    if (method === "get") return head + rest + "List";
    if (method === "delete") return head + rest + "Delete";
    if (method === "patch" || method === "put") return head + rest + "Update";
    return head + rest;
  }

  // Otherwise: GET /resource → resourceList; GET /resource/{id} → resourceGet;
  // POST /resource → resourceCreate; PATCH /resource/{id} → resourceUpdate;
  // DELETE /resource/{id} → resourceDelete.
  let verb = VERB_BY_METHOD[method] ?? method;
  if (method === "get" && lastIsParam) verb = "get";
  if (method === "get" && !lastIsParam) verb = "list";
  return head + rest + verb.charAt(0).toUpperCase() + verb.slice(1);
}
