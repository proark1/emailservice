# Deliverability Playbook

Inbox placement is the product. This doc covers what MailNowAPI does for you automatically and what you — the domain owner or platform operator — still have to configure yourself.

Skim the table, then drill into whichever section has a ❗ next to your domain.

---

## 1. What MailNowAPI handles automatically

| Signal | How |
|---|---|
| **DKIM** | 2048-bit RSA key generated per domain, private key AES-256-GCM encrypted at rest, signed on every send. Selector `es1`. |
| **SPF** | `v=spf1 a mx include:{MAIL_HOST} -all` — generated on domain create. |
| **DMARC** | `v=DMARC1; p=quarantine; adkim=s; aspf=s; pct=100`. Strict alignment. `rua=` added when you set `dmarc_rua_email`. |
| **`List-Unsubscribe`** | Both `mailto:` and web link injected on every message. |
| **`List-Unsubscribe-Post: List-Unsubscribe=One-Click`** | RFC 8058 one-click — POST endpoint live, GET endpoint renders a confirmation page. |
| **`Feedback-ID`** | `{email_id}:{account_id}:transactional:{domain}` — picked up by Gmail Postmaster. |
| **Plain-text alternative** | Auto-generated from HTML if you only supply HTML. |
| **RFC 5322 `Message-ID`** | UUID on the sender domain. |
| **Header sanitation** | Blocks `Received`, `DKIM-Signature`, `Return-Path`, `Authentication-Results`, etc. from caller-supplied headers. |
| **Warmup** | Built-in 30-day ramp (2→100/day) with engagement-hold: pauses if open rate <10% after week 1. |
| **DSN bounce auto-suppression** | Inbound MX parses RFC 3464 bounces, permanently-failed recipients (5.x.x) get added to your suppression list automatically; `email.bounced` webhook fires. |
| **FBL complaint auto-suppression** | RFC 5965 ARF reports parsed, complainant added to suppressions; `email.complained` webhook fires. |
| **Pre-send suppression check** | Every send queries the per-account suppression list first. |
| **Return-Path** | Envelope sender is `bounces@{return_path_domain || from_domain}` so DSNs route to your MX. |

---

## 2. What YOU must configure

### 2.1 DNS records — mandatory

When you create a domain via `POST /v1/domains`, the response includes the exact records to publish. At minimum:

| Type | Name | Purpose |
|---|---|---|
| TXT | `yourdomain.com` | SPF |
| TXT | `es1._domainkey.yourdomain.com` | DKIM |
| TXT | `_dmarc.yourdomain.com` | DMARC |
| MX | `yourdomain.com` | Receiving (bounces + inbound) |

Trigger verification after publishing: `POST /v1/domains/{id}/verify`. The worker polls for up to 72h; you can re-trigger at any time.

**If you want DMARC reports**, `PATCH /v1/domains/{id}` with `{ "dmarc_rua_email": "dmarc@yourdomain.com" }`. The returned DMARC TXT value will include `rua=mailto:...` — publish the updated value.

### 2.2 Reverse DNS (PTR) — mandatory, not handled by us

The IP that actually connects to receiving MTAs **must** have a PTR record that resolves back to the `HELO` hostname, and that hostname's A record must point to the same IP (forward-confirmed reverse DNS — FCrDNS). Gmail and Microsoft will reject or junk messages from mismatched IPs.

- Self-hosted: ask your hosting provider (Hetzner, OVH, DigitalOcean, etc.) to set the PTR on the sending IP.
- Using our infra: we handle it.
- Verify: `dig -x <sending_ip>` and `dig <returned_hostname>` should round-trip.

### 2.3 `MAIL_HOST` env var

Set to the actual public hostname of your sending infrastructure (e.g. `mail.mailnowapi.com`). This is what SPF `include:` and PTR resolve to. If not set, SPF falls back to `v=spf1 a mx -all` which only authorizes the domain's own A/MX records — works for low volume but less robust.

### 2.4 Return-Path subdomain (optional, recommended at scale)

Setting `PATCH /v1/domains/{id}` with `{"return_path_domain": "bounces.yourdomain.com"}` routes DSNs to a dedicated subdomain. Benefits:
- Isolates bounce signals from user-facing receiving.
- Helps with DMARC alignment when you send via a relay.
- Required if you plan to forward DMARC reports elsewhere.

