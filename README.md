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

**Interactive docs.** Run the API and open:

- `http://localhost:3000/docs` — Swagger UI (try-it-out, persists your bearer token)
- `http://localhost:3000/openapi.json` — OpenAPI 3.1 document, ready to feed into Stainless,
  `openapi-generator`, Postman, Insomnia, or any other client-codegen tool.

Or browse the committed `openapi.json` at the repo root — 85 paths / 139 operations, every
endpoint has a `summary`, a stable `operationId` (e.g. `emailsCreate`, `domainsVerify`,
`companiesAdoptDomains`), and Zod-derived request/response schemas. The same Zod schemas the
server uses for runtime validation drive the docs, so the spec can never drift from the
implementation.

**Regenerate the spec** after any route change:

```bash
pnpm openapi:export   # rewrite openapi.json
pnpm openapi:check    # CI step — fails if openapi.json is stale
pnpm openapi:lint     # CI step — runs redocly lint against the spec
```

**Webhook events** are documented in the same spec under the OpenAPI 3.1
`webhooks` map: 13 event types (`email.delivered`, `email.bounced`,
`email.opened`, `email.clicked`, `email.complained`, `email.received`,
`domain.verified`, `contact.*`, …) with payload schemas and HMAC signature
verification details.

**Official TypeScript SDK** lives at [`sdks/ts/`](sdks/ts/) — generated request
/ response types from `openapi.json` plus a thin `MailNowApiClient` runtime
wrapper and a `verifyWebhookSignature` helper. See
[`sdks/ts/README.md`](sdks/ts/README.md) for usage.

**Other clients**:

- **Postman / Insomnia** — both import `openapi.json` directly. From Postman:
  *File → Import → openapi.json* (or paste the URL `http://localhost:3000/openapi.json`).
