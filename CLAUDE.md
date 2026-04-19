# CLAUDE.md — MailNowAPI (mailnowapi.com)

Self-hosted email service platform. Send and receive emails through your own domains. Handles transactional email, broadcasts, inbound inbox, domain verification, webhooks, audiences, and analytics.

---

## Dev commands

```bash
# Start infrastructure (Postgres, Redis, Mailpit)
docker compose up -d

# Backend API (port 3000)
pnpm dev

# Background workers (separate process — needed for queued sends, DNS verify, webhooks)
pnpm dev:worker

# SMTP relay server (port 587/465 — for clients sending through the service)
pnpm dev:smtp

# MCP server for AI agents (requires running API server + API key)
EMAIL_SERVICE_API_KEY=es_xxxx pnpm mcp

# Frontend dashboard (port 5173, proxied to API in dev)
cd web && pnpm dev

# Build frontend (output → web/dist, served by the API in production)
cd web && pnpm build

# Type check backend
pnpm typecheck

# Run tests
pnpm test

# Database migrations
pnpm db:generate   # generate migration from schema changes
pnpm db:migrate    # apply migrations
pnpm db:studio     # open Drizzle Studio GUI
pnpm db:seed       # seed a test account + API key

# Check Mailpit (captured dev emails)
open http://localhost:8025
```

---

## Architecture

### Processes
Three separate Node processes in production:
- **API server** (`src/index.ts`) — HTTP API + dashboard + SMTP inbound
- **Worker** (`src/worker.ts`) — BullMQ workers for email send, DNS verify, webhooks, scheduling
- **SMTP relay** (`src/smtp-relay.ts`) — SMTP server on 587/465 for clients sending through the service

In development all three run separately via `pnpm dev`, `pnpm dev:worker`, `pnpm dev:smtp`.

### MCP Server
A fourth process — **MCP server** (`src/mcp-server.ts`) — exposes all email service features as MCP tools for AI agents. It communicates with the running API server over HTTP using an API key (Bearer token).

**Environment variables:**
- `EMAIL_SERVICE_URL` — Base URL of the API server (default: `http://localhost:3000`)
- `EMAIL_SERVICE_API_KEY` — API key for authentication (e.g. `es_xxxx`)

**Available MCP tools (100+ tools):**
- **Emails:** `send_email`, `send_batch_emails`, `list_emails`, `get_email`, `cancel_scheduled_email`
- **Domains:** `create_domain`, `list_domains`, `get_domain`, `verify_domain`, `delete_domain`
- **API Keys:** `create_api_key`, `list_api_keys`, `revoke_api_key`
- **Webhooks:** `create_webhook`, `list_webhooks`, `get_webhook`, `update_webhook`, `delete_webhook`, `list_webhook_deliveries`
- **Audiences:** `create_audience`, `list_audiences`, `get_audience`, `delete_audience`
- **Contacts:** `add_contact`, `list_contacts`, `get_contact`, `update_contact`, `delete_contact`
- **Suppressions:** `list_suppressions`, `add_suppression`, `remove_suppression`
- **Templates:** `create_template`, `list_templates`, `get_template`, `update_template`, `delete_template`
- **Broadcasts:** `create_broadcast`, `list_broadcasts`, `get_broadcast`, `delete_broadcast`
- **Warmup:** `start_warmup`, `list_warmups`, `get_warmup`, `get_warmup_stats`, `pause_warmup`, `resume_warmup`, `cancel_warmup`
- **Team:** `list_domain_members`, `add_domain_member`, `update_domain_member`, `remove_domain_member`, `list_domain_invitations`, `create_domain_invitation`, `revoke_domain_invitation`
- **Companies:** `create_company`, `list_companies`, `get_company`, `update_company`, `delete_company`, `create_company_api_key`, `list_company_api_keys`, `revoke_company_api_key`, `link_company_domain`, `create_company_domain`, `list_company_domains`, `unlink_company_domain`, `provision_company_member`, `list_company_members`, `get_company_member`, `update_company_member`, `remove_company_member`, `assign_company_mailbox`, `list_company_mailboxes`, `remove_company_mailbox`
- **Analytics:** `get_analytics`
- **Utilities:** `validate_email`

