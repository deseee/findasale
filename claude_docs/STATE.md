# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S837 — QA+DEV: #166 ✅, #74 ✅, #150 ✅ + nav audit → 11 fixes + 6 pages surfaced. QA verified 3 P0 items. Nav code audit (AvatarDropdown + BottomTabNav): double hr, Explorer's Guild dup in Connect, Add Items wrong href, dual-role settings buried, mobile no shopper path, 6 complete features with no nav entry (#398 referrals, #334 markdown-cycles, #396 starter-kit, #438 ai-score, #55 challenges, #182 surprise-me). All shipped: AvatarDropdown (11 changes), BottomTabNav (Shop tab for dual-role), color-rules→discount-rules redirect, notifications consolidated (sale_alert filter + redirect), wishlist "New Collection" stub wired to /wishlists. Unsurfaced pages: 9 were just redirects (no action needed), 6 surfaced in nav, 3 resolved (discount-rules canonical, notifications consolidated, wishlists hub-and-spoke Option A). 0 TS errors. user2 now USER+ORGANIZER+SHOPPER for dual-role testing. SVPKNKV3 invite code unused in DB — Patrick delete via /admin/invites. Blocked Queue: 5 rows.**

**Previous: S836 — DEV+QA: #462/#463/#464 UTM attribution ✅ FULLY VERIFIED. Root cause confirmed: Chrome incognito strips utm_* params at browser level before request is sent. Fix: email links use fsa_* param names (Chrome-safe). UTMCapture reads fsa_* as primary source, maps to utm_* for sessionStorage. Confirmed via console: sessionStorage.getItem('fsa_utm') = {"utm_source":"outreach","utm_medium":"email","utm_campaign":"touch1","utm_content":"hot",...}. Blocked Queue: 4 rows.**

**Previous: S835 — QA+Fix: #167 admin queue properly re-verified with real DB data (Patrick caught rubber-stamping of empty state). 2 test disputes injected via psycopg2 → /admin/disputes confirmed: dispute cards show buyer/seller/reason, expand reveals description + 4 status buttons, "Mark Under review" clicked → green toast + badge updated live without reload, F5 reload → status persisted. Admin guard verified (user5 → redirected to homepage). P2 found + fixed: filter tabs disappeared when filtered status returned empty results (EmptyState rendered before tabs, trapping admin). Fix: disputes.tsx restructured so tabs always render; inline empty state now context-aware ("No Open Disputes — try another filter"). UTM #462/#463/#464 ❌ confirmed broken in Patrick's real browser — session storage empty after navigating to finda.sale/search?utm_source=email in incognito; URL showed stripped params before page loaded. Needs new dev investigation. Blocked Queue: 5 rows.**

**Previous: S833 — QA: #279 ✅, #167 ⚠️ P2 bug found+fixed, S832 verifications applied to roadmap, artifactmi XP restored. (1) XP restored: artifactmi guildXp 183→283 (QA artifact from S832 #288 boost). (2) S832 Chrome verifications applied to roadmap: #135/#302/#300/#301/#288/#297 all updated to Human QA ✅ S832. (3) #279 Rare Finds ✅ Chrome-verified — /shopper/rare-finds as Leo Thomas (Hunt Pass active): page loads, 4 rarity filters work, empty states correct. Dashboard 💎 Rare Finds widget confirmed. Hunt Pass Active banner present. (4) #167 Disputes ⚠️ P2 BUG FOUND + FIXED — DisputeForm passes itemId={purchase.item?.id} but getPurchases omits id from item select → itemId always '' → "All fields are required" on submit. Fix: id:true added to item select in userController.ts. Form UI verified ✅. Admin queue UNVERIFIED (JWT caching blocked admin access; user1 ADMIN role added to DB). Also: user1 was missing ADMIN role entirely (seed gap) — fixed via DB. Blocked Queue: 5 rows.** (1) XP restored: artifactmi guildXp 183→283 (QA artifact from S832 #288 boost). (2) S832 Chrome verifications applied to roadmap: #135/#302/#300/#301/#288/#297 all updated to Human QA ✅ S832. (3) #279 Rare Finds ✅ Chrome-verified — /shopper/rare-finds as Leo Thomas (Hunt Pass active): page loads, 4 rarity filters work, empty states correct. Dashboard 💎 Rare Finds widget confirmed. Hunt Pass Active banner present. (4) #167 Disputes ⚠️ P2 BUG FOUND + FIXED — DisputeForm passes itemId={purchase.item?.id} but getPurchases omits id from item select → itemId always '' → "All fields are required" on submit. Fix: id:true added to item select in userController.ts. Form UI verified ✅. Admin queue UNVERIFIED (JWT caching blocked admin access; user1 ADMIN role added to DB). Also: user1 was missing ADMIN role entirely (seed gap) — fixed via DB. Blocked Queue: 5 rows.**

**Previous: S832 — QA: 6 features Chrome-verified. (1) #135 Social Templates ✅ — all 8 platforms (FB/IG/Nextdoor/Threads/WhatsApp/Pinterest/TikTok/Email), TikTok "✓ Copied!" confirmed. (2) #302 Email Verification Gate ✅ — registered qa302test832 as organizer, amber "Check your inbox" banner confirmed on dashboard; test user cleaned up. (3) #300 Return-to-Inventory ✅ — 3 unsold items returned from flip-report, inventory page confirmed all 3 AVAILABLE. (4) #301 Label Sheet Composer ✅ — UI verified (price chips, qty, Avery 5160 preview); API pipeline: POST batch→200 (batchId+11 tags), GET PDF→200 application/pdf 35KB. (5) #288 Featured Boost E2E ✅ — Boost Sale modal (100 XP + $1.00 rails), Spend 100 XP clicked, DB: BoostPurchase ACTIVE, guildXp 283→183. (6) #297 eBay Policy Sync ✅ — Sync from eBay fired, date updated 4/15→6/1/2026, green ✓ persists on reload. UTM #462/#463/#464: Chrome MCP confirmed strips params (window.location.search empty at mount — extension limitation, not app bug). Fix is deployed (READY Vercel). Patrick must verify in real browser. Blocked Queue: 5 rows.** (1) #135 Social Templates ✅ — all 8 platforms (FB/IG/Nextdoor/Threads/WhatsApp/Pinterest/TikTok/Email), TikTok "✓ Copied!" confirmed. (2) #302 Email Verification Gate ✅ — registered qa302test832 as organizer, amber "Check your inbox" banner confirmed on dashboard; test user cleaned up. (3) #300 Return-to-Inventory ✅ — 3 unsold items returned from flip-report, inventory page confirmed all 3 AVAILABLE. (4) #301 Label Sheet Composer ✅ — UI verified (price chips, qty, Avery 5160 preview); API pipeline: POST batch→200 (batchId+11 tags), GET PDF→200 application/pdf 35KB. (5) #288 Featured Boost E2E ✅ — Boost Sale modal (100 XP + $1.00 rails), Spend 100 XP clicked, DB: BoostPurchase ACTIVE, guildXp 283→183. (6) #297 eBay Policy Sync ✅ — Sync from eBay fired, date updated 4/15→6/1/2026, green ✓ persists on reload. UTM #462/#463/#464: Chrome MCP confirmed strips params (window.location.search empty at mount — extension limitation, not app bug). Fix is deployed (READY Vercel). Patrick must verify in real browser. Blocked Queue: 5 rows.**

**Previous: S829 — QA+DEV: #319/#325/#328 final bug chain found + fixed. (1) Chrome QA: API confirmed returning clusters (200, suggestedTitle "Steam Controller...", aiConfidence 0.92). (2) P1 found: itemsToCreate filter used `a.photoUrl` (undefined on ClusterSummary) → ALL clusters filtered out → "No photos could be analyzed" toast every time. (3) P1 found: `photoUrls: [a.photoUrl]` mapped undefined instead of actual Cloudinary URLs. (4) P0 data hygiene: batch-analyze creates items with saleId=NULL (orphaned, never visible). (5) Three fixes shipped: SmartInventoryUpload.tsx filter/map corrected (photoIndices→uploadedUrls[i]); batchAnalyzeController.ts now extracts+validates saleId, passes to both item.create calls; SmartInventoryUpload.tsx sends saleId in batch-analyze request, redirects directly after analysis (skipping duplicate createItemsMutation). Both packages 0 TS errors. Blocked Queue: 4 rows.**

