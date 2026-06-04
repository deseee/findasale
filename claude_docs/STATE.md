# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S865 — BUG/AUDIT: #335 ROOT CAUSE FOUND. Google clamped outreach@finda.sale sending since May 18 — ALL transactional email (payouts, password resets, verifications) dead 17 days. NOT Yahoo. Outreach stopped, fixes coded.**
- Evidence (all tool-verified): outreach@finda.sale inbox holds 1,400+ mailer-daemon bounces "You have reached a limit for sending mail" — first bounces May 18, 100% of sends bouncing since (incl. live S865 test msg 19e91905c1d8a024, password resets, Jane Thrift payout).
- **TRIGGER (corrected S865b, Patrick caught the shallow attribution):** organizerWeeklyDigestJob (Mon 9AM cron) mass-sent **5,000+** "Performance Summary – 0 items sold" emails to SCRAPED directory orgs on May 18 (Gmail sent-folder counts: storefront/outreach=29, Performance Summary=5,000+ that day; May 25 + Jun 1 = 2 each — one-time blast when imported sales were <30d old). Outreach (29–39/day) was NOT the cause. Outreach dup-send bugs found earlier are real but secondary.
- S864 "SES_FROM_EMAIL regression" was a misdiagnosis — Railway value verified already find@outreach.finda.sale; Gmail refresh token valid; Gmail API accepts sends (200) then bounces them. DNS (SPF/DKIM/DMARC) all healthy.
- Mitigation applied S865: GH Actions pipeline-outreach-emails.yml DISABLED (workflow page banner confirmed) + Railway OUTREACH_ENABLED=false (redeploy 34ff3f85 @ 07:47 UTC). Cold outreach paused until clamp lifts + fixes pushed.
- DEV fixes coded: outreachEmailsCron.ts — kill switch inside sendOutreachEmails(), overlap guard, atomic claim-before-send (pushed by Patrick, Railway green). S865b batch (pending push): organizerWeeklyDigestJob gated OFF (ORGANIZER_DIGEST_ENABLED, default off) + recipient filter fixed (isClaimed=true, isUnmanagedListing=false, user.password set, emailVerified — DB-verified: old query matched the same 2 real orgs today, but 16,788 scraped orgs were blast-eligible on any fresh import; new filter immune) + volume fuses: digest 300, monthlyTrendReport 300, curatorEmail 1,000, weeklyEmail 1,000 — no job can exceed 1,000/run now.
- ebayController.ts found TRUNCATED in working tree (ended mid-template-literal line 4956 — prior-session Edit truncation, would have broken next Railway build). Repaired S865b: tail restored from GitHub main, local uncommitted EPN comment edit preserved. 4,963 lines, parse-clean.

**Previous: S864 — QA MODE: #195 ✅ Chrome-verified. Vercel build broken by saved-searches.tsx TS error — fixed. #324/#176 PCV marks applied. #335 email diagnosis → S864 SES_FROM_EMAIL theory disproven S865.**
- QA ✅: #195 messaging re-fix Chrome-verified — POST /api/messages → 201, no 500 (ss_6119ualta, ss_03909ty8h). S863 backend fix confirmed live.
- Records: #324 Chr column updated to ✅ S863, #176 Status updated with Type filter evidence.
- Vercel build failure found: S863 commit caused 3 consecutive ERRORED Vercel deploys. Root cause: saved-searches.tsx priceMin/priceMax typed as `number` but compared to `''` → TS error. QA agent fixed to `number | string | null`. 0 TS errors confirmed.
- #194 saved-searches, #47 UGC, /search saleType: NOT deployed (Vercel blocked). Pending push of saved-searches.tsx fix.
- ⚠️ #335 REGRESSION INTRODUCED S864: Claude incorrectly diagnosed Yahoo deliverability as root cause and advised changing SES_FROM_EMAIL from `find@outreach.finda.sale` → `outreach@finda.sale`. This broke the Gmail API send entirely — confirmed by testing artifactmi@gmail.com (no email arrived anywhere). SES_FROM_EMAIL must be reverted to `find@outreach.finda.sale` in Railway immediately. The actual #335 diagnosis is incomplete.

