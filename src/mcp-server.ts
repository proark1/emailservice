#!/usr/bin/env node
/**
 * MCP (Model Context Protocol) server for the email service.
 *
 * Exposes all email service features as MCP tools so AI agents can
 * send emails, manage domains, audiences, webhooks, suppressions,
 * and query analytics programmatically.
 *
 * Communicates with the running API server over HTTP using an API key.
 *
 * Environment variables:
 *   EMAIL_SERVICE_URL  — Base URL of the API (default: http://localhost:3000)
 *   EMAIL_SERVICE_API_KEY — API key (Bearer token, e.g. es_xxxx)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.EMAIL_SERVICE_URL ?? "http://localhost:3000";
const API_KEY = process.env.EMAIL_SERVICE_API_KEY ?? "";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

interface ApiResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    parsed = { message: await res.text() };
  }

  return { ok: res.ok, status: res.status, body: parsed };
}

function formatResult(res: ApiResponse): string {
  if (res.ok) {
    return JSON.stringify(res.body, null, 2);
  }
  return `Error ${res.status}: ${JSON.stringify(res.body, null, 2)}`;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "emailservice",
  version: "1.0.0",
});

// ---- Emails ----------------------------------------------------------------

server.tool(
  "send_email",
  "Send a single email. Requires a verified domain for the 'from' address.",
  {
    from: z.string().describe("Sender address, e.g. 'Name <email@domain.com>' or 'email@domain.com'"),
    to: z.array(z.string()).describe("Array of recipient email addresses (1-50)"),
    subject: z.string().describe("Email subject line"),
    html: z.string().optional().describe("HTML body"),
    text: z.string().optional().describe("Plain text body"),
    cc: z.array(z.string()).optional().describe("CC recipients"),
    bcc: z.array(z.string()).optional().describe("BCC recipients"),
    reply_to: z.array(z.string()).optional().describe("Reply-to addresses"),
    headers: z.record(z.string(), z.string()).optional().describe("Custom email headers"),
    tags: z.record(z.string(), z.string()).optional().describe("Tags for categorization"),
    scheduled_at: z.string().optional().describe("ISO 8601 datetime to schedule delivery (max 72h ahead)"),
    idempotency_key: z.string().optional().describe("Unique key for idempotent sends"),
  },
  async (params) => {
    const res = await api("POST", "/v1/emails", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "send_batch_emails",
  "Send up to 100 emails in a single batch request.",
  {
    emails: z.array(z.object({
      from: z.string(),
      to: z.array(z.string()),
      subject: z.string(),
      html: z.string().optional(),
      text: z.string().optional(),
      cc: z.array(z.string()).optional(),
      bcc: z.array(z.string()).optional(),
      reply_to: z.array(z.string()).optional(),
      headers: z.record(z.string(), z.string()).optional(),
      tags: z.record(z.string(), z.string()).optional(),
      scheduled_at: z.string().optional(),
      idempotency_key: z.string().optional(),
    })).describe("Array of email objects (1-100)"),
  },
  async (params) => {
    const res = await api("POST", "/v1/emails/batch", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_emails",
  "List sent emails with cursor-based pagination.",
  {
    cursor: z.string().optional().describe("Pagination cursor from previous response"),
    limit: z.number().optional().describe("Number of results per page (default 20, max 100)"),
  },
  async (params) => {
    const query = new URLSearchParams();
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    const res = await api("GET", `/v1/emails${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_email",
  "Get details of a specific email by ID.",
  {
    email_id: z.string().describe("Email UUID"),
  },
  async ({ email_id }) => {
    const res = await api("GET", `/v1/emails/${email_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "cancel_scheduled_email",
  "Cancel a scheduled email that has not yet been sent.",
  {
    email_id: z.string().describe("Email UUID to cancel"),
  },
  async ({ email_id }) => {
    const res = await api("DELETE", `/v1/emails/${email_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Domains ---------------------------------------------------------------

server.tool(
  "create_domain",
  "Register a new sending domain. Returns DNS records (SPF, DKIM, DMARC, MX) to configure.",
  {
    name: z.string().describe("Domain name, e.g. 'example.com'"),
  },
  async (params) => {
    const res = await api("POST", "/v1/domains", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_domains",
  "List all registered sending domains and their verification status.",
  {},
  async () => {
    const res = await api("GET", "/v1/domains");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_domain",
  "Get details and DNS records for a specific domain.",
  {
    domain_id: z.string().describe("Domain UUID"),
  },
  async ({ domain_id }) => {
    const res = await api("GET", `/v1/domains/${domain_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "verify_domain",
  "Trigger DNS verification for a domain. Checks SPF, DKIM, DMARC, and MX records.",
  {
    domain_id: z.string().describe("Domain UUID to verify"),
  },
  async ({ domain_id }) => {
    const res = await api("POST", `/v1/domains/${domain_id}/verify`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_domain",
  "Delete a sending domain.",
  {
    domain_id: z.string().describe("Domain UUID to delete"),
  },
  async ({ domain_id }) => {
    const res = await api("DELETE", `/v1/domains/${domain_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- API Keys --------------------------------------------------------------

server.tool(
  "create_api_key",
  "Create a new API key. The full key is only returned once upon creation.",
  {
    name: z.string().describe("Descriptive name for the API key"),
    permissions: z.record(z.string(), z.boolean()).optional().describe("Permission map"),
    expires_at: z.string().optional().describe("ISO 8601 expiration date"),
    rate_limit: z.number().optional().describe("Requests per minute (1-10000, default 60)"),
  },
  async (params) => {
    const res = await api("POST", "/v1/api-keys", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_api_keys",
  "List all active API keys (key values are masked).",
  {},
  async () => {
    const res = await api("GET", "/v1/api-keys");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "revoke_api_key",
  "Revoke an API key, permanently disabling it.",
  {
    api_key_id: z.string().describe("API key UUID to revoke"),
  },
  async ({ api_key_id }) => {
    const res = await api("DELETE", `/v1/api-keys/${api_key_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Webhooks --------------------------------------------------------------

server.tool(
  "create_webhook",
  "Create a webhook subscription for email/domain/contact events.",
  {
    url: z.string().describe("HTTPS URL to receive webhook POSTs"),
    events: z.array(z.string()).describe(
      "Event types to subscribe to. Options: email.sent, email.delivered, email.bounced, " +
      "email.soft_bounced, email.opened, email.clicked, email.complained, email.failed, " +
      "email.received, domain.verified, contact.created, contact.updated, contact.deleted",
    ),
  },
  async (params) => {
    const res = await api("POST", "/v1/webhooks", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_webhooks",
  "List all webhook subscriptions.",
  {},
  async () => {
    const res = await api("GET", "/v1/webhooks");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_webhook",
  "Get details of a specific webhook subscription.",
  {
    webhook_id: z.string().describe("Webhook UUID"),
  },
  async ({ webhook_id }) => {
    const res = await api("GET", `/v1/webhooks/${webhook_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_webhook",
  "Update a webhook's URL, events, or active status.",
  {
    webhook_id: z.string().describe("Webhook UUID to update"),
    url: z.string().optional().describe("New webhook URL"),
    events: z.array(z.string()).optional().describe("New event types to subscribe to"),
    active: z.boolean().optional().describe("Enable or disable the webhook"),
  },
  async ({ webhook_id, ...body }) => {
    const res = await api("PATCH", `/v1/webhooks/${webhook_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_webhook",
  "Delete a webhook subscription.",
  {
    webhook_id: z.string().describe("Webhook UUID to delete"),
  },
  async ({ webhook_id }) => {
    const res = await api("DELETE", `/v1/webhooks/${webhook_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_webhook_deliveries",
  "List delivery attempts for a webhook, including status codes and timestamps.",
  {
    webhook_id: z.string().describe("Webhook UUID"),
  },
  async ({ webhook_id }) => {
    const res = await api("GET", `/v1/webhooks/${webhook_id}/deliveries`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Audiences & Contacts --------------------------------------------------

server.tool(
  "create_audience",
  "Create a new audience (contact list) for organizing recipients.",
  {
    name: z.string().describe("Audience name"),
  },
  async (params) => {
    const res = await api("POST", "/v1/audiences", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_audiences",
  "List all audiences.",
  {},
  async () => {
    const res = await api("GET", "/v1/audiences");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_audience",
  "Get details of a specific audience.",
  {
    audience_id: z.string().describe("Audience UUID"),
  },
  async ({ audience_id }) => {
    const res = await api("GET", `/v1/audiences/${audience_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_audience",
  "Delete an audience and all its contacts.",
  {
    audience_id: z.string().describe("Audience UUID to delete"),
  },
  async ({ audience_id }) => {
    const res = await api("DELETE", `/v1/audiences/${audience_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "add_contact",
  "Add a contact to an audience.",
  {
    audience_id: z.string().describe("Audience UUID"),
    email: z.string().describe("Contact email address"),
    first_name: z.string().optional().describe("First name"),
    last_name: z.string().optional().describe("Last name"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Custom metadata key-value pairs"),
    subscribed: z.boolean().optional().describe("Subscription status (default: true)"),
  },
  async ({ audience_id, ...body }) => {
    const res = await api("POST", `/v1/audiences/${audience_id}/contacts`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_contacts",
  "List all contacts in an audience.",
  {
    audience_id: z.string().describe("Audience UUID"),
  },
  async ({ audience_id }) => {
    const res = await api("GET", `/v1/audiences/${audience_id}/contacts`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_contact",
  "Get details of a specific contact.",
  {
    audience_id: z.string().describe("Audience UUID"),
    contact_id: z.string().describe("Contact UUID"),
  },
  async ({ audience_id, contact_id }) => {
    const res = await api("GET", `/v1/audiences/${audience_id}/contacts/${contact_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_contact",
  "Update a contact's name, metadata, or subscription status.",
  {
    audience_id: z.string().describe("Audience UUID"),
    contact_id: z.string().describe("Contact UUID"),
    first_name: z.string().optional().describe("Updated first name"),
    last_name: z.string().optional().describe("Updated last name"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Updated metadata"),
    subscribed: z.boolean().optional().describe("Updated subscription status"),
  },
  async ({ audience_id, contact_id, ...body }) => {
    const res = await api("PATCH", `/v1/audiences/${audience_id}/contacts/${contact_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_contact",
  "Remove a contact from an audience.",
  {
    audience_id: z.string().describe("Audience UUID"),
    contact_id: z.string().describe("Contact UUID"),
  },
  async ({ audience_id, contact_id }) => {
    const res = await api("DELETE", `/v1/audiences/${audience_id}/contacts/${contact_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Suppressions ----------------------------------------------------------

server.tool(
  "list_suppressions",
  "List all suppressed email addresses (bounces, complaints, manual blocks).",
  {},
  async () => {
    const res = await api("GET", "/v1/suppressions");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "add_suppression",
  "Add an email address to the suppression list to prevent sending.",
  {
    email: z.string().describe("Email address to suppress"),
    reason: z.enum(["bounce", "complaint", "unsubscribe", "manual"]).optional()
      .describe("Reason for suppression (default: manual)"),
  },
  async (params) => {
    const res = await api("POST", "/v1/suppressions", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "remove_suppression",
  "Remove an email address from the suppression list.",
  {
    suppression_id: z.string().describe("Suppression UUID to remove"),
  },
  async ({ suppression_id }) => {
    const res = await api("DELETE", `/v1/suppressions/${suppression_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Broadcasts ------------------------------------------------------------

server.tool(
  "create_broadcast",
  "Send an email to all subscribed contacts in an audience (bulk/campaign send).",
  {
    audience_id: z.string().describe("Audience UUID to send to"),
    name: z.string().describe("Campaign/broadcast name"),
    from: z.string().describe("Sender address, e.g. 'Name <email@domain.com>'"),
    subject: z.string().describe("Email subject line"),
    html: z.string().optional().describe("HTML body"),
    text: z.string().optional().describe("Plain text body"),
    reply_to: z.array(z.string()).optional().describe("Reply-to addresses"),
    headers: z.record(z.string(), z.string()).optional().describe("Custom headers"),
    tags: z.record(z.string(), z.string()).optional().describe("Tags for categorization"),
    scheduled_at: z.string().optional().describe("ISO 8601 datetime to schedule (max 72h ahead)"),
  },
  async (params) => {
    const res = await api("POST", "/v1/broadcasts", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_broadcasts",
  "List all broadcasts/campaigns sent from this account.",
  {},
  async () => {
    const res = await api("GET", "/v1/broadcasts");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_broadcast",
  "Get details and delivery stats for a specific broadcast.",
  {
    broadcast_id: z.string().describe("Broadcast UUID"),
  },
  async ({ broadcast_id }) => {
    const res = await api("GET", `/v1/broadcasts/${broadcast_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_broadcast",
  "Delete a broadcast (only if not currently sending).",
  {
    broadcast_id: z.string().describe("Broadcast UUID to delete"),
  },
  async ({ broadcast_id }) => {
    const res = await api("DELETE", `/v1/broadcasts/${broadcast_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Analytics -------------------------------------------------------------

server.tool(
  "get_analytics",
  "Get email analytics: sent, delivered, bounced, opened, clicked counts with optional date range.",
  {
    start_date: z.string().optional().describe("Start date (ISO 8601)"),
    end_date: z.string().optional().describe("End date (ISO 8601)"),
  },
  async (params) => {
    const query = new URLSearchParams();
    if (params.start_date) query.set("start_date", params.start_date);
    if (params.end_date) query.set("end_date", params.end_date);
    const qs = query.toString();
    const res = await api("GET", `/v1/analytics${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  if (!API_KEY) {
    console.error(
      "Warning: EMAIL_SERVICE_API_KEY is not set. All API calls will fail with 401.\n" +
      "Set it to your API key (e.g. es_xxxx) before starting the MCP server.",
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server fatal error:", err);
  process.exit(1);
});
