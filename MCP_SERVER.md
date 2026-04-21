# MCP Server — MailNowAPI

This repository ships a [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes the entire MailNowAPI REST surface as tools an AI agent can
call. Any MCP-aware client (Claude Desktop, Claude Code, Cursor, etc.) can run
it over stdio and get 100+ tools for sending email, managing domains, working
an inbox, and more.

---

## Quickstart (60 seconds)

1. **Start the API server.** In the repo root:
   ```bash
   docker compose up -d   # postgres + redis + mailpit
   pnpm dev               # API on :3000
   ```

2. **Create an account + API key** (development shortcut):
   ```bash
   pnpm db:seed
   # prints: Admin login + API key es_xxxxx
   ```
   Or register a real account via `/auth/register` and mint a key from the
   dashboard.

3. **Point your MCP client at the server.** Copy `mcp-config.example.json`:

   ```json
   {
     "mcpServers": {
       "mailnowapi": {
         "command": "pnpm",
         "args": ["mcp"],
         "env": {
           "EMAIL_SERVICE_URL": "http://localhost:3000",
           "EMAIL_SERVICE_API_KEY": "es_xxxxx"
         }
       }
     }
   }
   ```

   - **Claude Desktop**: put this in `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).
   - **Claude Code**: `~/.claude/mcp.json`.
   - **Cursor**: `~/.cursor/mcp.json`.

4. **Send your first email from the agent**:
   > "Send an email from `hello@yourdomain.com` to `me@example.com` with the subject `hi` and text `from an agent`."

   The agent calls `send_email` under the hood.

---

## Environment

| Variable                | Required | Description                                                        |
|-------------------------|----------|--------------------------------------------------------------------|
| `EMAIL_SERVICE_API_KEY` | Yes      | Bearer token. User-scoped (full account access) or company-scoped. |
| `EMAIL_SERVICE_URL`     | No       | Defaults to `http://localhost:3000`.                               |

Company-scoped keys transparently constrain every tool call to that company's
data (see CLAUDE.md → "Companies"). Same tools, narrower scope.

---

## Tool catalog

100+ tools, organized by domain:

| Group        | Representative tools                                                                                 |
|--------------|------------------------------------------------------------------------------------------------------|
| Emails       | `send_email`, `send_batch_emails`, `list_emails`, `get_email`, `cancel_scheduled_email`              |
| Inbox        | `list_inbound_emails`, `get_inbound_email`                                                           |
| Domains      | `create_domain`, `list_domains`, `get_domain`, `verify_domain`, `update_domain`, `delete_domain`     |
| API keys     | `create_api_key`, `list_api_keys`, `revoke_api_key`                                                  |
| Webhooks     | `create_webhook`, `list_webhooks`, `update_webhook`, `delete_webhook`, `list_webhook_deliveries`     |
| Audiences    | `create_audience`, `list_audiences`, `get_audience`, `delete_audience`                               |
| Contacts     | `add_contact`, `list_contacts`, `get_contact`, `update_contact`, `delete_contact`                    |
| Suppressions | `list_suppressions`, `add_suppression`, `remove_suppression`                                         |
| Templates    | `create_template`, `list_templates`, `get_template`, `update_template`, `delete_template`            |
| Broadcasts   | `create_broadcast`, `list_broadcasts`, `get_broadcast`, `delete_broadcast`                           |
| Warmup       | `start_warmup`, `list_warmups`, `get_warmup`, `get_warmup_stats`, `pause_warmup`, `resume_warmup`    |
| Team         | `list_domain_members`, `add_domain_member`, `update_domain_member`, `remove_domain_member`, invites  |
| Companies    | `create_company`, `list_companies`, `provision_company_member`, `create_company_api_key`, mailboxes  |
| Analytics    | `get_analytics`                                                                                      |
| Utilities    | `validate_email`                                                                                     |

---

## Error handling

Every tool returns either the REST response JSON (on success) or an error
envelope you can branch on:

```json
{
  "status": 400,
  "type": "validation_error",
  "message": "Domain example.com is not verified",
  "details": [ ... ]
}
```

Common `type` values:

| `type`                 | Meaning                                                   | Retry?        |
|------------------------|-----------------------------------------------------------|---------------|
| `validation_error`     | Bad input (unverified domain, malformed email, …)         | No — fix input |
| `unauthorized`         | Missing / invalid API key                                 | No             |
| `forbidden`            | Key is company-scoped; resource belongs to another tenant | No             |
| `not_found`            | Resource doesn't exist or is out of scope                 | No             |
| `conflict`             | Duplicate (e.g. suppression already exists)               | No             |
| `rate_limit_exceeded`  | Per-key or per-domain send cap                            | Yes (backoff)  |
| `internal_error`       | Server issue                                              | Yes (backoff)  |

---

## Pagination

List tools that paginate accept `limit` (max 100) and `cursor`. The response
is `{ data: [...], pagination: { cursor, has_more } }`. When `has_more` is
true, pass the `cursor` back to fetch the next page. The cursor is opaque —
don't parse it.

---

## Idempotency

`send_email` and `send_batch_emails` accept an `idempotency_key`. Reusing the
same key within 24 hours returns the original response without resending,
which protects against double-sends on agent retries. Generate a fresh UUID
per intent (e.g., per user action, not per attempt).

---

## Rate limits

- Global per-API-key limit (`RATE_LIMIT_MAX`, default 600/min).
- Per-domain send cap via `domains.send_rate_per_minute`. Exceeding it raises
  `rate_limit_exceeded`. Sleep and retry; honor the error's `message`.

---

## Troubleshooting

**`fetch failed` / `ECONNREFUSED`**
API server isn't running. Start it with `pnpm dev` or confirm
`EMAIL_SERVICE_URL` points at the right host.

**`Error: 401 unauthorized`**
Missing or wrong `EMAIL_SERVICE_API_KEY`. Mint a new key from the dashboard.

**`validation_error: Domain not verified`**
Run `verify_domain` and wait up to a few minutes for DNS propagation. `get_domain`
shows which of SPF/DKIM/DMARC/MX are still pending.

**`forbidden: Domain is not linked to this company`**
Company-scoped keys can only send from their own company's domains. Use
`link_company_domain` or `create_company_domain` on the correct company.

---

## See also

- `CLAUDE.md` — architecture + multi-tenant model
- `DELIVERABILITY.md` — SPF/DKIM/DMARC/warmup explainers
- `RUNBOOK.md` — operational playbook