**Integration:** Copy `mcp-config.example.json` and update with your API key. See that file for Claude Desktop / Claude Code / Cursor configuration format.

### Auth
Two auth systems:
- **API key (Bearer token)** — `Authorization: Bearer es_xxxx` — used for all `/v1/*` routes. Hashed with argon2 in DB. Checked in `src/plugins/auth.ts` → `app.authenticate()`.
- **Cookie/JWT session** — used for the dashboard UI (`/dashboard/*`) and auth routes (`/auth/*`). JWT signed with `JWT_SECRET`, stored in `session` cookie.

API keys can optionally carry a `companyId` (`api_keys.company_id`). When set, the key is **company-scoped**: routes use `request.apiKey.companyId` to enforce that the caller only acts on their own company and can only send mail from domains linked to it (`src/services/email.service.ts` rejects the send when `options.companyScopeId !== domain.companyId`). Keys without a `companyId` act as user-level keys with full access to the owning account's domains.

### Companies (multi-tenant)
A **company** is a sub-tenant that lives under a root MailNowAPI account. The intended use is a platform that wants to offer MailNowAPI to its own customers: the platform owns one root account + API key; each customer-project becomes a company.

**Tables** (`src/db/schema/companies.ts`):
- `companies` — id, `owner_account_id`, name, unique slug.
- `company_members` — maps `accounts` rows to a company with a role (`owner` | `admin` | `member`). The account is a real MailNowAPI user; members can log into the dashboard.
- `company_mailboxes` — `(domain_id, local_part) → account_id` mapping. Unique on `(domain_id, local_part)`. This is the authoritative handle → member account table.
- `domains.company_id` — nullable FK. Present on "delegated" domains.
- `api_keys.company_id` — nullable FK. Present on company-scoped keys.

**Services:**
- `src/services/company.service.ts` — CRUD, domain linking (`linkDomainToCompany`, `createAndLinkDomain`), company API key minting, `requireCompanyRole` (same role hierarchy pattern as `team.service.ts`).
- `src/services/company-member.service.ts` — `provisionMember` (creates account + company_member row + optional mailbox + optional per-member API key, sends welcome email), list/get/update/remove.
- `src/services/company-mailbox.service.ts` — `assignMailbox` (inserts `company_mailboxes` row AND mirrors into `domain_members` with mailbox filter so outbound send scoping works), `resolveMailbox` (used by inbound routing), list/remove.

**Routes:** `src/routes/companies.ts` — `/v1/companies/*`. `assertCompanyScope()` enforces that a company-scoped key can only hit its own `:companyId` path.

**Inbound routing:** when a message arrives at `alice@domain`, `src/smtp/inbound-server.ts` looks up the domain; if `domain.companyId` is set it calls `resolveMailbox(domainId, localPart)` and routes to the resolved member's `accountId`. When no mapping exists, it falls back to `domain.accountId` (the root owner) — no mail is lost. Non-company domains behave exactly as before.

