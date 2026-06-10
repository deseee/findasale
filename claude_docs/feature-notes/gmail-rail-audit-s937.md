# Gmail Rail Deliverability Audit — S937

**Date:** 2026-06-09 · **Mode:** READ-ONLY ops/deliverability audit · **Scope:** Gmail sending rail end-to-end (tokens, alias, DKIM/SPF, quota, headers, bounce ingestion, Sentry).

---

## VERDICT (2 lines)

The Gmail rail is **fundamentally proper and currently healthy**: it sends from a Google-Workspace domain (`outreach.finda.sale`) that is SPF-authorized AND has a live Google DKIM record, it is sending real volume (200–400/day, DB-confirmed), and Sentry shows **zero** `email_rail:gmail` send failures or `invalid_grant` errors in the last 7 days. The holes are not in the live Gmail path but in **alignment hygiene and fallbacks**: (1) the `find@outreach.finda.sale` From only works because it is a Gmail "send mail as" alias — that fact is verifiable ONLY in Gmail web settings (Patrick-confirm), and (2) the `SES_FROM_EMAIL`-defaults-to-`@send.finda.sale` pattern across ~30 callers means if the env var is ever **unset**, every Gmail-rail send silently falls back to `@send.finda.sale`, which has **no Google DKIM** → DKIM-unaligned Gmail mail = spam-folder risk.

---

## 1. AUTH / TOKENS

| Component | File | Token used | Auth identity |
|---|---|---|---|
| Transactional/bulk send | `emailService.ts:159-170` (`createGmailClient`) | `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN` | `userId:'me'` = the outreach Workspace mailbox the refresh token belongs to |
| Outreach cron send | `outreachEmailsCron.ts:78-89` (`createGmailClient`) | Same three vars (`GMAIL_REFRESH_TOKEN`) | Same mailbox |
| Bounce ingestion | `bounceSuppressService.ts:28-40` (`createGmailClient`) | **`GMAIL_MAILBOX_REFRESH_TOKEN` preferred, falls back to `GMAIL_REFRESH_TOKEN`** (needs `gmail.modify` scope) | Same mailbox |
| OAuth health check | `gmailHealthCron.ts:52-92` (`runGmailOAuthHealthCheck`) | `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN` | calls `gmail.users.getProfile` to prove token validity |

**Token-validity catcher exists and is scheduled.** `gmailHealthCron.ts` is a side-effect import in `index.ts:222`, which executes three `cron.schedule()` calls at module load:
- `30 6 * * *` → `runGmailOAuthHealthCheck` (daily 06:30 UTC) — calls `getProfile`, fires a **Resend** alert ("Gmail OAuth token BROKEN") if the refresh token is dead. Resend is the correct out-of-band channel (independent of Gmail).
- `0 8 * * *` → `runDailySendSummary` (daily 08:00 UTC) — quota digest.
- `0 */2 * * *` → `runSuspensionDetect` (every 2h) — alerts if quota-blocked.

Also registered in the internal job runner `JOB_MAP` (`internalJobRunnerController.ts:49` `'gmail-health-check'`, `:50` `'daily-send-summary'`, `:51` `'suspension-detect'`) so it can be triggered externally.