**Previous: S863 — QA MODE: #324 EXIF + #176 verified. #195 STILL 500 — second root cause found+fixed. #194/#47 built. Jane Thrift payout email RE-SENT. Records pass applied.**

**Previous: S862 — QA+DEV: 6 code fixes shipped. 14 features Chrome-verified. 4 new bugs found.**
- DEV fixes: Tranche B fraud gate (pointsController.ts), #324 EXIF preservation (uploadController.ts), #176 saleType in feed (discoveryService.ts + search.ts), #195 messaging 500 crash (messageController.ts + transaction), #66 ZIP export UI (settings.tsx), #31 Brand Kit → print-kit colors (print-kit/[saleId].tsx).
- QA ✅: #327 Price Cal Logging, #73 Two-Channel Notifications, #186 QR Scan Analytics, #396 Starter Kit, #197 Bounties, #163 Earnings, #173 Message Templates, Shopper Dashboard, Hunt Pass, #71 Reputation.
- New bugs: #194 Saved Searches view page missing (P2), #47 UGC Photo Submit not on sale detail (P2), #192 Price History data-dependent (UNVERIFIED).

**Previous: S861 — QA: #316 Tranche B ✅ Chrome-verified (ss_1479i18cy/ss_71277qiak/ss_1277utzwj). New P2: recordSaleVisit() after fraud early-return. #324 EXIF P1 bug found (Cloudinary strips EXIF by default). Blocked Queue: 8→10 rows.**

**Previous: S860 — QA+Records+DEV: #316 Tranche B P1 bug found+fixed. Notifications sort P2 fixed (|| → ??). #316 re-test ❌→✅. P2 referral banner fixed. Blocked Queue: 8 rows.**

**Previous: S858 — QA+DEV: Flash Deal dropdown FIXED. #398/#259/#290/#158 ✅. Blocked Queue: 6 rows.**

## Pool Audit Findings

Run: 2026-05-18 (S756). Railway DB queried directly via psycopg2.

**DirectoryClaimEmail (outreach queue):** 3,319 PENDING, 29 SENT. 31 junk rows deleted (26 image filenames stored as emailAddress, 5 Patrick test emails).

**leadTier breakdown:** HOT: 5,517 (100% website coverage) · WARM: 36,851 (3.3% website coverage) · COLD: 14,314

**WARM email gap:** Only 208 WARM orgs currently addressable. Website enrichment job changed from weekly → daily (S756). API headroom: HERE 250K/month cap, ~1,500/month usage. Pipeline healthy.

**Geocoding:** 6,760 sales still not geocoded. Nightly geocoding job addresses gradually.

---

## Blocked Queue

