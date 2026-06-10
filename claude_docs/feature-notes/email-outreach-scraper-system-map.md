# Email / Outreach / Scraper System Map — S937 (2026-06-09)

> Single coherent map of how email sending, outreach, and scraping connect in the FindA.Sale backend.
> Built by reading the actual code (not memory). Every claim carries a file:line or tool citation.
> AUDIT HONESTY GATE applied — see "Corrected Premises" before trusting the original session framing.

---

## Corrected Premises (read first — the brief's framing was partly stale)

The S937 brief and the memory header assert "Gmail rail SUSPENDED, ~40 files failing, outreach completely dead = P0." **Reading the code + recent STATE.md evidence shows this is NOT current reality:**

- **Gmail rail is ACTIVE, not suspended.** STATE.md S933 (2026-06-09): "outreach IS active (658 DirectoryClaimEmail rows sent, cron running)." STATE.md S917: "OUTREACH_ENABLED=true confirmed set on Railway." The S913 broken-refresh-token issue was RESOLVED S915. → There is **no** "outreach is dead" P0. Reporting one would be fabrication.
- **The outreach/pipeline crons are NOT scheduled in-process.** `packages/backend/src/index.ts:250-252` documents that in-process scheduling for autoSeedOutreachCron, outreachEmailsCron, emailDiscoveryJob, websiteEnrichmentJob was **removed and moved to GitHub Actions.** They now run via GitHub Actions → `POST /api/internal/jobs/run` → `internalJobRunnerController.JOB_MAP`. The `cron.schedule(...)` and `init*Cron()` functions still in those files are dead code.
- **S936 fixes are present and confirmed** (admin.ts test endpoint + transactionalEmailService FROM_DEFAULT + suppression check). See Part 1 / Part 4.
- **S934 scraper widenings are present** (FB Events flea/auction query + googlePlaces flea synonyms). See Part 3.

The real, code-verified gaps are smaller in count but concrete. They are in Part 4.

---

## Part 1 — Email Rails Map

There are **three** send paths, not two.

### Rail A — Gmail API (bulk / lifecycle / cold outreach)
**File:** `packages/backend/src/lib/emailService.ts`
- `emailService.emails.send()` (L226-247) builds a raw MIME message (`buildRawMessage`, L173) and calls `gmail.users.messages.send` via `createGmailClient()` (L150) using `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN` (L151).
- **Quota cap:** `HARD_LIMIT = GMAIL_DAILY_HARD_LIMIT || 1500` (L19); `checkAndIncrementQuota()` (L69) is DB-backed (`emailQuotaLog` table) and throws `QuotaExceededError` past the cap. This was the fix for the Jun-5 8,317-email blast (L14).
- **FROM:** caller-supplied. The authenticated Gmail account is the real envelope sender; the `from:` header is cosmetic for this rail.
- **Quota alert path (exception):** `sendQuotaAlert()` (L30) sends **via Resend** (`resend.emails.send`, L50) from `SES_FROM_EMAIL || 'alerts@send.finda.sale'` to `deseee@gmail.com` — deliberately bypasses Gmail so it survives a Gmail outage.
- **Importers (~38 files)** — `grep -rln "lib/emailService"`: adminBroadcastController, buyingPoolController, couponController, notificationController, reservationController, saleWaitlistController, waitlistController, abandonedCheckoutJob, auctionJob, curatorEmailJob, monthlyTrendReportJob, outreachEmailsCron, saleEndingSoonJob, crawlerAnalytics, admin.ts, contact.ts, organizers.ts, abandonedSignupEmailService, bounceSuppressService, buyerMatchService, collectorPassportService, emailReminderService, followerNotificationService, onboardingEmailService, organizerAnalyticsService, postSaleRecapEmailService, presaleSneakPeekEmailService, priceDropService, reviewRequestEmailService, saleAlertEmailService, saleLiveEmailService, smartFollowService, weeklyEmailService, winBackEmailService, wishlistAlertService, wishlistMatchEmailService, bulkEmailGate.

