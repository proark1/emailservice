/**
 * MailNowAPI TypeScript SDK.
 *
 * Thin wrapper around `fetch` that provides:
 *   - Bearer-token auth (`Authorization: Bearer es_xxx`)
 *   - Resource methods grouped by resource (`client.emails.create`, …)
 *   - Full request / response types generated from the OpenAPI spec — see
 *     `types.gen.ts`. Re-export both `paths` and `components` so SDK
 *     consumers can refer to e.g. `Email`, `Domain`, `WebhookEvent` directly.
 *   - Webhook signature verification helper for inbound events.
 *
 * Designed to work in Node 20+ and modern browsers without a runtime
 * dependency on the rest of the monorepo.
 */

import type { components, paths } from "./types.gen.js";

export type { components, paths };

// ---- handy aliases for consumers ----

type ApiKeyResponse = NonNullable<
  paths["/v1/api-keys/"]["post"]["responses"]["201"]["content"]["application/json"]["data"]
>;

export type Email = NonNullable<
  paths["/v1/emails/"]["post"]["responses"]["201"]["content"]["application/json"]["data"]
>;
export type SendEmailParams = NonNullable<
  paths["/v1/emails/"]["post"]["requestBody"]
>["content"]["application/json"];
export type Domain = NonNullable<
  paths["/v1/domains/"]["post"]["responses"]["201"]["content"]["application/json"]["data"]
>;
export type Webhook = NonNullable<
  paths["/v1/webhooks/"]["post"]["responses"]["201"]["content"]["application/json"]["data"]
>;
export type ApiKey = ApiKeyResponse;
export type WebhookEventName =
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.soft_bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked"
  | "email.failed"
  | "email.received"
  | "domain.verified"
  | "contact.created"
  | "contact.updated"
  | "contact.deleted";

// ---- error type ----

export class MailNowApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(opts: {
    status: number;
    type: string;
    message: string;
    details?: unknown;
    requestId?: string | null;
  }) {
    super(opts.message);
    this.name = "MailNowApiError";
    this.status = opts.status;
    this.type = opts.type;
    this.details = opts.details;
    this.requestId = opts.requestId ?? null;
  }
}

// ---- core client ----

export interface MailNowApiClientOptions {
  /** API key. Required for `/v1/*` endpoints. */
  apiKey: string;
  /** Base URL. Defaults to `https://mailnowapi.com`. */
  baseUrl?: string;
  /** Per-request timeout in ms. Defaults to 30 000. */
  timeoutMs?: number;
  /** Override `fetch`. Defaults to the global. Useful for tests + legacy Node. */
  fetch?: typeof fetch;
}

