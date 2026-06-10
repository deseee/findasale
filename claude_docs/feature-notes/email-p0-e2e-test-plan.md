# Email System — Comprehensive End-to-End Test Plan (run AFTER the S937 push)

**Purpose:** verify the WHOLE email system across every rail and every direction — not
just the transactional P0. Prove (a) legitimate mail DELIVERS from a verified domain to a
real inbox, and (b) every guard FILTERS the addresses it must (@system placeholders,
finda.sale-zone, competitor domains, hard bounces, opt-outs).

**QA Honesty gate (applies to every test):** a Resend/Gmail API 200 is **CODE-ONLY**.
✅ requires a real email received in a real inbox with working links, OR a verified
log/DB skip for the negative/guard tests. "Looks right" / "200 returned" is not ✅.

---

## Pre-requisites (Patrick, before the test session)
1. S937 push merged; Railway backend redeployed (watch the deploy go green).
2. Railway backend env: set `RESEND_FROM_EMAIL=noreply@finda.sale` (Resend only has the
   root `finda.sale` domain verified — `resolveFrom` forces any non-`finda.sale` from-domain
   back to this default; `transactionalEmailService.ts:27,32`).
3. Leave `SES_FROM_EMAIL=find@outreach.finda.sale` UNCHANGED — it is the Gmail-rail
   send-as alias; the code fix decouples Resend from it.
