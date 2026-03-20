# emailservice

Self-hosted email service platform — a Resend.com-style API you own and control. Handles sending, receiving, domain verification, webhooks, audiences, and analytics.

## Features

- **REST API** for sending transactional and bulk emails (`POST /v1/emails`)
- **Domain verification** with automatic SPF, DKIM (RSA-2048), DMARC, and MX record generation
- **DNS auto-setup** via GoDaddy and Cloudflare APIs
- **Webhook delivery** with HMAC signatures and automatic retries
- **SMTP relay server** (port 587/465) for clients sending through the service
- **SMTP inbound** for receiving emails
- **Click and open tracking** with per-email analytics
- **Batch sending** up to 100 emails per request
- **Audiences and contacts** management
- **Suppression lists** (bounces, complaints, unsubscribes)
- **Dashboard UI** — React 19 + Vite + TailwindCSS 4

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
| `POST` | `/v1/domains/:id/verify` | Trigger DNS verification |
| `DELETE` | `/v1/domains/:id` | Remove a domain |
| `POST` | `/v1/webhooks` | Register a webhook |
| `GET` | `/v1/audiences` | List audiences |
| `POST` | `/v1/audiences/:id/contacts` | Add a contact |

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

Version 1.2.0 — Last updated: 2026-03-20 22:00 UTC