You'll need to add an MX record on `bounces.yourdomain.com` pointing to your `MAIL_HOST`.

---

## 3. Recommended DNS extras

None of these are required — but they measurably help when you're above ~10k sends/day.

### 3.1 MTA-STS

Tells sending MTAs to require TLS when delivering to your MX.

1. Publish `_mta-sts.yourdomain.com` TXT: `v=STSv1; id=20260101120000Z`
2. Serve the policy at `https://mta-sts.yourdomain.com/.well-known/mta-sts.txt`:
```
version: STSv1
mode: enforce
mx: mail.mailnowapi.com
max_age: 86400
```

### 3.2 TLS-RPT

Reports on MTA-STS failures.

Publish `_smtp._tls.yourdomain.com` TXT: `v=TLSRPTv1; rua=mailto:tls-reports@yourdomain.com`

### 3.3 BIMI

Displays your brand logo in Gmail. **Requires** DMARC at `p=quarantine` or `p=reject` (you already have quarantine) and a paid VMC certificate.

Publish `default._bimi.yourdomain.com` TXT: `v=BIMI1; l=https://yourdomain.com/logo.svg; a=https://yourdomain.com/vmc.pem`

---

## 4. Monitor your reputation

You cannot improve what you don't measure. Enroll in at least the first two within a week of going live.

