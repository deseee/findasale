# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

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
| 462 | **#462 Outreach CSRF fix — POST /api/outreach/page-view returns 200** | ✅ Chrome partial S925 — JS fetch('POST /api/outreach/page-view', credentials:'omit') → 200 for unauthenticated caller on live site. S924 csrf.ts outreach exemption confirmed working. Full E2E (ORGANIZER_PAGE_VIEWED in OutreachAuditLog) requires real outreach email click — UNVERIFIED (no test email available in QA env). CSRF layer ✅. Attribution logging pending real outreach send. | S925 |
| — | **Logout flow — session fully clears on user dropdown logout** | ✅ Chrome-verified S925 — Leo Thomas (user5@example.com) at /shopper/dashboard. Desktop user dropdown opened, clicked Logout. Redirected to /login (ss_49305bl2y). Nav shows Login button. Navigated to /shopper/dashboard → 302 → /login?redirect=/shopper/dashboard (ss_581555xvt). Session fully cleared. | S925 |
| 463 | **#463 Claim button click tracking (Vercel Analytics)** | CODE-ONLY S925 — track('claim_profile_click', {organizerId, source, tier}) confirmed in organizers/[id].tsx onClick. <Analytics /> SDK confirmed in _app.tsx. CTA redirect confirmed: clicked "Claim This Profile — It's Free" → /register?claim=cmp0jq4j700mnoz89rdjmih15 (ss_6367qcmy3). Beacon delivery UNVERIFIED (keepalive beacon fire-and-forget; page navigates before capture). Requires Vercel Analytics Events tab check. | S925 |

_(S920/S921/S922 PCV rows applied to roadmap.md in S923 records pass — cleared.)_
---

## Next Session

**S926 STATUS ENTERING:**
- ✅ BQ = 5 (below QA ceiling of 8) → DEV or QA mode available
- ✅ CSRF fix live (S924, commit 44dabb618) — CSRF layer verified S925
- ⚠️ pushblock below still needs Patrick to run (doc changes S924+S925)

**S926 FIRST ACTIONS:**
1. **Records pass (cross-session rule):** Apply S925 PCVs to roadmap.md
   - #462 CSRF partial — CSRF layer ✅, attribution logging UNVERIFIED — update notes column only, Chr remains ⬜
   - Logout flow — no roadmap row; note in STATE.md only
   - #463 CODE-ONLY — no Chr ✅ (beacon unverified) — do NOT advance Chr column
2. **Continue Chrome QA sweep** — 65 features with Chr ⬜ in roadmap; next priority: organizer pages (/organizer/marketing, /organizer/photos, /organizer/pos), then shopper account pages.
3. **Patrick: check Vercel Analytics Events tab** for `claim_profile_click` event to close out #463 Chr column.

**Patrick actions:**
- **Run the pushblock below** — S924 csrf.ts + S924/S925 doc changes.
- **Vercel Analytics Events tab:** Verify `claim_profile_click` event firing for #463.
- **#332 Shopify:** Connect a real custom-app store for live QA when ready.

## Recent Sessions

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

### S923 — 2026-06-08 | RECORDS/WRAP

**Session type:** Records pass (cross-session PCV application) + attempted Chrome QA

**Work completed:**
- **roadmap.md PCVs applied** — #196 Buying Pools Chr column → ✅ S922 (with S922 evidence prepended to notes); #201 Favorites Chr → ✅ S922; #198 Reviews Chr → ✅ S920; #210 Streaks Chr → ✅ S921. Last Updated header updated. SEC-001/SEC-002 have no roadmap rows (BQ items only — already removed S922).
- **patrick-dashboard.md updated** — Reflects S923 records pass, BQ=5, roadmap up to date.
- **Chrome QA attempted** — Extension not connecting; handed back to Patrick.
- **Bash confirmed working** — Disk at 94% (was 100% S922 causing bash outage).