4. Confirm `RESEND_ADMIN_API_KEY` is set in Railway (used by the admin-API verification
   below and by the daily health task's new check M2).
5. Have ready: one Gmail inbox + one Yahoo inbox you control (external, real).

## Rails under test
1. **Resend transactional** — `lib/transactionalEmailService` (auth, stripe, pos, terminal,
   workspace, tierLapse, consignor, message). FROM `noreply@finda.sale`.
   Rail guard: `checkMultiple` (blocks domain-blocked + hard-bounce + complaint + opt-out + soft-bounce).
2. **Gmail bulk/lifecycle** — `lib/emailService` (sale alerts, digests, recap, onboarding,
   wishlist, etc.). FROM `SES_FROM_EMAIL` (find@outreach.finda.sale send-as).
   Rail guard: `isEmailDomainBlocked` ONLY (domain-level; per-caller adds isSuppressed/isHardSuppressed).
3. **Gmail outreach** — `jobs/outreachEmailsCron` (cold outreach, OUTREACH_ENABLED-gated). FROM outreach@finda.sale.
4. **Direct-Resend alerts** — `gmailHealthCron` / `deliverabilityMonitor` -> `QUOTA_ALERT_EMAIL` (deseee@gmail.com).

## How to trigger each rail (verified against code)
- **Resend transactional:** `POST /admin/send-test-email` with `{"rail":"resend", ...}`
  (routes/admin.ts:357); a real password reset; a real email verification; a Stripe-test
  receipt/payout.
- **Gmail bulk one-off:** `POST /admin/send-test-email` with `{"rail":"gmail", ...}`
  (routes/admin.ts:399). NOTE: this uses jobName `admin-send-test-email` and burns 1 quota.
- **Gmail lifecycle crons (recap/weekly/saleAlert/winback):** these are **node-cron only**
  — they are NOT in the `/api/internal/jobs/run` allowlist (JOB_MAP in
  internalJobRunnerController.ts has outreach/lead/enrichment/health jobs only, NOT the
  lifecycle email jobs). To exercise them you must either (a) trigger the real product
  action that feeds them (publish a sale, end a sale), or (b) wait for the 10:00 UTC
  `outwardEmailAutomationsJob` window, or (c) temporarily add a manual trigger. Plan
  around real product actions where possible.
- **Gmail outreach rail:** `POST /api/internal/jobs/run` `{"job":"outreach-emails"}`
  (requires the internal secret header; internal.ts:979). OUTREACH_ENABLED must be true.
- **Direct-Resend alerts:** `POST /api/internal/jobs/run` `{"job":"deliverability-monitor"}`
  or `{"job":"daily-send-summary"}` / `{"job":"gmail-health-check"}`.

---

## RAIL 1 — Resend transactional

### Positive
- **R1-P1 Admin test send (Resend):** `POST /admin/send-test-email` `{"rail":"resend"}` to
  a Gmail AND a Yahoo address. Expect: Resend Log 200, From=`noreply@finda.sale`, lands in
  **Inbox** (note if Spam). ✅ = inbox receipt both providers.
- **R1-P2 Real password reset:** request reset for a seed user -> email arrives, From
  `noreply@finda.sale`, reset link works end-to-end (set new password, log in). ✅ = reset completes.
- **R1-P3 Real email verification:** register a fresh test account -> verification email
  arrives + link verifies. ✅ = account verified.
- **R1-P4 Receipt/payout (Stripe test mode, if testable):** trigger a receipt or
  payout-confirmation; confirm delivery. Else mark CODE-ONLY and note why.

### Negative / guard (transactional rail = `checkMultiple`)
- **R1-N1 @system recipient FILTERED:** send transactional to `qa+x@system.finda.sale`.
  Expect: `[transactionalEmailService] Send blocked — suppressed/domain-blocked recipients`
  in Railway logs, NO Resend call, NO quota. ✅ = log skip + zero Resend record.
- **R1-N2 finda.sale-zone FILTERED except support@:** send to `random@finda.sale` -> BLOCKED;
  send to `support@finda.sale` -> **DELIVERS** (allowlisted; suppressionService.ts:43-49). ✅ = block log for random@, inbox/forward for support@.
- **R1-N3 competitor domain FILTERED:** send to `qa@estatesales.net` -> BLOCKED (BLOCKED_DOMAINS). ✅ = log skip.
- **R1-N4 hard-bounced address SKIPPED:** pick an EmailSuppression row with `bounceHard=true`
  -> transactional send BLOCKED. ✅ = log skip.
- **R1-N5 opted-out (not bounced) on transactional:**  ⚠ **DISCREPANCY TO CONFIRM.** The
  transactional rail uses `checkMultiple` (suppressionService.ts:143), which blocks
  `optedOut` AND `bounceSoft` — so an opted-out-but-not-hard-bounced user is currently
  **SKIPPED on transactional**, NOT delivered. This CONTRADICTS the intended policy
  ("a user who unsubscribed from marketing must still receive receipts" — the design note
  on `isHardSuppressed`, suppressionService.ts:90-92). **Test:** set a test address
  `optedOut=now, bounceHard=false`, trigger a real password reset to it. EXPECTED-BY-DESIGN:
  delivered. EXPECTED-BY-CURRENT-CODE: blocked. If blocked -> this is a **BUG** (transactional
  rail should use `isHardSuppressed`/`checkMultipleHard`, not `checkMultiple`). File a dev
  dispatch; do NOT mark ✅. This is the single most important guard test — receipts must
  reach unsubscribed-but-valid users.

---

## RAIL 2 — Gmail bulk / lifecycle

### Positive
- **R2-P1 Gmail test send:** `POST /admin/send-test-email` `{"rail":"gmail"}` to a Gmail
  address. Expect: Gmail API 200, From=`FindA.Sale <find@outreach.finda.sale>`, message in
  inbox, EmailQuotaLog count increments by 1. ✅ = inbox receipt.
- **R2-P2 Real lifecycle send (post-sale recap):** as a CLAIMED test organizer (NOT scraped),
  publish then end a sale (or wait for the 10:00 UTC `outwardEmailAutomationsJob`). Expect:
  recap email to the organizer's real inbox, `Sale.recapSentAt` stamped. ✅ = inbox receipt
  + recapSentAt set. (This is the exact path that caused the @system flood — verify it now
  ONLY hits claimed organizers.)
- **R2-P3 Sale-alert / weekly digest:** if a seed shopper has alerts configured, confirm a
  real alert/digest is received. Else CODE-ONLY.

### Negative / guard (Gmail rail guard = `isEmailDomainBlocked` only at rail; callers add isSuppressed/isHardSuppressed)
- **R2-N1 @system recipient FILTERED at rail (THE S937 fix):** call the Gmail test send
  with `to=qa+x@system.finda.sale`. Expect: `[emailService] Skipped — all recipients
  unsendable (placeholder/blocked domain)` in Railway logs, NO Gmail send, **NO quota
  increment** (guard runs BEFORE checkAndIncrementQuota; emailService.ts:243 vs :255).
  ✅ = log skip AND EmailQuotaLog unchanged. This is the regression-proof for the bounce flood.
- **R2-N2 recap batch excludes scraped orgs (DB proof):** after the next 10:00 UTC run,
  query `SELECT DATE("recapSentAt"), COUNT(*) FROM "Sale" s JOIN "Organizer" o ON
  s."organizerId"=o.id JOIN "User" u ON o."userId"=u.id WHERE u.email LIKE '%@system%' AND
  DATE("recapSentAt")=CURRENT_DATE` -> expect **0**. ✅ = zero new @system recap stamps post-fix.
- **R2-N3 finda.sale-zone FILTERED except support@:** Gmail test send to `random@finda.sale`
  -> blocked; to `support@finda.sale` -> delivers. ✅ = log skip + inbox/forward.
- **R2-N4 competitor FILTERED:** Gmail test send to `qa@estatesales.net` -> blocked. ✅ = log skip.
- **R2-N5 hard-bounced SKIPPED:** NOTE the Gmail rail-level guard does NOT check the
  EmailSuppression table — only the per-CALLER guard does. Verify via a real lifecycle path
  (e.g. recap to a `bounceHard=true` claimed organizer): the caller's `isSuppressed`/
  `isHardSuppressed` skips it. ✅ = caller skip log. **Also flag:** a bare
  `emailService.emails.send` to a hard-bounced address WITHOUT a caller guard would still
  send — see landmine #2 in system-finda-sale-bounce-source-S937.md (recommend adding
  isHardSuppressed to the Gmail rail).