- **Generated SDKs** in any language —
  `openapi-generator-cli generate -i openapi.json -g <python|go|ruby|rust|...> -o ./sdk`,
  or feed the spec to [Stainless](https://www.stainless.com) /
  [Speakeasy](https://www.speakeasy.com/) for managed client generation.
- **MCP server** — exposes every endpoint as a tool for AI agents
  (Claude Desktop, Claude Code, Cursor). See [`MCP_SERVER.md`](MCP_SERVER.md).

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
| `REDIS_URL` | No | Redis URL (queues disabled if absent — direct send fallback kicks in) |
| `ENCRYPTION_KEY` | Yes (prod) | 32-byte hex key for AES-256-GCM (DKIM keys, mailbox creds) |
| `JWT_SECRET` | Yes | 32+ char secret for dashboard session JWTs |
| `TRACKING_HMAC_SECRET` | Yes (prod) | 32-byte hex secret for click-tracking URL signatures. Independent of `ENCRYPTION_KEY` so a leak of one does not compromise the other. **Must stay stable across restarts** — rotating invalidates every previously-emitted tracking URL. |
| `BASE_URL` | Yes | Public URL of the API server (used in tracking links + Message-ID) |
| `MAIL_HOST` | Recommended | Hostname for MX/SPF records |
| `SMTP_HOST` | No | External SMTP relay host. If unset in production, falls back to `nodemailer direct:true` (port 25 to recipient MX — typically blocked on cloud egress) |
| `SMTP_PORT` | No | SMTP relay port (default 587) |
| `SMTP_USER` / `SMTP_PASS` | No | Relay credentials. If unset with `SMTP_HOST` set, the relay is treated as a trusted local relay (TLS off, no auth) |
| `NODE_ENV` | Yes | `development` or `production`. In dev, all sends go to Mailpit at `localhost:1025` regardless of `SMTP_HOST` |

See `.env.example` for all options with defaults. Generate hex secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Architecture

### Processes

Three Node processes in production, each a separate container:

- **API server** (`src/index.ts`) — Fastify HTTP API on `:3000` + dashboard SPA + SMTP inbound listener on `:2525`. When Redis is configured it also runs the BullMQ workers in-process so the worker container is technically optional but recommended for isolation.
- **Worker** (`src/worker.ts`) — Standalone BullMQ workers. Twelve queues: `email.send`, `dns.verify`, `webhook.deliver`, `email.inbound`, `email.scheduled`, `email.warmup`, `trash.purge`, `mailbox.sync`, `broadcast.execute`, `contact.import`, `broadcast.abtest`, `sequence.process`.
- **SMTP relay** (`src/smtp-relay.ts`) — SMTP server on `:587/:465` for clients sending through this service (e.g. an app pointing its `SMTP_HOST` at MailNowAPI). Authenticates the connection against an API key and re-enqueues into `email.send`.

A fourth process — **MCP server** (`src/mcp-server.ts`) — runs on demand for AI-agent integrations (stdio transport, wraps the REST API).

### Data flow

**Outbound send.** `POST /v1/emails` → `email.service.ts:sendEmail()` validates the from-domain (must be verified, owner has access, recipient not on suppression list), creates a row in `emails` with status `queued`, enqueues an `email.send` job. The worker picks it up, atomically claims the row (`status: sending`), loads the DKIM key from the cache (or decrypts from DB on first hit), DKIM-signs the message via nodemailer, and hands it off to the configured transport. On success: row flips to `sent`, `email.sent` event recorded, webhooks dispatched. On failure: row flips to `failed` with `failure_reason` + classified `failure_code` (`smtp_connection`, `smtp_auth`, `dkim`, `dns`, `tls`, `rejected`, `rate_limited`, `unknown`), and BullMQ retries (skipped for permanent codes).

**Inbound receive.** Internet → MX records → port 25 (host MTA, not this service) → forwards to `:2525` → `smtp/inbound-server.ts` parses the message, identifies bounces (RFC 3464 DSN) and complaints (RFC 5965 ARF), auto-adds suppressions for those, otherwise looks up the recipient mailbox and routes to the owning member's inbox. Webhooks fire (`email.received`, `email.bounced`, `email.complained`).

**Tracking.** HTML emails get a 1×1 tracking pixel inserted before `</body>` and every `<a href>` rewritten to `/c/:encodedData` where the data is HMAC-signed with `TRACKING_HMAC_SECRET`. Opens hit `/t/:emailId`, clicks hit `/c/:encodedData` and 302 to the original URL after recording the event. Both endpoints update the `emails.open_count` / `click_count` and emit events.

### Database

PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/). Schema files under `src/db/schema/`, migrations in `drizzle/`. Migrations apply automatically on app startup (`src/db/index.ts:runMigrations`). Never hand-edit `drizzle/*.sql` — always `pnpm db:generate` after a schema change.

### Queues

BullMQ on Redis. All queues are lazy-initialized — if Redis is unreachable, sends fall back to direct execution (no retries, no scheduling). Workers attach error handlers that log via pino with module/job context.

## Production deployment

The reference deployment (`https://mailnowapi.com`) runs everything on a **single Hetzner box** with five containers:

```
┌─────────────────────────────────────────────────────────────┐
│  Hetzner host (mail.mailnowapi.com)                         │
│                                                             │
│   Caddy (host systemd) :80/:443  ──TLS termination          │
│        │                                                    │
│        ▼ reverse proxy                                      │
│   ┌─────────────────────┐                                   │
│   │  deploy-app-1 :3000 │ API + dashboard + SMTP inbound    │
│   │  deploy-worker-1    │ BullMQ workers                    │
│   │  deploy-smtp-relay-1│ :587/:465 client SMTP             │
│   │  deploy-postgres-1  │ Postgres 16 (loopback only)       │
│   │  deploy-redis-1     │ Redis 7 (loopback only)           │
│   └─────────────────────┘                                   │
│        │                                                    │
│        ▼ via docker bridge (172.18.0.1:25)                  │
│   Postfix (host systemd) — relays outbound to internet      │
└─────────────────────────────────────────────────────────────┘
```

Compose file lives at `deploy/docker-compose.prod.yml` (a *separate* dev compose at `docker-compose.yml` includes Mailpit and is not used in prod). All env vars in `/opt/emailservice/.env`. Postfix's `mynetworks` includes the docker bridge `172.16.0.0/12` so containers can relay outbound without auth.

### CI/CD

A push to `main` triggers `.github/workflows/deploy.yml`:

1. GitHub Actions runner SSHes into the host using the `DEPLOY_SSH_KEY` repo secret.
2. `git fetch origin main && git reset --hard origin/main` — `/opt/emailservice` is a deploy target, never edited by hand.
3. `bash deploy/deploy.sh` — `docker compose -f deploy/docker-compose.prod.yml build && up -d --remove-orphans`, health-check loop on `:3000/health`, prune dangling images.
4. Migrations run on app startup via `runMigrations()`. The drizzle ledger lives in the `drizzle.__drizzle_migrations` table.

Required GitHub secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`. Watch deploys at `Actions → Deploy to Hetzner`.

For the full operational runbook (host paths, common ops, crash-loop triage), see [CLAUDE.md](CLAUDE.md#production-deployment-mailnowapicom).

## License

ISC

---

Version 1.7.0 — Last updated: 2026-04-29
