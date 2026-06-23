# ADR — Bounce-Suppression Mailbox Routing Fix (Option 2) — 2026-06-13

> **STATUS 2026-06-23 (IMPLEMENTED — S1025):** Bounce routing fixed end-to-end. No new Patrick action required.
> 1. **ImprovMX forwarding changed (2026-06-23):** `outreach@finda.sale` alias now routes to
>    `outreach@outreach.finda.sale` (the real Google Workspace inbox) instead of `deseee@gmail.com`.
>    Bounce DSNs sent to the outreach@finda.sale envelope address now land in the Workspace mailbox.
> 2. **`GMAIL_MAILBOX_REFRESH_TOKEN` deleted from Railway (2026-06-23):** The broken token that pointed
>    to the failed `find@outreach.finda.sale` account attempt has been removed. `bounceSuppressService`
>    now falls back to `GMAIL_REFRESH_TOKEN` (the working token for `outreach@finda.sale`), which polls
>    `userId='me'` = the same Workspace inbox that bounces now forward to.
> 3. **Job confirmed running:** `POST /api/internal/jobs/run {job:"process-bounces"}` returned HTTP 202
>    `{"ok":true,"job":"process-bounces","status":"started"}`. Auth succeeded (no GMAIL_CLIENT_ID/SECRET/token
>    error thrown). First run will find 0 messages (no bounces have arrived since routing changed);
>    subsequent bounces from outreach sends will be picked up automatically.
> 4. **`bounce-suppression-sweep` Cowork task** is now redundant — the backend native job handles
>    suppression. The Cowork task can be disabled when convenient (it's idempotent, so leaving it
>    running is safe but wastes Cowork context daily).
>
> The "Patrick Action List" (Workspace + OAuth) section below describes the **original** plan.
> It was superseded by the simpler ImprovMX-routing approach. No further action needed.


## Context / Confirmed Root Cause

The Gmail-rail bounce → `EmailSuppression` pipeline has never worked. `EmailSuppression`
has **0 rows with `suppressionReason='BOUNCED'`** in its entire history (only 3 `opted_out`
+ 2 `COMPETITOR_DOMAIN`). Live-triggering `POST /api/internal/jobs/run {job:'process-bounces'}`
returns 202 and the job runs cleanly — logs `[bounceSuppressService] No bounce messages found.`
in ~660ms, no auth or list error. It simply finds **zero** bounce messages in the mailbox it polls,
while June 11–12 hard bounces sit **un-trashed** in `deseee@gmail.com` (the service trashes
everything it processes → un-trashed = never seen).

**Why (mailbox mismatch, not a code-logic bug):**
- Outreach is sent via Gmail API authenticated as the Workspace user **`outreach@finda.sale`**
  (`outreachEmailsCron.ts` → `gmail.users.messages.send({userId:'me'})`). From header =
  `find@outreach.finda.sale` (`OUTREACH_FROM_EMAIL`), but Gmail sets the **envelope sender /
  Return-Path to the authenticated account's primary address = `outreach@finda.sale`**. A From
  header alone does NOT redirect bounces (confirmed: From is already find@… yet DSNs go to
  outreach@finda.sale).
- `outreach@finda.sale` is on the **root `finda.sale` domain, MX = mx1/mx2.improvmx.com**. So the
  Workspace user can *send* but cannot *receive* — inbound to outreach@finda.sale is handled by
  ImprovMX, which forwards to `deseee@gmail.com`. Bounces never reach any pollable Google mailbox.
- `bounceSuppressService` polls via `GMAIL_MAILBOX_REFRESH_TOKEN` (a Workspace mailbox on the
  Google-MX side) — which therefore contains none of these DSNs.
- Auth/secret is NOT the issue: all 9 GitHub Actions pipelines share the same secret/endpoint and
  the `outreach-emails` job is actively sending (32 sends in 2 days).

## Decision

**Unify the Gmail-API send AND poll identity onto a real Workspace mailbox on the
`outreach.finda.sale` subdomain (MX = smtp.google.com), so bounce DSNs return to a Google-MX
address that is a pollable inbox.** Promote `find@outreach.finda.sale` from a send-as *alias* of
outreach@finda.sale to a full Workspace **user mailbox**, authenticate both send and poll as that
account, and send From = that same address.

Result: envelope sender / Return-Path = `find@outreach.finda.sale` → bounces route via the
`outreach.finda.sale` MX (Google) → land in find@'s real mailbox → `bounceSuppressService`
(pointed at the same account) lists, suppresses, and trashes them.