| Tool | What it shows | Cost |
|---|---|---|
| [Gmail Postmaster Tools](https://postmaster.google.com/) | Spam rate, domain reputation, IP reputation, auth rates, encryption, delivery errors for Gmail-bound mail | Free |
| [Microsoft SNDS](https://sendersupport.olc.protection.outlook.com/snds/) | Per-IP junk/complaint/trap data for Outlook/Hotmail | Free |
| [MXToolbox Blacklists](https://mxtoolbox.com/blacklists.aspx) | Check your sending IP against 80+ RBLs | Free |
| [DMARC aggregate reports](https://dmarcian.com/) or [Postmark DMARC](https://dmarc.postmarkapp.com/) | Daily digest of what's passing/failing DMARC | Free tiers |

**Set Postmaster up like this**: sign in, verify the domain with the TXT record Google gives you, wait 48h for data to appear. If domain reputation drops to "Bad" or spam rate climbs above 0.3%, pause broadcasts immediately and investigate.

### 4.1 `abuse@yourdomain.com` is not optional

ISPs send complaint reports to `abuse@` and `postmaster@`. Make sure both addresses land somewhere you read:
1. Add a mailbox on your domain via the usual company-member flow.
2. Watch for ARF reports — our inbound MX auto-processes them, but reading them helps you spot a content problem early.

---

## 5. Use the built-in warmup for every new domain

Do not send 10,000 messages on day one from a fresh domain. Start `POST /v1/warmup` — the schedule ramps 2 → 100/day over 30 days, sends to a seed list, and pauses if the reply/inbox rate is poor.

Under the hood:
- Weekends are skipped (looks less botty).
- Ramp auto-pauses if week-1 open rate <10%.
- Ramp auto-pauses if >50% of warmup sends fail.

`GET /v1/warmup/{id}/stats` surfaces the current rate + engagement numbers.

---

## 6. Content rules

These cost nothing, and consistent From + good content beat clever infrastructure every time.

- **One consistent `From` address per campaign type**. Gmail treats `alice@company.com` and `news@company.com` as different reputations.
- **Physical postal address + visible unsubscribe link in the footer** of every broadcast (CAN-SPAM + GDPR).
- **HTTPS links only.** Expired certs on click-throughs tank reputation.
- **No URL shorteners** (`bit.ly`, `t.co`). Shorteners are spam-correlated and most filters downgrade.
- **Image-to-text ratio under 60%**. Single-image emails with no text look like image-only spam.
- **Don't attach executables, PDFs over 5MB, or bulk ZIP archives.** Use a link instead.
- **Avoid spam-trigger language** ("FREE !!!", "100% GUARANTEED", ALL CAPS subjects).
- **Test before broadcast** with [Mail Tester](https://www.mail-tester.com/) — aim for 9/10 or better.

---

## 7. List hygiene

A clean list beats a big list.

1. **Double opt-in.** Single opt-in lists have 5-10× the spam-trap rate.
2. **Re-confirm anyone inactive for 6 months.** If they don't click the re-confirm link, drop them.
3. **Segment engaged vs unengaged.** Send high-frequency campaigns only to the engaged segment.
4. **Never buy or scrape lists.** These are 100% spam-trap poisoned; one send will land you on Spamhaus.
5. **Honor unsubscribes within one request.** Our `/unsubscribe` handler does this automatically; don't try to re-add.

Use `GET /v1/analytics` per-domain to spot inactive cohorts, then export and prune with the suppression API.

---

## 8. Reading our signals

Subscribe webhooks to `email.bounced`, `email.soft_bounced`, `email.complained`, and `email.delivered` — this is how you learn about deliverability in real time.

| Webhook event | Meaning | What to do |
|---|---|---|
| `email.delivered` | SMTP 2xx from the receiving MX | — |
| `email.bounced` | Permanent failure (5.x.x DSN or 5xx SMTP). Recipient auto-added to suppressions. | Update your user record — flag the address as invalid. |
| `email.soft_bounced` | Transient (4.x.x). Not suppressed. | Retry is handled; investigate if a specific recipient keeps soft-bouncing. |
| `email.complained` | ARF complaint from an ISP FBL. Complainant auto-suppressed. | Treat as a hard signal that your content or targeting is wrong — the user hit "This is spam". |

The `GET /v1/suppressions` API is the source of truth. You can also `POST /v1/suppressions` to pre-load known-bad addresses (previous systems, manual complaints, GDPR requests).

---

## 9. Troubleshooting

### "Emails are landing in spam on Gmail but fine on Outlook"

1. Check Gmail Postmaster domain reputation. If "Bad" or "Low", pause broadcasts.
2. Verify your last broadcast passed DMARC — look at your `rua=` digest.
3. Check for a sudden complaint-rate jump (content issue) vs. a slow drift (list decay).
4. Re-read section 6. Ship transactional only for two weeks, watch reputation recover, then resume broadcasts on the engaged segment.

### "Authentication failing per DMARC report"

- Failed SPF: check `MAIL_HOST` matches your actual sending IP's reverse DNS. The easy mistake is sending from IP A but publishing `include:mail.example.com` that resolves to IP B.
- Failed DKIM: private key probably rotated or DNS record out of date. Compare `GET /v1/domains/{id}` returned `value` to what's published in DNS.
- Failed alignment (`adkim`, `aspf`): the `From` domain doesn't match the DKIM `d=` or the envelope sender domain. Make sure you're sending from a verified domain, not a spoofed one.

### "550 5.7.26 This message does not have authentication information" from Gmail

You're not DKIM-signing or not SPF-aligned. Verify:
```bash
curl -X POST http://localhost:3000/v1/domains/{id}/verify \
  -H "Authorization: Bearer es_YOUR_KEY"
```
Then `GET /v1/domains/{id}` — all four (`spfVerified`, `dkimVerified`, `dmarcVerified`, `mxVerified`) should be `true`.

### "Recovering from low Gmail IP reputation"

1. Stop all broadcasts. Transactional only for 14-30 days.
2. Slash send volume to the most-engaged 10% of your list.
3. Fix whatever content or list-source issue caused the drop.
4. Restart warmup via `/v1/warmup` at the lowest tier.
5. Watch Postmaster daily. Recovery takes weeks, not days.

---

## 10. Checklist before you go live

- [ ] Domain created via `POST /v1/domains`
- [ ] SPF / DKIM / DMARC / MX records published (all four verified)
- [ ] `MAIL_HOST` env var set to the actual sending hostname
- [ ] PTR / reverse DNS on the sending IP matches `MAIL_HOST`
- [ ] `dmarc_rua_email` set and receiving reports
- [ ] Gmail Postmaster Tools verified
- [ ] Microsoft SNDS enrolled (if you send to Outlook/Hotmail)
- [ ] `abuse@` mailbox reachable
- [ ] Warmup started via `/v1/warmup`
- [ ] Webhooks subscribed to `email.bounced`, `email.soft_bounced`, `email.complained`
- [ ] `List-Unsubscribe` tested (send to a Gmail address, confirm the header and the one-click POST work)
- [ ] First broadcast tested at [mail-tester.com](https://www.mail-tester.com/) — 9/10 or better

Keep this doc open on day one. You'll refer back to it.
