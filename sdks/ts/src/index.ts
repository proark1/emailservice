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

// ---- type helpers ----

type Json<P, M extends keyof P, K extends "requestBody"> =
  P[M] extends { requestBody: { content: { "application/json": infer B } } } ? B : never;

type Body<Path extends keyof paths, M extends keyof paths[Path]> = Json<paths[Path], M, "requestBody">;

type Pagination = { cursor: string | null; has_more: boolean };
type ListResponse<T> = { data: T[]; pagination: Pagination };
type DataResponse<T> = { data: T };

// ---- handy aliases for consumers ----

export type Email = NonNullable<
  paths["/v1/emails/"]["post"]["responses"]["201"]["content"]["application/json"]["data"]
>;
export type SendEmailParams = Body<"/v1/emails/", "post">;
export type Domain = NonNullable<
  paths["/v1/domains/"]["post"]["responses"]["201"]["content"]["application/json"]["data"]
>;
export type Webhook = NonNullable<
  paths["/v1/webhooks/"]["post"]["responses"]["201"]["content"]["application/json"]["data"]
>;
export type ApiKey = NonNullable<
  paths["/v1/api-keys/"]["post"]["responses"]["201"]["content"]["application/json"]["data"]
>;

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

type CursorPage = { cursor?: string; limit?: number };

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
      this.req<DataResponse<Email>>("POST", "/v1/emails", body),
    list: (params?: CursorPage) =>
      this.req<ListResponse<Email>>("GET", "/v1/emails", undefined, params),
    get: (id: string) => this.req<DataResponse<Email>>("GET", `/v1/emails/${enc(id)}`),
    cancel: (id: string) => this.req<DataResponse<Email>>("DELETE", `/v1/emails/${enc(id)}`),
    sendBatch: (emails: SendEmailParams[]) =>
      this.req<DataResponse<{ ids: string[]; count: number }>>("POST", "/v1/emails/batch", { emails }),
  };

  readonly domains = {
    create: (body: Body<"/v1/domains/", "post">) =>
      this.req<DataResponse<Domain>>("POST", "/v1/domains", body),
    list: (params?: { unlinked?: boolean; company_id?: string }) =>
      this.req<DataResponse<Domain[]>>("GET", "/v1/domains", undefined, params),
    get: (id: string) => this.req<DataResponse<Domain>>("GET", `/v1/domains/${enc(id)}`),
    update: (id: string, body: Body<"/v1/domains/{id}", "patch">) =>
      this.req<DataResponse<Domain>>("PATCH", `/v1/domains/${enc(id)}`, body),
    delete: (id: string) => this.req<DataResponse<Domain>>("DELETE", `/v1/domains/${enc(id)}`),
    verify: (id: string) =>
      this.req<DataResponse<{ message: string }>>("POST", `/v1/domains/${enc(id)}/verify`),
  };

  readonly apiKeys = {
    create: (body: Body<"/v1/api-keys/", "post">) =>
      this.req<DataResponse<ApiKey & { key: string }>>("POST", "/v1/api-keys", body),
    list: () => this.req<DataResponse<ApiKey[]>>("GET", "/v1/api-keys"),
    revoke: (id: string) => this.req<DataResponse<ApiKey>>("DELETE", `/v1/api-keys/${enc(id)}`),
  };

  readonly webhooks = {
    create: (body: Body<"/v1/webhooks/", "post">) =>
      this.req<DataResponse<Webhook>>("POST", "/v1/webhooks", body),
    list: () => this.req<DataResponse<Webhook[]>>("GET", "/v1/webhooks"),
    get: (id: string) => this.req<DataResponse<Webhook>>("GET", `/v1/webhooks/${enc(id)}`),
    update: (id: string, body: Body<"/v1/webhooks/{id}", "patch">) =>
      this.req<DataResponse<Webhook>>("PATCH", `/v1/webhooks/${enc(id)}`, body),
    delete: (id: string) => this.req<DataResponse<Webhook>>("DELETE", `/v1/webhooks/${enc(id)}`),
    listDeliveries: (id: string, params?: CursorPage) =>
      this.req<unknown>("GET", `/v1/webhooks/${enc(id)}/deliveries`, undefined, params),
    replayDelivery: (id: string, deliveryId: string) =>
      this.req<unknown>("POST", `/v1/webhooks/${enc(id)}/deliveries/${enc(deliveryId)}/replay`),
    replayAll: (id: string, body?: Body<"/v1/webhooks/{id}/replay", "post">) =>
      this.req<unknown>("POST", `/v1/webhooks/${enc(id)}/replay`, body),
    listDeadLetters: (params?: CursorPage) =>
      this.req<unknown>("GET", "/v1/webhooks/dead-letters", undefined, params),
  };

  readonly audiences = {
    create: (body: Body<"/v1/audiences/", "post">) =>
      this.req<unknown>("POST", "/v1/audiences", body),
    list: (params?: CursorPage) => this.req<unknown>("GET", "/v1/audiences", undefined, params),
    get: (id: string) => this.req<unknown>("GET", `/v1/audiences/${enc(id)}`),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/audiences/${enc(id)}`),
    contacts: {
      create: (id: string, body: Body<"/v1/audiences/{id}/contacts", "post">) =>
        this.req<unknown>("POST", `/v1/audiences/${enc(id)}/contacts`, body),
      list: (id: string, params?: CursorPage) =>
        this.req<unknown>("GET", `/v1/audiences/${enc(id)}/contacts`, undefined, params),
      get: (id: string, contactId: string) =>
        this.req<unknown>("GET", `/v1/audiences/${enc(id)}/contacts/${enc(contactId)}`),
      update: (id: string, contactId: string, body: Body<"/v1/audiences/{id}/contacts/{contactId}", "patch">) =>
        this.req<unknown>("PATCH", `/v1/audiences/${enc(id)}/contacts/${enc(contactId)}`, body),
      delete: (id: string, contactId: string) =>
        this.req<unknown>("DELETE", `/v1/audiences/${enc(id)}/contacts/${enc(contactId)}`),
    },
    imports: {
      create: (id: string, body: Body<"/v1/audiences/{id}/imports", "post">) =>
        this.req<unknown>("POST", `/v1/audiences/${enc(id)}/imports`, body),
      get: (id: string, importId: string) =>
        this.req<unknown>("GET", `/v1/audiences/${enc(id)}/imports/${enc(importId)}`),
      confirm: (id: string, importId: string) =>
        this.req<unknown>("POST", `/v1/audiences/${enc(id)}/imports/${enc(importId)}/confirm`),
    },
    /** Returns the contacts CSV as a string. */
    exportContactsCsv: (id: string) =>
      this.reqText("GET", `/v1/audiences/${enc(id)}/export`),
  };

  readonly broadcasts = {
    create: (body: Body<"/v1/broadcasts/", "post">) =>
      this.req<unknown>("POST", "/v1/broadcasts", body),
    list: (params?: CursorPage) => this.req<unknown>("GET", "/v1/broadcasts", undefined, params),
    get: (id: string) => this.req<unknown>("GET", `/v1/broadcasts/${enc(id)}`),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/broadcasts/${enc(id)}`),
    listVariants: (id: string) => this.req<unknown>("GET", `/v1/broadcasts/${enc(id)}/variants`),
    selectWinner: (id: string, body: Body<"/v1/broadcasts/{id}/select-winner", "post">) =>
      this.req<unknown>("POST", `/v1/broadcasts/${enc(id)}/select-winner`, body),
  };

  readonly warmup = {
    create: (body: Body<"/v1/warmup/", "post">) =>
      this.req<unknown>("POST", "/v1/warmup", body),
    list: () => this.req<unknown>("GET", "/v1/warmup"),
    get: (id: string) => this.req<unknown>("GET", `/v1/warmup/${enc(id)}`),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/warmup/${enc(id)}`),
    stats: (id: string) => this.req<unknown>("GET", `/v1/warmup/${enc(id)}/stats`),
    pause: (id: string) => this.req<unknown>("POST", `/v1/warmup/${enc(id)}/pause`),
    resume: (id: string) => this.req<unknown>("POST", `/v1/warmup/${enc(id)}/resume`),
  };

  readonly templates = {
    create: (body: Body<"/v1/templates/", "post">) =>
      this.req<unknown>("POST", "/v1/templates", body),
    list: (params?: CursorPage) => this.req<unknown>("GET", "/v1/templates", undefined, params),
    get: (id: string) => this.req<unknown>("GET", `/v1/templates/${enc(id)}`),
    update: (id: string, body: Body<"/v1/templates/{id}", "patch">) =>
      this.req<unknown>("PATCH", `/v1/templates/${enc(id)}`, body),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/templates/${enc(id)}`),
  };

  readonly folders = {
    list: () => this.req<unknown>("GET", "/v1/folders"),
    create: (body: Body<"/v1/folders/", "post">) =>
      this.req<unknown>("POST", "/v1/folders", body),
    update: (id: string, body: Body<"/v1/folders/{id}", "patch">) =>
      this.req<unknown>("PATCH", `/v1/folders/${enc(id)}`, body),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/folders/${enc(id)}`),
  };

  readonly inbox = {
    list: (params?: CursorPage & { folder_id?: string; thread_id?: string }) =>
      this.req<unknown>("GET", "/v1/inbox", undefined, params),
    bulk: (body: Body<"/v1/inbox/bulk", "post">) =>
      this.req<unknown>("POST", "/v1/inbox/bulk", body),
    get: (id: string) => this.req<unknown>("GET", `/v1/inbox/${enc(id)}`),
    update: (id: string, body: Body<"/v1/inbox/{id}", "patch">) =>
      this.req<unknown>("PATCH", `/v1/inbox/${enc(id)}`, body),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/inbox/${enc(id)}`),
    move: (id: string, body: Body<"/v1/inbox/{id}/move", "post">) =>
      this.req<unknown>("POST", `/v1/inbox/${enc(id)}/move`, body),
    restore: (id: string) => this.req<unknown>("POST", `/v1/inbox/${enc(id)}/restore`),
    permanentDelete: (id: string) =>
      this.req<unknown>("DELETE", `/v1/inbox/${enc(id)}/permanent`),
    listAttachments: (id: string) =>
      this.req<unknown>("GET", `/v1/inbox/${enc(id)}/attachments`),
    /** Returns the raw attachment bytes as a Blob. */
    downloadAttachment: (id: string, attachmentId: string) =>
      this.reqBlob("GET", `/v1/inbox/${enc(id)}/attachments/${enc(attachmentId)}`),
  };

  readonly drafts = {
    list: (params?: CursorPage) => this.req<unknown>("GET", "/v1/drafts", undefined, params),
    create: (body: Body<"/v1/drafts/", "post">) =>
      this.req<unknown>("POST", "/v1/drafts", body),
    get: (id: string) => this.req<unknown>("GET", `/v1/drafts/${enc(id)}`),
    update: (id: string, body: Body<"/v1/drafts/{id}", "patch">) =>
      this.req<unknown>("PATCH", `/v1/drafts/${enc(id)}`, body),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/drafts/${enc(id)}`),
    send: (id: string) => this.req<unknown>("POST", `/v1/drafts/${enc(id)}/send`),
  };

  readonly threads = {
    list: (params?: CursorPage) => this.req<unknown>("GET", "/v1/threads", undefined, params),
    get: (threadId: string) => this.req<unknown>("GET", `/v1/threads/${enc(threadId)}`),
  };

  readonly signatures = {
    list: () => this.req<unknown>("GET", "/v1/signatures"),
    create: (body: Body<"/v1/signatures/", "post">) =>
      this.req<unknown>("POST", "/v1/signatures", body),
    get: (id: string) => this.req<unknown>("GET", `/v1/signatures/${enc(id)}`),
    update: (id: string, body: Body<"/v1/signatures/{id}", "patch">) =>
      this.req<unknown>("PATCH", `/v1/signatures/${enc(id)}`, body),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/signatures/${enc(id)}`),
  };

  readonly addressBook = {
    autocomplete: (params: { q: string; limit?: number }) =>
      this.req<unknown>("GET", "/v1/address-book/autocomplete", undefined, params),
    list: (params?: CursorPage & { q?: string }) =>
      this.req<unknown>("GET", "/v1/address-book", undefined, params),
    create: (body: Body<"/v1/address-book/", "post">) =>
      this.req<unknown>("POST", "/v1/address-book", body),
    get: (id: string) => this.req<unknown>("GET", `/v1/address-book/${enc(id)}`),
    update: (id: string, body: Body<"/v1/address-book/{id}", "patch">) =>
      this.req<unknown>("PATCH", `/v1/address-book/${enc(id)}`, body),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/address-book/${enc(id)}`),
  };

  readonly team = {
    listMembers: (domainId: string) =>
      this.req<unknown>("GET", `/v1/team/${enc(domainId)}/members`),
    addMember: (domainId: string, body: Body<"/v1/team/{domainId}/members", "post">) =>
      this.req<unknown>("POST", `/v1/team/${enc(domainId)}/members`, body),
    updateMember: (domainId: string, memberId: string, body: Body<"/v1/team/{domainId}/members/{memberId}", "patch">) =>
      this.req<unknown>("PATCH", `/v1/team/${enc(domainId)}/members/${enc(memberId)}`, body),
    removeMember: (domainId: string, memberId: string) =>
      this.req<unknown>("DELETE", `/v1/team/${enc(domainId)}/members/${enc(memberId)}`),
    listInvitations: (domainId: string) =>
      this.req<unknown>("GET", `/v1/team/${enc(domainId)}/invitations`),
    createInvitation: (domainId: string, body: Body<"/v1/team/{domainId}/invitations", "post">) =>
      this.req<unknown>("POST", `/v1/team/${enc(domainId)}/invitations`, body),
    revokeInvitation: (domainId: string, invitationId: string) =>
      this.req<unknown>("DELETE", `/v1/team/${enc(domainId)}/invitations/${enc(invitationId)}`),
    myMemberships: () => this.req<unknown>("GET", "/v1/team/my-memberships"),
  };

  readonly mailboxes = {
    listProviders: () => this.req<unknown>("GET", "/v1/mailboxes/providers"),
    create: (body: Body<"/v1/mailboxes/", "post">) =>
      this.req<unknown>("POST", "/v1/mailboxes", body),
    list: () => this.req<unknown>("GET", "/v1/mailboxes"),
    get: (id: string) => this.req<unknown>("GET", `/v1/mailboxes/${enc(id)}`),
    update: (id: string, body: Body<"/v1/mailboxes/{id}", "patch">) =>
      this.req<unknown>("PATCH", `/v1/mailboxes/${enc(id)}`, body),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/mailboxes/${enc(id)}`),
    test: (id: string) => this.req<unknown>("POST", `/v1/mailboxes/${enc(id)}/test`),
    sync: (id: string) => this.req<unknown>("POST", `/v1/mailboxes/${enc(id)}/sync`),
  };

  readonly sequences = {
    create: (body: Body<"/v1/sequences/", "post">) =>
      this.req<unknown>("POST", "/v1/sequences", body),
    list: (params?: CursorPage) =>
      this.req<unknown>("GET", "/v1/sequences", undefined, params),
    get: (id: string) => this.req<unknown>("GET", `/v1/sequences/${enc(id)}`),
    update: (id: string, body: Body<"/v1/sequences/{id}", "put">) =>
      this.req<unknown>("PUT", `/v1/sequences/${enc(id)}`, body),
    delete: (id: string) => this.req<unknown>("DELETE", `/v1/sequences/${enc(id)}`),
    activate: (id: string) => this.req<unknown>("POST", `/v1/sequences/${enc(id)}/activate`),
    pause: (id: string) => this.req<unknown>("POST", `/v1/sequences/${enc(id)}/pause`),
    enroll: (id: string, body: Body<"/v1/sequences/{id}/enroll", "post">) =>
      this.req<unknown>("POST", `/v1/sequences/${enc(id)}/enroll`, body),
    listEnrollments: (id: string, params?: CursorPage) =>
      this.req<unknown>("GET", `/v1/sequences/${enc(id)}/enrollments`, undefined, params),
    steps: {
      list: (id: string) => this.req<unknown>("GET", `/v1/sequences/${enc(id)}/steps`),
      create: (id: string, body: Body<"/v1/sequences/{id}/steps", "post">) =>
        this.req<unknown>("POST", `/v1/sequences/${enc(id)}/steps`, body),
      update: (id: string, stepId: string, body: Body<"/v1/sequences/{id}/steps/{stepId}", "put">) =>
        this.req<unknown>("PUT", `/v1/sequences/${enc(id)}/steps/${enc(stepId)}`, body),
      delete: (id: string, stepId: string) =>
        this.req<unknown>("DELETE", `/v1/sequences/${enc(id)}/steps/${enc(stepId)}`),
    },
  };

  readonly companies = {
    create: (body: Body<"/v1/companies/", "post">) =>
      this.req<unknown>("POST", "/v1/companies", body),
    list: () => this.req<unknown>("GET", "/v1/companies"),
    get: (companyId: string) => this.req<unknown>("GET", `/v1/companies/${enc(companyId)}`),
    update: (companyId: string, body: Body<"/v1/companies/{companyId}", "patch">) =>
      this.req<unknown>("PATCH", `/v1/companies/${enc(companyId)}`, body),
    delete: (companyId: string) =>
      this.req<unknown>("DELETE", `/v1/companies/${enc(companyId)}`),
    adoptDomains: (companyId: string, body: Body<"/v1/companies/{companyId}/adopt-domains", "post">) =>
      this.req<unknown>("POST", `/v1/companies/${enc(companyId)}/adopt-domains`, body),
    apiKeys: {
      create: (companyId: string, body: Body<"/v1/companies/{companyId}/api-keys", "post">) =>
        this.req<unknown>("POST", `/v1/companies/${enc(companyId)}/api-keys`, body),
      list: (companyId: string) =>
        this.req<unknown>("GET", `/v1/companies/${enc(companyId)}/api-keys`),
      revoke: (companyId: string, keyId: string) =>
        this.req<unknown>("DELETE", `/v1/companies/${enc(companyId)}/api-keys/${enc(keyId)}`),
    },
    domains: {
      create: (companyId: string, body: Body<"/v1/companies/{companyId}/domains", "post">) =>
        this.req<unknown>("POST", `/v1/companies/${enc(companyId)}/domains`, body),
      list: (companyId: string) =>
        this.req<unknown>("GET", `/v1/companies/${enc(companyId)}/domains`),
      unlink: (companyId: string, domainId: string) =>
        this.req<unknown>("DELETE", `/v1/companies/${enc(companyId)}/domains/${enc(domainId)}`),
    },
    members: {
      create: (companyId: string, body: Body<"/v1/companies/{companyId}/members", "post">) =>
        this.req<unknown>("POST", `/v1/companies/${enc(companyId)}/members`, body),
      list: (companyId: string) =>
        this.req<unknown>("GET", `/v1/companies/${enc(companyId)}/members`),
      get: (companyId: string, memberId: string) =>
        this.req<unknown>("GET", `/v1/companies/${enc(companyId)}/members/${enc(memberId)}`),
      update: (companyId: string, memberId: string, body: Body<"/v1/companies/{companyId}/members/{memberId}", "patch">) =>
        this.req<unknown>("PATCH", `/v1/companies/${enc(companyId)}/members/${enc(memberId)}`, body),
      remove: (companyId: string, memberId: string) =>
        this.req<unknown>("DELETE", `/v1/companies/${enc(companyId)}/members/${enc(memberId)}`),
    },
    mailboxes: {
      assign: (companyId: string, body: Body<"/v1/companies/{companyId}/mailboxes", "post">) =>
        this.req<unknown>("POST", `/v1/companies/${enc(companyId)}/mailboxes`, body),
      list: (companyId: string) =>
        this.req<unknown>("GET", `/v1/companies/${enc(companyId)}/mailboxes`),
      remove: (companyId: string, mailboxId: string) =>
        this.req<unknown>("DELETE", `/v1/companies/${enc(companyId)}/mailboxes/${enc(mailboxId)}`),
    },
  };

  readonly compat = {
    /** Drop-in compatibility shim for Resend's POST /emails. */
    resendSendEmail: (body: Body<"/v1/compat/resend/emails", "post">) =>
      this.req<unknown>("POST", "/v1/compat/resend/emails", body),
    /** Drop-in compatibility shim for Postmark's POST /email. */
    postmarkSendEmail: (body: Body<"/v1/compat/postmark/email", "post">) =>
      this.req<unknown>("POST", "/v1/compat/postmark/email", body),
  };

  readonly deliverability = {
    /** Run the deliverability linter on a draft message. */
    lint: (body: Body<"/v1/deliverability/lint", "post">) =>
      this.req<unknown>("POST", "/v1/deliverability/lint", body),
  };

  /**
   * Escape hatch for endpoints not (yet) covered by a typed namespace.
   * Returns whatever the API returns; callers cast as needed.
   */
  raw<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    query?: Query,
  ): Promise<T> {
    return this.req<T>(method, path, body, query);
  }

  // ----- internals -----

  /** @internal */ req<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    return this.requestJson<T>(method, path, body, query);
  }

  private async requestJson<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const resp = await this.fetchRaw(method, path, body, query);
    const text = await resp.text();
    const data = text.length > 0 ? safeJson(text) : undefined;
    if (!resp.ok) throw makeError(resp, data);
    return data as T;
  }

  private async reqText(method: string, path: string, body?: unknown, query?: Query): Promise<string> {
    const resp = await this.fetchRaw(method, path, body, query);
    if (!resp.ok) throw makeError(resp, await safeReadJson(resp));
    return resp.text();
  }

  private async reqBlob(method: string, path: string, body?: unknown, query?: Query): Promise<Blob> {
    const resp = await this.fetchRaw(method, path, body, query);
    if (!resp.ok) throw makeError(resp, await safeReadJson(resp));
    return resp.blob();
  }

  private async fetchRaw(method: string, path: string, body?: unknown, query?: Query): Promise<Response> {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
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
  }
}

type Query = Record<string, string | number | boolean | undefined>;

const enc = (s: string) => encodeURIComponent(s);
const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};
const safeReadJson = async (resp: Response): Promise<unknown> => {
  try {
    return await resp.clone().json();
  } catch {
    return undefined;
  }
};
const makeError = (resp: Response, data: unknown): MailNowApiError => {
  const errBody = (data as { error?: { type?: string; message?: string; details?: unknown } } | undefined)?.error;
  return new MailNowApiError({
    status: resp.status,
    type: errBody?.type ?? "http_error",
    message: errBody?.message ?? `${resp.status} ${resp.statusText}`,
    details: errBody?.details,
    requestId: resp.headers.get("x-request-id"),
  });
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
 *   const ok = await verifyWebhookSignature({
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
