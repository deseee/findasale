# Email Infrastructure Map — Addresses, Inbound Forwarding & DNS

> **Purpose:** The durable reference for the **receiving / addressing / DNS / provider-account** side of FindA.Sale email — every `@finda.sale` address, what it's for, where it surfaces, and where inbound mail goes.
> **Companion doc (sending side):** `feature-notes/email-outreach-scraper-system-map.md` — the code-verified map of the 3 *send* rails. This file is the *inbound + infrastructure* map; that file is the *outbound code* map.
> **Last verified:** S953 (2026-06-11) — DNS re-checked live via `dig`; ImprovMX aliases + Resend suppression list confirmed in their dashboards; address inventory from `grep` over `packages/`. S-current (2026-06-21) — sending-limit throttling identified; bounce classification added.
> No date suffix — this is a living reference. Update it in place when addresses, aliases, DNS, or providers change.

---

## 1. Provider Accounts (who runs what)

| Layer | Provider | Account / location | Role |
|---|---|---|---|
| Domain registrar | **Spaceship** | spaceship.com | Registrar ONLY — no DNS changes happen here |
| DNS host | **Vercel** | "Patrick's projects" (`patricks-projects-f27190f8`) → vercel.com/.../domains/finda.sale | All DNS records for finda.sale. NOT the personal "deseee" Vercel account |
| Inbound forwarding | **ImprovMX** | app.improvmx.com (free plan) | Forwards every `@finda.sale` alias to Gmail |
| Inbox (destination) | **Gmail** | `deseee@gmail.com` | Where all forwarded `@finda.sale` mail lands |
| Outbound mailbox | **Google Workspace** | `find@outreach.finda.sale` (subdomain mailbox) | The authenticated sender for the Gmail API send rail; also receives bounces/Google notices |
| Transactional send | **Resend** | resend.com (login `deseee@gmail.com`) | Transactional + quota-alert rail; `finda.sale` root domain verified |
| Marketing send | **MailerLite** | account `2169788` (login `deseee@gmail.com`) | Lifecycle/onboarding campaigns; sends from `support@finda.sale` |
| Legacy send | **Amazon SES** | `send.finda.sale` subdomain | Legacy fallback FROM addresses only |

---

## 2. DNS Records (live, verified S953 via `dig`)

**Root `finda.sale`**
- **MX:** `10 mx1.improvmx.com`, `20 mx2.improvmx.com` → inbound forwarding via ImprovMX
- **SPF (TXT):** `v=spf1 a mx include:_spf.google.com include:_spf.mlsend.com ~all` → authorizes Google Workspace + MailerLite to send as `@finda.sale`
- **DMARC (`_dmarc` TXT):** `v=DMARC1; p=none;` (last-known; monitoring only, no enforcement)
- **Resend DKIM:** `resend._domainkey` TXT present → authorizes Resend for `noreply@finda.sale`
- **MailerLite:** `litesrv._domainkey` CNAME + `mailerlite-domain-verification=d7a915bd...` TXT
- **Google site-verification:** 3 TXT records (Search Console / Workspace)

**Subdomains**
- **`outreach.finda.sale` MX:** `1 smtp.google.com` → Google Workspace mailbox (`find@outreach.finda.sale`). DKIM at `google._domainkey.outreach`.
- **`send.finda.sale` MX:** `10 feedback-smtp.us-east-1.amazonses.com` → Amazon SES (legacy)
- **`system.finda.sale`:** null MX (`0 .`, RFC 7505) added S947 → mail to scraper placeholder addresses hard-fails instantly instead of flooding DSNs

---

## 3. Inbound Forwarding — ImprovMX aliases

Root `finda.sale` MX points at ImprovMX. **Every alias below forwards to `deseee@gmail.com`.** A **catch-all (`*`)** is now active, so ANY `@finda.sale` address forwards even if not explicitly listed.