**Gotcha (P2):** There is **no GitHub Actions workflow** that calls `gmail-health-check`/`suspension-detect`/`daily-send-summary` — verified: `grep -rln "gmail-health-check|suspension-detect|daily-send-summary|deliverability-monitor" .github/workflows/` → **NONE**. Only the 8 `pipeline-*.yml` workflows hit `/api/internal/jobs/run`, none for Gmail health. So the OAuth health check runs **only** via the in-process Railway cron. If the Railway backend process is down (the exact scenario where you'd most want the alarm), the health check does not run.

> Runtime token validity cannot be read from code. The mechanism that WOULD catch a dead token exists and is scheduled (06:30 UTC in-process). Sentry shows no `invalid_grant` in 7d (§6) — positive live evidence the token is currently valid.

---

## 2. FROM-ADDRESS / ALIAS / DKIM-SPF ALIGNMENT (core question)

### DNS evidence (dig, run S937)

```
MX  outreach.finda.sale         -> 1 smtp.google.com.                          (Workspace OK)
MX  finda.sale                  -> 10 mx1.improvmx.com / 20 mx2.improvmx.com   (improvmx inbound only)
MX  send.finda.sale             -> 10 feedback-smtp.us-east-1.amazonses.com.   (SES bounce domain)
TXT finda.sale       SPF        -> v=spf1 a mx include:_spf.google.com include:_spf.mlsend.com ~all
TXT outreach.finda.sale SPF     -> v=spf1 include:_spf.google.com ~all
TXT send.finda.sale  SPF        -> v=spf1 include:_spf.google.com ~all
DMARC finda.sale                -> v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@finda.sale
DMARC outreach.finda.sale       -> v=DMARC1; p=none; rua=mailto:dmarc@outreach.finda.sale
DKIM google._domainkey.outreach.finda.sale -> live v=DKIM1 RSA key present  OK
DKIM google._domainkey.finda.sale (root)   -> live v=DKIM1 RSA key present  OK
DKIM google._domainkey.send.finda.sale     -> EMPTY (no Google DKIM)        FAIL
```

### From-domains actually in play

| Sender | Code | Effective From when `SES_FROM_EMAIL=find@outreach.finda.sale` | When `SES_FROM_EMAIL` UNSET |
|---|---|---|---|
| Bulk transactional (~30 files) | `process.env.SES_FROM_EMAIL \|\| 'xxx@send.finda.sale'` | **`find@outreach.finda.sale`** (aligned) | **`xxx@send.finda.sale`** (NOT Google-DKIM-aligned) |
| Outreach cold cron | `outreachEmailsCron.ts:592` `OUTREACH_FROM_EMAIL \|\| 'outreach@finda.sale'` | `OUTREACH_FROM_EMAIL` (or `outreach@finda.sale`) | same |
| Admin test send | `admin.ts:398` `SES_FROM_EMAIL \|\| 'find@outreach.finda.sale'` | `find@outreach.finda.sale` | `find@outreach.finda.sale` |

### Answers to the three specific questions

**(a) Is `find@outreach.finda.sale` aligned?** YES. `outreach.finda.sale` is SPF-authorized (`include:_spf.google.com`) AND has a live Google DKIM record. Mail from `@outreach.finda.sale` via the Workspace mailbox = SPF-pass + DKIM-pass + DMARC-aligned (subdomain DMARC `p=none`). This is the correct From for the Gmail rail.

**(b) Does any Gmail-rail sender effectively send from `@send.finda.sale`?** **Only if `SES_FROM_EMAIL` is unset.** When set to `find@outreach.finda.sale` (the P0-evidence value), every `|| '...@send.finda.sale'` fallback is overridden and NO Gmail send uses `@send.finda.sale`. But `send.finda.sale` has SPF-google yet **no Google DKIM** (`google._domainkey.send.finda.sale` is empty). If the var is cleared/typo'd, Gmail blasts from a DKIM-unaligned domain. Latent footgun, P2.

**(c) Send-as alias requirement (Patrick-confirm).** Gmail API `users.messages.send` only honors a `From:` that is the authenticated user's primary OR a verified "send mail as" alias. `find@outreach.finda.sale` is the From, and **DB evidence proves sends succeed** (EmailQuotaLog: 400 on 2026-06-06, 202 on 06-07, 200 on 06-08 — counter increments inside the send path AFTER `checkAndIncrementQuota`, immediately before `gmail.users.messages.send`). Sentry shows zero `Invalid From`/`gmail_send_failed` in 7d. So empirically the alias is configured correctly and working. Whether it is a formal "send mail as" alias vs. mailbox primary is a Gmail-web-settings fact -> Patrick-confirm, but live evidence makes it effectively confirmed-working.

---

## 3. QUOTA / BLAST PROTECTION

- **HARD_LIMIT = 1500**, DB-backed via `EmailQuotaLog`. `emailService.ts:20` `parseInt(process.env.GMAIL_DAILY_HARD_LIMIT || '1500', 10)`.
- **DB-backed counter** (`checkAndIncrementQuota`, `emailService.ts:79-115`) uses `prisma.emailQuotaLog.upsert` with `count:{increment:1}` keyed on date — atomic, survives Railway restarts. The Jun-5 in-memory-Map blast bug (8,317 emails, S887) is **fixed**: the in-memory Map is gone, replaced by the DB upsert (documented `emailService.ts:13-16`). No in-memory counter remains in the send path.
- **Alert threshold** = `floor(1500 * 0.75)` = 1125 (`emailService.ts:22`). Resend warning once/day (deduped via `alertSentAt`).
- **Hard stop** at count > 1500 throws `QuotaExceededError` BEFORE the Gmail send (`emailService.ts:94-100`); outreach cron checks quota at `outreachEmailsCron.ts:636` before each send at `:645`.
- Live DB confirms nowhere near breached (200–400/day vs 1500). Blast protection sound. No P0/P1.

---

## 4. COMPLIANCE HEADERS

- **emailService `buildRawMessage`** (`emailService.ts:188-200`): `List-Unsubscribe: <url>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. OK
- **outreach `buildRawEmail`** (`outreachEmailsCron.ts:142-143`): `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Value (`:594`) is dual mailto+http: `<mailto:unsubscribe@finda.sale?subject=unsubscribe>, <https link>` — RFC-compliant. OK
- **CAN-SPAM physical address:** `outreachEmailsCron.ts:544` `OUTREACH_PHYSICAL_ADDRESS || '219 E Michigan Ave, Suite F, Paw Paw, MI 49079'`, injected as `[physical address]` (`:577`) into all 12 cold templates (verified). OK
- **Gap (P3):** transactional `buildRawMessage` omits a physical address. Acceptable — transactional/relationship mail is CAN-SPAM-exempt; the commercial outreach path correctly includes it. No action.

---

## 5. BOUNCE INGESTION

- `bounceSuppressService.processBounces()` polls the **outreach Gmail inbox** (`userId:'me'`, query `from:mailer-daemon OR from:postmaster -in:trash`, `bounceSuppressService.ts:175`), extracts the bounced address (X-Failed-Recipients -> Final-Recipient -> body patterns), upserts into **`EmailSuppression`** (`bounceHard:true, suppressionReason:'BOUNCED'`), then trashes the message. Loop is closed in code.
- **Scheduled:** `index.ts:802-812`, daily `0 6 * * *` UTC, wrapped in a defensive dynamic `require()` (missing compiled `.js` logs a warning instead of crashing — fix for Sentry FINDASALE-NODEJS-1A, S919).
- **Token:** `GMAIL_MAILBOX_REFRESH_TOKEN` (needs `gmail.modify`), falls back to `GMAIL_REFRESH_TOKEN`.
- **WARNING (P2):** Live DB `EmailSuppression` = **5 rows total** (3 `opted_out`, 2 `COMPETITOR_DOMAIN`, **ZERO `BOUNCED`**). With 800+ outreach sends in 3 days, zero captured bounces is suspicious (typical cold bounce rate 2–5%). Possible causes: (1) genuinely no bounces (improbable at volume); (2) `GMAIL_MAILBOX_REFRESH_TOKEN` lacks `gmail.modify` scope so `list`/`trash` silently fail (service catches + returns early, logs only); (3) bounces land in a different inbox than the token authenticates. Per memory `reference_email_rails_and_gates.md`, bounces land at `find@outreach.finda.sale`. **The bounce loop is wired but has captured nothing in prod — unproven.** Needs a live outreach-inbox check + runtime scope verification of `GMAIL_MAILBOX_REFRESH_TOKEN` -> Patrick-confirm / dev follow-up.

---

## 6. SENTRY (last 7d)

Org `deseee`, region `https://us.sentry.io`. Searches run S937:

| Query | Result |
|---|---|
| `email_rail:gmail lastSeen:-7d` | **0 issues** |
| `invalid_grant lastSeen:-7d` | **0 issues** |
| `gmail` (all time) | **0 issues** |
| `email` (all time) | **0 issues** |

The `gmail_send_failed` capture path (`emailService.ts:177-180`, `tags:{email_rail:'gmail', kind:'gmail_send_failed'}`) has fired **zero** times. No `invalid_grant` (dead token), no `Invalid From`, no `QuotaExceeded`. Strong positive signal the Gmail rail sends cleanly. (Caveat: a parallel dev pass is *adding* Sentry-capture to more error paths, so today's clean read partly reflects limited instrumentation; the one instrumented path — the send catch block — is clean.)

---

## 7. OTHER GMAIL GOTCHAS

- **`SES_FROM_EMAIL` shared-var footgun (P2, headline risk).** One env var is the From for BOTH Resend (must be a Resend-verified domain — the just-fixed P0) AND Gmail (must be Workspace-aligned `outreach.finda.sale`). These constraints conflict. `find@outreach.finda.sale` satisfies Gmail but is what 403'd Resend. **Recommend splitting into `GMAIL_FROM_EMAIL` + `RESEND_FROM_EMAIL`.** (Resend alerts already use a separate `RESEND_FROM_EMAIL` at `emailService.ts:56` / `gmailHealthCron.ts:31` -> `alerts@finda.sale`; the main transactional `SES_FROM_EMAIL` is still shared across ~30 controller callers.)
- **`@send.finda.sale` DKIM-unaligned fallback (P2).** ~30 callers default to `*@send.finda.sale` (SPF-google, no Google DKIM). Masked today only because `SES_FROM_EMAIL` is set. If unset -> unaligned Gmail blast. Fix: add Google DKIM for `send.finda.sale`, OR change in-code fallbacks to `@outreach.finda.sale`, OR split env vars.
- **From-header caller-supplied, not validated (P3).** Both `buildRawMessage` and `buildRawEmail` write `From:` verbatim from `opts.from`. No allowlist guard; a bad env value sends silently from an unaligned domain.
- **No hardcoded `send.finda.sale` that would 403 the *Gmail* rail.** Gmail ignores Resend domains; the `@send.finda.sale` defaults only hurt DKIM alignment, not send success. The 403 risk is Resend-only and already addressed.

---

## FINDINGS TABLE

| area | file:line / dig output | sev | finding | recommended fix |
|---|---|---|---|---|
| From alignment | `dig google._domainkey.outreach.finda.sale` live DKIM; SPF include _spf.google.com; SES_FROM_EMAIL=find@outreach.finda.sale | PASS | Gmail rail active From is fully SPF+DKIM+DMARC aligned. Core question = healthy. | none |
| Live send proof | DB EmailQuotaLog 400/202/200 Jun 6/7/8; Sentry email_rail:gmail = 0 in 7d | PASS | Bulk Gmail sends succeeding; alias works in practice. | none (Patrick-confirm alias for the record) |
| Shared env footgun | ~30 callers `SES_FROM_EMAIL \|\| '*@send.finda.sale'` e.g. stripeController.ts:50, notificationController.ts:282, auth.ts:125 | P2 | One SES_FROM_EMAIL serves both Resend (needs Resend domain) and Gmail (needs Workspace domain) — conflicting; caused the Resend 403 P0. | Split into GMAIL_FROM_EMAIL + RESEND_FROM_EMAIL; update callers per rail. |
| DKIM-unaligned fallback | `dig google._domainkey.send.finda.sale` EMPTY; fallbacks default to @send.finda.sale | P2 | If SES_FROM_EMAIL ever unset, every Gmail send falls back to @send.finda.sale (no Google DKIM) -> spam/quarantine risk. | Add Google DKIM for send.finda.sale, OR change fallbacks to @outreach.finda.sale, OR split env vars. |
| Bounce ingestion unproven | DB EmailSuppression = 5 rows, 0 BOUNCED, after 800+ sends in 3d; bounceSuppressService.ts:28-40,175 | P2 | Bounce loop wired + scheduled but captured zero bounces in prod — unproven. Likely scope/inbox mismatch on GMAIL_MAILBOX_REFRESH_TOKEN. | Verify token authenticates the bounce inbox (find@outreach.finda.sale) with gmail.modify scope; run processBounces once and confirm rows. Patrick-confirm + dev. |
| Health-check alarm SPOF | grep .github/workflows -> no gmail-health-check workflow; only in-process cron gmailHealthCron.ts + index.ts:222 | P2 | OAuth-token-dead alarm runs ONLY in-process on Railway. If backend is down, the alarm never fires. | Add GitHub Actions schedule POSTing {"job":"gmail-health-check"} to /api/internal/jobs/run (JOB_MAP entry exists) as out-of-process watchdog. |
| From-header not validated | emailService.ts:188 / outreachEmailsCron.ts:137 write From: verbatim | P3 | No allowlist guard on From domain; bad env value sends silently unaligned. | Assert From domain in {outreach.finda.sale} before messages.send. |
| Transactional rail no physical addr | emailService.ts buildRawMessage (no [physical address]) | P3 | Transactional emails omit CAN-SPAM physical address. | None — transactional/relationship mail is CAN-SPAM-exempt; commercial outreach path includes it. |
| Send-as alias | Gmail web settings (not in code/DNS) | Patrick-confirm | find@outreach.finda.sale must be a verified "send mail as" alias (or mailbox primary) on the outreach mailbox. | Confirm Gmail -> Settings -> Accounts -> "Send mail as". Live send evidence (2c) indicates correctly configured. |

---

## RECOMMENDED FOR STATE.md BLOCKED QUEUE (P2)

No P0/P1 found — the live Gmail rail is healthy. Four P2 items worth queuing (deliverability-load-bearing):
1. **Split `SES_FROM_EMAIL` -> `GMAIL_FROM_EMAIL` + `RESEND_FROM_EMAIL`** (root-cause fix for the rail-conflict footgun that caused the Resend P0).
2. **Bounce ingestion captured 0 bounces in prod** — verify token scope/inbox; run processBounces once.
3. **`send.finda.sale` has no Google DKIM** — add DKIM or change in-code fallbacks to @outreach.finda.sale.
4. **No out-of-process Gmail health watchdog** — wire a GitHub Actions schedule to gmail-health-check.
