# Changelog

All notable changes to this project will be documented in this file.

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
