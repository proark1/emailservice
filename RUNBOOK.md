# Runbook — MailNowAPI

Operational playbook for the self-hosted email service. Pair this with
`CLAUDE.md` (architecture) and `DELIVERABILITY.md` (customer-facing deliverability).

---

## Health endpoints

| Endpoint   | Purpose      | Returns 200 when                                                      |
|------------|--------------|-----------------------------------------------------------------------|
| `/health`  | Liveness     | Process is up. Use as container liveness probe.                        |
| `/readyz`  | Readiness    | DB reachable + Redis reachable (if configured). Use as readiness probe.|
| `/docs`    | OpenAPI UI   | Always (gate behind auth in prod via a reverse proxy if desired).      |

---

## First boot in production

1. Set required env vars (hard-fail on boot if missing):
   - `DATABASE_URL`
   - `ENCRYPTION_KEY` (64-hex chars; `openssl rand -hex 32`)
   - `JWT_SECRET` (32+ chars)
   - `TRACKING_HMAC_SECRET` (32+ chars, distinct from `ENCRYPTION_KEY`)
   - `BASE_URL`, `MAIL_HOST`
2. Recommended: `REDIS_URL`. Without Redis, queues, rate-limit fairness, and
   scheduled sends degrade.
3. Run migrations on boot (the server does this automatically).
4. Create the first admin account via `/auth/register` (the `db:seed` script
   refuses to run with `NODE_ENV=production`).

---

## Rotating `ENCRYPTION_KEY`

DKIM private keys and DNS provider credentials are AES-256-GCM encrypted at
rest with `ENCRYPTION_KEY`. Rotating it means re-encrypting every row.

1. Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Set `ENCRYPTION_KEY_OLD` to the current key, `ENCRYPTION_KEY` to the new one.
3. Run the rotation script (to be built per deployment — pseudocode):
   - For each `domains` row: `decryptPrivateKey(..., OLD)` then
     `encryptPrivateKey(..., NEW)` and update.
   - Same for `domains.dns_provider_key` / `dns_provider_secret`.
4. Unset `ENCRYPTION_KEY_OLD`. Restart.

Until the rotation script exists, treat the key as irrevocable — document it
in your secrets manager immediately.

---

## Suppression mutated unexpectedly

Suppressions are added from three sources: API (`/v1/suppressions`), unsubscribe
endpoint, and the inbound SMTP bounce/FBL path. The inbound path is
authenticated against the original send — a DSN/FBL whose `original-message-id`
doesn't name a message we actually sent from that account is dropped (see
`src/smtp/inbound-server.ts:findOriginalSend`).

If a legitimate-looking suppression still seems forged:
- Check `suppressions.source_email_id` — `null` means it came from the API or
  the unsubscribe flow; a UUID means we attributed it to a specific send.
- Check `emails` for the matching `message_id` to confirm the send happened.
- Delete via `DELETE /v1/suppressions/:id` or directly from `suppressions`.

---

## Queue inspection / replay

All queues are BullMQ on Redis. Names:
`email.send`, `email.scheduled`, `email.inbound`, `email.warmup`,
`webhook.deliver`, `dns.verify`, `trash.purge`, `mailbox.sync`,
`broadcast.execute`, `broadcast.abtest`, `contact.import`, `sequence.process`.

Common operations (via the BullMQ CLI or a small ops script):

- Count jobs: `await queue.getJobCounts()`
- List failed jobs: `await queue.getFailed(0, 50)`
- Retry a failed job: `await job.retry()`
- Drain waiting jobs: `await queue.drain()`
- Purge stalled: `await queue.clean(0, 0, "failed")`

The Fastify dashboard currently does not expose these — add a follow-up ticket
for an admin UI.

---

## A send got stuck in `queued`

1. Confirm Redis is reachable: `redis-cli -u $REDIS_URL ping`.
2. Check `email.send` queue depth. If high, the worker process may be down —
   restart the worker deployment.
3. If `scheduled_at` is set, check that `email.scheduled` is running. It polls
   every 30s; a worker restart resumes it.
4. As an immediate mitigation: `PATCH emails SET status='queued' WHERE ...`
   and re-enqueue via the API.

---

## A bounce rate spikes on one domain

1. Check `GET /v1/analytics` filtered to the domain.
2. Look in `suppressions` for the newest entries — the `reason` column
   distinguishes `bounce` / `complaint` / `unsubscribe`.
3. Check `email_events` for `failed` rows; the `data.error` field has the
   SMTP diagnostic.
4. Common root causes:
   - DKIM failing → verify `/v1/domains/:id` shows `dkim_verified: true`.
   - Shared-IP throttling → set `domains.send_rate_per_minute` to a lower value.
   - Missing reverse DNS on the sending IP → update PTR; not something the
     service does for you.

---

## Re-verify a stuck domain

```bash
curl -X POST $BASE_URL/v1/domains/$DID/verify -H "Authorization: Bearer $KEY"
```

The worker re-checks DNS immediately (no 60s delay). If verification still
fails, inspect the `domains` row — fields like `spf_verified`, `dkim_verified`,
`dmarc_verified`, `mx_verified`, `return_path_verified` tell you which record
is off.

---

## CSRF failures on the dashboard

The dashboard double-submits a `csrf_token` cookie via the `X-CSRF-Token`
header (`src/plugins/csrf.ts`). If users see sudden 403 `csrf_missing`:

- Confirm `/auth/me` runs on page load; it refreshes the cookie when missing.
- Confirm `credentials: "include"` is set on fetch (it is in `web/src/lib/api.ts`).
- Confirm the cookie domain matches the API domain in production (same origin).

---

## Observability

- Request logs include `x-request-id` automatically (`src/index.ts`).
- Background modules log via `childLogger(module)` (`src/lib/logger.ts`).
- Pino JSON in prod, pretty in dev. Ship to your aggregator of choice.

Planned follow-ups (not blocking launch):
- `/metrics` Prometheus endpoint (send duration, bounce rate, queue depth).
- Sentry integration for unhandled errors + BullMQ `failed` events.
- Dead-letter `failed_jobs` table with a replay UI.

---

## Shutdown semantics

On SIGTERM the process:
1. Stops accepting new SMTP connections (inbound + relay).
2. Closes the HTTP server (drains in-flight requests via Fastify).
3. Closes BullMQ queues + Redis.
4. Closes the DB pool.

Orchestrator graceful-shutdown timeouts ≥ 30s recommended.