- **R2-N6 opted-out on bulk SKIPPED:** a `optedOut=true` address must be SKIPPED on bulk
  (recap/weekly use `isSuppressed`). ✅ = caller skip log.

---

## RAIL 3 — Gmail outreach (cold outreach)
- **R3-P1 Outreach run delivers:** `POST /api/internal/jobs/run {"job":"outreach-emails"}`
  (internal secret header). With OUTREACH_ENABLED=true and a seeded, real, opted-in lead,
  confirm an outreach email arrives From `outreach@finda.sale`, with working unsubscribe.
  ✅ = inbox receipt. (If OUTREACH_ENABLED is false in prod, this is CODE-ONLY + note the gate.)
- **R3-N1 @system / scraped placeholder FILTERED:** confirm the outreach candidate query +
  rail guard exclude `@system.finda.sale` leads. Check Railway logs for the skip and
  confirm no DirectoryClaimEmail @system rows are created. ✅ = log skip + zero @system rows.
- **R3-N2 competitor + suppressed FILTERED:** confirm estatesales.net and EmailSuppression
  rows are skipped. ✅ = log skip.

---

## RAIL 4 — Direct-Resend alerts (internal monitoring)
- **R4-P1 Deliverability monitor alert:** `POST /api/internal/jobs/run
  {"job":"deliverability-monitor"}`. If bounce/complaint thresholds are crossed, an alert
  email goes to `QUOTA_ALERT_EMAIL` (deseee@gmail.com) via Resend. ✅ = inbox receipt (or
  verified "below threshold, no alert" in logs = correct no-op).
- **R4-P2 Daily send summary:** `POST /api/internal/jobs/run {"job":"daily-send-summary"}`
  -> digest of yesterday's EmailQuotaLog to QUOTA_ALERT_EMAIL. ✅ = inbox receipt.
- **R4-P3 Gmail OAuth health check:** `POST /api/internal/jobs/run {"job":"gmail-health-check"}`
  -> on OAuth failure, alert to QUOTA_ALERT_EMAIL. ✅ = healthy log OR alert receipt.

---