| Alias | Forwards to | Notes |
|---|---|---|
| `*` (catch-all) | deseee@gmail.com | Added S953 — guarantees nothing is silently dropped |
| `support@` | deseee@gmail.com | Public contact address (see §4) |
| `contact@` | deseee@gmail.com | Added S953 |
| `info@` | deseee@gmail.com | Added S953 |
| `legal@` | deseee@gmail.com | Added S953 — DMCA / legal pages |
| `privacy@` | deseee@gmail.com | Added S953 — GDPR / privacy page |
| `receipts@` | deseee@gmail.com | Added S953 |
| `patrick@` | deseee@gmail.com | Pre-existing |
| `outreach@` | deseee@gmail.com | Pre-existing — also catches outreach bounce DSNs |

**History (S953):** before this session only `support`, `patrick`, `outreach` were aliased. Mail to `legal@`, `privacy@`, `info@`, `contact@`, `receipts@` was being silently rejected by ImprovMX (no alias → bounce to sender, which itself had no alias → vanished). Patrick added the five missing aliases + a catch-all; all verified forwarding to Gmail.

**Gmail routing gotcha:** a Gmail filter auto-files everything to `support@` (and contact-form notifications) under the **`FindASale/Support`** label, where it lands **unread** and skips the primary inbox. This is why inbound support mail "looked missing." Check that label, or loosen the filter.

---

## 4. Address Inventory (send / receive / purpose)

| Address | Send / Receive | Purpose | Where it surfaces |
|---|---|---|---|
| `support@finda.sale` | Both | Public contact address + contact-form recipient (`SUPPORT_EMAIL`) + MailerLite campaign sender | ~12 frontend pages (contact, privacy, terms, DMCA, 404, FAQ, subscription, about, history); `routes/contact.ts`; the ONE allowlisted `@finda.sale` send-target in code |
| `find@outreach.finda.sale` | Send + mailbox | Gmail API send rail authenticated sender (`SES_FROM_EMAIL`); receives bounces + Google suspension notices | Workspace mailbox on outreach subdomain; ~38 backend importers of `lib/emailService` |
| `noreply@finda.sale` | Send | Resend transactional rail (`RESEND_FROM_EMAIL`) | `transactionalEmailService.ts` |
| `alerts@send.finda.sale` | Send | Quota / health alerts via Resend (Gmail-outage-proof) | `emailService.sendQuotaAlert`, `gmailHealthCron` |
| `admin@finda.sale` | n/a | Web-push contact (`VAPID_CONTACT_EMAIL`) — not real email | push config |
| `legal@` / `privacy@` | Receive | Legal/DMCA + GDPR contact | DMCA page, privacy page |
| `info@` / `contact@` / `receipts@` | Receive | General / contact / receipts | site + code references |
| `patrick@finda.sale` | Receive | Personal | mailto/display |
| `scraper+slug@system.finda.sale` | Neither | ~72k scraper placeholder User rows — NEVER real inboxes | zone-blocked in code; null MX |

---

## 5. Sending Rails (summary — full detail in companion doc)

Three outbound paths. See `email-outreach-scraper-system-map.md` for code-level detail.
- **Rail A — Gmail API** (`lib/emailService.ts`): bulk / lifecycle / cold outreach from `find@outreach.finda.sale`. DB-backed internal guard of 1500/day (`GMAIL_DAILY_HARD_LIMIT`) — but this is the CODE's own guard, NOT Google's enforced limit. Google's REAL enforced limit is **reputation-throttled to ~200-300/day** (far below the 2000/day paid Workspace ceiling). Evidence (2026-06-21): the cron attempted ~305 sends (quota log recorded 169) and 136 bounced with Gmail "You have reached a limit for sending mail. Your message was not sent." (daily sending-limit, no 4.x.x rate code). See §8.
- **Rail B — Resend** (`lib/transactionalEmailService.ts`): transactional (auth, receipts, invites) + quota alerts. FROM `noreply@finda.sale`. Gmail-suspension-proof.
- **Rail C — Amazon SES** (`send.finda.sale`): legacy fallback FROM addresses only.

**Recipient-domain policy (S937):** the app must NEVER send to its own `finda.sale` / `*.finda.sale` zone — enforced by `suppressionService.isEmailDomainBlocked()` on BOTH rails. Only exception: `SUPPORT_EMAIL`. To add a new internal inbox the app may email FROM the app, add it to the `SENDABLE_FINDA_SALE_ADDRESSES` env var (Railway + .env) — no code change needed.

