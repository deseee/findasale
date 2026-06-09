# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**S932 — RECORDS (2026-06-09). Records pass: Applied S931 PCVs to roadmap.md — #462 Attribution E2E Chr ✅ S931 (only column that needed update; others already ✅). #455 Notify Me updated to full E2E S931 (migration applied note added). Hunt Pass BQ item RESOLVED — Patrick confirmed /shopper/dashboard stats bar shows "1.5x XP" on live site. BQ: 6→5.**

**S930 — QA (2026-06-09). Records pass (applied S925 PCVs to roadmap.md: logout flow Chr✅, #463 claim-click CODE-ONLY note). DB migration: decoded 4 HTML-encoded category rows in Railway DB (Electronics & Technology, Lamps & Lighting, Home Décor, Jewelry & Watches). Chrome-verified HTML entity fix at /organizer/insights ✅ (no &amp; or &#233; entities visible). Autonomous QA sweep: organizer dashboard (Alice) ✅, shopper dashboard (Leo Thomas) ✅, Explorer Profile ✅, Explorer's Guild rank label #123 ✅ at /shopper/ranks, Hunt Pass active state #199 ✅ at /shopper/hunt-pass. 6 PCVs staged for S931 records pass. ⚠️ P3 new BQ item: Hunt Pass multiplier display inconsistency (dashboard "2x XP" vs /shopper/hunt-pass "1.5x XP"). Gmail DSN cleanup: 104 mailer-daemon bounce threads trashed from outreach inbox. BQ: 5→6.**

**S929 — BUG/OPS (2026-06-09). Sentry error triage + outreach placeholder fix. Reviewed Gmail bounce flood. VACUUM ANALYZE on Sale + Organizer tables (NODEJS-10, NODEJS-2Y table bloat). Added 2 DB indexes: Sale(status,isInventoryContainer,endDate) for NODEJS-3E + Organizer(contactEmail,isUnmanagedListing) for NODEJS-38. Created migration file. Fixed @system.finda.sale scraper placeholder domain missing from PLACEHOLDER_DOMAINS set in 3 outreach seeder files (autoSeedOutreachCron.ts, seedDirectoryClaimEmails.ts, backfill-warm-emails.ts) — was queueing outreach to our own scraper-generated addresses, causing bounce DSN flood through ImprovMX (500/day limit hit). 0 bad rows in DirectoryClaimEmail confirmed before fix. Patrick pushed + Railway redeployed + ran prisma migrate deploy. Sentry: 10 → 5 unresolved issues (NODEJS-1A/2N/32/3D cleared by VACUUM+redeploy). ImprovMX 500/day limit: caused by @system.finda.sale bounce notifications — stops now that fix is deployed. NODEJS-1G (scraper fallback LIKE address match) still periodic — needs take limit or trigram index, monitoring next session. BQ: 5 (unchanged).**

**S927 — QA (2026-06-08). Autonomous QA continued: #79 Earnings Counter Animation ✅ (insights widget shows $220 revenue, 42.9% conversion, ss_3082qg908; animation not capturable via SSR). #164 Tiers ✅ (Bronze badge + "1/4 sales until next tier" on organizer dashboard, ss_01384hjx7). #316 Referral Tranche Anti-Fraud ✅ (/organizer/referrals: link visible, 1 referred org tracked, DB fraudReviewStatus=CLEAR + TRANCHE_A/B awarded Jun-5, ss_1143gl3d4). P2 bug found: HTML-encoded category names in DB render as literal entity strings in insights Items by Category. BQ: 5→6.**

**S926 — ANALYTICS/GA4/WRAP (2026-06-08). Root cause of zero GA4 data since launch: CSP in next.config.js blocked googletagmanager.com (script-src) and google-analytics.com (connect-src) — every browser silently dropped all analytics traffic. Fixed both CSP directives. Deployed and verified: GA4 Realtime shows 1 active user in Michigan post-fix. Secondary bug fixed: CookieConsentBanner.handleAccept() now calls window.gtag('consent', 'update', ...) directly (storage event is cross-tab only — ConsentBridge never heard same-tab accepts). Answered Patrick automation meta-question. Added 4 new roadmap entries: #465 Tier 4 LIVE, #470 GA4 conversion events, SEO3 Denver city landing pages, #471 bounce suppression auto-ingestion, #472 email send automation. BQ: 5 (unchanged).**

**S925 — QA (2026-06-08). P1 CSRF fix re-verified: POST /api/outreach/page-view returns 200 for unauthenticated callers (JS fetch credentials:'omit') — S924 fix confirmed live. Logout flow verified: Leo Thomas (user5) desktop user dropdown at /shopper/dashboard → clicked Logout → redirected to /login (ss_49305bl2y), nav shows Login button, /shopper/dashboard → 302 → /login?redirect=/shopper/dashboard (ss_581555xvt) — session fully cleared. #463 claim-click: CTA click confirmed (organizer profile → /register?claim=cmp0jq4j700mnoz89rdjmih15, ss_6367qcmy3), Analytics SDK confirmed initialized in _app.tsx, CODE-ONLY (beacon delivery unverified). BQ: 5 (unchanged).**

**S924 — QA/BUG (2026-06-08). P1 CSRF bug found and fixed: POST /api/outreach/page-view and /outreach/unsubscribe returned 403 for all unauthenticated callers — validateCsrfToken had no exemption for these public endpoints. Fix: added outreach block in csrf.ts between auth and Bearer checks. Pushed to GitHub commit 44dabb618ef1e53256450e8904ef0b191033de0d (Railway auto-deploying). #462 roadmap notes updated (CSRF bug + fix documented, Pending Chrome QA). #138 roadmap title corrected to actual enums (ESTATE/YARD/AUCTION/FLEA_MARKET/DORM_DASH — CHARITY/BUSINESS/CORPORATE never implemented). #318 affiliate: XHR confirmed firing, eligibility gate working (toast visible), UNVERIFIED (cannot fully test without paid sale). BQ: 5 (unchanged).**

**S923 — RECORDS/WRAP (2026-06-08). Records pass complete. All S920/S921/S922 PCVs applied to roadmap.md: #196 Buying Pools Chr ✅ S922, #201 Favorites Chr ✅ S922, #198 Reviews Chr ✅ S920, #210 Streaks Chr ✅ S921. patrick-dashboard.md updated (BQ=5, records pass summary). Chrome QA not started — extension not connecting. BQ: 5 (unchanged).**

**S922 — QA (2026-06-08). All 4 S921 fixes Chrome-verified live RESOLVED (commit 7058d99c, Vercel READY). #196 Buying Pools ✅ — "Split this purchase" card renders on $169 Zoom B3 item, correct split math, Start a Pool CTA (ss_5769b4ui3); negative test $25 item shows no card. #201 Favorites ✅ all 3 — Items(1) count matches single item favorite, Saved Sales section shows sale-favorite, /shopper/collections → 302 → /shopper/wishlist (ss_37941eelg, ss_1509jponw). SEC-001 ✅ — admin.ts demand-signals parameterized (Prisma.sql bound ${city}/${minCount}, Prisma.empty), page loads as admin with 11 real patterns no error. SEC-002 ✅ — items.ts scoped multer (uploadImages JPEG/PNG/WebP/GIF 25MB on POST /api/items; uploadCsv 10MB on imports), valid types pass; add-items page loads clean. BQ: 9→5. ⚠️ Workspace bash DOWN all session (disk full) — roadmap.md PCVs (#210 S921 + #196/#201/SEC-001/SEC-002 S922) + patrick-dashboard.md NOT updated; must be applied S923 with working bash (see Next Session).**

**S921 — QA (2026-06-08). Applied #198 Reviews PCV to roadmap. DEV: #196 Buying Pools fix (BuyingPoolCard.tsx threshold > 100), #201 Favorites 3 bugs fixed (favoriteController + wishlist.tsx + new collections.tsx), SEC-001 SQL injection fix (admin.ts Prisma.sql), SEC-002 multer scoped instances (items.ts). QA: #210 Streaks Chrome-verified (Streak 6, XP 2025, Hunt Pass 2x XP). All 4 code fixes pending push. BQ: 9 (unchanged).**

**S920 — QA (2026-06-08). Shopper flow QA: #198 Reviews ✅ Chrome-verified. #196 Buying Pools root cause found (shouldShow threshold 100x too high). #201 Favorites 3 P2 bugs found. #335 BQ corrected (outreach NOT suspended). DB cleanup done. BQ: 7→9.**

**S919 — QA/WRAP (2026-06-08). #230 SmartBuyerWidget confirmed rendering + RESOLVED from BQ. #380 Apify deferred (roadmap updated). #335 Jane Thrift removed (fictional account). BQ: 7→5.**

**S918 — DEV (2026-06-07). Resend transactional email rail built. Gmail SPOF resolved. BQ: 7 (unchanged).**

**Completed:** (1) bounceSuppressService verified: EmailSuppression has 5 rows (no bounce-type suppressions — expected, inbox was cleared S917 and the Jun-5 wave hasn't bounced back yet; service is configured and running correctly). 0 sends in last 24h → outreach paused during S917 inbox triage, re-enabled with OUTREACH_ENABLED=true. (2) Resend transactional email rail built: new `packages/backend/src/lib/transactionalEmailService.ts` created using Resend SDK. 9 callers migrated from Gmail to Resend: authController.ts (2 calls — password reset + verification), routes/auth.ts (2 calls — magic link + resend verification), stripeController.ts (6 calls — receipts + payout confirmations + subscription notices), posController.ts (4 calls — POS receipts + invoices), terminalController.ts (2 calls — in-person receipts), workspaceController.ts (1 call — workspace invites), messageEmailService.ts (1 call — direct messages), consignorEmailService.ts (3 calls — consignor notifications), tierLapseJob.ts (1 call — subscription lapse). Backend TS check: 0 errors. (3) S913 P2 Gmail SPOF → RESOLVED: critical transactional email now on dedicated Resend rail that survives Gmail suspension. Gmail/emailService stays as bulk/marketing rail (40+ remaining senders untouched). **No setup required:** `send.finda.sale` is already verified in Resend (used by quota alert emails); `RESEND_API_KEY` already in Railway. FROM address corrected to `hello@send.finda.sale`. Push and it works. **Push block below.**

**S917 — OPS (2026-06-07). Gmail inbox triage complete. All 1,415 mailer-daemon bounce notifications cleared from outreach@finda.sale inbox (0 mailer-daemon messages remain). OUTREACH_ENABLED=true confirmed set on Railway. outreachEmailsCron.ts ARCHIVED exclusion fix confirmed live (commit ed8aa97d). Auto-forwarding quota to deseee@gmail.com unblocked. BQ: 7 (unchanged).**

**S916 findings:** Patrick ordered investigation of a Sentry ingest address appearing in email bounces. Chrome MCP audit of outreach@finda.sale Gmail confirmed: (1) NO Sentry forwarding filter exists in Gmail settings — Filters tab is completely empty; (2) Forwarding tab shows only deseee@gmail.com (the S915 forwarding we set up); (3) Gmail API sends are working — Sent folder has 8,919 messages including 2 successful sends tonight (7:31 PM). The "mailer-daemon" bounces in the outreach inbox are Gmail's AUTO-FORWARDING service failing — the inbox has 1,415 messages being forwarded to deseee@gmail.com, which saturates Gmail's daily forwarding quota. This is a noise issue, not an API delivery issue. ROOT CAUSE of the Sentry bounce: the outreach cron had a corrupted DirectoryClaimEmail record — "Kaff's Bake Shop" (id=cmp3nh7yy0041kbtjgb8aci4v) stored `u002F802d7a4fd3f743ec907da8badf47bec3@o1378064.ingest.sentry.io` as its contact emailAddress. The cron sent 3 outreach emails to this Sentry ingest address (May 27/May 30/Jun 4). Sentry received the unexpected emails and sent bounce notifications back. FIX: ARCHIVED that record in Railway DB — confirmed via psycopg2 (`status='ARCHIVED'`). NEXT: push outreachEmailsCron.ts ARCHIVED exclusion fix (coded prior session), then set OUTREACH_ENABLED=true. BQ: 7 (unchanged).

**S915 — OPS (2026-06-07). Railway ✅ deployed (0b9752bc). /api/health ✅ live. bounceSuppressCron ✅ registered. S913 [P3] /health RESOLVED. Gmail OAuth ✅ RESTORED S915: old token recovered from Jun-6 backup, transactional email working. Mailbox ops COMPLETE S915: (1) GMAIL_MAILBOX_REFRESH_TOKEN obtained (https://mail.google.com/ scope, OAuth Playground via qualified-cedar-496114-v1 client) + stored in Railway; (2) outreach-mailbox-ops.js updated to prefer GMAIL_MAILBOX_REFRESH_TOKEN; (3) 77 bounce messages (from:mailer-daemon subject:"one step from going live") moved to Trash; (4) auto-forwarding outreach@finda.sale → deseee@gmail.com ENABLED (confirmed via Gmail Settings banner). BQ: 7 (unchanged). S913 Noted Finding P1 (Gmail REFRESH_TOKEN broken) → RESOLVED S915.**

**S913 — OPS/EMAIL HARDENING (2026-06-07). Email-system audit + monitoring automation + task-fleet consolidation.** (1) Audited S912 kill-switch — sound + already live on `main` (the "Push pending" note was stale). Knock-on found: only 3 of ~40 Gmail-rail senders (`emailService.emails.send`) were gated. Dispatched dev → gated 8 proactive bulk jobs behind OUTREACH_ENABLED via new `utils/bulkEmailGate.ts` (weeklyEmailJob, notificationJob, presaleSneakPeekJob, curatorEmailJob, organizerWeeklyDigestJob, monthlyTrendReportJob, tierLapseJob warning-cron, abandonedCheckoutJob) — Patrick pushed, redeploying. Transactional + opt-in event mail intentionally left ungated. (2) NEW daily scheduled tasks: `findasale-email-delivery-health` (06:07, 14 checks A–N) + `findasale-ops-cost-guard` (05:10 — deploy health, Google-Maps cost guard, smoke test, backup verify). Both ran clean once (⚠️ caught 5 stale Vercel deploy failures + an UptimeRobot blip — both pre-known/recovered). (3) Task-fleet consolidation: RETIRED `context-freshness-check` (→friction-audit) + `ux-spotcheck` (→full-site-audit new Phase 5); NARROWED `health-scout` to security+code-quality; KEPT `ci-sentry-health` (owns CI+secrets+all-Sentry) + `brand-drift`. (4) ImprovMX root alias `outreach@finda.sale → deseee@gmail.com` LIVE. (5) Workspace account confirmed ACTIVE (sending ~200/day, zero suspension/OAuth/quota alerts in 20d inbox scan). **PENDING → S914 (blocked this session: no Railway CLI/MCP/creds):** run `scripts/outreach-mailbox-ops.js` to (a) trash the Jun-6 abandoned-signup bounce backlog (targeted query `from:mailer-daemon subject:"one step from going live"`) and (b) enable auto-forwarding on the outreach@finda.sale Workspace mailbox (address already verified by Patrick); then test forwarding end-to-end. BQ unchanged (7).

**S912 — BUG MODE (2026-06-07). Email kill-switch audit complete. Root cause of June 6 continued sends: `outwardEmailAutomationsJob.ts` had no OUTREACH_ENABLED gate (daily 10:00 UTC cron runs independently of outreachEmailsCron.ts). 3 fixes shipped: (1) `outwardEmailAutomationsJob.ts` — OUTREACH_ENABLED gate added at cron callback top, blocks all 5 outward services in one check; (2) `abandonedSignupEmailService.ts` — OUTREACH_ENABLED gate added + `isUnmanagedListing: false` filter added to candidate query (scrapers set isUnmanagedListing=true, so scraped organizers were being targeted by the 1h signup nudge); (3) `saleEndingSoonJob.ts` — OUTREACH_ENABLED gate added + in-memory DAILY_EMAIL_CAP removed (same restart-prone root cause as June 5 blast) + QuotaExceededError early-exit added to inner catch block. Audited 4 additional services (postSaleRecapEmailService, reviewRequestEmailService, winBackEmailService, onboardingEmailService) — all clean, no action needed. BQ unchanged (7). Push pending.**

**S911 — RECORDS (2026-06-07). S910 PCVs audited — all 23 map to rows already chr ✅ from prior sessions or admin infrastructure pages (no roadmap rows). No roadmap column changes applied. PCV table cleaned (32 rows removed: S905/S906/S909/S910). roadmap.md Last Updated header updated. BQ unchanged (7). Below ceiling — DEV mode available.**

**S909 — QA MODE (2026-06-07). Records pass: confirmed no roadmap updates needed for S908/S905/S906 PCVs (all map to rows already chr ✅ from prior sessions — cross-session rule satisfied). P3 inline fix: FlashDealForm.tsx — added X/close button + Escape key handler (Python via bash, 0 TS errors). Chrome QA sweep (all as Alice user1@example.com): /organizer/appraisals ✅ (heading, Submit button, tabs, empty state ss_6653l8dfe), /organizer/flip-report ✅ (60% sell-through, $325 revenue, 3/5 sold, Category Breakdown table ss_2720usq8g, ss_71199syzr), /organizer/consignors ✅ (heading, + Add Consignor, empty state ss_3604boua6), /organizer/qr-codes ✅ (QR Scan Analytics, 3 KPI cards, Scanner Funnel ss_68576clbw), /organizer/reputation ✅ (Score 0.1/5.0 real data, Reputation/Reviews tabs, New Organizer Badge ss_2693dz51y). Flash Deal modal close BQ entry RESOLVED (X button shipped). BQ: 8→7. Below ceiling — DEV mode available next session.**

**S908 — QA MODE (2026-06-07). Records pass: S907 PCVs applied to roadmap.md (4 rows — H-002 RESOLVED, Bounty E2E chr ✅, Explorer's Guild URL chr ✅, Pricing chr ✅). Dev: /organizer/sales/[id]/flash-deals.tsx NEW PAGE created (TS 0 errors). QA findings: Flash Deal button ✅ CONFIRMED WORKING (false positive — gated on PUBLISHED sale, ss_0053mz6eh). Social Posts button ✅ CONFIRMED WORKING (false positive — "Social Media Post" modal with platform selector, ss_8620q0mej). NEW P3: Flash Deal modal missing close/X button. New Chrome verifications: Print Kit ✅, Boost Sale ✅ "Sale Bump" modal, Holds ✅, /organizer/sales ✅, /organizer/plan/[saleId] ✅, /organizer/command-center ✅, /organizer/checklist/[saleId] ✅. BQ: 9→8 (−2 false positives +1 new P3).**

**S907 — QA MODE (2026-06-07). Autonomous QA sweep complete. H-002 Leaflet map ✅ RESOLVED (pin popup "Gerald Ave Estate Sale" confirmed ss_8736lh0zj). Bounty E2E ✅ full flow (Alice submit → Bob approve → APPROVED → Alice notification). BountySubmission "Your Submissions" ✅ S906 fix confirmed (Pyrex record visible ss_5550658mg). Explorer's Guild URL: /shopper/guild-primer (not /guild or /shopper/guild — both 404). Pricing ✅ PRO=$29, TEAMS=$79 confirmed. 2 new P2 bugs: Flash Deal button (no onClick, /organizer/flash-deals → 404) + Social Posts button (no onClick). BQ: 7→9.**

**S906 — QA MODE (2026-06-07). Bug C (messages reply dark mode) ✅ CHROME-VERIFIED (DOM computed styles + visual). Hero search Enter ✅ CHROME-VERIFIED (navigated to /search?q=vintage%20lamp). BountySubmission "Your Submissions" display bug FIXED inline (getOrganizerSubmissions where clause: item.sale.organizerId→organizerId direct field, TS 0 errors). #176 stale roadmap note corrected. BQ: 9→7.**

**S905 — QA MODE (2026-06-07). Bug A (P1 passkey) ✅ CHROME-VERIFIED. #197 BountyMatchModal ✅ CHROME-VERIFIED (BountySubmission DB record confirmed). Bug C (messages dark mode) + Hero search Enter CODED. New P3: BountySubmission "Your Submissions" display bug. BQ: 11→9 (Bug A + #197 resolved).**

**S904 — QA MODE (2026-06-06). Autonomous QA sweep complete. Bug A (P1 passkey auth): CODED — next.config.js beforeFiles + usePasskey.ts double /api/ prefix fixed (TS 0 errors, pushblock below). Bug B (#197 bountyController): already coded S903, still pending push. Bug C (P3 messages reply dark mode): new finding. Hero search Enter (P3): new finding. Full product sweep ✅ — shopper discovery, organizer management all functional. BQ: 8→11 (3 new items). QA-ONLY continues.**

**S903 — QA MODE (2026-06-06). Wrap. #197 BountyMatchModal fix CODED (bountyController.ts, TS 0 errors). Pushblock provided to Patrick. Stale note confirmed: #176 "Sales Near You still missing" → INCORRECT, feature IS live (ss_5140qm032). BQ: 8 (unchanged).**

**S902 — QA MODE (2026-06-06). Autonomous QA continued. #27 CSV Export ✅ (ss_94917yaqg Amazon, ss_2041bm2l3 eBay). #66 Open Data Export ZIP ✅ (ss_3723v0nw2, ss_2914rv4if). #47 UGC Photo Tags ✅ full submit — modal → toast → DB record id=5 (status=PENDING, correct saleId/userId/tags). ⚠️ UX gap: no "pending review" message shown after submit. ❌ #197 BountyMatchModal production bug CONFIRMED: POST /bounties/match always 403 — bountyController.ts L581/L593 uses req.user?.id (user ID) vs item.sale.organizerId (organizer record ID) — they are different values; modal can never fire for any organizer. Added to BQ.**

**S901 — QA MODE (2026-06-06). CTA1 Chr ✅ S899 applied to roadmap.md (pre-compaction). FB Events geocoding BQ RESOLVED (242/260 PUBLISHED geocoded, 93% — 18 remaining). Chrome sweep: Homepage ✅ ss_0902g1f99, Search ✅ ss_97123xc98, Trending ✅ ss_51644lm5l, Organizer dashboard (Alice) ✅ ss_46975zqht, /organizer/insights real data ✅ ss_81628rlz9 ($220 revenue, 50% conversion rate). BQ: 8→7 (FB Events resolved). DEV mode available next session.**

**S900 — QA WRAP (2026-06-06). S899 parallel sessions reconciled: no conflicts. Combined BQ 13→10. Records PCV audit: S897/S898/S899 PCVs confirmed — #168 dark mode ✅ S898 + #213 dark mode ✅ S898 already applied; S897 PCVs all re-verifications of existing ✅ (no new Chrome column changes). FB Events API key alert + dateApproximate CONFIRMED ON GITHUB (S887/S890 fixes were already pushed — local files truncated by Cowork Edit tool). 13 local files corrupted by Edit tool truncation — Patrick must restore from GitHub HEAD before any local dev. BQ rows removed (10→8). QA MODE continues (8 = ceiling). Only pushblock: roadmap.md + STATE.md + patrick-dashboard.md.**

---

## Pool Audit Findings

Run: 2026-05-18 (S756). Railway DB queried directly via psycopg2.

**DirectoryClaimEmail (outreach queue):** 3,319 PENDING, 29 SENT. 31 junk rows deleted (26 image filenames stored as emailAddress, 5 Patrick test emails).

**leadTier breakdown:** HOT: 5,517 (100% website coverage) · WARM: 36,851 (3.3% website coverage) · COLD: 14,314

**WARM email gap:** Only 208 WARM orgs currently addressable. Website enrichment job changed from weekly → daily (S756). API headroom: HERE 250K/month cap, ~1,500/month usage. Pipeline healthy.

**Geocoding:** 6,760 sales still not geocoded. Nightly geocoding job addresses gradually.

---

## S913 Noted Findings (raised this session — not yet actioned)

Surfaced during the S913 email audit; recorded so they aren't lost. None are active outages — all are deferred-risk / tech-debt, most to address BEFORE `OUTREACH_ENABLED=true`.

- **[P2] Bounced addresses are not auto-suppressed.** `EmailSuppression` has only 5 rows total; the Jun-6 abandoned-signup bounces ("reached a limit for sending mail") were never added. Sending to known-bad addresses on outreach resume risks re-tripping the Workspace suspension. Bounces currently live only as mailer-daemon messages in the outreach@finda.sale mailbox, unparsed. → Build bounce → `EmailSuppression` processing BEFORE outreach resumes.
- **[P2 → RESOLVED S918] Single Gmail/Workspace account SPOF for ALL email → FIXED.** New `transactionalEmailService.ts` (Resend) now handles auth emails, Stripe receipts/payouts, POS receipts, workspace invites, direct messages, consignor notifications. Gmail/emailService remains bulk-only rail. Gmail suspension can no longer silence payouts or password resets.
- **[P3] `OUTREACH_ENABLED` conflates two concerns.** It now gates cold outreach AND opt-in subscriber notifications (`saleEndingSoonJob`) AND bulk digests — so turning off outreach also silently stops opt-in "sale ending soon" emails shoppers requested. → Consider a separate `BULK_EMAIL_ENABLED` / account-health flag distinct from cold-outreach.
- **[P3] Backend `/health` and `/api/health` → ✅ RESOLVED S915.** Confirmed: `GET https://backend-production-153c9.up.railway.app/api/health` → `{"status":"ok","timestamp":"2026-06-07T21:06:25.597Z"}` 200.
- **[P1 — NEW S915] Gmail REFRESH_TOKEN returns `unauthorized_client` — ALL Gmail-rail sending BROKEN.** Patrick re-minted the token with `https://mail.google.com/` scope but the new token fails with `unauthorized_client: Unauthorized` on every OAuth refresh attempt. Root cause: token was likely generated by a different OAuth client than GMAIL_CLIENT_ID in Railway (client ID `955070470579-3kangpdvi0jcvj88v...`), OR Workspace Admin needs to approve the broader scope. Impact: ALL transactional email via Gmail rail is currently broken (payouts, receipts, password resets, organizer notifications). bounceSuppressService cron will also fail silently at 06:00 UTC. → Patrick must restore a working GMAIL_REFRESH_TOKEN immediately. (Note: superseded S918 — transactional email now on Resend rail.)

## Blocked Queue

_S772 reconciliation: graduated/closed rows removed — reconciled into strategy/roadmap.md. Only genuinely open items remain._
_⚠️ P0 AGING: #332 at 73+ sessions — mandatory P0 per CLAUDE.md §10a._
_S919 WRAP: #230 RESOLVED (SmartBuyerWidget rendering confirmed). FB Marketplace RESOLVED (Patrick decision: DEFERRED — Apify path added to roadmap #380). #335 updated: Jane Thrift is fictional. BQ: 7→5._
_S921: SEC-001, SEC-002, #196, #201 coded but pending push+Chrome-verify — all 4 remained in BQ. BQ: 9._
_S922 QA MODE: all 4 S921 fixes Chrome-verified live RESOLVED (commit 7058d99c deployed): SEC-001 (admin.ts Prisma.sql parameterized, page returns 11 patterns no error), SEC-002 (items.ts scoped multer, valid types pass, add-items loads clean), #196 Buying Pools (card renders on $169 item ss_5769b4ui3, negative test on $25 item), #201 Favorites all 3 (Items(1) count, Saved Sales section, /shopper/collections→302→/shopper/wishlist ss_37941eelg/ss_1509jponw). All 4 rows REMOVED. BQ: 9→5. Below QA ceiling — DEV available S923._
_S928: HTML entity P2 FIXED (textUtils.ts + insights.tsx + itemController.ts). GA4 #470 conversion events built. 22 Chr cols bulk-applied (S803–S805 backlog). BQ: 6→5._
_S932: Hunt Pass multiplier display inconsistency RESOLVED (Patrick confirmed 1.5x XP on live site). BQ: 6→5._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing → CORE BUGS FIXED (pending push) | **P0** — **S890 FIXES CODED** (shopifyService.ts + connect-shopify.ts, TS 0 errors both packages): (1) sold-sync rewritten to correct 3-step REST flow — GET variant→inventory_item_id, GET locations→location_id, POST /inventory_levels/set.json (was malformed, silently failing); (2) API version 2024-01→2025-10; (3) variant payload gets `inventory_management:'shopify'`; (4) connect-shopify guide rewritten to match the real manual-token flow (removed false OAuth/auto-webhook/auto-sync promises); (5) 422/429 error handling added. **FLAGGED for Patrick (NOT built — future decisions):** proper OAuth app, inbound webhook handler (Shopify→FindA.Sale is one-way only), token encryption, optional ShopifyListing.shopifyInventoryItemId column to skip the 2 lookup calls. **Store still needed for live QA, but the code is now correct.** | Push; then connect a real custom-app store to QA the push + sold-sync end-to-end | S791 |

| #335 Outreach Resume — intentional hold | **P2** — S865 blast (8,317+ emails) → GH workflow disabled + OUTREACH_ENABLED=false (both confirmed). **S920 CORRECTION: Patrick confirmed outreach@finda.sale is NOT suspended — account ACTIVE.** OUTREACH_ENABLED=false is deliberate hold pending domain warming (17+ days silence required before resume). Transactional email now on Resend rail (S918) — payouts/auth unaffected by outreach pause. S919: Jane Thrift reference removed (fictional). **37 PENDING DirectoryClaimEmail queue** when ready to resume outreach. | S865-auto / Jun 5 |


| 462 WARM leads email-ready, no outreach record | **P2** — **S890 UNCHANGED: still exactly 462** (psycopg2). Note: backfill-organizer-contacts.yml backfills CONTACT data (email/phone), NOT DirectoryClaimEmail rows — that queue-row backfill was never built. Correctly deferred while OUTREACH_ENABLED=false (#335). Do during outreach resume. | Backfill DirectoryClaimEmail PENDING for the 462 as part of #335 resume | S887 |

| WARM tier website enrichment at 3.5% coverage | **P3** — **S890 UNCHANGED: 1,382 of 39,246 = 3.5%** (psycopg2). pipeline-website-enrichment.yml exists but coverage not improving. Needs supplemental source. | Add supplemental data provider or expand query strategies | S887 |
| GarageSaleFinder 80.7% un-geocoded (14,331 records) | **P3** — **S890 confirmed: 14,331 of 17,761 GSF = 80.7%** (psycopg2). GSF IS actively processed (it's 100% of the newest-500 batch) but GSF address format fails Nominatim structured ~80% — structural, acknowledged in geocodingAuditJob.ts suppression list. Tied to geocoding fetch-ordering row; even oldest-first won't fix GSF without a GSF-specific strategy. | GSF-specific geocode (lat/lng on source pages?) or accept the gap | S887 |


---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
_(S931 PCV rows — #462 Attribution, #237 Command Center, /admin/outreach-opens, SEO1 SSR, #455 Notify Me, #464 SEO footer, sale detail, /trending, /map — applied to roadmap.md in S932 records pass — cleared.)_
_(S930 PCV rows — organizer dashboard, HTML entity fix, shopper dashboard, Explorer Profile, #123 rank label, #199 Hunt Pass — applied to roadmap.md in S931 records pass — cleared.)
_(S925 PCV rows — logout flow Chr✅, #463 CODE-ONLY, #462 CSRF partial — applied to roadmap.md in S930 records pass — cleared.)
_(S927 PCV rows #79/#164/#316 applied to roadmap.md in S928 records pass — cleared.)
_(S920/S921/S922 PCV rows applied to roadmap.md in S923 records pass — cleared.)_
---


## Next Session

### Patrick — Actions Needed
1. **S932 pushblock** — run the pushblock below (roadmap + STATE + dashboard — code was already in S931 block).

### S933 Recommendation
BQ=5 (below ceiling=8). DEV available.
- **NODEJS-1G** — scraper fallback LIKE query still periodic; add `take: 500` to scraper/index.ts candidates findMany. Low urgency.
- **Monitor ImprovMX** — confirm daily forwarding stays below 500 (S929 @system.finda.sale fix deployed)
- **#471 Bounce Suppression Auto-Ingestion** — needed before outreach resume; build mailer-daemon parser
- **#335 Outreach Resume** — 37 PENDING DirectoryClaimEmail queue ready when domain warming complete


## Recent Sessions

### S932 — 2026-06-09 | RECORDS

**Session type:** Records — S931 PCV application, Hunt Pass BQ closure

**Work completed:**
- **Records pass** — Applied S931 PCVs to roadmap.md. #462 Outreach Funnel Attribution Chr column updated: ⬜|⬜ → ✅ S931|✅ S931 (only row needing a column update; #237/#SEO1/#464/#189/#139 already had Chr ✅ from prior sessions). #455 Notify Me updated: ⚠️ migration-pending note removed, S931 full E2E confirmation added.
- **Hunt Pass BQ RESOLVED** — Patrick confirmed /shopper/dashboard stats bar shows "1.5x XP" on live Vercel deploy. BQ item removed. BQ: 6→5.

**Files modified:**
- `claude_docs/strategy/roadmap.md` — #462 Chr ✅ applied, #455 note updated
- `claude_docs/STATE.md` — S932 wrap
- `claude_docs/patrick-dashboard.md` — S932 summary

**BQ delta:** 6 → 5 (Hunt Pass RESOLVED)

### S931 — 2026-06-09 | QA

**Session type:** QA — Records pass, Hunt Pass fix, Chrome QA sweep (continuing from S930)

**Work completed:**
- **Records pass (Task #1)** — Applied 6 S930 PCVs to roadmap.md Chr columns: organizer dashboard ✅, HTML entity fix (insights) ✅, shopper dashboard ✅, Explorer Profile ✅, #123 rank label ✅, #199 Hunt Pass active state ✅.
- **Hunt Pass multiplier fix (Task #2)** — 5 components corrected: StreakWidget.tsx (L78 label + L86 tooltip), HuntPassAvatarBadge.tsx (L69 title), HuntPassModal.tsx (L63 description), AvatarDropdown.tsx (L1199 title), Layout.tsx (L641 title). All changed "2x XP" → "1.5x XP". TS 0 errors. Pending push.
- **Chrome QA sweep (Task #3)** — 9 features verified: #462 Attribution E2E ✅ (ORGANIZER_PAGE_VIEWED DB id=cmq60o67l000n11qnfaa3qt13, ss_8722s1et1), #237 Command Center ✅ (ss_3575f2hgq ss_89830syni), /admin/outreach-opens ✅ (173 EMAIL_OPENED records, ss_324409tr9), SEO1 SSR ✅ (og:title/image/canonical confirmed web_fetch), #455 Notify Me ✅ (DB id=snmq614gmmivpefw, ss_8148yby5f), #464 SEO footer ✅ (Discover column links, ss_8148yby5f), sale detail page ✅ (ss_1097rjp4e), /trending ✅ (hot sales grid, ss_1920zk41t), /map ✅ (57 sales, Leaflet, ss_5209hylq3). 9 PCVs staged.

**Files modified:**
- `claude_docs/strategy/roadmap.md` — 6 S930 PCV Chr columns applied
- `packages/frontend/components/StreakWidget.tsx` — "2x XP" → "1.5x XP" (L78 + L86)
- `packages/frontend/components/HuntPassAvatarBadge.tsx` — "2x XP" → "1.5x XP" (L69)
- `packages/frontend/components/HuntPassModal.tsx` — "2x XP" → "1.5x XP" (L63)
- `packages/frontend/components/AvatarDropdown.tsx` — "2x XP" → "1.5x XP" (L1199)
- `packages/frontend/components/Layout.tsx` — "2x XP" → "1.5x XP" (L641)
- `claude_docs/STATE.md` — S931 wrap
- `claude_docs/patrick-dashboard.md` — S931 summary

**BQ delta:** 6 → 6 (Hunt Pass entry updated: "fix built S931, pending push+re-verify")

### S930 — 2026-06-09 | QA

**Session type:** QA — Records pass, DB migration, Chrome QA sweep

**Work completed:**
- **Records pass** — Applied S925 PCVs to roadmap.md: logout flow → Chr✅ S925; #463 claim-click → CODE-ONLY note (beacon fire-and-forget, unverifiable in QA env).
- **DB migration** — Decoded 4 HTML-encoded category rows in Railway DB: "Electronics & Technology", "Lamps & Lighting", "Home Décor", "Jewelry & Watches".
- **HTML entity fix Chrome-verified** — Navigated /organizer/insights as Alice. No `&amp;` or `&#233;` visible in Items by Category. ✅ (ss_7450stzxz ss_5747xy01g)
- **Autonomous QA sweep** — 5 features Chrome-verified: organizer dashboard ✅, shopper dashboard (Leo Thomas) ✅, Explorer Profile ✅, #123 ranks page ✅ (Ranger card + "↑ Your rank" badge), #199 Hunt Pass active state ✅ (no "Active until N/A"). 6 PCVs staged.
- **⚠️ P3 new BQ item** — Dashboard stats bar "Hunt Pass 2x XP" vs /shopper/hunt-pass "1.5x XP on every action" multiplier display inconsistency.
- **Gmail DSN cleanup** — Trashed 104 mailer-daemon delivery delay/failure notifications from outreach@finda.sale inbox. S929 fix prevents new ones; backlog cleared.

**Files modified:** claude_docs/STATE.md, claude_docs/patrick-dashboard.md, claude_docs/strategy/roadmap.md (S925 PCVs applied)

**BQ delta:** 5 → 6 (+1 Hunt Pass multiplier P3)

### S929 — 2026-06-09 | BUG/OPS

**Session type:** Bug/Ops — Sentry triage + outreach placeholder fix

**Work completed:**
- **Sentry 10→5 issues resolved** — VACUUM ANALYZE on Sale + Organizer tables cleared NODEJS-10/2Y/32/3D/2N (table bloat). NODEJS-1A (bounceSuppressService module) cleared by redeploy (file exists, dynamic require had try/catch). 
- **DB indexes added (now live)** — `Sale_status_isInventoryContainer_endDate_idx` (NODEJS-3E: search.ts COUNT query) + `Organizer_contactEmail_isUnmanagedListing_idx` (NODEJS-38: emailDiscoveryJob). Migration deployed via `prisma migrate deploy`.
- **@system.finda.sale outreach leak fixed** — `PLACEHOLDER_DOMAINS` set was missing `system.finda.sale` in all 3 seeder files. Scraper creates synthetic emails (`scraper+slug@system.finda.sale`) stored as User.email; outreach cron was treating these as real organizer contactEmails and queuing outreach to them. Fix deployed. 0 bad rows confirmed in DirectoryClaimEmail queue before fix.
- **ImprovMX 500/day flood explained** — bounce DSNs from @system.finda.sale outreach attempts landing at finda.sale addresses ImprovMX forwards. Fix stops new bad emails; volume drops tomorrow. Outreach account confirmed NOT suspended (memory corrected).
- **NODEJS-1G still monitoring** — scraper fallback `findMany({ where: { isUnmanagedListing: true, address: { contains: city } } })` cannot use B-tree index on LIKE '%city%'. `@@index([isUnmanagedListing])` exists but not sufficient for large table scan. Needs `take: 500` limit or pg_trgm GIN index. Low frequency (< 1/day average). Deferred to S930.

**Files modified:**
- `packages/database/prisma/schema.prisma` — 2 new @@index entries (Organizer + Sale)
- `packages/database/prisma/migrations/20260608000001_add_missing_sale_organizer_indexes/migration.sql` — new migration
- `packages/backend/src/jobs/autoSeedOutreachCron.ts` — added 'system.finda.sale' to PLACEHOLDER_DOMAINS
- `packages/backend/src/scripts/seedDirectoryClaimEmails.ts` — same fix
- `packages/backend/src/scripts/backfill-warm-emails.ts` — same fix

**BQ delta:** 5 → 5 (unchanged — no feature work)


### S928 — 2026-06-08 | QA + DEV

**Session type:** Autonomous QA + parallel dev dispatch (BQ=6, below ceiling=8)

**Work completed:**
- **Records Chr bulk-apply (22 rows)** — S803–S805 PCV backlog applied: #77/#8/#18/#136/#16/#57→✅S805; #33/#34/#63/#67/#6/#39/#191/#52/#70/#208/#211→✅S804; #28/#180/#181/#187→✅S803; #244→✅S791. S927 PCVs (#79/#164/#316) also applied in same pass.
- **P2 HTML entity fix — RESOLVED** — Root cause: eBay CSV import encoded category strings (`&amp;`, `&#233;`). Fix: (1) `decodeHtmlEntities()` extended with numeric entity support in textUtils.ts; (2) insights.tsx wraps both bar chart + top items table renders; (3) itemController.ts decodes `rawCategory` at CSV bulk-import path. Future imports clean; existing DB rows still encoded (DB migration deferred → S929).
- **#470 GA4 conversion events — BUILT** — 5 conversion events wired: `organizer_registered` (register.tsx, post-login, ORGANIZER only), `sale_created` (create-sale.tsx, post-publish, includes sale_type), `first_item_uploaded` (add-items/[saleId].tsx, guarded items.length===0), `shopper_favorite_added` (FavoriteButton.tsx, confirmed add only), `checkout_initiated` (CheckoutModal.tsx PaymentForm, includes amount). CODE-ONLY — no Stripe test terminal in QA env.
- **Chrome QA sweep** — Confirmed 8 pages/features working: organizer dashboard (Alice, "Welcome", QA Active Sale S875 LIVE), insights (no entities in organic data ✅), affiliate page (code ORG_ABFJDV, empty state ✅), sale detail Hype Meter (green dot, 3 views, live activity ✅), category browsing (30 items Comics grid ✅), item detail (all CTAs: Save/Share/QR/Scout/Buy/Cart/Hold ✅), Verified Organizer Badge (blue checkmark on Artifact Downtown Paw Paw ✅).

**Files modified (code):**
- `packages/frontend/utils/textUtils.ts` — numeric entity decode + &apos; support
- `packages/frontend/pages/organizer/insights.tsx` — decodeHtmlEntities on bar chart + top items
- `packages/backend/src/controllers/itemController.ts` — decode rawCategory at CSV import
- `packages/frontend/pages/register.tsx` — organizer_registered GA4 event
- `packages/frontend/pages/organizer/create-sale.tsx` — sale_created GA4 event
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — first_item_uploaded GA4 event
- `packages/frontend/components/FavoriteButton.tsx` — shopper_favorite_added GA4 event
- `packages/frontend/components/CheckoutModal.tsx` — checkout_initiated GA4 event

**BQ: 6→5 (HTML entity P2 RESOLVED).**

### S927 — 2026-06-08 | QA

**Session type:** QA — autonomous continuation from S926

**Work completed:**
- **#79 Earnings Counter Animation ✅** — Navigated to /organizer/insights as Alice. TOTAL REVENUE $220.00, ITEMS SOLD 3, CONVERSION RATE 42.9% confirmed rendered. Animation not capturable via QA (Next.js SSR loads final values before screenshot). Prior ✅ human QA S805 still valid.
- **#164 Tiers Backend Infrastructure ✅** — Bronze Organizer badge on organizer dashboard confirmed: "1/4 sales until next tier", "Reach Silver at 5 sales". Real-Time Metrics widget showing live data.
- **#316 Referral Tranche Anti-Fraud ✅** — /organizer/referrals page functional. Referral link (`https://finda.sale/signup?ref=REF-7CD8DCC0`) visible. 1 Organizers Referred tracked. DB confirms: fraudReviewStatus=CLEAR, ownReferralSucceeded=false, TRANCHE_A (100 XP) + TRANCHE_B (150 XP) awarded 2026-06-05. UI "0 XP Earned" is OrganizerReferral-program-specific counter (separate from tranche XP awarded via engagement hooks). Anti-fraud working correctly.
- **P2 bug found: HTML entity encoding in category names** — DB stores `Electronics &amp; Technology`, `Lamps &amp; Lighting`, `Home D&#233;cor`, `Jewelry &amp; Watches` as HTML-encoded strings. insights.tsx renders `{cat.category}` directly — entities appear literally in "Items by Category". Fix: data migration + prevent re-encoding at write time. Added to BQ.

**Files modified:** None (QA only — docs only this entry)

**BQ: 6 (+1 HTML entity P2 bug).**

### S926 — 2026-06-08 | ANALYTICS/GA4/WRAP

**Session type:** Analytics investigation + GA4 root cause fix + session wrap

**Work completed:**
- **GA4 root cause found and fixed** — CSP in `packages/frontend/next.config.js` missing `https://www.googletagmanager.com` in `script-src` and `https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com` in `connect-src`. Every browser since launch silently blocked the gtag.js script and all measurement hits. Fixed via Python/bash (Edit tool banned). Deployed to Vercel — Realtime confirmed 1 active user in Michigan post-fix.
- **ConsentBridge secondary bug fixed** — `CookieConsentBanner.handleAccept()` now calls `window.gtag('consent', 'update', { analytics_storage: 'granted' })` directly. Root cause: Web Storage `storage` event only fires in OTHER tabs, so ConsentBridge (`window.addEventListener('storage', ...)`) never heard same-tab consent grants.
- **Automation meta-audit** — answered Patrick's "what's automated / what's missing / what should we be getting" question. 21 scheduled tasks active.
- **Roadmap updated** — #465 Tier 4 marked LIVE; added #470 GA4 conversion events, SEO3 Denver city landing pages, #471 bounce suppression auto-ingestion, #472 email send automation.

**Files modified (code — pushed to GitHub):**
- `packages/frontend/next.config.js` — CSP script-src + connect-src updated (GA4 unblocked)
- `packages/frontend/components/CookieConsentBanner.tsx` — direct gtag consent call on Accept

**Files modified (docs — need Patrick pushblock):**
- `claude_docs/strategy/roadmap.md` — #465 updated (Tier 4 live), #470/SEO3/#471/#472 added
- `claude_docs/STATE.md` — S926 wrap
- `claude_docs/patrick-dashboard.md` — S926 summary

**BQ: 5 (unchanged).**

### S925 — 2026-06-08 | QA

**Session type:** QA — CSRF fix verification + logout re-test + #463 claim-click investigation

**Work completed:**
- **#462 CSRF fix re-verified** — POST /api/outreach/page-view returns 200 for unauthenticated callers (JS fetch credentials:'omit'). S924 csrf.ts outreach exemption confirmed working on live site. Attribution logging (ORGANIZER_PAGE_VIEWED audit) UNVERIFIED — requires real outreach email click.
- **Logout flow verified** — Leo Thomas (user5) signed out from desktop user dropdown at /shopper/dashboard → redirected to /login (ss_49305bl2y) → /shopper/dashboard nav shows Login button → navigating back redirects to /login?redirect=/shopper/dashboard (ss_581555xvt). Session fully cleared. S897 fix still holding.
- **#463 Claim-click tracking (CODE-ONLY)** — track('claim_profile_click',...) confirmed in organizers/[id].tsx onClick handlers. <Analytics /> SDK confirmed in _app.tsx. CTA redirect confirmed: clicked "Claim This Profile — It's Free" → /register?claim=cmp0jq4j700mnoz89rdjmih15 (ss_6367qcmy3). Vercel beacon delivery UNVERIFIED (fire-and-forget keepalive; page navigates before capture).

**Files modified (docs only — need Patrick pushblock):**
- `claude_docs/STATE.md` — S925 status, PCVs updated, Next Session updated for S926
- `claude_docs/patrick-dashboard.md` — S925 QA summary

**BQ: 5 (unchanged).**

### S924 — 2026-06-08 | QA/BUG

**Session type:** QA sweep + P1 bug fix (CSRF exemption missing for public outreach endpoints)

**Work completed:**
- **P1 CSRF bug FIXED — csrf.ts:** POST /api/outreach/page-view and /outreach/unsubscribe returned 403 CSRF validation failed for all unauthenticated callers. Root cause: validateCsrfToken had no exemption for these public endpoints. Fix: added outreach block between auth check and Bearer token check. Pushed to GitHub commit 44dabb618ef1e53256450e8904ef0b191033de0d. Railway auto-deploying.
- **roadmap.md #462 notes updated** — documented CSRF bug + fix, marked Pending Chrome QA.
- **roadmap.md #138 title corrected** — ESTATE/CHARITY/BUSINESS/CORPORATE → ESTATE/YARD/AUCTION/FLEA_MARKET/DORM_DASH (CHARITY was never a top-level type; it is a toggle within ESTATE).
- **#318 affiliate button investigated** — XHR confirmed firing to POST /api/affiliate/generate-code. Eligibility gate working (toast appears: "Must complete at least one paid sale"). UNVERIFIED — cannot fully test without paid sale. Seed accounts all have 0 sales.

**Files modified (code — pushed to GitHub):**
- `packages/backend/src/middleware/csrf.ts` — outreach CSRF exemption block added (commit 44dabb618)

**Files modified (docs — need Patrick pushblock):**
- `claude_docs/strategy/roadmap.md` — #462 notes (CSRF fix), #138 title corrected
- `claude_docs/STATE.md` — S924 wrap
- `claude_docs/patrick-dashboard.md` — S924 summary

**BQ: 5 (unchanged).** CSRF bug found and fixed in same session — no BQ entry needed.

### S923 and earlier — archived

_(Session entries S923 and earlier are in git history / prior STATE.md revisions. Trimmed per T4/T5 rotation — full detail in session-log-archive.md.)_

---
 