_S772 reconciliation: graduated/closed rows removed — reconciled into strategy/roadmap.md. Only genuinely open items remain._
_⚠️ P0 AGING: #332 at 70 sessions; #335 at 70 sessions — mandatory P0 per CLAUDE.md §10a._
_⚠️ FRICTION AUDIT 2026-06-04: 3 new P0s added — truncated working-copy files that will break both deployments if pushed._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| **TRUNCATED: search.tsx** | **P0** — Working copy is 514 lines vs 564 HEAD. Missing `export default SearchPage` and last 50 lines (EmptyState body, Notify Me Waitlist, closing JSX). Vercel build will fail if pushed. | `git checkout HEAD -- packages/frontend/pages/search.tsx` before next push | Audit 2026-06-04 |
| **TRUNCATED: routes/search.ts** | **P0** — File ends mid-comment `// #455: Anonymous search-qu`, missing notify route registration and `export default router`. Railway build will fail if pushed. | `git checkout HEAD -- packages/backend/src/routes/search.ts` before next push | Audit 2026-06-04 |
| **TRUNCATED: messageController.ts** | **P0** — File ends mid-expression `res.status(500).json`, missing closing for catch block and function. Railway build will fail if pushed. | `git checkout HEAD -- packages/backend/src/controllers/messageController.ts` before next push | Audit 2026-06-04 |
| #332 Shopify Cross-Listing | **P0 (70 sessions)** — Requires Shopify OAuth; no test store available | Create free Shopify Partners dev store, connect via OAuth | S791 |
| #335 Consignor Payout Email | **P0 (74 sessions) — ROOT CAUSE (corrected S865b):** Google sending clamp since Mon May 18 = organizerWeeklyDigestJob blasted 5,000+ digest emails to scraped orgs (2.5× the 2,000/day limit). NOT outreach (29 sends that day), NOT Yahoo, NOT SES_FROM_EMAIL. Digest now gated OFF (ORGANIZER_DIGEST_ENABLED) + recipient filter fixed + volume fuses on all bulk jobs. | (1) Push S865b batch. (2) Scheduled task 2026-06-05 re-tests; on clean test it re-enables outreach (env + GH workflow). (3) Re-test payout email to Yahoo after clamp lifts. | S791 |
| Rarity Boost pricing spec gap | **P3** — /coupons Rarity Boost shows "Activate Rarity Boost (50 XP)" with no cash option. Roadmap #290 documented as "15 XP / or $0.15 via card". Spec may be outdated. | Patrick: confirm Rarity Boost is XP-only at 50 XP (no cash rail) as intended | S858 |
| Email Verification Migration | **P0 (134 sessions, age-escalated)** — Migration 20260515180000 exists in migrations/ but no prisma migrate deploy recorded S726–S862. Token expiry not enforced in prod DB. | Patrick: cd packages/database && $env:DATABASE_URL="[Railway]" && npx prisma migrate deploy && npx prisma generate | S726 |
| eBay Connection for user1 | **P0 (75 sessions, age-escalated)** — No eBay OAuth on organizer QA account. Blocks #293, #298, all eBay push QA. | Patrick: connect eBay to user1 at /organizer/settings/ebay via OAuth | S785 |
| #230 Smart Buyer Widget Human QA | **P3** — Claude QA ✅ S793 confirmed. Human QA pending but blocked: no published sale on any real test organizer account. | Patrick: publish a sale on user1 account, then visit organizer dashboard to verify SmartBuyerWidget shows shopper data | S859 |
| #194 Saved Searches view page | **P2** — Built S863. Vercel deploy blocked S864 (TS error in saved-searches.tsx — fixed S864). Push TS fix → Vercel deploy → Chrome QA. | Push saved-searches.tsx fix, confirm Vercel green, Chrome QA /shopper/saved-searches. | S862 |
| #47 UGC Photo Submit not on sale detail | **P2** — Built S863. Vercel deploy blocked (same TS error). Push TS fix → Chrome QA submit button on sale detail. | Push saved-searches.tsx fix, confirm Vercel green, Chrome QA UGC button on sales/[id]. | S862 |

| #192 Price History data-dependent | **P3** — ItemPriceHistoryChart is correctly wired in edit-item/[id].tsx but returns null when no ItemPriceHistory records exist. Railway DB has no price change history for test items. | No code fix needed. To verify: run price update on a real item, then check chart renders. | S862 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

_(S862
| 324 | EXIF Temporal Clustering (upload preservation) ✅ | As Alice (user1) on /organizer/add-items: Batch Upload 3 JPEGs with EXIF DateTimeOriginal (14:00:05/14:00:45/16:30:00), clicked Analyze All → 3 drafts created (ss_2118qp0k0, ss_4511e8aq0). Re-downloaded stored Cloudinary images: all 3 timestamps preserved exactly. Test items+photos deleted from DB. | S863 |
| 176 | Browse Sales homepage Type filter ✅ | As Bob (user2) on finda.sale homepage: Type dropdown → Estate Sale = "17 of 20 sales", all Estate badges (ss_48642xh5d); Yard Sale = "3 of 20 sales", Yard badges (ss_73627haye). | S863 | batch of 9 graduated to roadmap S863. Note: S862 evidence had no screenshot IDs — applied on DB/page-content evidence per S862 orchestrator log.)_

---

## Next Session

**S865 done. Blocked Queue: 10 rows — QA MODE next session (>=8 items).**