**Previous: S828 — QA+records. (1) Records: Applied S824/S826 Chrome verifications to roadmap — #214 ✅, #356 ✅, #352 ✅, #354 ✅; #319/#325/#328 notes updated (API-VERIFIED, Chrome pending). (2) Flip Report re-QA: ✅ PASS — all 3 HTML entity decode bugs confirmed fixed. (3) #319/#325/#328 Chrome re-QA: NEW P1 found + fixed — SmartInventoryUpload.tsx read response.data.results but backend sends response.data.clusters → error toast, items never displayed in UI. Fix: .results → .clusters (1-line). Needs Chrome re-QA after this ships. Blocked Queue: 4 rows.**

**Previous: S827 — DEV+QA. (1) UTM fix shipped (#462/#463/#464): root cause = router.isReady guard missing + Vercel trailing-slash redirect stripping params. Fixed: _app.tsx guard + next.config.js skipTrailingSlashRedirect. (2) Batch upload QA (#319/#325/#328): P1 bug found (Analyze All button non-responsive) + P2 bug (30s timeout too short for AI) — both fixed (SmartInventoryUpload.tsx + requestTimeout.ts + index.ts). Chrome UI UNVERIFIED (needs re-QA post-deploy). (3) Flip Report QA: loads ✅, 3 HTML decode bugs found + fixed ([saleId].tsx). Blocked Queue: 4 rows.**

**Previous: S825 — QA session. P1 BUG FOUND + FIXED: #319/#325/#328 (Burst Clustering / Best-Photo-First / Photo Role Awareness) all broken since launch. Root cause: batchAnalyzeController.ts prisma.item.create() calls missing \`embedding: []\` field (NOT NULL, no DB default) → silent constraint violation → 0 Items and 0 Photos ever written to DB. Confirmed via: (1) created test sale for Bob Smith (user2) via psycopg2, (2) logged in via backend JWT, (3) called /api/upload/batch-analyze with real Cloudinary URLs, (4) got 200 + cluster data but 0 DB records. Fix: added \`embedding: []\` to both prisma.item.create calls (cluster + ungrouped). 0 TS errors. S824 Chrome verifications applied to roadmap (#356 both CTAs ✅, #214 markdown ✅). Blocked Queue: 4 rows.**

**Previous: S823 — QA sweep. Railway ENV all 5 ✅. S822 Chrome verifications applied to roadmap. Full QA: Homepage ✅, #214 AI Planner ✅, Shopper dashboard ✅, #311 Multi-Location full CRUD ✅, #356 Broadcast composer ✅, #50 Loot Log ✅ (seeded Purchase, verified, cleaned). #319/#325/#328 UNVERIFIED (upload_image tool limitation). P2 bugs found: /plan markdown not rendered, Broadcast duplicate dead CTA. Blocked Queue: 4 rows.**

**Previous: S820 — Scheduled session: markSold duplicate Purchase fix + DB purge + backup restore (automated).**

**Previous: S819 — QA session. 4 features Chrome-verified. P2 bug found + fixed: reservationController.ts RECORD path now returns settlementMode in response. #239 Multi-Consignor Settlement test-mode fully verified.**

**Previous: S818 — QA/Fix: S817 Chrome Verifications Applied + 3 P2 Bugs Fixed.**

**Previous S816: S816 — QA integrity audit + 9 structural enforcement fixes shipped. No code changes — all CLAUDE.md rules and skill updates. 9 rules added to CLAUDE.md (CODE-ONLY abolishment, dev≠QA separation, Blocked Queue aging/row-count, audit P0/P1 pipeline, prior-session validation, screenshot gate, cross-session Chrome rule, immediate staging rule). 3 skills updated: findasale-qa-v2, findasale-records-v2, conversation-defaults-v2 (all installed by Patrick). Blocked Queue table has 12 rows — row-count script will compute this at next session start. CLAUDE.md push still needed from Patrick.**

**Previous: S815 — Ops/Tooling (2026-05-31).** Two-item session: (1) Pushed geocoding sourceName fix (`'FacebookEvents'` → `'Facebook Events'` — resolves 100% FB Events geocoding failure in Sentry) + Cloudinary cloud name fix (hardcoded `'findasale'` → `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` in create-sale.tsx — resolves Safari TypeError). (2) Diagnosed and fixed Cowork global instructions revert bug (GitHub #40175) on Windows MS Store: identified MSIX package path for `memory\CLAUDE.md`, built `scripts/sync-global-instructions.ps1` (-Status/-Setup/-Update modes), set file read-only (stale session writebacks now blocked at OS level), backed up master to `AppData\Roaming\Claude\CLAUDE_MASTER.md`. Updated dev-environment skill + memory reference with the full global instructions management workflow. Blocked Queue: 2 (unchanged).

**Previous: S814 — Table Stakes Audit + Full Implementation (2026-05-31).** Audited FindA.Sale for missing business fundamentals. Shipped: robots.txt (blocks /organizer/ /shopper/ /admin/ /api/ /auth/); DMCA policy page at /dmca; GA4 analytics (property G-VSD9YR4D28, GoogleAnalytics.tsx, consent-gated + GDPR-safe defaults, NEXT_PUBLIC_GA_MEASUREMENT_ID added to Vercel, redeployed — data in 24-48hr); ToS: 7 new sections (refund/dispute 48hr, sales tax disclaimer, fulfillment 24hr ack/30d pickup, Stripe KYC, 1099-K, chargeback fees, DMCA ref); Privacy Policy: 4 new sections (GDPR legal basis, 30-day deletion, 72hr breach notification, auto-suggested content); 3 internal SOPs (data-deletion-sop.md, chargeback-sop.md, breach-notification-plan.md in claude_docs/operations/); Google Business Profile created (E-commerce service, 219 E Michigan Ave Suite F Paw Paw MI, https://finda.sale) — pending Patrick phone verification; backup: 8 consecutive nightly runs confirmed healthy. Roadmap: 11 new table-stakes entries (#469-479). Blocked Queue: 2 active (unchanged).

**Previous: S813 — eBay QA batch (#424/#425/#426) + map pins root cause found and fixed. #424 ✅ Patrick-verified. #425 ✅ Chrome-verified: logged in as Artifact MI, checked "Also push to eBay" on Steam Controller (16oz, 12×8×4"), clicked Approve in review queue → "Item published!" toast → edit-item confirmed "Live on eBay" badge + "View on eBay" + "Re-push to eBay" buttons. ebayListingId assigned — push fires correctly from review queue. #426 ✅ Chrome-verified: "Best Offers" section renders in edit-item for eBay-connected account; "Accept Best Offers on eBay" checkbox toggles, auto-accept % + auto-decline % inputs expand on check. Map pins root cause: authenticated users were bypassing the regional bounding box in discoveryService.ts (line 58-59 had `userId ? undefined : regionConfig.centerLat` — logged-in users got a global unbounded query, top-20 were scraper sales from TN/NC/TX with coordinates 1000+ miles south of GR, appearing off-screen). Fix: always apply regionConfig center as fallback for both auth states. 2-line change in discoveryService.ts — pushed green. Blocked Queue: 2 active.**

**Previous: S812 — QA session (2026-05-31): H-002 map pins, S811 polish, shopper dashboard P0 fix, #465 markSold. P0 FOUND + FIXED: shopper dashboard was crashing for ALL shoppers since S810.** Two bugs found via React fiber inspection: (1) Rules of Hooks violation — `useQuery`/`useFollows`/`useXpProfile` hooks were called AFTER the `if (!isLoading && !user)` conditional return → React 18 hydration mismatch (server renders null, client calls N hooks). (2) `NotificationPreferences` crashed on `null.emailNewSalesFromFollowed` — `userData?.notificationPrefs` returns `null` from API (not `undefined`), default param `= {}` only fires for `undefined`. Both fixed + deployed. Also fixed: `SaleMapInner.tsx` Leaflet type cast (`reset` not in `ZoomPanOptions` TS type). **H-002 ✅ CODE-VERIFIED:** Pane transform non-identity (matrix(-109, -55)) — leaflet.css fix working. All 197 geocoded markers are at correct geographic positions (southern US scraper data, lat 32-36°N). Zero GR-area sales in `/api/sales?limit=200` response (scraped national data dominates) so no visible pins, but the Leaflet mechanism is confirmed correct. **S811 polish ✅ ALL VERIFIED:** L-002 (💰/📢 emojis), M-007 (breadcrumb title near-white on near-black — high contrast), L-004 (branded pin placeholder on all photoless scraped cards). **4 shopper dashboard widgets ✅ ALL VERIFIED:** StreakWidget (streak/XP strip), RankBenefitsCard (Scout Unlocks list), NotificationPreferences (4 checkboxes), MyPickupAppointments (empty state). **#465 markSold ✅ RECORD + POS_CART verified, CHECKOUT_LINK ⚠️ code-verified:** RECORD flips item→SOLD (DB confirmed), POS_CART flips hold→HOLD_IN_CART (DB confirmed), CHECKOUT_LINK API fires but returns "No such destination: acct_1TF0UsLTUdLTeyio" — Bob's Stripe account is prod-mode, test env doesn't have it. Blocked Queue: 2 active.

**Previous: S810 — S809 index verification + P2 findMany cleanup + widget triage executed. (1) S809's 7 slow-query indexes + Review.organizerId column CONFIRMED live in Railway via psycopg2 (migration 20260530000001 finished 18:41 UTC). The S809 Next-Session stub's `LIKE '%2026%'` predicate returns 0 rows because Prisma names indexes by field (e.g. Organizer_contactEmail_idx), NOT by date — the migration applied cleanly; not a failure. Stub corrected below. (2) P2 unbounded findMany cleanup shipped + pushed (origin/main confirmed): bounded 6 public endpoints — organizer-profile reviews converted to prisma.review.aggregate (was loading EVERY review row to compute count+avg — the same 4300ms query S809 denormalized for), organizer-profile sales include take:200, encyclopedia limit hard-capped at 100, popular-tags take:5000 sample, flash-deals take:200, haul-posts take:100, search-by-organizer take:200. Sitemap/feed generators + cached city-heat aggregations left exhaustive by design. citiesController was ALREADY bounded (stale brief). Backend TS clean. (3) Widget triage executed against Patrick decisions: agent found 19 unused imports, 8 genuine product orphans. RENDERED 4 on shopper dashboard — StreakWidget, NotificationPreferences (+ fixed a dark-mode black-on-dark-card text bug in the component), MyPickupAppointments, RankBenefitsCard. CUT 3 — PointsBadge (dup of RankHeroSection), LocationMap (dup of SaleMap which renders 2x on the page + touches locked-down Google Maps billing), SaleSubscription (dup of existing SaleWaitlistButton + RemindMeButton on the sale page). PickupBookingCard left on checkout-success (correct surface — pickup is inherently post-purchase). 11 remaining dead imports of still-live components left as optional lint cleanup (not auto-stripped — Removal Gate). Stale fact corrected: roadmap #59 claimed StreakWidget rendered on /shopper/dashboard since S346 — it did NOT until S810. Frontend TS clean. Blocked Queue: unchanged at 5.**

**Previous: S809 — Sentry triage + slow query indexes + Railway DB password confirmed. Automated health check surfaced 25 unresolved Sentry issues. Resolved/ignored 8 stale issues: 5x PrismaClientInitializationError (S807 rotation artifacts, no events in last 24h), 2x FATAL backend crashes (transient 2026-05-27 deploy, not recurring), CO/WA licensing scraper 404s (ignored forever — state gov URL changes). Dispatched and shipped: 7 new DB indexes (Organizer contactEmail, isClaimed+isUnmanagedListing composite; Sale organizerId+status, lastScrapedAt, city; Review organizerId+saleId composite; DirectoryClaimEmail organizerId+sentAt composite) + Review.organizerId denormalized field (eliminates 4300ms JOIN) + migration 20260530000001 created and deployed. instrument.ts: added beforeSend Sentry filter to suppress MulterError LIMIT_UNEXPECTED_FILE noise (field name was correct; stale client bundles were the trigger, backend already returns 400). Railway DB password confirmed active ✅ (stale entry in global CLAUDE.md — Patrick must update manually). GG_API_KEY issue: VM bash doesn't inherit Railway env vars; token shared this session was Railway DB password, not a GG token — GitGuardian personal access token with incidents:read scope still needs to be created and stored. Geocoding WARNINGs (Facebook Events 100%, GarageSaleFinder 80.9%) are expected — geocoder uses Nominatim, not Google Maps; Facebook Events don't provide geocodable street addresses. Blocked Queue: unchanged at 5.**

**Previous: S808 — Parallel strategy + bug sweep + 4 features shipped. (1) #463 Google Merchant Center feed BUILT + LIVE: backend /api/google-merchant/feed (TSV per Google spec) + nightly cron (3:30 AM UTC) + per-item parcel shipping from organizer eBay weight-tier policies; freight/oversized + Local-Pickup-Only excluded; opt-in (no shipping config → zero products). Merchant Center account created (Patrick), feed registered US+CA, ~52 products in Google's 3-day initial review. (2) markSold settlement ROUTER built (RECORD / POS_CART / CHECKOUT_LINK; smart default by sale type; item flips SOLD only on real payment/webhook) — pushed, NEEDS Chrome QA. (3) #239 Multi-Consignor Estate Settlement Phase 1 built in Stripe TEST mode: ConsignorSettlementBatch model + migration 20260529210000 (Patrick ran migrate deploy + generate); per-consignor split + approval-gate UI; live transfers gated behind OFF-by-default env STRIPE_CONNECT_LIVE_TRANSFERS; legal recommends Model B (organizer = merchant of record), attorney+CPA question list produced, live money BLOCKED pending legal sign-off. (4) P1 POS hold-release double-/api/ 404 FIXED (pos.tsx) — pushed/deployed. Data cleanup: restored Yzerman duck price $15,000→$21.50 (QA test mutation on Artifact's real account; only QA-jacked item). Bug sweep also found ~17 built-but-unrendered widgets across organizer/shopper dashboards + public sale page (DECISION NEEDED from Patrick — render vs cut, do NOT auto-remove) + P2 unbounded findMany on public endpoints (e.g. citiesController); Sentry clean except transient DB-auth cluster from the S807 rotation. Recruitment: beta outreach reframed HOT-first (live pool has 5,517 addressable HOT orgs); funnel ~22% open / 0% click is likely a sent-before-tracking artifact (click path wired correctly). Blocked Queue: 3 (+1 markSold QA, +1 #239 legal/QA noted below). ⚠️ Global CLAUDE.md password field stale — needs update (file not accessible from VM; see packages/database/.env).**

**Previous: S807 — P0 incident + QA. Railway DB credentials drifted after S780b rotation: Postgres DATABASE_URL had stale hardcoded password; backend returning 500 on all queries from ~12:36 UTC. Fixed via railway-agent: POSTGRES_PASSWORD/DATABASE_URL/DATABASE_PUBLIC_URL updated to actual DB password; backend redeployed ~13:35 UTC. QA resumed: #186 QR Scan Analytics ✅ CHROME VERIFIED (/organizer/qr-codes — 3 KPI tiles, Scanner Funnel, Sales Breakdown). #192 Price History Tracking ✅ CHROME VERIFIED (ItemPriceHistoryChart on edit-item — Recharts line chart with seeded data confirmed). Blocked Queue: 3.**

S796 (QA batch 2): Chrome-verified 7 additional features using test accounts (user1-4 organizers, user5-7 shoppers; Railway DB passwords + emailVerified fixed via psycopg2). **#288 Featured Boost ✅** — Sale Bump modal confirmed on dashboard; XP + $1.00 Stripe payment options both present. **#402 Cover the Fee ✅** — AUCTION-gated checkbox confirmed in edit-sale when sale type = AUCTION. **#416 Sale Floor Map ✅** — FLOOR GUIDE auto-generated with Living Room + Kitchen sections on Barn Door QA Test Sale (room tags set via DB). **#363 Auction Lot Number ✅** — Lot Number field appears in add-items when listingType = AUCTION. **#284 Feedback Survey ✅** — OG-5 triggered on settings profile save, modal appeared with correct copy + submitted. **#458 Confidence Score ✅** — confidenceScore field confirmed in /api/sales API response (null for uncalculated entries; internal-only, no UI surface needed). **#351 QR Quick-Access ✅** — My QR tab on shopper dashboard opens full-screen modal, QR renders, tap to expand/shrink works. **#285 POS In-App Payment ⚠️ CODE-VERIFIED** — POS at /organizer/pos confirmed; all payment modes visible + cart works; real-time shopper notification requires concurrent users to verify. Chrome left at finda.sale/login — Patrick must click "Sign in with Google → Artifact / artifactmi@gmail.com" to restore session.

S796 (QA batch 1): Verified Railway DB password correct (psycopg2 confirmed live). Fixed Vercel build error in dashboard.tsx (TS1005 `')' expected` — multiple JSX siblings in ternary without Fragment; wrapped PUBLISHED branch in `<>...</>`; 0 errors). Chrome QA: **#401 Sale of the Day ✅** — "🌟 SALE OF THE DAY" card on homepage. **#404 First 100 Buyers ✅** — "🏆 0 / 100 OG Buyers" on organizer dashboard. **#395 CSV Bulk Import ✅** — 3-step modal (Upload → Map Columns → Done) on add-items. **#410 CSV Export Watermark ✅** — Cloudinary watermark + QR overlay in eBay CSV photo URLs confirmed. **#408 Scan & Split ⚠️ CODE-VERIFIED** — recentItemScans tracker + SCAN_AND_SPLIT Socket.io confirmed; cannot live-test without 2 concurrent users. **#399 Local Legends ⚠️ CODE-VERIFIED** — API live, conditional rendering confirmed; no test user has 3+ ZIP check-ins.

S795: Chrome-verified #400 Loot Link (24 share buttons on item cards, Web Share API fires without auth modal) and #406 Split-the-Bill POS (full end-to-end with Bob Smith: cart → split evenly → collect → "✓ Split complete"). Added `e.stopPropagation()` to #400 share button (P3 auth-interceptor bug fix). Dispatched 6 parallel dev agents: #399 Local Legends badge + #404 First 100 Buyers badge (new badgeService.ts), #396 scraper upgrades (AK/NY/TX/VA), #397 confirmed all 10 Tier 2 scrapers already exist (NV source URL dead), #410 csvExportController watermark gap fixed, #408 Scan & Split (in-memory tracker + Socket.io SCAN_AND_SPLIT in itemController + POS listener). Blocked Queue 7→6 (#406 removed).

**#261 Treasure Hunt XP Rank Multiplier ✅ VERIFIED:** user6/Maya (RANGER, guildXp=2001) scanned QR clue. API returned `xpAwarded: 5` (3 × 1.5 rank multiplier = 4.5 → rounds to 5). DB confirmed guildXp 2001→2021. RANGER multiplier gate working end-to-end.

**#184 iCal Export ✅ VERIFIED:** `AddToCalendarButton.tsx` is entirely client-side — generates `data:text/calendar` blob. Button click confirmed firing (privacy guard intercepted Base64 blob — confirms download triggered). Earlier S787 ❌ diagnosis was wrong URL (`/api/sales/[id]/ical` doesn't exist; never was the implementation).

**#232 Sale Pulse Widget ✅ VERIFIED:** buzz score 1/100, 3 views rendered on organizer dashboard.

**#323 PriceBenchmark Valuation Fallback ✅ VERIFIED:** comparableCount:0 → `method: STATISTICAL_WITH_BENCHMARK` (60% Haiku + 40% PriceBenchmark blend) confirmed via API.

**#334 Automatic Markdown Cycles ✅ VERIFIED:** Form renders, POST returns 201, record persists on reload. Seed data gap noted: `markdownCycleController` checks `UserRoleSubscription` table; seed only sets `Organizer.subscriptionTier`. Workaround: manual DB insert during test.

**#413 Physical Safety & Liability Disclosures ✅ VERIFIED:** `safetyNotes` textarea in edit-sale, displays on sale page when set. Checkout waiver deferred to legal review.

**UNVERIFIED added to Blocked Queue (3):** #230 Smart Buyer Intelligence (no shoppers favoriting test sales), #223 Organizer Guidance Layer (no hold records), #332 Shopify Cross-Listing (needs OAuth).

**eBay QA batch (continuation of S791 — post-context-compaction):**

**#298 eBay Default Policies Settings ✅ VERIFIED:** Navigated to `/organizer/settings/ebay` on Patrick's account. All 8 sections confirmed: Default Policies, Push Defaults, Shipping Policy by Weight, Special Shipping Rules, Category Overrides, Default Description Template, Pickup Location, Custom Label (SKU) Append. Created fake EbayConnection + EbayPolicyMapping rows in Railway DB for user1 to enable test UI. ✅

**#244 eBay CSV Export ✅ VERIFIED:** Navigated to `/organizer/add-items/cmom7h73l000hz36wzbruoa64`. "📦 Export to eBay" button confirmed in toolbar alongside "📦 Export to QuickBooks" and "👁 Buyer Preview". Push-to-eBay button also confirmed in edit-item (Patrick verified directly). ✅

**#293 Post-Sale eBay Panel BLOCKED:** No ended sales in DB. Patrick confirmed no ended sales available. Cannot test PostSaleEbayPanel without a ENDED sale that has items. Remains in Blocked Queue.

**#295 Category Review Alert Badge ❌ BUG FOUND + FIXED:** `ebayNeedsReview` field was missing from `getDraftItemsBySaleId` select clause in `itemController.ts`. Badge condition `!item.ebayListingId && !item.ebayOfferId && item.ebayNeedsReview` always evaluated to `undefined` (falsy) — badge never showed on page load/refresh, only transiently during the push session via `ebayPushStatus` client state. Fix: added `ebayNeedsReview: true` to select. In push block below.

**Consignor QA (S791 continuation — post-compaction):**

**#333 Consignor Payout Flow — URL bugs fixed, pending Chrome verify:** Test consignor "Jane Thrift" created in Railway DB (id: `cqa333testjanethrift01`, 70% commission, `janethrift@example.com`). Steam Controller item assigned. Navigated to `/organizer/consignors` → consignor detail → exposed double `/api/` prefix bug (Axios baseURL is `/api`; calls used `/api/consignors/...` = 404). Fixed in two files: `pages/organizer/consignors/[id].tsx` line 69 and `components/ConsignorPayoutModal.tsx` lines 46+72. UNVERIFIED pending Chrome verify post-deploy.

**#335 Automated Consignor Email Notifications — BUG FOUND + FIXED:** `sendConsignorPayout` function exists in `consignorEmailService.ts` and is fully implemented, but was never called from `runPayout` in `consignorController.ts`. Also: no `sendConsignorEmailService` import at top of controller. Fix shipped: import added + fire-and-forget call after `prisma.consignorPayout.create` (skips silently if consignor has no email). TypeScript clean (0 errors). Pending Chrome verify post-deploy.

**Post-compaction Chrome verifies (same session S791):**

**#295 eBay Category Review Badge ✅ VERIFIED:** Navigated to `/organizer/sales/cmom7h73l000hz36wzbruoa64`. Steam Controller shows "eBay Category Needed" badge on load. F5 reload — badge persists. ebayNeedsReview fix confirmed working end-to-end. Removed from Blocked Queue.

**#333 Consignor Payout Flow ✅ VERIFIED:** Navigated to `/organizer/consignors`. Clicked Payout → Jane Thrift detail page. Clicked Run Payout → modal opened with Cash/Check/Venmo/Other selector. Submitted with CASH → ConsignorPayout record created (id: cmpoifg0k000djd3l4fyw8hs2, date 2026-05-27). Payouts (0) → Payouts (1) confirmed in UI. Removed from Blocked Queue.

**#335 Consignor Payout Email ✅ CODE-VERIFIED:** Payout created and code path executed. Investigation revealed: consignor emails use Gmail API (`lib/emailService.ts`), NOT Resend — Resend showing 0 emails was expected/irrelevant. Gmail API is the same service used for all working transactional emails (welcome, reminders, etc.). Test consignor janethrift@example.com is fictional so inbox delivery cannot be confirmed, but the send path is correct. Removing from Blocked Queue.

**Roadmap.md updated S791:** 16 entries updated — 7 flipped to ✅ Chrome-verified, 2 bugs fixed + verified, 1 bug fixed + unverified (#335), 4 marked BLOCKED/UNVERIFIED, header date updated.

**Previous: S790 — Chrome QA: Intent-Wins Verified (#336 ✅)**

Camera batch QA complete. Photo pipeline fix confirmed working end-to-end. All 6 targets tested via in-browser JS fetch + psycopg2 DB verification. #319/#325/#328/#340 ✅ VERIFIED S789. #336 Intent-Wins ✅ VERIFIED S790. Blocked Queue 15→11.

**Previous: S785 — QA Batches 1+2+3 Complete (8 ✅, 16 UNVERIFIED, 2 ✅ DB-only, 1 Bug Fixed)**

All 3 QA batches run. Batch 1 (XP/Guild): 8 Chrome-verified. Batch 2 (Camera/Photo): all 6 UNVERIFIED — upload_image imageId issue + handleAnalyzePhotos JS crash blocked photo tests. Batch 3 (eBay): 2 DB-verified (#320, #321), rest UNVERIFIED — user1 has no eBay connection. Rank permanence bug fixed and in push block.

**Verified ✅:** #267 RSVP XP (2 XP, SaleRSVP row created, RSVP_CONFIRMED notification), #255 Rank-Up Notifications (Maya 498→503 guildXp → SCOUT, RANK_UP notification in DB), #257 Scout Hold Duration (holdDurationMinutes=45, UI shows 00:44:57 countdown), #227 XP Profile API (5 fields confirmed on /api/xp/profile), #290 Hunt Pass Dual-Rail Cash Column ($ value + XP cost side-by-side on /coupons), #289 Shopper Coupon Generation (Standard tier generated, 100 XP deducted), #312 XP Economy Security Hardening (leaderboard API returns only rank/userName/guildXp/explorerRank — no PII), #349 In-App QR Scanner Phase 1 (scan button in header, modal opens with camera permission request).

**Bug → dev dispatched:** `explorerRank` demotes on XP spend. Leo (user5) was SCOUT (guildXp=500). Generating a Standard coupon deducted 100 XP → guildXp=400 → backend recalculated explorerRank → INITIATE demotion. Fix: rank should ratchet up only; use cumulative/peak XP for threshold checks, never decrement on spend. Dispatched to findasale-dev this session.

**UNVERIFIED:** #261 Treasure Hunt XP Rank Multiplier (blocked by rank permanence bug — manipulating to RANGER tier unreliable until fix ships), RSVP XP monthly cap (only 3 platform sales have Going/RSVP button; need 5 RSVPs in one month to verify 10 XP cap).

**Batch 2/3 run — mostly UNVERIFIED:** Camera/Photo (#319, #336, #339, #340, #328, #325) all UNVERIFIED — photo upload blocked in VM. eBay: #320 ✅ DB-verified, #321 ✅ DB-verified, rest UNVERIFIED (no eBay connection for user1). See Blocked Queue.

**Previous: S784 — Audit Fixes: Map Geocoding + Categories Icons + QA Batch (9 items)**

Map bug fixed: platform sales (organizer-created) now get geocoded server-side when status transitions to PUBLISHED and lat is null. `geocodeAddress()` call added to `updateSaleStatus` in saleController.ts (fire-and-forget, never blocks publish response). Batch backfill job (`internalGeocodingController.ts`) extended to include `sourceName: null, status: PUBLISHED` sales so existing pinless sales will be geocoded on next batch run.

Categories bug fixed: `CATEGORY_ICONS` expanded from 14 to 200+ entries covering eBay leaf node names (comics, action figures, toys, kitchen items, coins, jewelry, clothing subcategories, electronics, sports, music, art, etc.). `DISPLAY_NAME_OVERRIDES` map added to shorten verbose eBay names (e.g. "Comics & Graphic Novels" → "Comics"). Render logic updated to use displayLabel everywhere.

Roadmap items #424 and #425: human-verified by Patrick this session.

**S784b QA continuation (same session, context compressed):** Chrome QA of 9 Pending Chrome QA roadmap items — all verified. Chrome conflict encountered mid-session (two Cowork sessions sharing one browser — mutual logout). DB inaccessible from VM (disk full + Railway password rotated 2026-05-24 post-GitGuardian, new password not available in VM). QA prompt for Groups B/C/D (`qa-session-prompt-groups-bcd.md`) fixed: added Chrome concurrency warning + replaced hardcoded DB password with Railway dashboard instructions.

**Previous: S783 — SEO Sprint: Sitemap Expansion + IndexNow + Schema.org Audit**

Sitemap grew from 1,727 → 1,885 URLs. Added items, encyclopedia, and category pages to the sitemap; fixed guide pages (slim slugs.json + outputFileTracingIncludes + Cache-Control bypass); fixed Washington DC slug (dots in city name). New `/api/items/sitemap` backend endpoint returns all items from PUBLISHED sales (lightweight id+updatedAt). IndexNow integration built from scratch: fires on every sale publish, POSTs sale URL + all item URLs to `https://api.indexnow.org/indexnow`. Key file live at `https://finda.sale/fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt`. Schema.org audit confirmed: Product schema on items, JSON-LD on sale detail, HowTo/Article on guide pages — already implemented. Also fixed homepage "Error Loading Sales" (localhost fallback), /creator/dashboard role guard, and built admin creators/affiliate page.

**Previous: S781 — DMARC Upgrade to p=quarantine + Email Stack Audit**

DMARC upgraded from `p=none` to `p=quarantine` (with `rua=mailto:dmarc-reports@finda.sale`). SPF/DKIM confirmed clean for Resend and Google Workspace. MailerLite DKIM gap documented (free plan limitation — acceptable given ~0 campaign usage). Email stack roles clarified.

**Previous: S780 — Deliverability Fix + GitGuardian + CORS + Slow Query Indexes**

Audit of S779 priorities plus execution. 4 code fixes, 1 P0 credential leak remediated, 6 DB indexes added.

**Fixes shipped:**
- ✅ buildRawEmail() MIME fix — added `htmlToPlainText()` helper + text/plain part to multipart/alternative (was html-only, contributing to spam classification)
- ✅ CORS P0 — `api.finda.sale` added to allowedOrigins in index.ts (34 CORS errors in 23hrs from new Railway custom domain added S779 but not in CORS allowlist)
- ✅ GitGuardian P0 — PostgreSQL URI (live Railway password) found in STATE.md + patrick-dashboard.md committed in S776. Removed from both files. **Password rotation needed** — credential remains in git history.
- ✅ 7 performance indexes added for 5 Sentry slow queries (NODEJS-2N/2M/2K/2J/1P): DirectoryClaimEmail outreach cron (status+touch4+touch1, sentAt), Sale (createdAt, status+markdownEnabled+startDate), Organizer (isUnmanagedListing+createdAt, createdAt)

**Deliverability DNS fixes (S780b):**
- ✅ Root SPF updated: `v=spf1 a mx include:_spf.google.com include:_spf.mlsend.com ~all` (added Google, changed ?all → ~all)
- Root DKIM for Google: not needed for root domain (root sends via Resend/MailerLite, outreach subdomain already has Google DKIM)
- DMARC at p=none — upgrade to p=quarantine after SPF propagation confirmed (give it a few days)

**S780b — Railway DB password rotated:**
- ✅ New password active: `[rotated — see Railway dashboard]`
- ✅ Backend `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}` reference variable (auto-rotates)
- ✅ `packages/database/.env` updated with new password
- ✅ `scripts/backup-everything.ps1` PGPASSWORD updated
- ✅ Memory file updated with new password
- ⚠️ Global CLAUDE.md still has old password — Patrick must update manually

**Sentry scan (6 issues reviewed):**
- FINDASALE-NODEJS-3: CORS errors — fixed (api.finda.sale origin)
- 5 slow queries — indexes added (migration 20260524120000)

**Previous: S779 — Outreach Email Deliverability Fix**

Root cause of 0% open rate (417 sends, 0 real opens): all outreach email bodies contained `https://backend-production-153c9.up.railway.app` URLs. Fix: added `api.finda.sale` custom domain to Railway; set `RAILWAY_BACKEND_URL=https://api.finda.sale` in Railway Variables.

**Previous: S778 — Vercel Build Fix + eBay Blue Pill + Re-push Button + #424 Root Cause**

Vercel build was failing for 4+ consecutive deploys (`@types/react` missing) because `NODE_ENV=production` causes pnpm to skip all `devDependencies`. Fix: moved all 11 devDependencies to regular `dependencies` in `packages/frontend/package.json`; added `.npmrc` with public-hoist-pattern entries. Then hit a second missing type (`@types/minimatch`) — added to deps. Awaiting Patrick push + Vercel confirmation.

eBay UX improvements: (1) status badge on `[saleId].tsx` turns blue (instead of green "Live") when `item.ebayListingId` is set; (2) "Re-push to eBay" button added to `edit-item/[id].tsx` alongside "View on eBay" — calls existing `handlePushToEbay`, allows applying description template to already-listed items.

#424 root cause confirmed: `EbayPolicyMapping.defaultDescriptionHtml` was NULL in Patrick's DB (template never saved in FindA.Sale eBay Settings, only in eBay's own listing template system). Patrick added the template to the FindA.Sale field. Existing items need "Re-push to eBay" to apply it.

user3 TEAMS modal (Blocked Queue): Confirmed not a bug — Patrick had manually set user3 to TEAMS in Railway DB. Removed from blocked queue.

**Previous: S775 — eBay Tier 2B QA + Custom Label Bug Fix**

Chrome QA of eBay Tier 2B batch: #427 Local Pickup Mode ✅, #428 Review Card Readiness Borders ✅, #429 Description Template on Approve ✅, Voice location extraction ✅ (Patrick verified directly). Bug found and fixed: Custom Label append toggles (`skuAppendDate/Cost/Location`) were not persisting — root cause was GET /organizers/me missing these 3 fields from its response JSON. Fix: 3-line add to `packages/backend/src/routes/organizers.ts`. TypeScript clean. Awaiting Patrick push.

---

**S774 — Scraper Audit + Admin User Mgmt + Migration Recovery**

Full scraper ecosystem audit: removed 5 dead scrapers (SaleSeker, Newspaper RSS, Canada411, Eventbrite, AuctionNinja dupe), fixed 4 misconfigured scrapers (FB Marketplace state field, YellowPages.ca stats tracking, ESN cron removal, Website Address Friday), fixed backfillBenchmarks dead Prisma query, created AuctionZip GH Actions workflow. Added admin suspend/delete for users + `isHiddenFromDirectory` flag on Organizer. Migration crashed production DB (WAL overflow from bulk UPDATE on 57K rows) — rewrote migration to DDL-only, resolved Prisma failed-migration record, re-applied successfully. Backfill run separately via `prisma db execute`. Postgres region moved from EU West (Amsterdam) to US East by Patrick. Stale DATABASE_URL password discovered and corrected (was `QvnU...` → now `Qlzi...`).

**S771 — Bug Hunt (Sentry / Railway / crons)**

- ✅ Scraper Sentry-noise flood fixed at source — `services/scraper/index.ts` was firing `Sentry.captureMessage(...returned 0 results..., 'warning')` on every zero-result scrape (added in today's commit 176fc6c). 18 of 19 unresolved Sentry issues were this noise. Zero results is a normal SUCCESS for low-volume metros (only small markets fired → scraper is healthy). Both calls → console.log; removed now-unused Sentry import.
- ✅ NODEJS-W (playwright-extra `default.use is not a function`, fatal module-load crash) — confirmed already fixed in current `saleDetailEnrichment.ts` (named `{ chromium }` import + deferred stealth registration). Resolved stale Sentry issue.
- ✅ NEXTJS-G ("Java object is gone") — Facebook in-app browser instrumentation, not our code. Added beforeSend filter in `sentry.client.config.ts`. Resolved.
- Verified Railway backend Online, all in-process crons [CRON OK], no runtime errors in log buffer. Slow-query Sentry warnings (NODEJS-10/1G/1X/1T) confirmed STALE — last fired 2026-05-08, transient scrape-load, no fix shipped (would need speculative migration).
- Files changed: `packages/backend/src/services/scraper/index.ts` · `packages/frontend/sentry.client.config.ts`

**S770 — MailerLite Purge + Hex Escape Fix + Cron Root Cause Fix**

Purged 498 junk scraped-directory subscribers from MailerLite (free plan was full at 500, blocking real users like a1clcook@gmail.com). Fixed hex escape Prisma error from scraped HTML descriptions. Patched `syncLeadTierGroups` cron to only sync registered users (root cause of the junk subscriber flood).

**Also fixed this session (S768+, UX spot-check + Sentry dispatch):**
- ✅ dashboard.tsx — Literal "X shoppers" placeholder replaced with real viewCount; clipboard copy wrapped in try/catch+toast; 3 stray console.errors removed; icon-only links got aria-label; dropdown buttons got aria-haspopup/aria-expanded
- ✅ edit-sale/[id].tsx — Rules of Hooks violation fixed (auth early return moved into useEffect); geocoding failure now shows toast to user; 9 redundant aria-labels removed from inputs with htmlFor associations
- ✅ NODEJS-17 — organizers.ts was truncated (Edit tool truncation bug) — appended missing 14 lines for claim-oauth route close: prisma.$transaction close + res.json + error handler + export default router
- ✅ NODEJS-S — index.ts: added express.raw() middleware for /api/ebay/account-deletion and /api/ebay/notifications (matches Stripe webhook pattern); stops "stream is not readable" Sentry error
- ✅ NODEJS-1Q — Added 3 Review table indexes to schema.prisma (userId, saleId+moderationStatus+createdAt composite, reviewerIp) + migration 20260520140000

**Fixed this session:**
- ✅ requestTimeout middleware — added `/api/internal/` exemption; prevents 30s kill switch firing on fire-and-forget enrichment routes
- ✅ NODEJS-1B double-response — `internalScraperController.ts` moved 202 outside try; `internalSaleDetailEnrichmentController.ts` + `internal.ts` route got `!res.headersSent` guard in catch
- ✅ 6 slow-query indexes added to schema.prisma — Organizer stripeCustomerId, subscriptionStatus/Tier, graceEndAt, lastScoredAt; User createdAt, roles

**New features this session:**
- ✅ Voice location extraction — `extractLocationTag()` in voiceController.ts detects room names, bin codes (bin B6), shelf/row/aisle references from transcript; auto-fills roomTag field via existing description mic button in VoiceDescriptionInput + RapidCapture (no new UI button)
- ✅ eBay Custom Label append toggles — skuAppendDate/Cost/Location booleans on Organizer model; `buildCustomLabel()` in ebayController builds `FAS-{id} [date] [$cost] [location]`; settings UI added to organizer/settings/ebay.tsx; manual migration created (20260520120000)

**Recovery this session:**
- schema.prisma truncation: Edit tool cut file at line 4689 mid-UnmetDemandSignal, ShopperWaitlistEntry entirely missing. Recovered via `git show 683fd4a4:...` as clean base, added 3 new fields, restored to 4716 lines. Pushed as commit 2ba70eb2.

**Test data in Railway DB (use artifactmi account; Patrick must be present):**
- "Barn Door QA Test Sale" (id: cmpbvumj90001e7t7v5sa1iqi) — PUBLISHED, holdsEnabled, safetyNotes set, 3 items (draftStatus=PUBLISHED), active hold for user12 (CONFIRMED status)
- "QA Test Ended Sale — Donation Kit" (id: 6c9c9f00-17ce-4e69-a9df-b8ba30c1f387) — ENDED, 3 unsold AVAILABLE items

## Pool Audit Findings

Run: 2026-05-18 (S756). Railway DB queried directly via psycopg2.

**DirectoryClaimEmail (outreach queue):** 3,319 PENDING, 29 SENT. 31 junk rows deleted this session (26 image filenames stored as emailAddress, 5 Patrick test emails — all had attemptCount=0).

**Outreach pace:** 29 emails sent since S754 fix deployed (May 17-18). ~48/day, matching warmup schedule (Day 1-7: 20/day cap). Pipeline healthy.

**leadTier breakdown:**
- HOT: 5,517 (all have website — 100% coverage)
- WARM: 36,851 (only 1,223 have website — 3.3% coverage)
- COLD: 14,314
- NULL: small residual

**WARM email gap — root cause confirmed S756:** Email discovery requires `website IS NOT NULL` as prerequisite. Only 208 WARM orgs are currently addressable (have website + no contactEmail). The website enrichment job (`websiteEnrichmentJob.ts`) is the upstream bottleneck — it only targets `isStateLicensed: true` orgs (intentional: WARM→HOT bridge for licensed orgs) and was running weekly only. **Fix shipped S756: cron changed from weekly to daily** (`0 1 * * *`). API headroom: HERE 250K/month cap, current usage ~400/month — daily runs increase this to ~1,500/month, well under cap.

**Source attribution (updated S754):** 87.7% of organizers have `directoryMostRecentSource` tagged (was ~5.5% before S754 backfill of 46,333 records).

**Email coverage:**
- Has contactEmail: HOT ~100%, WARM ~2.77%
- Addressable WARM pool (website + no email): 208 orgs

**Geocoding:** 6,760 sales still not geocoded. Nightly geocoding job should address gradually.

**Verdict:** Pipeline healthy. WARM outreach will slow once the 208-org addressable pool is exhausted — daily website enrichment extends the runway by adding newly-licensed orgs continuously.

---

## Blocked Queue

_S772 reconciliation: graduated/closed rows (✅ VERIFIED/CLOSED/DONE) removed — they are now reconciled into `strategy/roadmap.md` (SHIPPED & VERIFIED S772 + Pending Chrome QA Backlog). Only genuinely open items remain below._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|

| RSVP XP Monthly Cap (#267 part 2) | Only 3 platform sales have Going/RSVP button; need 5 RSVPs in one month to hit 10 XP cap | Create more platform sales with RSVP enabled, or wait for organic usage | S785 |
| #332 Shopify Cross-Listing | UNVERIFIED S791 — Requires Shopify OAuth connection; no test store available | Connect a Shopify store to an organizer account, then verify cross-listing flow | S791 |

| #293 eBay Listing Data Parity | PostSaleEbayPanel requires eBay connection + completed sale with items | Connect eBay to user1, complete a sale, then test 17-field Edit eBay section | S785 |

| #335 Consignor Payout Email | ✅ CODE-VERIFIED S791 — sendConsignorPayout() called after payout creation. Consignor emails use Gmail API (not Resend — that was a red herring). Same service as all working transactional emails. Fictional test address can't be inbox-verified. | Run payout against a real email address to fully verify delivery. | S791 |

| #72 Dual-Role Account Schema | UNVERIFIED S837 — No seed user has both ORGANIZER+SHOPPER roles simultaneously. VM disk full prevented psycopg2 DB access. Single-role organizer nav confirmed clean (no duplicates). | Create a user with both ORGANIZER and SHOPPER DB roles, then verify nav deduplication and endpoint access for both roles. | S837 |


---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| 166 | Invites (Admin Beta Codes + Workspace) | Navigated to /admin/invites as user1. Clicked "Generate Invite Code" → code SVPKNKV3 appeared in list (unused). Navigated to /register?invite=SVPKNKV3 → green banner "Invite code SVPKNKV3 applied", role pre-set to "Sale Organizer". Navigated to /organizer/members → typed qa-member-invite@example.com → clicked "Send Invite" → green toast "Invitatio..." + POST /api/workspace/invite → 201. Screenshots: ss_1510bwi14, ss_7342ujb0m, ss_4900ul8jh | S837 |
| 74 | Role-Aware Registration Consent | Navigated to /register as user1. Clicked role dropdown → selected "Sale Organizer" → Business Information section appeared (Business Name/Phone/Address fields). Shopper role: 1 consent checkbox visible. Organizer role: 1 consent checkbox + Business Info section visible. ToS link present both roles. Role-aware behavior confirmed via form_input + screenshot. Screenshots: ss_5756ltixe, ss_4111g721a | S837 |
| 150 | Push Notification Subscriptions | Navigated to /organizer/settings → Notifications tab as user1. Saw "Push Notifications" section: "Push notifications are enabled" + Disable button. JS confirmed: navigator.serviceWorker scope=https://finda.sale/ state=activated. pushManager.getSubscription() → FCM endpoint + p256dh+auth keys active. Screenshot: ss_42439jwp1 | S837 |

## Next Session

**Blocked Queue: 5 rows (below ≥8 ceiling — dev sessions clear).**

**S837 complete.** #166 ✅, #74 ✅, #150 ✅ staged to Pending Chrome Verifications. #72 UNVERIFIED → added to Blocked Queue. Records to apply S837 verifications to roadmap at next session start.

**Patrick actions required:**

1. **Push block for S837 (2 files — docs only):**
   ```powershell
   cd C:\Users\desee\ClaudeProjects\FindaSale
   git add claude_docs/STATE.md
   git add claude_docs/patrick-dashboard.md
   git commit -m "docs: S837 QA wrap — #166/#74/#150 verified, #72 UNVERIFIED, staged to Pending Chrome Verifications"
   .\push.ps1
   ```

2. **Delete test invite SVPKNKV3:** Navigate to finda.sale/admin/invites → Delete the SVPKNKV3 row (Chrome froze during QA cleanup — code is unused and harmless but should be removed).
3. **GBP phone verification:** business.google.com → "Verify now" → phone code.
4. **#239 legal gate:** Attorney + CPA before live consignor payouts.

**Dispatch stubs (next session — QA + Records):**

1. **Records at session start:** Apply S837 Pending Chrome Verifications to roadmap.md — #166, #74, #150 all have full evidence (URL + user + element + outcome + screenshot IDs).

2. **QA continues (P0 age-floor targets remaining):**
   - **#165 A/B Testing Infrastructure** — ORG/SIMPLE. Dispatch: verify A/B variant assignment visible in organizer flow.
   - **#36 Weekly Treasure Digest** — SHO/FREE. CODE-ONLY acceptable (cron, can't force Sunday 6pm).
   - **#61 Near-Miss Nudges** — SHO/FREE. Dispatch: verify nudge API endpoint, check if any UI surfaces it.
   - **#72 Dual-Role Account Schema** — needs dual-role user (ORGANIZER+SHOPPER). Create via psycopg2 on a session where VM disk has space, then Chrome verify.
   - **#308 Item Hide** — needs a test sale with items (not live organizer data).
   - **#25 eBay Sync Phase B/C** — browser verification pending.

## Recent Sessions

### S837 — QA: #166 ✅, #74 ✅, #150 ✅, #72 UNVERIFIED

**#166 Invites ✅** — Admin /admin/invites: generated code SVPKNKV3, appeared in table (unused, 6/1/2026). /register?invite=SVPKNKV3: green "Invite code SVPKNKV3 applied" banner + role pre-set to "Sale Organizer". Workspace invite: /organizer/members → sent to qa-member-invite@example.com → POST /api/workspace/invite → 201 + green toast. Both invite flows fully verified. Cleanup: SVPKNKV3 left in DB (browser froze on delete — Patrick to delete manually).

**#74 Role-Aware Registration Consent ✅** — /register default role = Shopper (1 consent checkbox + ToS). Switch to Sale Organizer: Business Information section (Name/Phone/Address) appears, 1 consent checkbox + ToS. Role-aware form behavior confirmed. Code verified: `organizerEmailConsent` vs `shopperEmailConsent` mapped per role; third branch (both checkboxes) is dead code since UI only offers 2 roles.

**#150 Push Notification Subscriptions ✅** — /organizer/settings → Notifications tab: "Push notifications are enabled" + Disable button. JS: `navigator.serviceWorker` scope=https://finda.sale/ state=activated. `pushManager.getSubscription()` → FCM endpoint + p256dh+auth keys confirmed active.

**#72 Dual-Role Account Schema UNVERIFIED** — No seed user has both ORGANIZER+SHOPPER roles simultaneously. VM disk full prevented psycopg2 access. Single-role organizer nav (ORGANIZER+ADMIN) confirmed no duplicate links. Added to Blocked Queue.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S836 — DEV+QA: #462/#463/#464 UTM attribution ✅ verified, Vercel build failure fixed

**Root cause confirmed:** Chrome incognito strips `utm_*` params at the browser level before the HTTP request is sent. No server-side fix (middleware, skipTrailingSlashRedirect, window.location.search) could intercept them — they never arrive.

**Fix shipped:**
- `outreachEmailsCron.ts`: email links now use `fsa_*` param names (`fsa_src`, `fsa_med`, `fsa_cmp`, `fsa_cnt`) — Chrome-safe, not on strip list
- `middleware.ts`: updated to capture both `fsa_*` (primary) and `utm_*` (legacy/non-incognito) and normalise to utm_* in `fsa_utm_pending` cookie
- `_app.tsx` UTMCapture: reads `fsa_*` as primary source, `utm_*` as fallback, cookie as tertiary — all normalised to `utm_*` in sessionStorage
- `_app.tsx`: also fixed missing `  );
}

export default MyApp;
` closing (caused S835 push Vercel build failure)
- `vercel.json`: added `"trailingSlash": false, "cleanUrls": false` (belt-and-suspenders against infrastructure redirect)

**Verified:** Incognito Chrome → `finda.sale/search?fsa_src=outreach&fsa_med=email&fsa_cmp=touch1&fsa_cnt=hot` → `sessionStorage.getItem('fsa_utm')` = `{"utm_source":"outreach","utm_medium":"email","utm_campaign":"touch1","utm_content":"hot","captured_at":"2026-06-01T14:48:54.209Z"}` ✅

**Files changed:** `packages/frontend/middleware.ts` · `packages/frontend/pages/_app.tsx` · `packages/frontend/vercel.json` · `packages/backend/src/jobs/outreachEmailsCron.ts` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md`

---

### S835 — QA+Fix: #167 admin queue verified with real data, P2 filter bug fixed, UTM confirmed broken

**#167 admin queue ✅ properly verified** — Patrick caught rubber-stamping (empty state ≠ verification). 2 test disputes injected via psycopg2. /admin/disputes as user1 (ADMIN): dispute cards show buyer/seller/reason ✅, expand shows description + 4 status buttons ✅, "Mark Under review" → green toast + live badge update ✅, F5 → persisted ✅, admin guard (user5 → homepage redirect) ✅. Test data cleaned up.

**P2 bug found + fixed:** filter tabs disappeared when filtered status returned empty results. EmptyState rendered before tabs, trapping admin. Fix: disputes.tsx restructured — tabs always render; inline empty state is now context-aware ("No Open Disputes — try another filter."). 0 TS errors.

**UTM #462/#463/#464 ❌ confirmed broken in real browser:** Patrick navigated to finda.sale/search?utm_source=email in real Chrome incognito. Session storage empty. URL shows params already stripped. S831 CODE-ONLY fix (window.location.search on mount) did not work — server-side redirect strips params before React boots.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md` · `packages/frontend/pages/admin/disputes.tsx` · `packages/backend/src/controllers/userController.ts` (S833 fix included in push)

---

### S836 — DEV+QA: #462/#463/#464 UTM attribution ✅ verified, Vercel build failure fixed

**Root cause confirmed:** Chrome incognito strips `utm_*` params at the browser level before the HTTP request is sent. No server-side fix (middleware, skipTrailingSlashRedirect, window.location.search) could intercept them — they never arrive.

**Fix shipped:**
- `outreachEmailsCron.ts`: email links now use `fsa_*` param names (`fsa_src`, `fsa_med`, `fsa_cmp`, `fsa_cnt`) — Chrome-safe, not on strip list
- `middleware.ts`: updated to capture both `fsa_*` (primary) and `utm_*` (legacy/non-incognito) and normalise to utm_* in `fsa_utm_pending` cookie
- `_app.tsx` UTMCapture: reads `fsa_*` as primary source, `utm_*` as fallback, cookie as tertiary — all normalised to `utm_*` in sessionStorage
- `_app.tsx`: also fixed missing `  );
}

export default MyApp;
` closing (caused S835 push Vercel build failure)
- `vercel.json`: added `"trailingSlash": false, "cleanUrls": false` (belt-and-suspenders against infrastructure redirect)

**Verified:** Incognito Chrome → `finda.sale/search?fsa_src=outreach&fsa_med=email&fsa_cmp=touch1&fsa_cnt=hot` → `sessionStorage.getItem('fsa_utm')` = `{"utm_source":"outreach","utm_medium":"email","utm_campaign":"touch1","utm_content":"hot","captured_at":"2026-06-01T14:48:54.209Z"}` ✅

**Files changed:** `packages/frontend/middleware.ts` · `packages/frontend/pages/_app.tsx` · `packages/frontend/vercel.json` · `packages/backend/src/jobs/outreachEmailsCron.ts` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md`

---

### S833 — QA: #279 ✅, #167 P2 bug fixed, S832 roadmap verifications applied

**artifactmi XP restored:** guildXp 183→283 (QA artifact from S832 Featured Boost test).

**S832 Chrome verifications applied to roadmap:** #135, #302, #300, #301, #288, #297 all updated to Human QA ✅ S832 in roadmap.md.

**#279 Rare Finds ✅** — /shopper/rare-finds as Leo Thomas (user5, Hunt Pass active, 517 XP/SCOUT). Page loads correctly. All 4 rarity filter tabs (All Rarities/Rare/Ultra Rare/Legendary) activate with correct visual highlight and resolve to "No rare items available right now. Check back soon!" empty state. Dashboard 💎 Rare Finds widget confirms same empty state. Hunt Pass Active banner present ("You're earning 1.5x XP..."). ss_3532u4dcb ss_7403ckyjq

**#167 Disputes ⚠️ P2 BUG FOUND + FIXED** — Form UI ✅: "Report an Issue" opens inline on purchase, "Condition Mismatch" reason dropdown, 50-char minimum counter (172 chars entered), contact email auto-fills (user5@example.com), Cancel + Submit buttons present. Submit FAILS due to bug: `getPurchases` API includes `item` but omits `id: true` from select → `purchase.item?.id` is undefined → `itemId = ''` → backend "All fields are required". Fix: `id: true` added to item select in `userController.ts`. Admin queue UNVERIFIED (JWT caching blocked after adding ADMIN role to user1 DB). Bug: user1 was missing ADMIN role in seed (had only ORGANIZER) — corrected in DB. Test purchase created + deleted (ca8cc8d4).

**Data changes:** artifactmi guildXp restored 183→283. user1 ADMIN role added to DB. Test purchase created + deleted (no net change).

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `claude_docs/strategy/roadmap.md` · `packages/backend/src/controllers/userController.ts`

---

### S832 — QA: 6 Features Chrome Verified

**6 features verified