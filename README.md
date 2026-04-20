# emailservice

Self-hosted email service platform — a Resend.com-style API you own and control. Handles sending, receiving, domain verification, webhooks, audiences, and analytics.

## Features

- **REST API** for sending transactional and bulk emails (`POST /v1/emails`)
- **Domain verification** with automatic SPF, DKIM (RSA-2048), DMARC, and MX record generation
- **DNS auto-setup** via GoDaddy and Cloudflare APIs
- **Company accounts** — provision sub-tenants via API so an external platform can offer
  MailNowAPI to its own customers under one root account, with isolated per-member inboxes
  and company-scoped API keys
- **Webhook delivery** with HMAC signatures and automatic retries
- **SMTP relay server** (port 587/465) for clients sending through the service
- **SMTP inbound** for receiving emails, with per-handle routing to the owning member's inbox
- **Click and open tracking** with HMAC-signed URLs and per-email analytics
- **Batch sending** up to 100 emails per request
- **Audiences and contacts** management
- **Suppression lists** (bounces, complaints, unsubscribes)
- **MCP server** — 100+ tools exposing the full API to AI agents (Claude Desktop, Cursor, etc.)
- **Dashboard UI** — React 19 + Vite + TailwindCSS 4, fully mobile-responsive
- **Security hardened** — SSRF protection on webhooks, HMAC-signed tracking links, encrypted
  unsubscribe tokens, rate limiting, company-scoped API keys restricted to their own domains
- **Deliverability-first** — RFC 8058 one-click unsubscribe, DSN bounce auto-suppression, ARF
  complaint auto-suppression, DMARC aggregate reporting, per-domain rate limits, strict outbound
  TLS. See [DELIVERABILITY.md](DELIVERABILITY.md) for the full playbook.

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm, Docker

# 1. Clone and install
git clone https://github.com/proark1/emailservice.git
cd emailservice
pnpm install
cd web && pnpm install && cd ..

# 2. Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, JWT_SECRET, ENCRYPTION_KEY

# 3. Start infrastructure
docker compose up -d   # Postgres, Redis, Mailpit

# 4. Run migrations and seed
pnpm db:migrate
pnpm db:seed           # Creates test account + prints API key

# 5. Start all processes (in separate terminals)
pnpm dev               # API server on :3000
pnpm dev:worker        # Background workers
pnpm dev:smtp          # SMTP relay on :587

# 6. (Optional) Start frontend dev server
cd web && pnpm dev     # Dashboard on :5173
```

## API Overview

All API routes require `Authorization: Bearer es_xxx` (API key auth).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/emails` | Send an email |
| `GET` | `/v1/emails` | List sent emails |
| `GET` | `/v1/emails/:id` | Get email details |
| `POST` | `/v1/emails/batch` | Send up to 100 emails |
| `POST` | `/v1/domains` | Add a domain |
| `GET` | `/v1/domains` | List domains |
| `PATCH` | `/v1/domains/:id` | Update DMARC reporting, Return-Path, send rate limit |
| `POST` | `/v1/domains/:id/verify` | Trigger DNS verification |
| `DELETE` | `/v1/domains/:id` | Remove a domain |
| `POST` | `/v1/webhooks` | Register a webhook |
| `GET` | `/v1/audiences` | List audiences |
| `POST` | `/v1/audiences/:id/contacts` | Add a contact |
| `POST` | `/v1/companies` | Create a company (sub-tenant) |
| `POST` | `/v1/companies/:id/domains` | Create & link a domain, or link an existing one |
| `POST` | `/v1/companies/:id/adopt-domains` | Bulk-migrate existing master-account domains into a company |
| `POST` | `/v1/companies/:id/members` | Provision a member account + handle + optional API key |
| `POST` | `/v1/companies/:id/mailboxes` | Assign an email handle to a member |
| `POST` | `/v1/companies/:id/api-keys` | Mint a company-scoped API key |

### Send an email

```bash
curl -X POST http://localhost:3000/v1/emails \
  -H "Authorization: Bearer es_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "you@yourdomain.com",
    "to": ["recipient@example.com"],
    "subject": "Hello",
    "html": "<h1>Hi there!</h1>"
  }'
```

## Company accounts (multi-tenant)

If you're building a platform that wants to offer MailNowAPI to your own
customers, use **companies**. One root account on MailNowAPI holds the API key;
each of your customer projects becomes a `company` that owns its own domains
and members.

- Every member is a real account — they can log into the dashboard, have their
  own isolated inbox, and (optionally) their own API key.
- Inbound mail to `alice@customer-domain.com` lands in Alice's inbox only.
  Other members of the company never see it.
- Company-scoped API keys can only send from domains linked to that company,
  so a single root account can safely serve many tenants without cross-talk.
- Per-member API keys inherit `domain_members.mailboxes` scoping — the key for
  Alice can only send as `alice@…`.

### Typical flow