### Queues (BullMQ on Redis)
All queues are lazy-initialized (won't crash if Redis is unavailable):
- `email:send` — sends an outbound email (DKIM sign → nodemailer)
- `dns:verify` — polls DNS to verify SPF/DKIM/DMARC/MX for a domain
- `webhook:deliver` — POSTs webhook events with HMAC signature + retry
- `email:scheduled` — polling job (every 30s) to move due scheduled emails to `email:send`
- `email:inbound` — processes received SMTP messages, fires webhooks
- `email:warmup` — runs hourly warmup rounds for active domain warmup schedules

Workers live in `src/workers/`. Queues declared in `src/queues/index.ts`.

### Email sending flow
1. `POST /v1/emails` → `src/services/email.service.ts:sendEmail()` validates domain, checks suppressions, creates DB record
2. Enqueues to `email:send` (or falls back to direct send if Redis unavailable)
3. `src/workers/email-send.worker.ts` → `src/services/email-sender.ts:sendEmailDirect()`
4. Loads DKIM private key (decrypts AES-256-GCM), signs with nodemailer, sends via configured transport:
   - Dev → Mailpit (localhost:1025)
   - Production + `SMTP_HOST` set → relay (your own Postfix, Gmail, SendGrid, etc.)
   - Production, no `SMTP_HOST` → `nodemailer direct:true` (resolves MX, connects port 25 — blocked on Railway)

### DNS verification flow
`POST /v1/domains` → generates DKIM RSA-2048 key pair + DNS record values → saves to DB → enqueues `dns:verify` job with 60s delay. Worker polls with exponential backoff (1min → 5min intervals → 30min) for up to 72 hours. Uses `Date.now() - job.data.startedAt` for elapsed time tracking.

---

## Project structure

```
src/
  index.ts              # API server entry
  worker.ts             # Worker process entry
  smtp-relay.ts         # SMTP relay entry (port 587/465)
  smtp-inbound.ts       # SMTP inbound entry (port 2525)
  mcp-server.ts         # MCP server entry (stdio transport, wraps REST API)
  config/index.ts       # Env var loading (Zod-validated). Use getConfig() everywhere.
  db/
    index.ts            # Drizzle client (getDb())
    schema/             # One file per table, re-exported from index.ts
  plugins/
    auth.ts             # app.authenticate() decorator (API key auth)
    error-handler.ts    # Maps AppError subclasses to HTTP responses
    rate-limit.ts
  routes/
    index.ts            # Registers all route plugins
    dashboard.ts        # Dashboard API (cookie auth) — all UI-facing endpoints
    domains.ts          # /v1/domains (API key auth)
    emails.ts           # /v1/emails
    webhooks.ts
    audiences.ts
    tracking.ts         # /t/:id (open pixel), /c/:id (click redirect) — no auth
    auth.ts             # /auth/login, /auth/register, /auth/logout
    admin.ts            # /admin/* (cookie auth + admin role)
    companies.ts        # /v1/companies/* — multi-tenant sub-accounts
  services/
    email.service.ts        # sendEmail(), getEmail(), listEmails() — accepts companyScopeId option
    email-sender.ts         # sendEmailDirect() — nodemailer, DKIM, transport cache
    domain.service.ts       # CRUD + formatDomainResponse()
    dns.service.ts          # generateDnsRecords(), verifyDnsRecords()
    dns-providers.service.ts # setupDnsRecords() via GoDaddy/Cloudflare API
    dkim.service.ts         # generateDkimForDomain(), getDkimPrivateKey()
    webhook.service.ts      # dispatchEvent(), CRUD
    suppression.service.ts
    analytics.service.ts
    tracking.service.ts     # recordOpen(), recordClick(), decodeClickTrackingData()
    company.service.ts          # CRUD, linkDomainToCompany, createAndLinkDomain, company API keys
    company-member.service.ts   # provisionMember() — creates account + membership + mailbox + key
    company-mailbox.service.ts  # assignMailbox(), resolveMailbox() — handle → member routing
  workers/              # One file per BullMQ worker
  queues/index.ts       # getEmailSendQueue(), getDnsVerifyQueue(), etc.
  lib/
    errors.ts           # AppError, ValidationError, NotFoundError, etc.
    crypto.ts           # generateApiKey(), encryptPrivateKey(), signWebhookPayload()
    html-transform.ts   # Injects tracking pixel + rewrites links
    idempotency.ts
    pagination.ts
  schemas/              # Zod schemas for request bodies (email.schema.ts etc.)
  types/
    webhook-events.ts   # WEBHOOK_EVENT_TYPES constant + WebhookEventType

web/                    # React 19 + Vite + TailwindCSS 4
  src/
    pages/Dashboard.tsx # Entire dashboard UI (single-page app, ~750 lines)
    lib/api.ts          # api(), post(), patch(), del() fetch wrappers
  dist/                 # Built output — served by API server in production

drizzle/                # Migration SQL files (auto-generated, do not edit manually)
scripts/
  seed.ts               # Creates test account + API key
  generate-certs.ts     # Generates self-signed TLS certs for SMTP
```

---

## Code conventions

### Error handling
Always throw from `src/lib/errors.ts` — the error handler in `src/plugins/error-handler.ts` maps these to correct HTTP status codes automatically:
```typescript
throw new ValidationError("Domain example.com is not verified");  // 400
throw new NotFoundError("Email");                                  // 404
throw new ConflictError("Domain already exists");                  // 409
throw new UnauthorizedError();                                     // 401
```
Never `return reply.status(400).send(...)` manually in routes.

### Database access
Always use `getDb()` from `src/db/index.ts`. Never import the db client directly.
```typescript
const db = getDb();
const [row] = await db.select().from(domains).where(eq(domains.id, id));
if (!row) throw new NotFoundError("Domain");
```

Schema tables are in `src/db/schema/` — import from `src/db/schema/index.ts`.

### Adding a migration
1. Edit the schema file in `src/db/schema/`
2. `pnpm db:generate` — creates a new SQL file in `drizzle/`
3. `pnpm db:migrate` — applies it
4. Never hand-edit the generated SQL unless absolutely necessary

### Adding a new API route (API key auth)
1. Create `src/routes/myfeature.ts` following the pattern in `domains.ts`
2. Add `app.addHook("onRequest", async (request) => { await app.authenticate(request); })` at the top
3. Register in `src/routes/index.ts`: `await app.register(myRoutes, { prefix: "/v1/myfeature" })`

### Adding a new dashboard route (cookie auth)
Add to `src/routes/dashboard.ts` inside the existing plugin. The auth hook is already registered at the top.

### Adding a new queue/worker
1. Add getter to `src/queues/index.ts` following existing pattern (lazy init, shared Redis connection)
2. Create `src/workers/myfeature.worker.ts` exporting `createMyFeatureWorker()`
3. Import and call in `src/workers/index.ts`

### Validation
Use Zod schemas in `src/schemas/`. Parse request bodies with `.parse(request.body)` — Zod throws `ZodError` which the error handler maps to 400.

### Encryption
DKIM private keys and DNS provider credentials are AES-256-GCM encrypted at rest:
```typescript
import { encryptPrivateKey, decryptPrivateKey } from "../lib/crypto.js";
const encrypted = encryptPrivateKey(plaintext);   // store this
const plaintext = decryptPrivateKey(encrypted);   // to use
```
These use `ENCRYPTION_KEY` from config — must be set in production (app throws at startup if missing).

### Response format
All API responses follow:
```json
{ "data": {...} }                                        // single
{ "data": [...], "pagination": { "cursor", "has_more" } } // list
{ "error": { "type": "...", "message": "..." } }         // error
```

### Frontend API calls
Use the wrappers in `web/src/lib/api.ts`:
```typescript
import { api, post, patch, del } from "../lib/api";
const result = await api("/dashboard/stats");
const created = await post("/dashboard/domains", { name: "example.com" });
```
All wrappers include `credentials: "include"` for cookie auth. JSON.parse errors are silently handled. On 401/403 responses (except `/auth/*` paths), the user is automatically redirected to `/login`.

### Frontend UI patterns
Use the hooks and components in `web/src/components/ui.tsx`:
```typescript
import { useConfirmDialog, useToast, ConfirmDialog, Toast, Modal } from "../components/ui";

// Confirm dialog for destructive actions (never use window.confirm)
const { confirm, dialog: confirmDialog } = useConfirmDialog();
confirm({ title: "Delete?", message: "Cannot be undone.", confirmLabel: "Delete", onConfirm: async () => { ... } });
// Render {confirmDialog} in JSX

// Toast for error feedback (never use alert())
const { showError, toast } = useToast();
showError("Something went wrong");
// Render {toast} in JSX
```
Modal supports Escape key dismissal and has ARIA attributes for accessibility.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | No | Redis URL (queues disabled if absent) |
| `ENCRYPTION_KEY` | Yes (prod) | 32-byte hex key for AES-256-GCM. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_SECRET` | Yes | Secret for dashboard session JWTs |
| `BASE_URL` | Yes | Public URL of the API server |
| `MAIL_HOST` | Recommended | Hostname for MX/SPF records. Auto-detected from Railway/Render env vars. |
| `SMTP_HOST` | No | External SMTP relay host (skip for direct send) |
| `SMTP_PORT` | No | Relay port (default 587) |
| `SMTP_USER` / `SMTP_PASS` | No | Relay credentials |
| `NODE_ENV` | Yes | `development` \| `production` |
| `LOG_LEVEL` | No | pino log level (default `info`) |

Dev defaults are in `.env.example`. Copy to `.env` to run locally.

---

## Common tasks

### Test sending an email (dev)
```bash
# 1. Seed a test account
pnpm db:seed

# 2. Send via API (key printed by seed script)
curl -X POST http://localhost:3000/v1/emails \
  -H "Authorization: Bearer es_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@yourdomain.com","to":["any@example.com"],"subject":"Test","text":"Hello"}'