### Rationale
- The envelope sender is what controls bounce routing, and with Gmail API the envelope = the
  authenticated account. The only reliable way to redirect bounces to a pollable Google mailbox is
  to **change the authenticated account** to one whose primary address has Google MX.
- `outreach.finda.sale` already has the right DNS: MX = smtp.google.com (verified), SPF
  `v=spf1 include:_spf.google.com ~all` (verified), DKIM `google._domainkey.outreach` present
  (verified). Sending as find@outreach.finda.sale gives full SPF+DKIM+envelope DMARC alignment —
  a deliverability improvement over the current From/envelope split.
- Keeps bounce handling inside the sending domain — no dependency on Patrick's personal Gmail.
- **Zero blast radius on root-domain forwarding**: root `finda.sale` MX stays ImprovMX, so
  support@/info@/legal@/contact@ forwarding is untouched. (Rejected alternative: pointing root MX
  at Google would break all those.)

### Consequences
- `EmailSuppression` starts receiving `BOUNCED` rows → dead addresses stop getting re-mailed across
  touches 1–4 → real bounce rate drops, protecting Gmail/Workspace sending reputation.
- `deliverabilityMonitorJob` (bounceRate = `EmailSuppression.count ÷ outreachAuditLog SENT`)
  **auto-restores** — it reads the same table, so once BOUNCED rows appear it computes a real rate
  and will alert above 2%. No separate change needed. (Minor pre-existing inaccuracy: it counts ALL
  suppressions incl. opted_out/COMPETITOR as "bounces" — out of scope here, note for later.)

## Code Changes
**None functionally required.** This is an identity/credential + Workspace config change driven by
env vars the code already reads. Optional, non-blocking:
- `services/bounceSuppressService.ts` — header comment says "Polls the outreach@finda.sale Gmail
  inbox"; update to find@outreach.finda.sale (doc only).
- Optional: introduce `OUTREACH_BOUNCE_MAILBOX` env var for self-documentation (not needed for
  function).

Dev must **grep all `GMAIL_REFRESH_TOKEN` consumers** before the token swap and confirm each is fine
sending as find@outreach.finda.sale: `jobs/gmailHealthCron.ts`, `jobs/outreachEmailsCron.ts`,
`lib/emailService.ts`, `services/bounceSuppressService.ts` (fallback). All are outreach/health —
unifying onto find@ is the intended end state.

## Patrick Action List (Workspace + OAuth + Railway)
1. **Google Workspace admin** → make `find@outreach.finda.sale` a real **user mailbox** (not just a
   send-as alias of outreach@finda.sale), so Google delivers inbound to it. (Alternatively create a
   dedicated `bounces@outreach.finda.sale` user and use that everywhere below.)
2. **Generate OAuth2 refresh tokens for that account** (same GMAIL_CLIENT_ID/SECRET app):
   - send scope `https://www.googleapis.com/auth/gmail.send`
   - mailbox scope `https://www.googleapis.com/auth/gmail.modify` (list + trash)
3. **Railway → backend service → Variables** (redeploy after — env changes need a redeploy):
   - `GMAIL_REFRESH_TOKEN` = send token for find@outreach.finda.sale
   - `GMAIL_MAILBOX_REFRESH_TOKEN` = modify token for find@outreach.finda.sale
   - `OUTREACH_FROM_EMAIL` = `find@outreach.finda.sale` (align From with authenticated account)
4. Redeploy backend (trivial commit or Railway redeploy) so the new env vars load.

## Verification (end-to-end)
1. Send a test outreach to a known-invalid address (or wait for an organic hard bounce). DSN should
   now land in find@outreach.finda.sale's Google mailbox.
2. Trigger `POST /api/internal/jobs/run {job:'process-bounces'}` (x-internal-secret = OUTREACH_SECRET).
3. Confirm logs show `Found N bounce message(s)` and `Suppressed: <addr>` (not "No bounce messages found").
4. DB: `SELECT * FROM "EmailSuppression" WHERE "suppressionReason"='BOUNCED' ORDER BY "suppressedAt" DESC` → new rows.
5. Confirm the DSN was moved to Trash in the find@ mailbox.

## Cross-Layer / Knock-On Effects
- DMARC alignment improves (From/envelope/DKIM all on outreach.finda.sale).
- `gmailHealthCron` OAuth health check will now validate the find@ account — expected.
- Daily send quota (1500) is per-account; unifying onto find@ is fine.
- No schema change, no migration, no frontend impact.

## Rollback
Env-var only: revert `GMAIL_REFRESH_TOKEN`, `GMAIL_MAILBOX_REFRESH_TOKEN`, `OUTREACH_FROM_EMAIL` to
prior values and redeploy. No code or schema to roll back.