### Rail B — Resend (transactional, Gmail-suspension-proof)
**File:** `packages/backend/src/lib/transactionalEmailService.ts`
- `transactionalEmailService.emails.send()` (L25) calls `resend.emails.send` (L62).
- **FROM_DEFAULT** = `process.env.RESEND_FROM_EMAIL ?? 'FindA.Sale <noreply@finda.sale>'` (L21) — **S936 fix confirmed present.**
- **Suppression check present before EVERY send** (L48-58): `suppressionService.checkMultiple(recipients)` → drops any suppressed/domain-blocked recipient. ✅
- **Importers (9):** authController, posController, stripeController, terminalController, workspaceController, tierLapseJob, routes/auth, consignorEmailService, messageEmailService.
- **⚠️ All 9 importers pass an explicit `from: ...@send.finda.sale`** (see grep in Part 4 G1), so the corrected `noreply@finda.sale` default (L21) is **never used by real transactional sends** — it only fires if a caller omits `from`. This is gap **G2**.

### Rail C — Outreach Gmail send (cold directory outreach)
**File:** `packages/backend/src/jobs/outreachEmailsCron.ts`
- Separate Gmail send path (`gmail.users.messages.send`, L645; `buildRawEmail`).
- **FROM:** `OUTREACH_FROM_EMAIL || 'outreach@finda.sale'` (L592), rendered as `The FindA.Sale Team <…>` (L597). Institutional sender — matches memory `feedback_no_founder_voice`.
- **Gate:** `OUTREACH_ENABLED !== 'true'` aborts the run (L201) — per-run gate, not just registration.
- **Suppression:** `suppressionService.isSuppressed(record.emailAddress)` before each send (L479). ✅
- Shares the DB quota counter (`checkAndIncrementQuota`, imported L9).

### Suppression service
**File:** `packages/backend/src/services/suppressionService.ts`
- `BLOCKED_DOMAINS` (L12) = `estatesales.net`, `estatesales.org` (competitor hard-block, sync, no DB call).
- `isEmailDomainBlocked()` (L21), `isSuppressed()` (L29 — domain block + EmailSuppression hard/soft bounce, opt-out, complaint), `checkMultiple()` (L89 — batched, domain pre-filter).
- Fed by `bounceSuppressService` (Part 4 G-ok) and `processOptOut/processComplaint/processBounce`.