---

## 6. Resend Suppression — mechanism & how to clear (S953 learnings)

**How it works:** when a send hard-bounces, Resend adds the recipient to its **account-level suppression list**. Future sends to that address are **not delivered** — Resend self-generates a bounce and marks the email **"Suppressed"** in the Emails log (this does NOT count toward the bounce-rate metric). A webhook (`routes/outreach.ts`) mirrors these bounces into the local **`EmailSuppression`** DB table (`addSuppression`).

**To clear a suppression (dashboard — the API send-key cannot do this):**
1. resend.com → **Emails** → open the suppressed email (status "Suppressed").
2. Click the actions menu (top-right `...`) to reveal the **EMAIL EVENTS** panel.
3. Click **"Remove from suppression list"** → toast confirms removal.
4. If a local DB row exists, also delete it from `EmailSuppression` (psycopg2 against Railway).

**GOTCHA — never test internal `@finda.sale` forwarding by sending through Resend (or any app rail).** The zone is code-blocked anyway, and a bounce poisons that address in Resend's list. To test inbound forwarding, use **ImprovMX's per-alias `TEST` button** — it routes straight through ImprovMX, bypasses Resend, and creates no bounces.

**S953 incident (self-inflicted, resolved):** testing forwarding for `legal@`/`privacy@`/`info@` via Resend *before* their ImprovMX aliases existed hard-bounced them → Resend-suppressed + 4 `EmailSuppression` DB rows. Fix: removed all three from the Resend suppression list (dashboard), deleted the 4 DB rows, re-sent — all delivered and forwarded to Gmail. `receipts@` was only a soft bounce (never suppressed).

**Bounce classification (verified 2026-06-21):** the daily bounce job (`bounceSuppressService`) now classifies bounces by category — `DEAD_MAILBOX` / `NO_MX` / `POLICY_BLOCK` / `TRANSIENT` / `UNKNOWN` — and only permanently suppresses true dead mailboxes. Recoverable policy-blocks get a cooldown (`retryAfter`) instead of permanent suppression. New `EmailSuppression` columns: `bounceCategory`, `bounceStatusCode`, `diagnosticCode`, `retryAfter`, `classifiedAt`.

---

## 8. Sending Limits & Reputation Throttling (verified 2026-06-21)

**The 1500/day in §5 is a code guard, not Google's limit.** `GMAIL_DAILY_HARD_LIMIT` (1500) is FindA.Sale's own internal cap. Google enforces a *separate* limit, and for `find@outreach.finda.sale` that limit is currently **reputation-throttled to roughly ~200-300/day** — far below the 2000/day ceiling of a paid Workspace seat.

**Evidence (2026-06-21):** the cron attempted ~305 sends (quota log recorded 169) and **136 bounced** with the Gmail message *"You have reached a limit for sending mail. Your message was not sent."* — a daily sending-limit block (no 4.x.x transient rate code). 500+ such failures exist historically, so this is **chronic, not a one-off**.

**Root signal:** reputation throttling driven by cold-outreach spam flags — the same `5.7.1` *"unsolicited / Message rejected"* outbound blocks documented in the deliverability findings.

**Tactical fix (shipping):** new env `OUTREACH_DAILY_CAP` (default 75), surge guard, send pacing, and limit-aware backoff so the cron stays under the throttle instead of slamming into it.

**Strategic fix (specced):** migrate cold outreach off the Workspace mailbox onto a **dedicated sending domain + ESP** to isolate `finda.sale`'s root reputation. See `feature-notes/ADR-dedicated-outreach-sender.md`.

---

## 9. Related
- `feature-notes/email-outreach-scraper-system-map.md` — sending rails (code map)
- `feature-notes/email-audit-history-consolidated.md` — historical deliverability findings
- `feature-notes/gmail-rail-audit-s937.md` — Gmail rail DKIM/SPF/quota audit
- `feature-notes/ADR-dedicated-outreach-sender.md` — strategic migration to a dedicated outreach sender (domain + ESP)
- Memory: `reference_dns_infrastructure`, `reference_email_rails_and_gates`, `reference_email_recipient_domain_policy`
