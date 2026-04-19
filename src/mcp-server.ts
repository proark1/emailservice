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
  const text = await res.text();
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { message: text };
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
  name: "mailnowapi",
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
  "Register a domain for sending and/or receiving email. Returns DNS records needed based on mode.",
  {
    name: z.string().describe("Domain name, e.g. 'example.com'"),
    mode: z.enum(["send", "receive", "both"]).optional().describe("Domain mode: 'send' (outbound only), 'receive' (inbound only), or 'both' (default)"),
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

// ---- Templates -------------------------------------------------------------

server.tool(
  "create_template",
  "Create a reusable email template with {{variable}} placeholders.",
  {
    name: z.string().describe("Template name"),
    subject: z.string().optional().describe("Subject line (supports {{variables}})"),
    html: z.string().optional().describe("HTML body (supports {{variables}})"),
    text: z.string().optional().describe("Plain text body (supports {{variables}})"),
  },
  async (params) => {
    const res = await api("POST", "/v1/templates", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_templates",
  "List all email templates.",
  {},
  async () => {
    const res = await api("GET", "/v1/templates");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_template",
  "Get a specific email template by ID.",
  {
    template_id: z.string().describe("Template UUID"),
  },
  async ({ template_id }) => {
    const res = await api("GET", `/v1/templates/${template_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_template",
  "Update an email template.",
  {
    template_id: z.string().describe("Template UUID"),
    name: z.string().optional().describe("Updated name"),
    subject: z.string().optional().describe("Updated subject"),
    html: z.string().optional().describe("Updated HTML body"),
    text: z.string().optional().describe("Updated text body"),
  },
  async ({ template_id, ...body }) => {
    const res = await api("PATCH", `/v1/templates/${template_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_template",
  "Delete an email template.",
  {
    template_id: z.string().describe("Template UUID to delete"),
  },
  async ({ template_id }) => {
    const res = await api("DELETE", `/v1/templates/${template_id}`);
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

// ---- Warmup ----------------------------------------------------------------

server.tool(
  "start_warmup",
  "Start email warmup for a domain to build sender reputation. Sends Mon–Fri, ramps up volume, auto-detects inbox placement, and holds the ramp if open rate drops below 10%.",
  {
    domain_id: z.string().describe("Domain UUID to warm up"),
    total_days: z.number().optional().describe("Warmup duration in days (7-90, default 30)"),
    from_address: z.string().optional().describe("From address for warmup emails — use your real production sending address (e.g. 'newsletter@yourdomain.com'). Accepts display name format: 'Name <email@domain.com>'. Default: noreply@yourdomain.com"),
    extra_recipients: z.array(z.string().email()).max(20).optional().describe("Optional external email addresses to include in the warmup pool (e.g. a personal Gmail or Yahoo account). These broaden the reputation signal beyond your own MX and test real-world inbox placement."),
  },
  async (params) => {
    const res = await api("POST", "/v1/warmup", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_warmups",
  "List all warmup schedules for the account.",
  {},
  async () => {
    const res = await api("GET", "/v1/warmup");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_warmup",
  "Get details of a specific warmup schedule.",
  {
    warmup_id: z.string().describe("Warmup schedule UUID"),
  },
  async ({ warmup_id }) => {
    const res = await api("GET", `/v1/warmup/${warmup_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_warmup_stats",
  "Get detailed warmup statistics with daily breakdown of sends, opens, replies, and inbox placement.",
  {
    warmup_id: z.string().describe("Warmup schedule UUID"),
  },
  async ({ warmup_id }) => {
    const res = await api("GET", `/v1/warmup/${warmup_id}/stats`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "pause_warmup",
  "Pause an active warmup schedule.",
  {
    warmup_id: z.string().describe("Warmup schedule UUID to pause"),
  },
  async ({ warmup_id }) => {
    const res = await api("POST", `/v1/warmup/${warmup_id}/pause`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "resume_warmup",
  "Resume a paused warmup schedule.",
  {
    warmup_id: z.string().describe("Warmup schedule UUID to resume"),
  },
  async ({ warmup_id }) => {
    const res = await api("POST", `/v1/warmup/${warmup_id}/resume`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "cancel_warmup",
  "Cancel a warmup schedule permanently.",
  {
    warmup_id: z.string().describe("Warmup schedule UUID to cancel"),
  },
  async ({ warmup_id }) => {
    const res = await api("DELETE", `/v1/warmup/${warmup_id}`);
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

// ---- Email Validation ------------------------------------------------------

import dns from "node:dns";

server.tool(
  "validate_email",
  "Validate an email address by checking syntax and verifying MX records exist for the domain.",
  {
    email: z.string().describe("Email address to validate"),
  },
  async ({ email }) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const syntaxOk = emailRegex.test(email);
    const domain = email.includes("@") ? email.split("@")[1] : "";

    let mxFound = false;
    if (syntaxOk && domain) {
      try {
        const records = await dns.promises.resolveMx(domain);
        mxFound = records.length > 0;
      } catch {
        // DNS resolution failed — no MX records
      }
    }

    const result = {
      valid: syntaxOk && mxFound,
      syntax_ok: syntaxOk,
      mx_found: mxFound,
      domain,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---- Folders ----------------------------------------------------------------

server.tool(
  "list_folders",
  "List all email folders with unread counts.",
  {},
  async () => {
    const res = await api("GET", "/v1/folders");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "create_folder",
  "Create a new custom email folder.",
  {
    name: z.string().describe("Folder name"),
  },
  async (params) => {
    const res = await api("POST", "/v1/folders", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_folder",
  "Update a custom folder's name or position.",
  {
    folder_id: z.string().describe("Folder ID"),
    name: z.string().optional().describe("New folder name"),
    position: z.number().optional().describe("New position"),
  },
  async (params) => {
    const { folder_id, ...body } = params;
    const res = await api("PATCH", `/v1/folders/${folder_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_folder",
  "Delete a custom folder. Emails in it are moved to Inbox.",
  {
    folder_id: z.string().describe("Folder ID"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/folders/${params.folder_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Inbox ------------------------------------------------------------------

server.tool(
  "list_inbox",
  "List inbound emails with optional folder, search, and filter parameters.",
  {
    folder_id: z.string().optional().describe("Filter by folder ID"),
    folder_slug: z.string().optional().describe("Filter by folder slug (inbox, sent, trash, spam, archive)"),
    thread_id: z.string().optional().describe("Filter by thread ID"),
    search: z.string().optional().describe("Search in subject, from address, and from name"),
    is_read: z.enum(["true", "false"]).optional().describe("Filter by read status"),
    is_starred: z.enum(["true", "false"]).optional().describe("Filter by starred status"),
    limit: z.number().optional().describe("Max results (1-100, default 50)"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async (params) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) query.set(k, String(v));
    }
    const res = await api("GET", `/v1/inbox?${query}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_inbox_email",
  "Get a single inbound email by ID.",
  {
    email_id: z.string().describe("Inbound email ID"),
  },
  async (params) => {
    const res = await api("GET", `/v1/inbox/${params.email_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_inbox_email",
  "Update an inbound email's read or starred status.",
  {
    email_id: z.string().describe("Inbound email ID"),
    is_read: z.boolean().optional().describe("Mark as read/unread"),
    is_starred: z.boolean().optional().describe("Star/unstar"),
  },
  async (params) => {
    const { email_id, ...body } = params;
    const res = await api("PATCH", `/v1/inbox/${email_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "move_email_to_folder",
  "Move an inbound email to a different folder.",
  {
    email_id: z.string().describe("Inbound email ID"),
    folder_id: z.string().describe("Target folder ID"),
  },
  async (params) => {
    const res = await api("POST", `/v1/inbox/${params.email_id}/move`, { folder_id: params.folder_id });
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_inbox_email",
  "Soft-delete an inbound email (move to trash).",
  {
    email_id: z.string().describe("Inbound email ID"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/inbox/${params.email_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "restore_inbox_email",
  "Restore an email from trash back to inbox.",
  {
    email_id: z.string().describe("Inbound email ID"),
  },
  async (params) => {
    const res = await api("POST", `/v1/inbox/${params.email_id}/restore`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "bulk_inbox_action",
  "Perform a bulk action on multiple inbound emails.",
  {
    ids: z.array(z.string()).describe("Array of email IDs (1-100)"),
    action: z.enum(["mark_read", "mark_unread", "star", "unstar", "move_to_folder", "move_to_trash", "permanent_delete"]).describe("Action to perform"),
    folder_id: z.string().optional().describe("Target folder ID (required for move_to_folder)"),
  },
  async (params) => {
    const res = await api("POST", "/v1/inbox/bulk", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_email_attachments",
  "List attachments for an inbound email.",
  {
    email_id: z.string().describe("Inbound email ID"),
  },
  async (params) => {
    const res = await api("GET", `/v1/inbox/${params.email_id}/attachments`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Drafts -----------------------------------------------------------------

server.tool(
  "save_draft",
  "Save a new email draft.",
  {
    from: z.string().optional().describe("Sender address"),
    to: z.array(z.string()).optional().describe("Recipient addresses"),
    subject: z.string().optional().describe("Subject line"),
    html: z.string().optional().describe("HTML body"),
    text: z.string().optional().describe("Plain text body"),
    cc: z.array(z.string()).optional().describe("CC recipients"),
    bcc: z.array(z.string()).optional().describe("BCC recipients"),
    in_reply_to: z.string().optional().describe("Message-ID being replied to"),
    references: z.array(z.string()).optional().describe("References header chain"),
  },
  async (params) => {
    const res = await api("POST", "/v1/drafts", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_draft",
  "Update an existing email draft.",
  {
    draft_id: z.string().describe("Draft ID"),
    from: z.string().optional().describe("Sender address"),
    to: z.array(z.string()).optional().describe("Recipient addresses"),
    subject: z.string().optional().describe("Subject line"),
    html: z.string().optional().describe("HTML body"),
    text: z.string().optional().describe("Plain text body"),
  },
  async (params) => {
    const { draft_id, ...body } = params;
    const res = await api("PATCH", `/v1/drafts/${draft_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_drafts",
  "List all email drafts.",
  {
    limit: z.number().optional().describe("Max results (1-100, default 50)"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async (params) => {
    const query = new URLSearchParams();
    if (params.limit) query.set("limit", String(params.limit));
    if (params.cursor) query.set("cursor", params.cursor);
    const res = await api("GET", `/v1/drafts?${query}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "send_draft",
  "Send an existing draft email.",
  {
    draft_id: z.string().describe("Draft ID to send"),
  },
  async (params) => {
    const res = await api("POST", `/v1/drafts/${params.draft_id}/send`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_draft",
  "Permanently delete a draft.",
  {
    draft_id: z.string().describe("Draft ID"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/drafts/${params.draft_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Threads ----------------------------------------------------------------

server.tool(
  "list_threads",
  "List email conversation threads.",
  {
    folder_id: z.string().optional().describe("Filter by folder ID"),
    limit: z.number().optional().describe("Max results (1-100, default 50)"),
    cursor: z.string().optional().describe("Pagination cursor"),
  },
  async (params) => {
    const query = new URLSearchParams();
    if (params.folder_id) query.set("folder_id", params.folder_id);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.cursor) query.set("cursor", params.cursor);
    const res = await api("GET", `/v1/threads?${query}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_thread",
  "Get all messages in a conversation thread.",
  {
    thread_id: z.string().describe("Thread ID"),
  },
  async (params) => {
    const res = await api("GET", `/v1/threads/${encodeURIComponent(params.thread_id)}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Signatures -------------------------------------------------------------

server.tool(
  "list_signatures",
  "List all email signatures.",
  {},
  async () => {
    const res = await api("GET", "/v1/signatures");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "create_signature",
  "Create a new email signature.",
  {
    name: z.string().describe("Signature name"),
    html_body: z.string().describe("HTML content of the signature"),
    text_body: z.string().optional().describe("Plain text version"),
    is_default: z.boolean().optional().describe("Set as default signature"),
  },
  async (params) => {
    const res = await api("POST", "/v1/signatures", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_signature",
  "Update an email signature.",
  {
    signature_id: z.string().describe("Signature ID"),
    name: z.string().optional().describe("Signature name"),
    html_body: z.string().optional().describe("HTML content"),
    text_body: z.string().optional().describe("Plain text version"),
    is_default: z.boolean().optional().describe("Set as default"),
  },
  async (params) => {
    const { signature_id, ...body } = params;
    const res = await api("PATCH", `/v1/signatures/${signature_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_signature",
  "Delete an email signature.",
  {
    signature_id: z.string().describe("Signature ID"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/signatures/${params.signature_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Address Book -----------------------------------------------------------

server.tool(
  "list_address_book",
  "List personal address book contacts.",
  {
    search: z.string().optional().describe("Search by name, email, or company"),
  },
  async (params) => {
    const query = params.search ? `?search=${encodeURIComponent(params.search)}` : "";
    const res = await api("GET", `/v1/address-book${query}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "add_address_book_contact",
  "Add a new contact to the address book.",
  {
    email: z.string().describe("Contact email"),
    name: z.string().optional().describe("Contact name"),
    company: z.string().optional().describe("Company name"),
    notes: z.string().optional().describe("Notes"),
  },
  async (params) => {
    const res = await api("POST", "/v1/address-book", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_address_book_contact",
  "Update an address book contact.",
  {
    contact_id: z.string().describe("Contact ID"),
    email: z.string().optional().describe("Contact email"),
    name: z.string().optional().describe("Contact name"),
    company: z.string().optional().describe("Company name"),
    notes: z.string().optional().describe("Notes"),
  },
  async (params) => {
    const { contact_id, ...body } = params;
    const res = await api("PATCH", `/v1/address-book/${contact_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_address_book_contact",
  "Delete a contact from the address book.",
  {
    contact_id: z.string().describe("Contact ID"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/address-book/${params.contact_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "autocomplete_contacts",
  "Autocomplete email addresses from address book and recent senders.",
  {
    query: z.string().describe("Search query (min 1 character)"),
  },
  async (params) => {
    const res = await api("GET", `/v1/address-book/autocomplete?q=${encodeURIComponent(params.query)}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "reply_to_email",
  "Reply to an inbound email with proper threading headers.",
  {
    email_id: z.string().describe("Inbound email ID to reply to"),
    from: z.string().describe("Sender address"),
    html: z.string().optional().describe("HTML body"),
    text: z.string().optional().describe("Plain text body"),
    reply_all: z.boolean().optional().describe("Reply to all recipients (default: false)"),
    signature_id: z.string().optional().describe("Signature ID to append"),
  },
  async (params) => {
    // Get the original email first
    const original = await api("GET", `/v1/inbox/${params.email_id}`);
    if (!original.ok) return { content: [{ type: "text" as const, text: formatResult(original) }] };
    const email = (original.body as any)?.data;
    if (!email) return { content: [{ type: "text" as const, text: "Error: Email not found" }] };

    const to = params.reply_all
      ? [email.from, ...(email.cc || [])].filter((a: string) => a !== params.from)
      : [email.from];
    const refs = [...(email.references || [])];
    if (email.message_id && !refs.includes(email.message_id)) refs.push(email.message_id);

    const res = await api("POST", "/v1/emails", {
      from: params.from,
      to,
      subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
      html: params.html,
      text: params.text,
      in_reply_to: email.message_id,
      references: refs,
      signature_id: params.signature_id,
    });
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "forward_email",
  "Forward an inbound email to new recipients.",
  {
    email_id: z.string().describe("Inbound email ID to forward"),
    from: z.string().describe("Sender address"),
    to: z.array(z.string()).describe("Forward recipients"),
    html: z.string().optional().describe("Additional message (prepended to forwarded content)"),
    text: z.string().optional().describe("Additional plain text message"),
    signature_id: z.string().optional().describe("Signature ID to append"),
  },
  async (params) => {
    const original = await api("GET", `/v1/inbox/${params.email_id}`);
    if (!original.ok) return { content: [{ type: "text" as const, text: formatResult(original) }] };
    const email = (original.body as any)?.data;
    if (!email) return { content: [{ type: "text" as const, text: "Error: Email not found" }] };

    const fwdHtml = `${params.html || ""}<br/><hr/><p><b>---------- Forwarded message ----------</b><br/>From: ${email.from}<br/>Date: ${email.created_at}<br/>Subject: ${email.subject}<br/>To: ${email.to}</p>${email.html_body || email.text_body || ""}`;

    const res = await api("POST", "/v1/emails", {
      from: params.from,
      to: params.to,
      subject: email.subject.startsWith("Fwd:") ? email.subject : `Fwd: ${email.subject}`,
      html: fwdHtml,
      text: params.text,
      signature_id: params.signature_id,
    });
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Team Management --------------------------------------------------------

server.tool(
  "list_domain_members",
  "List all members of a domain.",
  {
    domain_id: z.string().describe("Domain ID"),
  },
  async (params) => {
    const res = await api("GET", `/v1/team/${params.domain_id}/members`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "add_domain_member",
  "Add a member to a domain or send an invitation if they don't have an account.",
  {
    domain_id: z.string().describe("Domain ID"),
    email: z.string().describe("Member's email address"),
    role: z.enum(["admin", "member"]).describe("Role: admin (can manage members) or member (send/receive only)"),
    mailboxes: z.array(z.string()).optional().describe("Specific mailbox addresses this member can use (null = all)"),
  },
  async (params) => {
    const { domain_id, ...body } = params;
    const res = await api("POST", `/v1/team/${domain_id}/members`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_domain_member",
  "Update a domain member's role or mailbox permissions.",
  {
    domain_id: z.string().describe("Domain ID"),
    member_id: z.string().describe("Member ID"),
    role: z.enum(["admin", "member"]).optional().describe("New role"),
    mailboxes: z.array(z.string()).optional().describe("Updated mailbox restrictions"),
  },
  async (params) => {
    const { domain_id, member_id, ...body } = params;
    const res = await api("PATCH", `/v1/team/${domain_id}/members/${member_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "remove_domain_member",
  "Remove a member from a domain.",
  {
    domain_id: z.string().describe("Domain ID"),
    member_id: z.string().describe("Member ID"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/team/${params.domain_id}/members/${params.member_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_domain_invitations",
  "List pending invitations for a domain.",
  {
    domain_id: z.string().describe("Domain ID"),
  },
  async (params) => {
    const res = await api("GET", `/v1/team/${params.domain_id}/invitations`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "create_domain_invitation",
  "Create an invitation for someone to join a domain.",
  {
    domain_id: z.string().describe("Domain ID"),
    email: z.string().describe("Invitee's email address"),
    role: z.enum(["admin", "member"]).describe("Role to assign"),
    mailboxes: z.array(z.string()).optional().describe("Specific mailbox addresses"),
  },
  async (params) => {
    const { domain_id, ...body } = params;
    const res = await api("POST", `/v1/team/${domain_id}/invitations`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "revoke_domain_invitation",
  "Revoke a pending domain invitation.",
  {
    domain_id: z.string().describe("Domain ID"),
    invitation_id: z.string().describe("Invitation ID"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/team/${params.domain_id}/invitations/${params.invitation_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

// ---- Companies --------------------------------------------------------------
// A "company" is a tenant that owns domains and provisions email handles for
// its members. The external platform typically uses a company-scoped API key
// to call these tools on behalf of one company.

server.tool(
  "create_company",
  "Create a new company. Requires a user-level API key (not a company-scoped key).",
  {
    name: z.string().describe("Company display name"),
    slug: z.string().describe("URL-safe slug, unique across the service"),
  },
  async (params) => {
    const res = await api("POST", "/v1/companies", params);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_companies",
  "List companies the caller has access to.",
  {},
  async () => {
    const res = await api("GET", "/v1/companies");
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_company",
  "Fetch a single company by ID.",
  { company_id: z.string().describe("Company ID") },
  async (params) => {
    const res = await api("GET", `/v1/companies/${params.company_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_company",
  "Update a company's display name.",
  {
    company_id: z.string().describe("Company ID"),
    name: z.string().optional().describe("New name"),
  },
  async (params) => {
    const { company_id, ...body } = params;
    const res = await api("PATCH", `/v1/companies/${company_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "delete_company",
  "Delete a company. Unlinks its domains first (they survive).",
  { company_id: z.string().describe("Company ID") },
  async (params) => {
    const res = await api("DELETE", `/v1/companies/${params.company_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "create_company_api_key",
  "Mint a new company-scoped API key. The raw key is returned once — store it safely.",
  {
    company_id: z.string().describe("Company ID"),
    name: z.string().describe("Human-readable key name"),
    rate_limit: z.number().int().optional().describe("Requests per minute (default 60)"),
    expires_at: z.string().optional().describe("ISO timestamp; omit for a non-expiring key"),
  },
  async (params) => {
    const { company_id, ...body } = params;
    const res = await api("POST", `/v1/companies/${company_id}/api-keys`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_company_api_keys",
  "List active API keys for a company.",
  { company_id: z.string().describe("Company ID") },
  async (params) => {
    const res = await api("GET", `/v1/companies/${params.company_id}/api-keys`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "revoke_company_api_key",
  "Revoke a company API key.",
  {
    company_id: z.string().describe("Company ID"),
    key_id: z.string().describe("API key ID"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/companies/${params.company_id}/api-keys/${params.key_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "link_company_domain",
  "Link an existing verified domain to a company. The caller must own the domain.",
  {
    company_id: z.string().describe("Company ID"),
    domain_id: z.string().describe("Domain ID to link"),
  },
  async (params) => {
    const { company_id, domain_id } = params;
    const res = await api("POST", `/v1/companies/${company_id}/domains`, { domain_id });
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_company_domains",
  "List domains currently linked to a company.",
  { company_id: z.string().describe("Company ID") },
  async (params) => {
    const res = await api("GET", `/v1/companies/${params.company_id}/domains`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "unlink_company_domain",
  "Unlink a domain from a company (returns it to standalone ownership).",
  {
    company_id: z.string().describe("Company ID"),
    domain_id: z.string().describe("Domain ID to unlink"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/companies/${params.company_id}/domains/${params.domain_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "provision_company_member",
  "Create (or attach) a member account on a company. Optionally assigns an email handle and issues a per-member API key in the same call.",
  {
    company_id: z.string().describe("Company ID"),
    email: z.string().describe("Member's email address (used for login)"),
    name: z.string().describe("Member's display name"),
    role: z.enum(["admin", "member"]).default("member").describe("Company role"),
    password: z.string().optional().describe("Optional password; if omitted a random one is generated and emailed"),
    domain_id: z.string().optional().describe("Domain ID (when assigning a handle)"),
    local_part: z.string().optional().describe("Local part of the member's handle, e.g. \"alice\""),
    issue_api_key: z.boolean().default(false).describe("Mint a per-member API key and return it once"),
    api_key_name: z.string().optional().describe("Name for the issued API key"),
  },
  async (params) => {
    const { company_id, ...body } = params;
    const res = await api("POST", `/v1/companies/${company_id}/members`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_company_members",
  "List members of a company.",
  { company_id: z.string().describe("Company ID") },
  async (params) => {
    const res = await api("GET", `/v1/companies/${params.company_id}/members`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "get_company_member",
  "Fetch a single company member.",
  {
    company_id: z.string().describe("Company ID"),
    member_id: z.string().describe("Member ID"),
  },
  async (params) => {
    const res = await api("GET", `/v1/companies/${params.company_id}/members/${params.member_id}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "update_company_member",
  "Update a company member's role or display name.",
  {
    company_id: z.string().describe("Company ID"),
    member_id: z.string().describe("Member ID"),
    role: z.enum(["admin", "member"]).optional().describe("New role"),
    name: z.string().optional().describe("New display name"),
  },
  async (params) => {
    const { company_id, member_id, ...body } = params;
    const res = await api("PATCH", `/v1/companies/${company_id}/members/${member_id}`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "remove_company_member",
  "Remove a member from a company. Pass hard_delete=true to also delete the underlying account (only allowed if it was provisioned by this flow and belongs to no other companies).",
  {
    company_id: z.string().describe("Company ID"),
    member_id: z.string().describe("Member ID"),
    hard_delete: z.boolean().default(false).describe("Also delete the account row"),
  },
  async (params) => {
    const suffix = params.hard_delete ? "?hard_delete=true" : "";
    const res = await api("DELETE", `/v1/companies/${params.company_id}/members/${params.member_id}${suffix}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "assign_company_mailbox",
  "Assign an email handle (local_part@domain) to a company member. Inbound mail to this handle will land in that member's isolated inbox.",
  {
    company_id: z.string().describe("Company ID"),
    account_id: z.string().describe("Member's account ID"),
    domain_id: z.string().describe("Domain ID (must be linked to this company)"),
    local_part: z.string().describe("Local part of the email address, e.g. \"alice\""),
  },
  async (params) => {
    const { company_id, ...body } = params;
    const res = await api("POST", `/v1/companies/${company_id}/mailboxes`, body);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "list_company_mailboxes",
  "List email handles assigned to members of a company.",
  {
    company_id: z.string().describe("Company ID"),
    domain_id: z.string().optional().describe("Filter by domain"),
    account_id: z.string().optional().describe("Filter by member account"),
  },
  async (params) => {
    const { company_id, ...query } = params;
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    const res = await api("GET", `/v1/companies/${company_id}/mailboxes${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: formatResult(res) }] };
  },
);

server.tool(
  "remove_company_mailbox",
  "Remove an email handle assignment.",
  {
    company_id: z.string().describe("Company ID"),
    mailbox_id: z.string().describe("Mailbox assignment ID"),
  },
  async (params) => {
    const res = await api("DELETE", `/v1/companies/${params.company_id}/mailboxes/${params.mailbox_id}`);
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