## Resend admin-API cross-check (verify from Resend's side, not just the inbox)
After the positive transactional tests (R1-P1..P3), run:
```
curl -s -H "Authorization: Bearer $RESEND_ADMIN_API_KEY" "https://api.resend.com/emails?limit=100" > /tmp/resend.json
```
Confirm:
1. The new sends APPEAR (a rail-wide 403 outage would leave them ABSENT — rejected sends create no record).
2. Their `from` is `@finda.sale` (NOT `@send.finda.sale` / `@outreach.finda.sale`).
3. `last_event`/status progresses to `delivered` (not `failed`/`bounced`).
4. Zero `failed` statuses in the recent window.
PASS = test send + password-reset both present, from @finda.sale, delivered. This is the
same query the daily `findasale-email-delivery-health` task's check M2 runs.

## Daily health task — check M2 synthetic-failure verification
Confirm the new M2 check (RESEND_ADMIN_API_KEY presence + admin-API reachability) flags a
synthetic failure: temporarily point M2 at a bad key (or simulate a non-200) and confirm
the daily task reports M2 as FAILED rather than silently passing. ✅ = the task surfaces
the injected failure.

---

## Pass/Fail gates (QA Honesty)
- ✅ ONLY when a real email is received in a real inbox AND links work (positives), or a
  verified log/DB skip is observed (negatives/guards).
- Resend/Gmail 200 with no inbox confirmation = CODE-ONLY (not ✅).
- Mail in Spam: the fix worked (DKIM-aligned) but sender needs warming — log a warming
  follow-up (Google/Yahoo Postmaster Tools), do NOT mark the delivery ✅ as inbox.
- Any guard that fails to filter = ❌ + dev dispatch (NOT a "Patrick decision").

## Dispatch stub for next session
`Skill('findasale-qa')` -> run this plan via Chrome MCP + Resend Logs + real inboxes. Read
seed creds from memory/seed.ts first (NO bash-auth — rate limiter). Trigger crons via
`POST /api/internal/jobs/run` (internal secret) where the job is in JOB_MAP; use real
product actions for the lifecycle email crons (recap/weekly/saleAlert) which are NOT in
JOB_MAP. Stage results in STATE.md Pending Chrome Verifications with screenshot IDs +
Resend Log status codes.

---

## Checklist (next session ticks each)
- [ ] R1-P1 Resend admin test (Gmail+Yahoo) — inbox, From noreply@finda.sale
- [ ] R1-P2 Real password reset — link works end-to-end
- [ ] R1-P3 Real email verification — link verifies
- [ ] R1-P4 Receipt/payout (Stripe test) — delivered or CODE-ONLY
- [ ] R1-N1 @system transactional — blocked, no Resend record
- [ ] R1-N2 random@finda.sale blocked / support@finda.sale delivered
- [ ] R1-N3 estatesales.net blocked
- [ ] R1-N4 hard-bounce blocked (transactional)
- [ ] R1-N5 opted-out transactional — CONFIRM delivers (else BUG: checkMultiple vs isHardSuppressed)
- [ ] R2-P1 Gmail admin test — inbox, From find@outreach.finda.sale, quota+1
- [ ] R2-P2 Real post-sale recap (claimed organizer) — inbox + recapSentAt
- [ ] R2-P3 Sale-alert/weekly digest — inbox or CODE-ONLY
- [ ] R2-N1 @system Gmail — skipped at rail, NO quota increment
- [ ] R2-N2 DB: zero new @system recapSentAt after next 10:00 UTC run
- [ ] R2-N3 random@finda.sale blocked / support@ delivered (Gmail rail)
- [ ] R2-N4 estatesales.net blocked (Gmail rail)
- [ ] R2-N5 hard-bounce skipped via caller guard
- [ ] R2-N6 opted-out skipped on bulk
- [ ] R3-P1 Outreach run delivers (or CODE-ONLY if gate off)
- [ ] R3-N1 @system / scraped excluded from outreach
- [ ] R3-N2 competitor + suppressed excluded from outreach
- [ ] R4-P1 deliverability-monitor alert (or verified no-op)
- [ ] R4-P2 daily-send-summary digest — inbox
- [ ] R4-P3 gmail-health-check — healthy or alert
- [ ] Resend admin-API cross-check — sends present, from @finda.sale, delivered
- [ ] Health task M2 synthetic-failure flagged