```bash
# 1. Create a company (uses the platform's root user key)
curl -X POST http://localhost:3000/v1/companies \
  -H "Authorization: Bearer es_ROOT" -H "Content-Type: application/json" \
  -d '{"name":"Acme Inc","slug":"acme"}'
# → { "data": { "id": "COMPANY_ID", ... } }

# 2. Create and link a domain in one call. Response includes DNS records.
curl -X POST http://localhost:3000/v1/companies/COMPANY_ID/domains \
  -H "Authorization: Bearer es_ROOT" -H "Content-Type: application/json" \
  -d '{"name":"acme.example.com","mode":"both"}'
# → DNS records (SPF, DKIM, DMARC, MX) to hand to your customer

# 3. Customer configures DNS, then trigger verification
curl -X POST http://localhost:3000/v1/domains/DOMAIN_ID/verify \
  -H "Authorization: Bearer es_ROOT"

# 4. Provision a member with an email handle and a per-member API key
curl -X POST http://localhost:3000/v1/companies/COMPANY_ID/members \
  -H "Authorization: Bearer es_ROOT" -H "Content-Type: application/json" \
  -d '{
    "email":"alice@ext.example",
    "name":"Alice",
    "domain_id":"DOMAIN_ID",
    "local_part":"alice",
    "issue_api_key": true
  }'
# → { "data": { "member_id": "...", "api_key": { "key": "es_..." } } }

# 5. Mint a company-scoped API key if you want to delegate ongoing provisioning
curl -X POST http://localhost:3000/v1/companies/COMPANY_ID/api-keys \
  -H "Authorization: Bearer es_ROOT" -H "Content-Type: application/json" \
  -d '{"name":"Acme provisioning key"}'
# → { "data": { "key": "es_..." } } — shown once, store it safely
```

Company-scoped keys can manage members, mailboxes, and domains for their
company, and can send email — but only from domains linked to that company.

### Migrating existing domains into a company

If domains were already created via `POST /v1/domains` before the company
endpoint was wired up, they sit unscoped on the master account. To find and
move them:

```bash
# 1. List stranded domains
curl http://localhost:3000/v1/domains?unlinked=true \
  -H "Authorization: Bearer es_ROOT"

# 2. Bulk-adopt them into a company
curl -X POST http://localhost:3000/v1/companies/COMPANY_ID/adopt-domains \
  -H "Authorization: Bearer es_ROOT" -H "Content-Type: application/json" \
  -d '{"domain_ids": ["<id1>", "<id2>", "<id3>"]}'
# → { "data": { "linked": 3, "skipped": 0, "errored": 0, "results": [...] } }
```

The dashboard's **Companies** page (`/dashboard/companies`) groups every
domain by company with an "Unlinked" bucket at the top — pick the domains,
choose a target company, click "Move domains".

## Deliverability

If this service is serving real user volume, read [DELIVERABILITY.md](DELIVERABILITY.md) — it's the checklist you actually need.

What's automatic:

- DKIM 2048 signing, SPF, DMARC (`p=quarantine`, strict alignment) generated per domain.
- `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headers on every send, with live GET and POST endpoints (RFC 8058 — required by Gmail/Yahoo bulk sender rules).
- DSN bounces (RFC 3464) and ARF complaints (RFC 5965) parsed at ingress and auto-added to the suppression list. `email.bounced` / `email.complained` webhooks fire in real time.
- Return-Path aligned to a configurable subdomain (`bounces@{return_path_domain || from_domain}`).
- Auto-generated plain-text alternative when only HTML is supplied.
- Warmup system with engagement-gated ramp + weekend skip.
- Strict outbound TLS (`rejectUnauthorized: true` on both the relay and connected-mailbox transports).

What you configure:

```bash
# Optional but recommended — add DMARC aggregate reporting and a bounces subdomain
curl -X PATCH http://localhost:3000/v1/domains/DOMAIN_ID \
  -H "Authorization: Bearer es_YOUR_KEY" -H "Content-Type: application/json" \
  -d '{
    "dmarc_rua_email": "dmarc@yourdomain.com",
    "return_path_domain": "bounces.yourdomain.com",
    "send_rate_per_minute": 300
  }'
```

Then publish the updated DMARC TXT from the response, add an MX for `bounces.yourdomain.com` pointing at your `MAIL_HOST`, and enroll in [Gmail Postmaster Tools](https://postmaster.google.com/).

## MCP server

Run an MCP server that exposes every API feature as a tool for AI agents:

```bash
EMAIL_SERVICE_API_KEY=es_YOUR_KEY pnpm mcp
```

Tools cover Emails, Domains, API Keys, Webhooks, Audiences, Contacts,
Suppressions, Templates, Broadcasts, Warmup, Analytics, Team, Sequences, and
Companies. See `mcp-config.example.json` for Claude Desktop / Claude Code /
Cursor integration.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | No | Redis URL (queues disabled if absent) |
| `ENCRYPTION_KEY` | Yes (prod) | 32-byte hex key for AES-256-GCM |
| `JWT_SECRET` | Yes | Secret for dashboard session JWTs |
| `BASE_URL` | Yes | Public URL of the API server |
| `MAIL_HOST` | Recommended | Hostname for MX/SPF records |
| `SMTP_HOST` | No | External SMTP relay host |
| `NODE_ENV` | Yes | `development` or `production` |

See `.env.example` for all options with defaults.

## Architecture

Three separate Node processes in production:

- **API server** (`src/index.ts`) — HTTP API + dashboard + SMTP inbound
- **Worker** (`src/worker.ts`) — BullMQ workers for email send, DNS verify, webhooks, scheduling
- **SMTP relay** (`src/smtp-relay.ts`) — SMTP server on 587/465

For full architecture details, see [CLAUDE.md](CLAUDE.md).

## License

ISC

---

Version 1.6.1 — Last updated: 2026-04-20
