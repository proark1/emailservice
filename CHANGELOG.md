# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0] — 2026-04-19

### Added
- **Company accounts** — multi-tenant model so an external platform can use
  one root MailNowAPI account to serve many of its own customers. Each
  customer-project becomes a "company" that owns domains and provisions its
  own members:
  - New tables `companies`, `company_members`, `company_mailboxes` and
    `company_id` columns on `domains` and `api_keys` (migration `0017`).
  - `/v1/companies/*` routes: CRUD, domain linking, API key minting, member
    provisioning (creates an `accounts` row, assigns a handle, and optionally
    mints a per-member API key in a single call), and handle management.
  - `POST /v1/companies/:id/domains` accepts either `{ domain_id }` (link an
    existing domain) or `{ name, mode? }` (create + link in one call) and
    returns the DNS records to hand to the end customer.
- **Per-handle inbound routing** — when a domain is linked to a company, mail
  to `alice@customer-domain.com` now lands in Alice's isolated inbox (not the
  domain owner's shared inbox). Domains without a company link retain today's
  behavior (`src/smtp/inbound-server.ts`).
- **18 new MCP tools** for company, member, mailbox, domain, and API key
  management (`create_company`, `provision_company_member`,
  `create_company_domain`, `assign_company_mailbox`, etc.).

### Security
- Company-scoped API keys are restricted to their own company's domains.
  `sendEmail` now rejects any `from` address whose domain is not linked to
  the key's company (`src/services/email.service.ts`), preventing cross-tenant
  sends on a shared root account. Internal workers (broadcasts, sequences,
  warmup) and dashboard cookie sessions are unaffected.
- Company API keys are minted with explicit `company:provision` and
  `company:read` permissions; the raw key is returned once and never again.

## [1.4.0] — 2026-03-28

### Security
- Click tracking URLs now signed with HMAC to prevent open redirect abuse
- Removed legacy unsigned base64url unsubscribe fallback (prevented suppression injection)
- Expanded webhook SSRF protection with IPv6 private ranges, `.local`/`.internal` suffixes
- Added 25MB message size limit to SMTP inbound server
- Frontend API layer now redirects to login on 401/403 (expired session handling)

### Fixed
- Fixed invalid Tailwind `pt-18` class causing dashboard content to be hidden behind mobile header
- Fixed ILIKE wildcard characters (`%`, `_`) not escaped in dashboard search queries
- Fixed inbox mutations (star, archive, delete) silently swallowing errors with no user feedback
- Fixed modal error state persisting when reopening Broadcast and Warmup create modals
- Fixed AdminPanel account delete and warmup cancel having no error handling

### Changed
- Replaced all native `window.confirm()`/`alert()` dialogs with styled `ConfirmDialog` component across 9 pages
- Added `useConfirmDialog` hook, `Toast` component, and `useToast` hook to UI component library
- Added Escape key handler and ARIA attributes (`role`, `aria-modal`, `aria-label`) to Modal component
- Added `aria-label` to mobile hamburger menu button
- Added `sm:grid-cols-3` breakpoint to dashboard stats grid for tablet viewports
- Added delete confirmation dialog to inbox email deletion

## [1.3.0] — 2026-03-21

### Added
- Full self-hosted VPS deployment stack (`deploy/` directory)
- Production Docker Compose with separate API, worker, and SMTP relay containers
- Postfix configuration for outbound delivery (port 25) and inbound receive
- Caddy reverse proxy with automatic Let's Encrypt HTTPS
- One-command server setup script (`deploy/setup.sh`)
- Deployment guide with DNS, Hetzner setup, and troubleshooting (`deploy/README.md`)
- Dockerfile healthcheck and multi-process support via CMD override

## [1.2.0] — 2026-03-20

### Changed
- Complete UI/UX overhaul: dark theme replaced with modern light theme
- All pages converted: Dashboard, Admin Panel, Landing, Login, Register
- Added Inter font for cleaner typography
- Mobile-responsive sidebar with hamburger menu (collapses on small screens)
- Responsive grids and tables with overflow scrolling on mobile
- Cards now use white backgrounds with subtle shadows
- Status badges updated for light background visibility
- Code block on landing page kept dark for contrast
- CTA section uses soft violet gradient background

## [1.1.0] — 2026-03-20

### Added
- Comprehensive admin analytics page with 10 new API endpoints
- Key metrics: delivery rate, open rate, click rate, bounce rate, complaint rate
- Email volume time series (last 30 days by status)
- Event volume time series (opens, clicks, bounces, etc.)
- Top accounts and top domains leaderboards
- Webhook delivery health dashboard (success/failed/exhausted rates)
- Suppression breakdown by reason (bounce, complaint, unsubscribe, manual)
- Real-time activity feed showing recent email events across all accounts
- API key usage monitoring (active/dormant/revoked status)
- New admin-analytics service (`src/services/admin-analytics.service.ts`)

## [1.0.0] — 2026-03-20

### Added
- Email sending API (`POST /v1/emails`) with DKIM signing, tracking, and queue-based delivery
- Batch sending (`POST /v1/emails/batch`) up to 100 emails per request
- Domain management with automatic SPF, DKIM (RSA-2048), DMARC, and MX record generation
- DNS auto-setup via GoDaddy and Cloudflare APIs
- DNS verification worker with exponential backoff polling (up to 72 hours)
- Webhook delivery with HMAC signatures and retry logic (30s, 2m, 15m, 1h, 6h)
- SMTP relay server (port 587/465) for clients sending through the service
- SMTP inbound server (port 2525) for receiving emails
- Click and open tracking with per-email analytics
- Audiences and contacts management
- Suppression lists (bounces, complaints, unsubscribes)
- Dashboard UI (React 19 + Vite + TailwindCSS 4) with domain setup, email viewer, webhook management
- API key authentication (argon2 hashed) and JWT session auth for dashboard
- Idempotency key support for safe retries
- Scheduled email sending
- Rate limiting per API key