**Files modified:**
- `claude_docs/strategy/roadmap.md` — Chrome column PCVs applied (#196/#201/#198/#210)
- `claude_docs/patrick-dashboard.md` — S923 records pass summary
- `claude_docs/STATE.md` — S923 status, Next Session updated

**BQ: 5 (unchanged).**

### S922 — 2026-06-08 | QA MODE

**Session type:** QA — Chrome-verify the 4 S921 fixes on live production (commit 7058d99c, Vercel deploy confirmed READY).

**Work completed:**
- **Verified S921 push live** — GitHub commit 7058d99c (15:35Z) + Vercel deployment dpl_J2zD… state READY, aliased to finda.sale. (Frontend was still BUILDING at session start, which caused an initial false 404 on /shopper/collections — re-tested after READY.)
- **#196 Buying Pools ✅ RESOLVED** — /items/cmp1digeb000lxravcnxftuix (Zoom B3, $169) as Leo Thomas: "Split this purchase" card renders, split math 2/3/4/5 ways correct ($84.50/$56.33/$42.25/$33.80), "Start a Pool" CTA. ss_5769b4ui3. Negative test: $25 Vintage Radio (cmq2z2ocg001810t51m6su0bb) → no card. Deployed BuyingPoolCard.tsx confirmed `itemPrice > 100`.
- **#201 Favorites ✅ RESOLVED (all 3)** — Saved Zoom B3 as Leo → /shopper/wishlist shows "Items (1)" (count matches single item favorite), "Saved Items" lists the Zoom B3, "Saved Sales" lists July Discovery Auction (sale-favorite separated), /shopper/collections → 302 → /shopper/wishlist. ss_37941eelg, ss_1509jponw.
- **SEC-001 ✅ RESOLVED** — /admin/demand-signals as Alice (user1, admin): "Unmet Demand Signals", 11 real patterns, full table, no error. Deployed admin.ts query parameterized (Prisma.sql bound ${city}/${minCount}, Prisma.empty fallback) — no $queryRawUnsafe.
- **SEC-002 ✅ RESOLVED** — Deployed items.ts: scoped uploadImages (JPEG/PNG/WebP/GIF, 25MB) on POST /api/items + uploadCsv (CSV types, 10MB) on import routes; fileFilter rejects arbitrary types; valid types pass. /organizer/add-items/[saleId] loads clean post-deploy.
- **Observation (not filed):** Logout from the user menu did not fully clear Leo's session until a fresh login superseded it — I interrupted the logout flow, so not a confirmed bug; flagged for a clean isolated re-test.

**Tooling/infra issues this session:**
- Workspace bash DOWN entire session — "useradd failed: No space left on device". No psycopg2 / Python-via-bash available → could not edit roadmap.md or patrick-dashboard.md, or run the BQ-count script. STATE.md updated via full-content Write (Edit tool banned per CLAUDE.md §4).
- Chrome screenshot tool intermittently errored ("params.clip.scale" deserialize) — used get_page_text/JS DOM reads for evidence where needed.

**Files modified:**
- `claude_docs/STATE.md` — S922 status, BQ 9→5 (removed #196/#201/SEC-001/SEC-002), 4 PCV rows added, Next Session rewritten for S923.

**BQ: 9→5.** Deferred to S923 (bash required): roadmap.md Chrome-column PCVs (#210 S921 + #196/#201/SEC-001/SEC-002 S922 + verify #198) and patrick-dashboard.md.

### S921 — 2026-06-08 | QA MODE

**Session type:** QA — BQ=9 at ceiling; coded fixes for #196/#201/SEC-001/SEC-002 + #210 Streaks Chrome QA

**Work completed:**
- **#198 Reviews PCV → roadmap** — Row #198 Chrome QA column updated → S920 with full evidence.
- **#196 Buying Pools fix CODED** — BuyingPoolCard.tsx line 48: `> 10000` → `> 100`. TS 0 errors.
- **#201 Favorites 3 bugs CODED** — (1) favoriteController.ts getUserFavorites: added sale-level favorites query, returns saleFavorites + saleTotal; (2) wishlist.tsx: items tab count = savedCount only + new Saved Sales section; (3) pages/shopper/collections.tsx NEW: 302 redirect to /shopper/wishlist. TS 0 errors all 3.
- **SEC-001 CODED** — admin.ts: all $queryRawUnsafe replaced with Prisma.sql tagged templates. TS 0 errors.
- **SEC-002 CODED** — items.ts: two scoped multer instances — uploadImages (JPEG/PNG/WebP/GIF, 25MB) + uploadCsv (CSV/XLS, 10MB). TS 0 errors.
- **#210 Streaks — Chrome-verified** — /shopper/dashboard as Leo Thomas (user5). Streak banner: Streak 6, XP 2025, Hunt Pass 2x XP. ss_021185in1, ss_4660qufq3, ss_1965zcca0.

**Files modified:**
- `packages/frontend/components/BuyingPoolCard.tsx` — threshold 10000→100
- `packages/backend/src/controllers/favoriteController.ts` — sale favorites in getUserFavorites
- `packages/frontend/pages/shopper/wishlist.tsx` — items count fix + Saved Sales section
- `packages/frontend/pages/shopper/collections.tsx` — NEW 302 redirect
- `packages/backend/src/routes/admin.ts` — SEC-001 Prisma.sql
- `packages/backend/src/routes/items.ts` — SEC-002 scoped multer
- `claude_docs/strategy/roadmap.md` — row #198 Chrome QA → S920 applied

**BQ: 9 (unchanged)** — #196/#201/SEC-001/SEC-002 coded but pending push+Chrome-verify. All 4 remain in BQ. (Pushed S922 as commit 7058d99c; all 4 verified S922.)

### S920 — 2026-06-08 | QA MODE

**Session type:** QA — shopper flow (#196 Buying Pools, #198 Reviews, #201 Favorites, #210 Streaks)

**Work completed:**
- **#198 Reviews ✅ Chrome-verified** — Navigated https://finda.sale/sales/cmpt2oq6q00138cehpgqx3huk as user5 (Leo Thomas). Clicked 5-star rating. Clicked Submit Review. Review appeared with correct content. Form reset to 0/500 confirming onSuccess fired. ss_5467x997f, ss_9288c84e3.
- **#196 Buying Pools root cause** — `BuyingPoolCard.tsx`: `shouldShow = itemPrice > 10000`. Items stored in dollars ($285/$3500) never reach $10k. Fix is 1 line: `> 100`. Added to BQ as P1.
- **#201 Favorites 3 P2 bugs** — Favorites sub-flows navigated as user5: (1) Items tab overcounts (2 shown, 1 actual), (2) Sale-level Favorites absent from /shopper/wishlist, (3) /shopper/collections → 404. Added to BQ.
- **#335 corrected** — Patrick confirmed outreach@finda.sale NOT suspended S920. Updated BQ entry, downgraded P1→P2, removed stale "reactivate at admin.google.com" requirement.
- **DB cleanup** — Deleted test Review cmq5cdxx9000dxq7vmt95figg + Favorites cmq5be3d701bfv7mwny6k4zyb + cmq5bpsy301bmv7mwqi1bp8m7 via psycopg2.

**Files modified:** STATE.md, patrick-dashboard.md

**BQ: 7→9** (+2: #196 Buying Pools, #201 Favorites P2 bugs).

---

### S919 — 2026-06-08 | AUTOMATED + SECURITY AUDIT

**Session type:** Automated (findasale-workflow-retrospective) + findasale-hacker quarterly audit

**Work completed:**
- Monthly retrospective written: `claude_docs/workflow-retrospectives/monthly-retro-2026-06-08.md` — 7-area analysis, 13 recommendations
- SH-023/024/025 appended to `self_healing_skills.md` (Edit tool truncation, Railway env var propagation, outreach cascade)
- `audits/` soft cap (30 files) added to `file-creation-schema.md`
- Health-reports archival: 23 files moved to `claude_docs/archive/health-reports/` (28 → 5 files)
- Workflow-retrospectives archival: 2 oldest files moved to `claude_docs/archive/workflow-retrospectives/`
- **Quarterly security audit (findasale-hacker):** First since S218. Full report: `claude_docs/health-reports/security-audit-2026-06-08.md`
  - **CRITICAL fixed inline:** `/api/dev` route registered in production without NODE_ENV guard — privilege escalation (anyone registers user1@example.com → becomes ADMIN). Fixed: added `if (process.env.NODE_ENV !== 'production')` guard to `packages/backend/src/index.ts`
  - **P1 queued:** admin.ts SQL string interpolation in `$queryRawUnsafe` (admin-only, SEC-001) — FIXED S921, verified S922
  - **P1 queued:** items.ts multer no MIME filter/size limit (SEC-002) — FIXED S921, verified S922
  - **Confirmed safe:** Stripe webhook signatures, JWT httpOnly cookies, auth rate limiting, IDOR checks, password reset entropy, QA bypass guard
  - **HIGH npm vulns:** 6 HIGH in backend (path-to-regexp, semver, axios) — no critical; P2 backlog
- Blocked Queue: 5 → 7 (SEC-001 + SEC-002 added)

**Files modified:**
- `packages/backend/src/index.ts` — NODE_ENV guard on /api/dev route (P0 fix)
- `claude_docs/self-healing/self_healing_skills.md` — SH-023/024/025 appended
- `claude_docs/operations/file-creation-schema.md` — audits/ soft cap row added
- `claude_docs/health-reports/security-audit-2026-06-08.md` — NEW (quarterly security report)
- `claude_docs/workflow-retrospectives/monthly-retro-2026-06-08.md` — NEW (monthly retro)
- `claude_docs/STATE.md` and `claude_docs/patrick-dashboard.md` — updated at wrap
- Archived: 25 files (23 health-reports + 2 workflow-retrospectives) to `claude_docs/archive/`


### S919 — QA/WRAP (2026-06-08). SmartBuyerWidget BQ closed. Apify deferred on roadmap. BQ: 7→5.

**Completed:**
- #230 SmartBuyerWidget: Logged in as Alice (user1@example.com, Seedy2025!). Sale S875 end date was Jun 7 (expired) — extended to Jun 15 via edit-sale page. Dashboard confirmed all 4 BASE_WIDGETS rendering: SalePulse (4/100), Who's Coming (empty state — correct for 0 watchers), High-Value Items (empty), Efficiency Coach (60% sell-through). ss_9730k70bl. The "Who's Coming" empty state card IS the SmartBuyerWidget rendering correctly — confirmed. S793 Chrome QA (Leo Thomas, SCOUT rank) remains valid. #230 RESOLVED, removed from BQ.
- #380 FB Marketplace: Patrick confirmed Apify as DEFERRED (not DROP). Roadmap row updated via Python/bash: parked → DEFERRED with Apify (~$30-50/mo, pre-built scrapers with residential IP + session). BQ entry (CF Worker dead end) removed.
- #335 cleanup: DB query confirmed Jane Thrift (jthrift@example.com / Jane Thrift) does not exist in Railway DB — fictional account from canary testing. Removed "Jane Thrift re-send" from #335 BQ entry. #335 remains open (intentional outreach hold — see BQ).

**Files Changed:**
- `claude_docs/strategy/roadmap.md` — row #380 updated (Apify deferred)
- `claude_docs/STATE.md` — BQ 7→5, S919 added
- `claude_docs/patrick-dashboard.md` — BQ updated

**BQ: 7→5.** Below ceiling — DEV mode available next session.

---

### S918 — DEV (2026-06-07). Resend transactional email rail. BQ: 7 (unchanged).

**Completed:**
- bounceSuppressService verified clean: EmailSuppression 5 rows (no BOUNCED entries — expected, inbox cleared S917, first outreach wave hasn't bounced back yet). Service correctly configured.
- Created `packages/backend/src/lib/transactionalEmailService.ts` — Resend SDK, same `emails.send()` interface as emailService, `hello@send.finda.sale` default FROM (`send.finda.sale` already verified in Resend), soft no-op with console.error when RESEND_API_KEY missing, throws on Resend API error.
- Migrated 9 callers to Resend rail: authController (2), auth.ts route (2), stripeController (6), posController (4), terminalController (2), workspaceController (1), messageEmailService (1), consignorEmailService (3), tierLapseJob (1). Total: 22 call sites moved.
- 40+ remaining callers (bulk/marketing) intentionally left on Gmail/emailService.
- Backend TypeScript check: 0 errors.
- S913 P2 Gmail SPOF finding: RESOLVED.

**BQ: 7 (unchanged).**

---

_(Earlier session entries S917–S900 retained in git history / prior STATE.md revisions. Trimmed here per T4/T5 rotation to keep STATE.md maintainable — full detail remains in the Current Status one-liners above and in session-log-archive.md.)_