# 3. View captured email
open http://localhost:8025
```

### Add a domain (dev)
```bash
curl -X POST http://localhost:3000/v1/domains \
  -H "Authorization: Bearer es_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"yourdomain.com"}'
# Returns DNS records to configure
```

### Run DNS verify immediately (skip 60s delay)
```bash
curl -X POST http://localhost:3000/v1/domains/DOMAIN_ID/verify \
  -H "Authorization: Bearer es_YOUR_KEY"
```

### Provision a customer via companies (platform-as-a-customer flow)
```bash
# 1. Create the company
CID=$(curl -s -X POST http://localhost:3000/v1/companies \
  -H "Authorization: Bearer es_ROOT" -H "Content-Type: application/json" \
  -d '{"name":"Acme","slug":"acme"}' | jq -r .data.id)

# 2. Create + link a domain in one call (returns DNS records for the customer)
DID=$(curl -s -X POST http://localhost:3000/v1/companies/$CID/domains \
  -H "Authorization: Bearer es_ROOT" -H "Content-Type: application/json" \
  -d '{"name":"acme.example.com","mode":"both"}' | jq -r .data.id)

# 3. After customer configures DNS, trigger verification
curl -X POST http://localhost:3000/v1/domains/$DID/verify \
  -H "Authorization: Bearer es_ROOT"