export class MailNowApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MailNowApiClientOptions) {
    if (!opts.apiKey) throw new Error("MailNowApiClient: `apiKey` is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://mailnowapi.com").replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error("MailNowApiClient: no `fetch` available — pass one via `fetch` option");
    }
  }

  // ----- resource namespaces -----

  readonly emails = {
    create: (body: SendEmailParams) =>
      this.request<{ data: Email }>("POST", "/v1/emails", body),
    list: (params?: { cursor?: string; limit?: number }) =>
      this.request<{ data: Email[]; pagination: { cursor: string | null; has_more: boolean } }>(
        "GET",
        "/v1/emails",
        undefined,
        params,
      ),
    get: (id: string) => this.request<{ data: Email }>("GET", `/v1/emails/${enc(id)}`),
    cancel: (id: string) => this.request<{ data: Email }>("DELETE", `/v1/emails/${enc(id)}`),
    sendBatch: (emails: SendEmailParams[]) =>
      this.request<{ data: { ids: string[]; count: number } }>(
        "POST",
        "/v1/emails/batch",
        { emails },
      ),
  };

  readonly domains = {
    create: (body: paths["/v1/domains/"]["post"]["requestBody"]["content"]["application/json"]) =>
      this.request<{ data: Domain }>("POST", "/v1/domains", body),
    list: (params?: { unlinked?: boolean; company_id?: string }) =>
      this.request<{ data: Domain[] }>("GET", "/v1/domains", undefined, params),
    get: (id: string) => this.request<{ data: Domain }>("GET", `/v1/domains/${enc(id)}`),
    update: (id: string, body: paths["/v1/domains/{id}"]["patch"]["requestBody"]["content"]["application/json"]) =>
      this.request<{ data: Domain }>("PATCH", `/v1/domains/${enc(id)}`, body),
    delete: (id: string) => this.request<{ data: Domain }>("DELETE", `/v1/domains/${enc(id)}`),
    verify: (id: string) =>
      this.request<{ data: { message: string } }>("POST", `/v1/domains/${enc(id)}/verify`),
  };

  readonly apiKeys = {
    create: (body: paths["/v1/api-keys/"]["post"]["requestBody"]["content"]["application/json"]) =>
      this.request<{ data: ApiKey & { key: string } }>("POST", "/v1/api-keys", body),
    list: () => this.request<{ data: ApiKey[] }>("GET", "/v1/api-keys"),
    revoke: (id: string) => this.request<{ data: ApiKey }>("DELETE", `/v1/api-keys/${enc(id)}`),
  };

  readonly webhooks = {
    create: (body: paths["/v1/webhooks/"]["post"]["requestBody"]["content"]["application/json"]) =>
      this.request<{ data: Webhook }>("POST", "/v1/webhooks", body),
    list: () => this.request<{ data: Webhook[] }>("GET", "/v1/webhooks"),
    get: (id: string) => this.request<{ data: Webhook }>("GET", `/v1/webhooks/${enc(id)}`),
    update: (id: string, body: paths["/v1/webhooks/{id}"]["patch"]["requestBody"]["content"]["application/json"]) =>
      this.request<{ data: Webhook }>("PATCH", `/v1/webhooks/${enc(id)}`, body),
    delete: (id: string) => this.request<{ data: Webhook }>("DELETE", `/v1/webhooks/${enc(id)}`),
  };

  /**
   * Escape hatch for endpoints not (yet) covered by a typed namespace.
   * Returns whatever the API returns; callers cast as needed.
   */
  raw<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>(method, path, body, query);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let resp: Response;
    try {
      resp = await this.fetchImpl(url, {
        method,
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          Accept: "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } finally {
      clearTimeout(timer);
    }

    const requestId = resp.headers.get("x-request-id");
    const text = await resp.text();
    const data = text.length > 0 ? safeJson(text) : undefined;

    if (!resp.ok) {
      const errBody = (data as { error?: { type?: string; message?: string; details?: unknown } } | undefined)?.error;
      throw new MailNowApiError({
        status: resp.status,
        type: errBody?.type ?? "http_error",
        message: errBody?.message ?? `${resp.status} ${resp.statusText}`,
        details: errBody?.details,
        requestId,
      });
    }
    return data as T;
  }
}

const enc = (s: string) => encodeURIComponent(s);
const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

// ---- webhook signature verification ----

/**
 * Verify the HMAC signature on an inbound webhook delivery.
 *
 * MailNowAPI signs every webhook POST body with HMAC-SHA256 using the
 * webhook's `signing_secret` (returned once on `POST /v1/webhooks`) and
 * sends the result in the `X-Webhook-Signature` header as `sha256=<hex>`.
 *
 * Use this on your webhook receiver before trusting the payload:
 *
 * ```ts
 * import { verifyWebhookSignature } from "@mailnowapi/sdk";
 *
 * app.post("/webhooks/email", async (req, res) => {
 *   const ok = verifyWebhookSignature({
 *     rawBody: req.rawBody,                    // un-parsed Buffer / string
 *     signature: req.headers["x-webhook-signature"],
 *     signingSecret: process.env.WEBHOOK_SECRET,
 *   });
 *   if (!ok) return res.status(401).send();
 *   // ...handle event
 * });
 * ```
 *
 * Implemented in pure JS using `globalThis.crypto.subtle` so it runs in Node
 * 20+, Cloudflare Workers, Bun, and Deno without imports.
 */
export async function verifyWebhookSignature(opts: {
  rawBody: string | Uint8Array;
  signature: string | null | undefined;
  signingSecret: string;
}): Promise<boolean> {
  if (!opts.signature) return false;
  const provided = opts.signature.startsWith("sha256=")
    ? opts.signature.slice("sha256=".length)
    : opts.signature;
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(opts.signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data: BufferSource =
    typeof opts.rawBody === "string"
      ? enc.encode(opts.rawBody)
      : (opts.rawBody.buffer.slice(
          opts.rawBody.byteOffset,
          opts.rawBody.byteOffset + opts.rawBody.byteLength,
        ) as ArrayBuffer);
  const sigBuf = await globalThis.crypto.subtle.sign("HMAC", key, data);
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqualHex(provided, expected);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