Priority:
1. **#335 email clamp re-test** (scheduled task fires 2026-06-05; or manually): send test via Gmail API with prod creds -> check outreach@finda.sale inbox for bounce -> if clean, check deseee@yahoo.com delivery. Only after a clean test: consider re-enabling OUTREACH_ENABLED=true + GH workflow (requires S865 fixes pushed first).
2. **Push S865 batch** (block below). Unblocks Vercel (S863 features) and hardens outreach before any re-enable.
3. **After Vercel goes green:** Chrome QA -> #194 /shopper/saved-searches (save+view+delete), #47 UGC submit on sales/[id], /search Sale Type filter.
4. **P0 Patrick items:** #332 Shopify dev store, Email Verification migration, eBay OAuth user1.

**Patrick actions required (in order):**

1. **Push S865b batch (digest blast fix — the actual #335 trigger):**
   ```
   git add packages/backend/src/jobs/organizerWeeklyDigestJob.ts
   git add packages/backend/src/services/organizerAnalyticsService.ts
   git add packages/backend/src/jobs/curatorEmailJob.ts
   git add packages/backend/src/jobs/monthlyTrendReportJob.ts
   git add packages/backend/src/services/weeklyEmailService.ts
   git add packages/backend/src/controllers/ebayController.ts
   git add claude_docs/STATE.md
   git add claude_docs/patrick-dashboard.md
   git add claude_docs/strategy/roadmap.md
   git commit -m "fix: gate organizer digest + recipient filter + volume fuses on all bulk email jobs (May 18 blast root cause) + restore ebayController tail"
   .\push.ps1
   ```
   ebayController.ts: only a 3-line comment diff vs main after tail repair — safe to commit.
2. **Confirm Rarity Boost intent** — XP-only at 50 XP or restore $0.15 cash rail? (P3, carried)
3. **GBP phone verification** — business.google.com -> "Verify now" -> phone code. (carried)

## Recent Sessions

### S865 — BUG/AUDIT: #335 root cause found — Google sending clamp, not Yahoo

**Audit chain (all tool-verified):**
- Railway env verified: SES_FROM_EMAIL already find@outreach.finda.sale (S864 "regression" never persisted / was misdiagnosed). Gmail refresh token VALID (live token exchange, scope gmail.send). DNS healthy (SPF/DKIM/DMARC on outreach.finda.sale all present).
- Live send test with prod creds + exact emailService.ts format: Gmail API accepted (msg 19e91905c1d8a024) -> bounced 30s later by mailer-daemon: "You have reached a limit for sending mail."
- Chrome: deseee@yahoo.com last received find@outreach.finda.sale mail May 17. outreach@finda.sale inbox: 1,400+ limit bounces, first ones May 18, 100% of sends bouncing since — payouts, password resets, verifications, all outreach. June 3 volume only 32 sends, still all bounced -> sustained clamp, re-tripped by cron sending every 4h for 17 days.
- May 17-18 sent folder: "We built X a storefront" blasts with duplicates (same business up to 4x; junk targets e.g. The Walt Disney Company).

**Mitigation (done in-session):** GH Actions pipeline-outreach-emails.yml disabled via UI. Railway OUTREACH_ENABLED=false (redeploy 34ff3f85). Clamp expected to lift ~24-48h after sends stop; scheduled re-test task created (fires 2026-06-05).

**DEV (1 agent, root causes DB-confirmed):** outreachEmailsCron.ts — (RC-1) kill switch now inside sendOutreachEmails() (was registration-only; GH job-runner path bypassed it); (RC-2) atomic claim-before-send via conditional updateMany — DB evidence showed one org with 5 SENT audit events but attemptCount=2 (sent-marking happened after send; crashes enabled repeat blasts); (RC-3) in-process overlap guard (manual route had no lock); (RC-4) 184 shared-address org records noted — existing dedup layers + atomic claim neutralize at send time. Also: messageController.ts truncated tail restored to match GitHub main.

**Process notes:** Railway CLI installed in VM via npm (mnt/.claude binary not mounted this session). Email failures are invisible to the app — all catch blocks swallow; bounces only visible in the outreach@finda.sale mailbox (gmail.send scope cannot read it; used Chrome).

---

### S864 — QA MODE: #195 ✅, Vercel build fixed, #335 regression introduced

**QA ✅:**
- #195 messaging re-fix Chrome-verified: POST /api/messages → 201, no 500 (ss_6119ualta, ss_03909ty8h).

**Records:**
- #324 roadmap Chr column → ✅ S863. #176 Status updated with Type filter S863 evidence.
- S863 PCV table entries graduated.

**Vercel build failure found + fixed:**
- 3 consecutive ERRORED Vercel deploys on S863 commit. Root cause: saved-searches.tsx priceMin/priceMax typed `number`, compared to `''` → TS compile error.
- Fix: changed to `number | string | null`. 0 TS errors confirmed. Not yet pushed.

**⚠️ #335 REGRESSION (Claude error):**
- Incorrectly diagnosed SES_FROM_EMAIL as root cause and advised changing from `find@outreach.finda.sale` → `outreach@finda.sale`.
- This broke Gmail API send entirely. Confirmed: no email arrives anywhere (tested artifactmi@gmail.com and Yahoo).
- Must revert SES_FROM_EMAIL → `find@outreach.finda.sale` next session before any email testing.

**Files changed:** claude_docs/strategy/roadmap.md · claude_docs/STATE.md · packages/frontend/pages/shopper/saved-searches.tsx (TS fix, not yet pushed)

---

### S863 — QA MODE: 2 verified, #195 re-fixed, 2 features built, payout email re-sent

**QA ✅ (Chrome + DB evidence):**
- #324 EXIF: 3 EXIF-tagged JPEGs uploaded via Batch Upload as Alice → Analyze All → re-downloaded stored Cloudinary images → DateTimeOriginal preserved exactly (ss_2118qp0k0, ss_4511e8aq0). Test data cleaned.
- #176 homepage Type filter: Estate 17/20, Yard 3/20, badges match (ss_48642xh5d, ss_73627haye).

**QA ❌ → re-fixed:**
- #195 messaging STILL 500 in prod (ss_4465t8wly). Railway logs: PrismaClientValidationError in sendMessage. Root cause: S862 guard did `sale.findUnique({select:{isUnmanagedListing}})` but the field is on Organizer, not Sale. Fix: select `organizer:{select:{isUnmanagedListing}}`. messageController.ts, 0 TS errors. Lesson: S862 dev skipped schema preflight; TS didn't catch it (VM Prisma client types loose).

**New bug found+fixed:** /search Sale Type filter silently ignored server-side — saleType absent from search route zod schema. Added schema field + where clause (search.ts).

**DEV (2 parallel agents, both 0 TS errors):**
- #194: built pages/shopper/saved-searches.tsx (list/delete/run, empty+loading+error states) + Save Search button on search.tsx with correct {name,filters} payload.
- #47: UGCPhotoSubmitButton wired onto sales/[id].tsx alongside UGCPhotoGallery, gated to logged-in users, with empty state.
- Inline: homepage handleSaveSearch payload fixed ({query}→{name,filters} — was 400 on every save).

**#335:** Jane Thrift payout email re-sent directly via Gmail API using production creds (msg 19e9093c5a587f21). Exact replica of sendConsignorPayout template, $29.75 Cash, Artifact workspace.

**Records:** 9 S862 PCV marks applied to roadmap (#327/#73/#186/#396/#197/#163/#173/#71 + note). Queue: Bing row removed (done), Re-Seed row removed (user5–12 no longer exist — Patrick), #324 graduated to PCV. Queue 12→10 rows.

**Files changed:** messageController.ts · search.ts (backend routes) · index.tsx · search.tsx · saved-searches.tsx (NEW) · sales/[id].tsx · STATE.md · patrick-dashboard.md · roadmap.md

---

### S862 — QA+DEV: 6 fixes shipped, 14 features verified, 4 new bugs found

**DEV (6 fixes, all 0 TS errors):**
- `pointsController.ts`: moved `recordSaleVisit()` before `!result` fraud early-return (Tranche B fraud gate fix)
- `uploadController.ts`: added `exif: true` to Cloudinary upload_stream options (#324 EXIF preservation)
- `discoveryService.ts` + `search.ts`: added `saleType: true` to Prisma selects (#176 — browse filter returning 0 results)
- `messageController.ts`: wrapped Conversation+Message in `prisma.$transaction`, moved unmanaged-listing guard before DB writes (#195 — messaging 500 crash)
- `settings.tsx`: added "Download Sale & Item Data (ZIP)" button calling `GET /api/organizers/export` (#66 frontend UI)
- `print-kit/[saleId].tsx`: brand colors from brandPrimaryColor/brandSecondaryColor now applied to yard sign header/footer + item tag price/borders (#31)

**QA ✅ (all Chrome-verified S862):** #327 Price Calibration Logging, #73 Two-Channel Notifications, #186 QR Scan Analytics, #396 DIY Starter Kit, #197 Bounties organizer, #163 Organizer Earnings (sale-level fees), #173 Message Templates, Shopper Dashboard, Hunt Pass upsell page, #71 Shopper Reputation.

**QA bugs found:**
- **#176 Browse filter** ❌ P1 FIXED — saleType absent from feed API, every filter returned 0 results
- **#195 Messaging** ❌ P1 FIXED — POST /api/messages crashed, Conversation created but Message insert failed
- **#27 CSV Exports** ⚠️ PARTIAL — rate-limited (1/month), endpoints confirmed live, no standalone /organizer/exports page (exports live inside Promote page per-sale)
- **#194 Saved Searches view** ❌ P2 NEW — no /shopper/saved-searches page, POST works + toast fires but no view
- **#47 UGC Photo Submit** ❌ P2 NEW — UGCPhotoSubmitButton only in history.tsx, not wired to sale detail page
- **#192 Price History** UNVERIFIED P3 — chart wired correctly but returns null with no history data; data-dependent not a code bug
- **#401 Sale of the Day** — no card visible on homepage (may require qualifying sale to exist)
- **Admin invites** — SVPKNKV3 not present in /admin/invites (already gone)

**Blocked Queue: 10 → 12 rows** (removed Tranche B gate, updated #324, added #194/#47/#192).

**Files changed:** pointsController.ts · uploadController.ts · discoveryService.ts · search.ts · export.ts · messageController.ts · settings.tsx · print-kit/[saleId].tsx · roadmap.md · STATE.md · patrick-dashboard.md

---

### S861 — QA: #316 Tranche B ✅ Chrome-verified; #324 EXIF P1 bug found; 2 new bugs

**QA #316 Referral Tranche B — ✅ VERIFIED:**
- Navigated to /register?ref=REF-7CD8DCC0. Green "Referral link applied" banner confirmed (ss_1479i18cy). S860 fix working.
- Registered qa-tranche-b-s861@test.com, logged in (ss_71277qiak).
- Root finding: fraudSuspect=True auto-set on new user (S854 pattern) — blocked awardXp(), which blocked recordSaleVisit(). Cleared flag, re-tested.
- Visited 3 distinct sales. DB post-visit: distinctSalesVisited=[3 IDs], trancheBReleasedAt=2026-06-03T14:37:15, user1 +150 XP (ss_1277utzwj). ✅
- **New P2 bug found:** recordSaleVisit() placed after `!result` (fraud) early-return in trackSaleVisit(). Fraud-flagged referred users never trigger Tranche B for referrer. Fix: move call before fraud gate. File: pointsController.ts.
- Test data cleaned: test user deleted, user1 XP restored to 108.

**QA #324 Temporal EXIF Clustering — UNVERIFIED (P1 design bug):**
- Code review confirmed: `clusterPhotos()` calls `extractExifTimestamp()` on Cloudinary-downloaded images.
- **P1 bug:** Cloudinary strips EXIF metadata by default on upload. `uploadController.ts` upload_stream has no EXIF preservation flags. batchAnalyzeController downloads from Cloudinary → EXIF always null → temporal hints never generated.
- Feature is silently non-functional in production. Basic clustering UI works (not tested this session — no need, it's been verified in prior sessions).
- Action: dispatch findasale-dev to add EXIF preservation to Cloudinary upload, then re-test #324.

**Blocked Queue: 8 → 10 rows (2 new bugs added).**

---