# 4. Provision a member with handle + API key in one call
curl -X POST http://localhost:3000/v1/companies/$CID/members \
  -H "Authorization: Bearer es_ROOT" -H "Content-Type: application/json" \
  -d "{\"email\":\"alice@ext\",\"name\":\"Alice\",\"domain_id\":\"$DID\",\"local_part\":\"alice\",\"issue_api_key\":true}"
```

---

## What NOT to do

- **Never call `getDb()` outside of a request/job handler** at module load time — DB connection is not ready at import.
- **Never import queue getters at module top level** — queues lazy-init and will crash if Redis isn't running yet.
- **Never hand-edit files in `drizzle/`** — always use `pnpm db:generate`.
- **Never add console.log with credentials, keys, or tokens** — use structured logging via Fastify's `request.log`.
- **Never set `ENCRYPTION_KEY` to the placeholder value from `.env.example`** in production.
- **Never use `dangerouslySetInnerHTML`** — email HTML is rendered in a sandboxed `<iframe>`.
- **Do not bypass auth hooks** — always add `onRequest` hook with `app.authenticate()` on protected routes.
- **Do not return errors manually** — throw from `src/lib/errors.ts` and let the error handler format the response.
- **Never use `window.confirm()` or `alert()`** — use `useConfirmDialog` and `useToast` hooks from `web/src/components/ui.tsx`.
- **Never create unsigned/unencrypted tracking or unsubscribe URLs** — click tracking uses HMAC signatures, unsubscribe uses AES-256-GCM encryption.