### Bounce ingestion
**File:** `packages/backend/src/services/bounceSuppressService.ts`
- `processBounces()` (L143) polls `outreach@finda.sale` Gmail for `from:mailer-daemon OR from:postmaster -in:trash` (L160), extracts the bounced address (L50), **upserts into `EmailSuppression` with `bounceHard:true`** (L198-211), trashes the message.
- Registered as a **daily 06:00 UTC** cron directly in `index.ts:800-812` (dynamic `require` so a missing compiled file can't crash boot).
- **Confirmed: bounce data flows into `EmailSuppression`, which `isSuppressed()`/`checkMultiple()` read.** The loop is closed for Rail B and Rail C. (Rail A bulk services are the gap — see G3.)

### DNS / FROM-domain state (from memory — NOT code-verifiable here)
- `resend._domainkey` TXT covers **root** `finda.sale` → `noreply@finda.sale`, `notifications@finda.sale` are Resend-DKIM-aligned.
- `send.finda.sale` has **SES** SPF + MX, and memory says **NOT** Resend DKIM. **Conflict:** code comment `transactionalEmailService.ts:14` claims `send.finda.sale` "already verified — used by emailService quota alerts." This must be resolved by Patrick in the Resend dashboard (Part 4 G1).
- Railway `RESEND_FROM_EMAIL` = `support@finda.sale` (unwarmed, landed in Yahoo spam, S936). Intended: `noreply@finda.sale`.

---

## Part 2 — Outreach Pipeline Map (end-to-end)

**Trigger is GitHub Actions, not in-process cron.**

```
GitHub Actions workflow (scheduled)
  └─ pipeline-email-discovery.yml ──────► POST /api/internal/jobs/run {job:"email-discovery"}
  └─ pipeline-auto-seed-outreach.yml ───► POST /api/internal/jobs/run {job:"auto-seed-outreach"}  (cron 0 6 * * *)
  └─ pipeline-outreach-emails.yml ──────► POST /api/internal/jobs/run {job:"outreach-emails"}      (cron 0 */4 * * *)
        │
        ▼
  internalJobRunnerController.ts  (JOB_MAP, L40-53; in-process lock prevents double-run)
        │
        ├─ "email-discovery"   → emailDiscoveryJob       → fills Organizer.contactEmail
        ├─ "auto-seed-outreach"→ runAutoSeedOutreach()   → creates DirectoryClaimEmail rows
        └─ "outreach-emails"   → sendOutreachEmails()     → Gmail send from outreach@finda.sale
```

### Chain detail with citations
1. **Scraper discovers an organizer** → writes `Organizer` (`isUnmanagedListing:true`) + `Sale` rows (Part 3).
2. **emailDiscoveryJob** fills `Organizer.contactEmail` + `emailDiscoveryConfidence`.
3. **`runAutoSeedOutreach()`** (`autoSeedOutreachCron.ts:62`):
   - Query (L90-102): `Organizer` where `(isClaimed:false OR isUnmanagedListing:true)`, `contactEmail != null`, `claimStatus NOT IN (CLAIMED, OPTED_OUT)`, `suppressOutreach:false`, excludes `emailDiscoveryConfidence:0.0` and (default) Canadian orgs (L71-89).
   - Filters: `isValidEmail` (rejects image filenames, L44), `isPlaceholderEmail` (rejects `system.finda.sale` etc., L26-32/L53), `suppressedEmails` set (L158), `isEmailDomainBlocked` (L159), dedup by org + email (L164-172).
   - Inserts `DirectoryClaimEmail{status:PENDING, trackingPixelId, trackingToken}` capped at `MAX_PER_RUN=500` (L22/L191).
   - **Gate:** the in-process `initAutoSeedOutreachCron()` checks `OUTREACH_ENABLED` (L208) but is **dead** (never called). The live trigger is the GitHub Action; `runAutoSeedOutreach()` itself does **not** re-check `OUTREACH_ENABLED` — the GH workflow is the control point. (Documented, low-risk: seeding rows ≠ sending.)
4. **`sendOutreachEmails()`** (`outreachEmailsCron.ts`): re-checks `OUTREACH_ENABLED` (L201) → suppression per row (L479) → Gmail send from `outreach@finda.sale` (L645) → tracking pixel appended (L586) → List-Unsubscribe header (L594).
5. **Bounces** → `bounceSuppressService` (06:00 UTC) → `EmailSuppression` → read back by step 4's suppression check. Loop closed.

**DirectoryClaimEmail creators:** `autoSeedOutreachCron.ts` (auto), `scripts/seedDirectoryClaimEmails.ts` (manual seed), `scripts/backfill-warm-emails.ts` (backfill). All three apply `isEmailDomainBlocked` + placeholder filters. `adminController.ts` + `outreachEmailsCron.ts` read/update them.

---

## Part 3 — Scraper Pipeline Map

### Orchestration
- **In-process:** `scraperCron.ts` (`initScraperCron`, gated by `SCRAPER_ENABLED`, index.ts:837) builds schedules from `SOURCE_REGISTRY` (L483). EstateSalesNet + GarageSaleFinder are skipped in-process when `USE_GH_ACTIONS_*` is set (L491-499) — i.e. GitHub Actions is the primary driver.
- **GitHub Actions:** ~130 `scrape-*.yml` workflows (per-state licensing scrapers, per-state phase2, plus source workflows: `scrape-estatesalesnet`, `scrape-garagesalefinder`, `scrape-facebook-events`, `scrape-facebook-marketplace`, `scrape-foursquare`, `scrape-google-places`, `scrape-here-places`, `scrape-auctionzip`, `scrape-auctionninja`, `scrape-naa`, `scrape-osm`, `scrape-yellowpages-ca`).

### Sources directory
`packages/backend/src/services/scraper/sources/` (and `types/`, orchestrator). Scrapers write **`Sale`** rows (with `saleType` inferred) and **`Organizer`** rows (`isUnmanagedListing:true`) — the records autoSeedOutreach later discovers.

### S934 changes confirmed present
- `search-facebook-events.ts:494` — widened query includes `"flea market" OR "swap meet" OR "public auction" OR "online auction" OR "consignment sale"`; `inferSaleType` maps `flea`→`FLEA_MARKET` (L168). ✅
- `googlePlaces.ts:135-163` — `PLACES_QUERIES` now includes `antique flea market`, `outdoor market`, `vendor market`, `trade days`, `bazaar`; `FLEA_MARKET` typeMap expanded (L395). ✅

### BLOCKED sources (ToS — documented, do not build)
- **HiBid** — ToS §7 prohibits scraping/aggregation (ADR-hibid-auction-scraper.md). NO-GO (legal).
- **US YellowPages.com** — ToS §2.1 prohibits data mining. NO-GO (legal). (`yellowPagesCaScraper.ts` / `scrape-yellowpages-ca.yml` for Canada likely shares the prohibition — flagged for future ToS check.)
- **AuctionNinja** — auction listings are JavaScript-rendered; fetch+cheerio sees only the static company-directory nav. Needs a headless browser; no GitHub scraper exists.

---

## Part 4 — Gap Analysis

| # | file:line | Severity | What's broken | Recommended fix |
|---|-----------|----------|---------------|-----------------|
| **G1** | `send.finda.sale` FROM on **Rail B (Resend)**: authController:288/731, posController:124/583/672/1168, stripeController:50/1600/1640/1989, terminalController:384/629, workspaceController:159 (hardcoded, no env), routes/auth:125/214, consignorEmailService:5, messageEmailService:9; plus direct-Resend alert senders deliverabilityMonitorJob:53, gmailHealthCron:31, run-search-facebook-events:45, emailService:51 | **P1** | Every transactional Resend send goes FROM a `send.finda.sale` address. Memory: `send.finda.sale` has SES DNS, **not** Resend DKIM → those sends fail DKIM alignment → spam/junk for receipts, password resets, payouts, verification, invoices, workspace invites. Code comment claims it's Resend-verified — **unresolved conflict, not code-verifiable.** | **(a) Patrick:** verify `send.finda.sale` DKIM status in Resend dashboard. **(b) Code:** since root `finda.sale` IS Resend-DKIM-verified, change the Resend-rail `from` fallbacks from `…@send.finda.sale` to root-domain `…@finda.sale` (receipts@, invoices@, notifications@, noreply@, invites@). Leave Rail A (Gmail) `from` headers alone (cosmetic). |
| **G2** | `transactionalEmailService.ts:21` vs its 9 callers | **P2** | The S936 `FROM_DEFAULT = noreply@finda.sale` fix is **dead code** — all 9 callers pass explicit `from: …@send.finda.sale`, so the corrected default never applies. | Fixed automatically by G1 (rewrite caller fallbacks to root domain). No separate work if G1 done. |
| **G3** | `saleAlertEmailService`, `priceDropService`, `wishlistMatchEmailService`, `saleLiveEmailService`, `presaleSneakPeekEmailService`, `smartFollowService`, `followerNotificationService`, `onboardingEmailService` (all Rail A) | **P1** | **8 of 15 bulk lifecycle services call `emailService.emails.send` with NO suppression check** (grep: no `isSuppressed`/`suppressionService`/`checkMultiple`). Opted-out and hard-bounced addresses keep receiving bulk mail → deliverability damage + the exact re-send pattern that risks Workspace suspension. The other 7 (weeklyEmailService, winBackEmailService, wishlistAlertService, postSaleRecapEmailService, reviewRequestEmailService, buyerMatchService, abandonedSignupEmailService) DO check. | Add `await suppressionService.isSuppressed(to)` (or `checkMultiple` for batches) guard before each `emailService.emails.send` in the 8 services. Same pattern already used by the other 7 + outreach cron. |
| **G4** | Railway env `RESEND_FROM_EMAIL=support@finda.sale` | **P2** | Unwarmed sender domain → Yahoo spam (S936). Only affects sends that omit `from` (admin test endpoint + any future default-using caller). | Patrick: set `RESEND_FROM_EMAIL=noreply@finda.sale` in Railway backend service. (Already tracked from S936.) |
| **G5** | `autoSeedOutreachCron.ts:1-14/207`, `outreachEmailsCron.ts:766-773` | **P3** | File headers say "Daily cron 06:00 UTC" and expose `init*Cron()` that are **never called** (index.ts:250-252 moved scheduling to GitHub Actions). Misleads future readers into thinking these self-schedule. | Update header comments to: "Scheduled via GitHub Actions → POST /api/internal/jobs/run; in-process init* is retained for manual/legacy use only." Doc-only. |
| **G6** | `auctionJob.ts` (no `OUTREACH_ENABLED`/`bulkEmailEnabled`) | **P3** | Only Rail A sender with no bulk gate. Sends auction-win receipts (`receipts@send.finda.sale`, L161) — **transactional**, so being ungated is arguably correct (shouldn't pause with cold outreach). | Document as intentionally ungated (transactional auction receipt). Confirm with Patrick; if any of its sends are promotional, gate those. No code change unless confirmed bulk. |

### Verification of the brief's 8 listed concerns
1. **Gmail "~40 files silently failing now"** → **NOT failing.** Gmail rail active (S933, 658 sent). No P0.
2. **OUTREACH_ENABLED gating** → Rail C outreach gated at run-time (outreachEmailsCron:201) + all 11 bulk lifecycle jobs gated via `bulkEmailGate`/inline (weeklyEmailJob, notificationJob, presaleSneakPeekJob, curatorEmailJob, organizerWeeklyDigestJob, monthlyTrendReportJob, tierLapseJob, abandonedCheckoutJob, saleEndingSoonJob:51, outwardEmailAutomationsJob:29). **Only un-gated Rail A job: auctionJob (G6, transactional).**
3. **RESEND_FROM_EMAIL=support@finda.sale** → confirmed (G4).
4. **transactionalEmailService suppression** → present before every send (L48-58). ✅
5. **admin.ts send-test-email S936 fix** → confirmed: Resend branch requires `RESEND_FROM_EMAIL`, returns 503 if missing, no hardcoded `hello@send.finda.sale` (admin.ts ~L416-421). ✅
6. **autoSeedOutreachCron rail** → it only **inserts DB rows** (no email send). Sending is Rail C (outreachEmailsCron, Gmail, active). Outreach is **not** dead. No P0.
7. **bounceSuppressService → isSuppressed** → confirmed closed loop (Part 1). ✅
8. **send.finda.sale via Resend** → confirmed widespread (G1). Primary P1.

### P0 / P1 list for Blocked Queue + dev dispatch
- **P1 — G1:** Resend-rail transactional FROM uses `send.finda.sale` (possible DKIM misalignment). Patrick DNS verify + code rewrite of caller fallbacks to root-domain `finda.sale`.
- **P1 — G3:** 8 bulk lifecycle services send via Gmail with no suppression check. Add suppression guard to each.
- (P2 G4 = Patrick Railway env action; P2 G2 folded into G1; P3 G5/G6 = doc/confirm.)

**No P0 findings.** The brief's P0 framing (Gmail dead / outreach dead) is contradicted by code + recent session evidence.


---

## Recipient-Domain Policy + Config (S937)

**Rule:** the app NEVER emails any address at our own domain zone — `finda.sale` or any `*.finda.sale` subdomain (scraped placeholders like `scraper+slug@system.finda.sale`, `system-scraper@finda.sale`, and any From-only aliases). Enforced centrally in `suppressionService.isEmailDomainBlocked()` and at BOTH rail chokepoints (`emailService.emails.send` Gmail rail filters recipients; `transactionalEmailService.send` Resend rail via `checkMultipleHard`).

**Allowlist exception:** `SUPPORT_EMAIL` (default `support@finda.sale`) — the contact-form support inbox is the one legitimate @finda.sale send-target.

**`SENDABLE_FINDA_SALE_ADDRESSES` (env, optional):** comma-separated extra internal @finda.sale inboxes the app is allowed to send to (e.g. `info@finda.sale,patrick@finda.sale`). Read in `suppressionService.ts` (`SENDABLE_INTERNAL_ALLOWLIST`). Default empty. **If Patrick ever creates a new internal finda.sale mailbox that the app must email, add it to this env var (Railway + .env) — otherwise the zone filter will silently drop it.** No code change needed.

**Rail suppression floor (S937):** both rails block unsendable-domain + hard-bounce + complaint. Opt-out and soft-bounce do NOT block at the rail (so transactional mail still reaches unsubscribed users); bulk/marketing senders layer full `isSuppressed()` (incl. opt-out + soft-bounce) on top.
