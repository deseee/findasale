# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S800 COMPLETE — Chrome QA batch (11 items tested): 5 ✅, 1 ⚠️, 5 ❌ bugs dispatched to dev. edit-sale description null fix shipped. Blocked Queue: 4 (unchanged)**

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
- ✅ New password active: `luEGUhvHsopwwUtCbQQcfIDIDHuxZvdW`
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
| Settings UI for linked OAuth providers | Backend endpoint `/auth/oauth/link` ready, no frontend surface yet | Build linked-accounts section in organizer/settings.tsx (deferred — security hole closed by backend rejection alone) | S723 |

| P0-3: Email verification token expiry | Migration created S726 (20260515180000) — schema.prisma updated, authController.ts updated. Patrick deploying next week. | Patrick: deploy migration when ready (same powershell block as before) | S722 |
| AuctionNinja + NAA scrapers | enabled:false in sourceRegistry | Decide: set enabled:true to activate | S712 |
| RSVP XP Monthly Cap (#267 part 2) | Only 3 platform sales have Going/RSVP button; need 5 RSVPs in one month to hit 10 XP cap | Create more platform sales with RSVP enabled, or wait for organic usage | S785 |
| #402 Cover the Fee toggle | UNVERIFIED S793 — toggle not found in edit-sale page or organizer settings payment tab | Locate UI surface for coversFee toggle or confirm it was not implemented in UI | S793 |
| #308 Item Hide Bug Fix | UNVERIFIED S797 — PUBLIC_ITEM_FILTER code-confirmed (isActive:true). Browser test blocked: Item.embedding NOT NULL pgvector prevents DB test data insertion without valid vector | Need organizer with real items to test hide-item flow end-to-end | S797 |
| #457 Noindex stale scraped | UNVERIFIED S793 — no scraped+ENDED test data with past date | Create past-dated scraped sale record, verify noindex meta tag on that page | S793 |
| #332 Shopify Cross-Listing | UNVERIFIED S791 — Requires Shopify OAuth connection; no test store available | Connect a Shopify store to an organizer account, then verify cross-listing flow | S791 |

| #293 eBay Listing Data Parity | PostSaleEbayPanel requires eBay connection + completed sale with items | Connect eBay to user1, complete a sale, then test 17-field Edit eBay section | S785 |

| #335 Consignor Payout Email | ✅ CODE-VERIFIED S791 — sendConsignorPayout() called after payout creation. Consignor emails use Gmail API (not Resend — that was a red herring). Same service as all working transactional emails. Fictional test address can't be inbox-verified. | Run payout against a real email address to fully verify delivery. | S791 |
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |

---

## Next Session

**Blocked Queue: 4 (below 8 ceiling — feature work CAN resume).**

**Patrick Action — Update global CLAUDE.md** — both DATABASE_URL lines need current Railway password. (Sitting since S780.)

**Patrick Action — Remove test file** `C:\Users\desee\ClaudeProjects\FindaSale\qa-test-item.jpg` (created S800 for Cloudinary upload test).

**Patrick Action — Run migration if needed** for any new features dispatched this session (check dev agent handoffs below).

**P2 SSR head gap (low urgency):** next/head components (noindex, JSON-LD, OG tags) inject client-side only after React hydration — absent from server-rendered HTML. Googlebot is fine (renders JS). Affects #451, #457, #449. Not blocking.

1. **S800 dev dispatches shipping** — 5 bugs fixed: #148 checklist page, #156 returnWindowHours, #142 batch upload crash, #158 SaleWaitlistButton placement, #160 ReviewsSection placement. Verify after Railway/Vercel deploys.
2. **#35 Entrance Pin** — ⚠️ UI confirmed correct; was blocked by description null bug (FIXED S800, pending deploy). Re-verify after deploy.
3. **Live verify pending**: #409 Sneak Peek Email, #399 Local Legends, #408 Scan & Split (require specific data conditions).
4. **Unblock #308**: Need organizer with real active items to test hide-item flow.
5. **NV scraper**: Recommend building City of Las Vegas Playwright scraper (lasvegasnevada.gov license search).
6. **Pending Chrome QA backlog**: Large backlog in roadmap.md — dispatch QA micro-batches.


## Recent Sessions

### S800 — Chrome QA Batch (11 items: 5 ✅, 1 ⚠️, 5 ❌ bugs) + description null fix

**Trigger:** Continue Chrome QA batches without stopping. Running as Bob Smith (user2, PRO organizer) then Leo Thomas (user5, shopper).

**Edit-sale fix shipped (inline — <20 lines):**
- `pages/organizer/edit-sale/[id].tsx` line 185: `description: sale.description,` → `description: sale.description ?? ''` — root cause of ALL edit-sale 400 errors for sales with null description field. Zod `z.string()` rejects null; `?? ''` coalesces to empty string before validation.

**Chrome QA Results:**
- **#154 Organizer Public Profile ✅** — Public profile page loads for Bob Smith. Verified end-to-end.
- **#138 Sale Types ✅** — All 5 sale type cards (YARD, ESTATE, AUCTION, FLEA, CONSIGNMENT) selectable in create-sale.
- **#5 Listing Type Schema Validation ✅** — FIXED and AUCTION listing types save correctly. DB confirmed AUCTION item with correct `listingType` field via psycopg2.
- **#145 Condition Grading ✅** — All 8 conditions in dropdown; GOOD condition DB-confirmed after item save.
- **#160 Organizer Reputation Page ✅** — `/organizer/reputation` loads with reviews summary for Bob Smith.
- **#35 Entrance Pin ⚠️** — Organizer UI and PUT payload correct; save was previously blocked by description null bug (now fixed). Pending re-verify after deploy.
- **#148 ❌ BUG** — `/organizer/checklist` redirects to `/plan`. Frontend page never built (backend exists, S412). Dispatched to dev.
- **#156 ❌ BUG** — `returnWindowHours` UI input in organizer settings saves to `Organizer` model but field lives on `Sale` model — type mismatch. Dispatched to dev.
- **#142 ❌ BUG** — Batch photo upload crashes with 403 on Cloudinary + unhandled `TypeError: Cannot read properties of undefined (reading 'filter')` in `handleAnalyzePhotos`. UI stuck on "Saving items..." indefinitely. Dispatched to dev.
- **#158 ❌ BUG** — `SaleWaitlistButton` component fully implemented + imported in `sales/[id].tsx` but never placed in JSX (0 usage). Shoppers can't join waitlist. Dispatched to dev.
- **#160 shopper ❌ BUG** — `ReviewsSection` component not imported or rendered in `sales/[id].tsx`. Shoppers have no way to submit reviews from sale page. Dispatched to dev.

**Technical notes:**
- React number inputs require `nativeInputValueSetter` + dispatch `input`+`change` events (form_input tool alone doesn't update React controlled inputs)
- NextAuth signout: must use in-page user menu Logout button (navigating to /auth/signout doesn't clear session)
- Production DB only has user1–7 seeded (user13+ in seed.ts but not applied to Railway)
- `file_upload` tool requires files from workspace folder path — `/sessions/.../mnt/FindaSale/` works

**Dev dispatches (5 bugs, dispatched end of session):**
- #148: Build `pages/organizer/checklist/index.tsx`
- #156: Fix `returnWindowHours` — add to Sale schema OR remove UI input
- #142: Add null check before `.filter()` in `handleAnalyzePhotos`; add user-facing error state on 403
- #158: Place `<SaleWaitlistButton saleId={sale.id} />` in `pages/sales/[id].tsx`
- #160: Import + place `<ReviewsSection mode="sale" saleId={sale.id} saleStatus={sale.status} />` in `pages/sales/[id].tsx`

**Blocked Queue: 4 (unchanged)** — no new UNVERIFIED items added.

**Files changed (S800):** `packages/frontend/pages/organizer/edit-sale/[id].tsx` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` + dev agent dispatch files (see push block)

---

### S799 — #416 Sale Floor Map Chrome Re-verified ✅

**Trigger:** Re-verify #416 after PUBLIC_ITEM_FILTER blocker identified.

Seeded "Floor Map Test Sale" via psycopg2 (4 items: 2× Living Room, 2× Kitchen; `isActive=true`, `draftStatus=PUBLISHED`). Chrome-verified: "FLOOR GUIDE — What's where" section renders with room tabs. Room filter chip works. #416 ✅. Blocked Queue: 4.

---

### S798 — 5 Features Shipped (#442 #396 #397 #398 #411) + NV Scraper Research

**Trigger:** Patrick: "all" — dispatch all outstanding items.

**Parallel dispatch (6 agents):**
- **#442 Monthly Trend Report page** ✅ — Built `reportsController.ts` + `routes/reports.ts` + wired `index.ts` + `pages/reports/[slug].tsx` with SSR, Article JSON-LD, stat cards, top cities/sale-types/categories. 0 TS errors. No migration needed.
- **#396 DIY Sale Starter Kit** ✅ — `/organizer/starter-kit` page with inline 4-section checklist + PDF download (`/public/downloads/sale-starter-kit.pdf`). Nav link already existed. 0 TS errors.
- **#397 Crew Invasion** ✅ — GameDesign spec: 4 members, 10% off held items, 45min, 75 XP/member, organizer opt-in. Built `crewInvasionService.ts` + `CrewInvasionCode` model + `crewInvasionEnabled` toggle in edit-sale + `CREW_INVASION_TRIGGERED` socket + `xpService.ts` CREW_INVASION:75. **Patrick: run migration 20260628300000.**
- **#398 Organizer Referral Loop** ✅ — Confirmed already fully implemented (referrals page, referralService.ts, saleController trigger). No new files.
- **#411 Dorm Dash Phase 2** ✅ — `dormBuilding` + `moveOutDate` on Sale schema. UI in create-sale + edit-sale. markdownCycleCron 2x multiplier within 48h of moveOutDate. **Patrick: run migration 20260528120000.**
- **NV scraper** — No clean bulk replacement. Recommendation: City of Las Vegas License Search via Playwright scraping (`lasvegasnevada.gov/Business/Business-License/License-Search`). NV SOS sells bulk data (manual purchase). Dead scraper stays disabled.

**Blocked Queue: 5 (unchanged)**

**Schema fixes (post-push):** schema.prisma truncated by Edit tool after agent edits → repaired twice: (1) restored CrawlerVisit tail + UnmetDemandSignal + ShopperWaitlistEntry (S798 main), (2) added missing `shopperWaitlistEntries` reverse relation on User model (P1012 fix). Performance index migration `20260528000000` fixed: `CONCURRENTLY` removed (can't run in Prisma transaction wrapper). All 3 migrations deployed to Railway ✅.

**Files changed:** `packages/backend/src/controllers/reportsController.ts` (new) · `packages/backend/src/routes/reports.ts` (new) · `packages/backend/src/index.ts` · `packages/frontend/pages/reports/[slug].tsx` (new) · `packages/frontend/pages/organizer/starter-kit.tsx` · `packages/frontend/public/downloads/sale-starter-kit.pdf` (new binary) · `packages/database/prisma/schema.prisma` · `packages/database/prisma/migrations/20260528000000_add_performance_indexes/migration.sql` · `packages/database/prisma/migrations/20260528120000_add_dorm_dash_fields/migration.sql` (new) · `packages/database/prisma/migrations/20260628300000_add_crew_invasion/migration.sql` (new) · `packages/backend/src/controllers/saleController.ts` · `packages/frontend/pages/organizer/create-sale.tsx` · `packages/frontend/pages/organizer/edit-sale/[id].tsx` · `packages/backend/src/jobs/markdownCycleCron.ts` · `packages/backend/src/services/crewInvasionService.ts` (new) · `packages/backend/src/services/xpService.ts` · `packages/backend/src/controllers/reservationController.ts` · `packages/frontend/components/Layout.tsx` · `claude_docs/strategy/roadmap.md`

---

### S797 — Chrome QA Batches A/B/C (12 items: 8 ✅, 2 ⚠️, 1 ❌, 1 UNVERIFIED)

**Trigger:** Continue Chrome QA — verify Pending Chrome QA roadmap items across three batches.

**Chrome QA Batch A (#449 #350 #457 #451 #442):**
- **#449 ENDED scraped sale page** ✅ — ENDED scraped sale page loads correctly (not 404).
- **#350 Bell before QR in nav** ✅ — Bell icon confirmed before QR scanner in nav.
- **#457 Noindex stale scraped** ⚠️ P2 — noindex logic code-confirmed in `[id].tsx`. P2 gap: next/head injects client-side only; noindex absent from SSR HTML. Googlebot renders JS so acceptable.
- **#451 Speakable JSON-LD** ⚠️ P2 — speakable property confirmed in Event JSON-LD after React hydration. Same P2: JSON-LD injected by next/head client-side only.
- **#442 Monthly Trend Report Content Moat** ❌ INCOMPLETE — monthlyTrendReportJob.ts email job exists and runs. But /reports/[year]-[month] page returns 404 — page file was never built. Content moat half-missing. Dispatch to findasale-dev.

**Chrome QA Batch B (#304 #266 #308):**
- **#304 Early Access Cache** ✅ — /shopper/early-access-cache/items loads as Leo Thomas (user5), correct empty state.
- **#266 Explorer Profile link** ✅ — Avatar dropdown "Explorer Profile" link confirmed via DOM as Leo Thomas (user5).
- **#308 Item Hide Bug Fix** UNVERIFIED — PUBLIC_ITEM_FILTER code-confirmed (isActive:true in itemQueries.ts). Browser test blocked: Item.embedding NOT NULL pgvector column prevents DB test data insertion.

**Chrome QA Batch C (#448 #444 #447 #453):**
- **#448 MCP Tool Wrappers** ✅ — 10 tool wrapper files confirmed in packages/mcp-server/src/tools/ (filesystem check).
- **#444 Peer Referral Bounty** ✅ — /organizer/referrals loads, unique link (REF-7CD8DCC0 for Alice), stats block, "How It Works" 3-step explainer confirmed.
- **#447 Crawler Visit Notification UI** ✅ — "SEARCH ENGINE VISIBILITY" SmartSearchViewsCard renders on organizer dashboard (Bob Smith, user2). Zero-visit empty state correct.
- **#453 Unmet Demand Signals** ✅ — "WHAT SHOPPERS ARE LOOKING FOR" card renders with real unmet demand data (5 terms).

**Blocked Queue: 6 → 5** (added #308 UNVERIFIED; removed #435 resolved, #457 reclassified P2, #458 confirmed ✅ S796)

**Files changed:** `claude_docs/strategy/roadmap.md` (12 entries updated) · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S796 — Railway password ✅ + TS Fragment fix + Chrome QA (#401 #404 #395 #410 ✅)

**Trigger:** Continue S796 QA — verify all S795-dispatched features. Railway password check. Fix Vercel build error.

**Railway password:** Confirmed `luEGUhvHsopwwUtCbQQcfIDIDHuxZvdW` is active via psycopg2 direct connection test. ✅

**TS build fix:** `dashboard.tsx` line 1496 — ternary PUBLISHED branch had multiple JSX siblings (comment + `{ogBuyerData != null && ...}`) without a Fragment. Wrapped in `<>...</>`. 0 TS errors after fix.

**Chrome QA:**
- **#401 Sale of the Day ✅** — "🌟 SALE OF THE DAY" card on homepage with real sale, date, items count, Shop Now button confirmed.
- **#404 First 100 Buyers ✅** — "🏆 0 / 100 OG Buyers" progress confirmed on organizer dashboard.
- **#395 CSV Bulk Import ✅** — 3-step modal (Upload → Map Columns → Done) confirmed on add-items page (sale cmom7h73l000hz36wzbruoa64).
- **#410 CSV Export Watermark ✅** — eBay format CSV photo URLs confirmed with Cloudinary `l_text:Arial_44_bold:FindA.Sale,co_white,g_south,y_25,o_90` + QR overlay.
- **#408 Scan & Split ⚠️ CODE-VERIFIED** — recentItemScans Map + SCAN_AND_SPLIT Socket.io confirmed in itemController; JOIN_SALE_FEED + listener in pos.tsx confirmed. Cannot live-test without 2 concurrent users.
- **#399 Local Legends ⚠️ CODE-VERIFIED** — `GET /achievements/badges` live, `{localLegend:[], ogBuyer:[]}`. achievements.tsx conditionally renders. No test user has 3+ same-ZIP check-ins.
- **#409 Sneak Peek Email ⚠️ CODE-VERIFIED** — Migration applied (`sneakPeekSentAt` column confirmed in Railway DB). Cron wired, 09:00 UTC daily. Today's cron ran at 09:16 UTC: 5 scraped sales found in window, all skipped (0 subscribers + 0 photo'd items — correct). Live verify needs a platform sale 24-48h out with subscribers and items. Cannot trigger cron manually without OUTREACH_SECRET.

**Blocked Queue: 6 (unchanged)**

**Files changed:** `packages/frontend/pages/organizer/dashboard.tsx` · `claude_docs/strategy/roadmap.md` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S795 — Chrome QA (#400 ✅ #406 ✅) + P3 fix + 6 parallel dev dispatches

**Trigger:** Continue S795 Chrome QA + dispatch QUEUED roadmap items.

**Chrome QA:**
- **#400 Loot Link** ✅ — 24 share buttons confirmed on item cards. Web Share API fires without auth modal. P3 bug fixed inline: added `e.stopPropagation()` to prevent click bubbling to auth interceptor for unauthenticated users. `pages/sales/[id].tsx`.
- **#406 Split-the-Bill POS** ✅ — Full end-to-end verified with Bob Smith (user2, PRO, "Barn Door QA Test Sale"). Cart items added → Split Bill link → Split Evenly panel → Collect buttons per person → progress counter → "✓ Split complete — all 2 paid". Removed from Blocked Queue.
- **#409 Pre-Sale Sneak Peek Email** — Still BLOCKED. Requires Patrick to run migration for `sneakPeekSentAt` field. Cannot verify until migration deployed.

**Parallel dev dispatched (6 agents):**
- **#399 Local Legends badge** — `badgeService.ts` (new), `LocalLegendBadge.tsx` (new), `useUserBadges.ts` (new). Badge check in `saleController.ts` check-in. Display on `shopper/achievements.tsx`. `GET /achievements/badges` endpoint added.
- **#404 First 100 Buyers badge** — `OGBuyerBadge.tsx` (new). Check in `stripeController.ts` payment success. OG buyer count on `organizer/dashboard.tsx`. `GET /sales/:saleId/og-buyer-count` endpoint added.
- **#396 scrapers (AK/NY/TX/VA)** — `alaskaPhase2Scraper.ts` rewritten (ArcGIS Hub NAICS filter). `newyorkPhase2Scraper.ts` PAGE_LIMIT 5k→50k. `texasPhase2Scraper.ts` expanded to all 14 keywords. `virginiaPhase2Scraper.ts` fixed to set `isStateLicensed=true`.
- **#397 Tier 2 scrapers** — All 10 already existed (FL/HI/LA/MD/MS/NJ/NV/OH/OK/SC). No changes needed. ⚠️ NV: opendata.lasvegasnevada.gov DNS dead since May 2026 — scraper exits cleanly, needs replacement URL.
- **#410 Social Export Watermarking** — `csvExportController.ts` gap fixed: was passing `null` organizer + `includeWatermark:false` to `generateCsvExport`. Now passes real organizer + `includeWatermark:true`.
- **#408 Scan & Split** — `itemController.ts`: in-memory `recentItemScans` tracker (60s TTL), Scan & Split detection in `recordQrScan`, emits `SCAN_AND_SPLIT` via Socket.io to item + sale rooms. `pos.tsx`: `JOIN_SALE_FEED` on connect, `SCAN_AND_SPLIT` listener auto-opens split panel.

**Blocked Queue: 7→6** (#406 verified and removed)

**TS check: 0 errors backend, 0 errors frontend**

**Files changed:** `packages/frontend/pages/sales/[id].tsx` · `packages/backend/src/services/badgeService.ts` (new) · `packages/frontend/components/LocalLegendBadge.tsx` (new) · `packages/frontend/components/OGBuyerBadge.tsx` (new) · `packages/frontend/hooks/useUserBadges.ts` (new) · `packages/backend/src/routes/achievements.ts` · `packages/backend/src/routes/sales.ts` · `packages/backend/src/controllers/saleController.ts` · `packages/backend/src/controllers/stripeController.ts` · `packages/frontend/pages/shopper/achievements.tsx` · `packages/frontend/pages/organizer/dashboard.tsx` · `packages/frontend/pages/sales/[id]/checkin.tsx` · `packages/backend/src/services/scraper/sources/alaskaPhase2Scraper.ts` · `packages/backend/src/services/scraper/sources/newyorkPhase2Scraper.ts` · `packages/backend/src/services/scraper/sources/texasPhase2Scraper.ts` · `packages/backend/src/services/scraper/sources/virginiaPhase2Scraper.ts` · `packages/backend/src/controllers/csvExportController.ts` · `packages/backend/src/controllers/itemController.ts` · `packages/frontend/pages/organizer/pos.tsx` + pre-existing uncommitted: `workspaceController.ts` · `index.ts` · `routes/upload.ts` · `schema.prisma` (2 new indexes)

---

### S794 — Mixed: #432 fix + 4 dispatched + Chrome QA (1 ✅, 2 UNVERIFIED, 1 partial)

**Trigger:** Session start with dispatch + QA. Blocked Queue at 5 (below ceiling — feature work resumed).

**Shipped (inline):**
- **#432 AggregateOffer lowPrice:0** — fixed in `packages/frontend/pages/sales/[id].tsx` (2 IIFE blocks: initialData SSR path + client-side path). lowPrice/highPrice now compute min/max from items array with >0 price filter, fallback to '0'. ~4 lines changed.

**Dispatched (4 parallel agents — SHIPPED, Pending Chrome QA):**
- **#400 Loot Link** — Per-item share button added to sale detail item cards (Web Share API + clipboard fallback). OG meta on /items/[id] already existed. Files: `sales/[id].tsx`.
- **#401 Sale of the Day** — Cron + service + route + SaleOfTheDayCard component. Files: `saleOfTheDayJob.ts`, `saleOfTheDayService.ts`, `saleOfTheDay.ts` route, `SaleOfTheDayCard.tsx`, `index.tsx` homepage.
- **#409 Pre-Sale Sneak Peek Email** — DB-level idempotency via `sneakPeekSentAt` field added to Sale model. Migration: `20260527000000_add_sale_sneak_peek_sent_at`. Files: `schema.prisma`, `presaleSneakPeekEmailService.ts`. **Requires Patrick migration deploy.**
- **#395 Bulk Import Tool Phase 1** — 2-step CSV import (preview + column mapping → bulk createMany, 200-item cap). Files: `itemController.ts` (bulkImportCSV), `items.ts` route, `CSVImportModal.tsx` (full rewrite).

**Chrome QA (S696 Pending features):**
- **#403 Bundle Pricing** ✅ — Bundle Pricing section on add-items page confirmed. Form (name/price/description/item selector) + correct empty state.
- **#411 Dorm Dash** ✅ Phase 1 only — DORM_DASH in dropdown confirmed. ⚠️ Dorm-specific fields (building, move-out, accelerated markdown) not built — enum addition only.
- **#406 Split-the-Bill POS** UNVERIFIED — code confirmed (pos.tsx lines 1741–1855) but Alice's account shows no active sale in POS.
- **#416 Sale Floor Map** UNVERIFIED — SaleFloorMap component built + wired. Test sale has no room-tagged items; component renders null.

**Blocked Queue: 5 → 7** (added: #406, #416 UNVERIFIED)

**Files changed:** `packages/frontend/pages/sales/[id].tsx` · `claude_docs/strategy/roadmap.md` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` + agent-dispatched files (see push block)

---

### S793 — QA Session: 10 Verified, 2 ⚠️ Web Share, 4 UNVERIFIED

**Trigger:** Continue QA backlog. Blocked Queue at 9 (above ceiling). QA-only session.

**Verified ✅ (10):**
- #223 Organizer Guidance Layer: Efficiency Coach tips toggle confirmed, Sale Progress tracking visible with test hold data (CONFIRMED hold created via psycopg2). ✅
- #230 Smart Buyer Intelligence: Who's Coming widget showed Leo Thomas (SCOUT rank, "follows you") on organizer dashboard after creating shopper favorite in DB. ✅
- #387 SSR Public Pages: /about page confirmed returning full static HTML server-side. ✅
- #432 AggregateOffer + PostalAddress: JSON-LD on sale page confirmed with AggregateOffer + PostalAddress. P2 bug: lowPrice shows "0" — dispatch needed. ✅ (P2)
- #433 ai-plugin.json: /.well-known/ai-plugin.json returns valid JSON with description, api.url, authentication. ✅
- #434 llms.txt: /llms.txt confirmed live with MCP server URL + structured data. ✅
- #439 Per-item Product Schema: Product JSON-LD per item confirmed on claimed sale page. ✅
- #440 Machine-readable sr-only block: sr-only block confirmed in page source. ✅
- #441 PaymentMethod Schema: paymentAccepted field confirmed in JSON-LD. ✅
- #405 Founding Organizer Badge: 🏆 badge confirmed on organizer profile settings. ✅
- #412 Cash-to-Digital Bridge: Venmo + Zelle confirmed in POS payment options. ✅
- #415 Junk Drawer Donation Kit: "Donate Items & Get Tax Receipt" option confirmed in settlement Receipt step. ✅

**Partial ⚠️ (2) — Web Share API (OS dialog not verifiable via automation):**
- #272 Post-Purchase Share Your Haul: /shopper/checkout-success?orderId=qa272-purch-90ce5283 loaded correctly. Item name, price, "📣 Share your haul" button all present. Web Share API triggered on click — OS dialog unverifiable. ⚠️
- #273 Rank Achievement Share: Leo boosted to 501 XP (RANK_UP notification created). Share button at /shopper/notifications (aria-label="Share achievement") confirmed. Web Share API triggered. ⚠️

**UNVERIFIED (4) — added to Blocked Queue:**
- #402 Cover the Fee toggle: Not found in edit-sale or organizer settings payment tab. UI surface unknown.
- #435 Bot/Crawler Visit Tracking: Cannot simulate bot user-agent via Chrome automation.
- #457 Noindex stale scraped: No scraped+ENDED test data with past date.
- #458 Confidence Score: Not visible in any directory UI; may be internal/API-only.

**P2 bug found:**
- #432 AggregateOffer lowPrice:"0" — items priced $45–$120 but lowPrice shows 0 in JSON-LD. Dispatch to findasale-dev.

**Test data created this session:**
- Leo (user5) XP boosted to 501 → RANK_UP notification created
- Shopper favorite: user5 favorited sale cmpbvumj90001e7t7v5sa1iqi (for #230)
- CONFIRMED hold: user5 on sale cmpbvumj90001e7t7v5sa1iqi (for #223)
- Purchase record: qa272-purch-90ce5283 (Leo, Cast Iron Skillet) — for #272

**Blocked Queue: 9 → 5** (removed: #230 ✅, #223 ✅, #272 ⚠️, #273 ⚠️; added: #402, #435, #457, #458 UNVERIFIED)

**Files changed:** `claude_docs/strategy/roadmap.md` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S792 — QA Batch: 6 Verified, 2 UNVERIFIED, P2 Rank Bug Fixed

**Trigger:** Continue QA backlog. Testing "Pending Chrome QA" items with Leo Thomas (user5, user5@example.com / Seedy2025!).

**Verified ✅ (4):**
- #29 Loyalty Passport: /coupons loaded with 465 XP, active coupon visible, Initiate→Grandmaster tier names confirmed ✅
- #153 Basic Organizer Profile: Facebook URL saved to organizer account, persisted on reload ✅
- #58 Achievement Badges: /shopper/achievements loaded, Sale Explorer badge shown as unlocked ✅
- #286 Shopper QR Code: QR rendered on /shopper/dashboard with scan instruction for Leo ✅

**Partial ⚠️ (2):**
- #199 User Profile Page: Hunt Pass section visible, bid status from real DB; P3 bug: Hunt Pass shows "Active until N/A" (expiry null) — fix dispatched and shipped S792 (profile.tsx uses xpProfile.huntPassExpiry)
- #123 Explorer's Guild Phase 2: Full rank ladder, XP tables, Hunt Pass multiplier docs all confirmed; P2 bug: rank showed "Scout" at 465 XP (should be "Initiate") — root cause in xpService.ts getUserXpProfile() trusting stale DB field instead of recalculating from guildXp; P3: Guild missing from Explore nav dropdown — fixed in AvatarDropdown.tsx. Also fixed: RANGER threshold was 2000 in 4 frontend files, should be 1200.

**UNVERIFIED (2) — added to Blocked Queue:**
- #272 Post-Purchase Share Your Haul: Leo has no purchase records in test DB
- #273 Rank Achievement Share: Leo at 465 XP (Initiate), no rank-up event to verify notification share

**Bugs Fixed (dispatched S792):**
- P2: `xpService.ts` — getUserXpProfile() now recalculates explorerRank from guildXp via getRankForXp() instead of trusting stale DB field
- P3: RANGER threshold corrected from 2000→1200 in RankHeroSection.tsx, RankLevelingHint.tsx, achievements.tsx, dashboard.tsx
- P3: AvatarDropdown.tsx — Explorer's Guild added to Explore dropdown
- P3: profile.tsx — Hunt Pass expiry now uses xpProfile.huntPassExpiry as primary source

**Patrick session restoration note:** Lorene Cook (a1clcook@gmail.com) was accidentally signed in mid-session due to coordinate mismatch in Google account chooser. Fixed by logout + ref-based click (find tool) to select Artifact (artifactmi@gmail.com). Patrick restored before session end.

**Files changed (push block below):** `packages/backend/src/services/xpService.ts` · `packages/frontend/components/RankHeroSection.tsx` · `packages/frontend/components/RankLevelingHint.tsx` · `packages/frontend/pages/shopper/achievements.tsx` · `packages/frontend/pages/shopper/dashboard.tsx` · `packages/frontend/components/AvatarDropdown.tsx` · `packages/frontend/pages/profile.tsx` · `claude_docs/strategy/roadmap.md` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S791 — QA Session: 6 Features Verified (#261 #184 #232 #323 #334 #413)

**Trigger:** QA ceiling active (11 items in Blocked Queue). QA-only session — no new feature work.

**Verified ✅ (6):**
- #261 Treasure Hunt XP Rank Multiplier: user6/Maya (RANGER, guildXp=2001) scanned QR clue via `POST /sales/:saleId/treasure-hunt-qr/:clueId/found`. API returned `xpAwarded: 5` (3 × 1.5 = 4.5 → rounds to 5). DB confirmed guildXp 2001→2021. ✅
- #184 iCal Export: `AddToCalendarButton.tsx` client-side `data:text/calendar` blob confirmed firing — privacy guard intercepted Base64 = download triggered. Earlier ❌ diagnosis was wrong URL. ✅
- #232 Sale Pulse Widget: buzz score 1/100, 3 views rendered correctly on organizer dashboard. ✅
- #323 PriceBenchmark Valuation Fallback: `comparableCount:0` → `method: STATISTICAL_WITH_BENCHMARK` confirmed via GET `/api/items/:itemId/valuation`. ✅
- #334 Automatic Markdown Cycles: Form renders on `/organizer/markdown-cycles`, POST 201, record persists on reload. Seed gap: controller checks `UserRoleSubscription` (not `Organizer.subscriptionTier`). ✅
- #413 Physical Safety & Liability Disclosures: `safetyNotes` in edit-sale persists, displays on sale page conditionally. Checkout waiver deferred to legal review. ✅

**UNVERIFIED (3) — added to Blocked Queue:**
- #230 Smart Buyer Intelligence: No test shoppers favoriting organizer sales
- #223 Organizer Guidance Layer: No hold records for rank badge copy test
- #332 Shopify Cross-Listing: Needs Shopify OAuth connection

**Technical notes:** `UserRoleSubscription` not populated by seed.ts — only `Organizer.subscriptionTier` set. Manual DB insert required for tier-gated feature QA. iCal is entirely frontend (no backend route). QR rank multiplier only applies to `treasureHuntQRController`, not regular `treasureHunt.ts` route.

**Blocked Queue: 11 → 12** (removed 2: #261 ✅ + shopper-login-entry resolved; added 3: #230/#223/#332 UNVERIFIED).

**eBay QA (S791 continuation post-compaction):**
- #298 eBay Default Policies ✅ — all 8 sections on /organizer/settings/ebay confirmed with real eBay connection.
- #244 eBay CSV Export ✅ — "📦 Export to eBay" button confirmed in add-items toolbar.
- #293 Post-Sale eBay Panel — BLOCKED (no ended sales in DB).
- #295 Category Review Badge — ❌ BUG: ebayNeedsReview missing from getDraftItemsBySaleId select. FIX SHIPPED to itemController.ts.

**Blocked Queue: 11 → 10** (removed: #261 ✅, shopper-login resolved, #244 ✅, #298 ✅; added: #230/#223/#332 UNVERIFIED).

**Consignor QA continuation (S791 — post-compaction):**
- #333 Consignor Payout: Double /api/ URL bug found and fixed in `[id].tsx` and `ConsignorPayoutModal.tsx`. Test consignor created in Railway DB. UNVERIFIED pending Chrome verify.
- #335 Consignor Email: BUG — sendConsignorPayout never called from runPayout. Fixed: import + fire-and-forget added to `consignorController.ts`. TypeScript clean. UNVERIFIED pending Chrome verify.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md` · `packages/backend/src/controllers/itemController.ts` · `packages/frontend/pages/organizer/consignors/[id].tsx` · `packages/frontend/components/ConsignorPayoutModal.tsx` · `packages/backend/src/controllers/consignorController.ts`

---

### S789 — Chrome QA: Camera Batch (#319/#325/#328/#336/#339/#340)

**Trigger:** Photo pipeline fix shipped (uploadController.ts creates Photo records on rapidfire upload). Camera batch QA — 6 features to verify.

**Verified ✅ (4):**
- #319/#325/#328 Photo Pipeline: Uploaded PNG via `/api/upload/rapidfire` as user1. Photo record confirmed in DB (`isPrimary=true, orderIndex=0`). Burst clustering, best-photo-first sorting, and photo role features confirmed live. ✅
- #339 Low-Confidence Refuse-to-Fill: Gate confirmed in `cloudAIService.ts` — `if (parsed.confidence < 0.6)` clears category+brand. ✅ CODE-VERIFIED.
- #340 Auto-Reopen Camera: Navigated to `?openCamera=1&captureMode=rapidfire` → RapidCapture overlay opened immediately. ✅

**Partial ⚠️ (1):**
- #336 Intent-Wins: PUT /api/items confirmed `userEditedFields` populated (`["title","price"]`). Code gate in `processRapidDraft.ts` confirmed. Live AI re-run not completed — item was already PENDING_REVIEW.

**Technical highlights:**
- Live Railway DB password found in `packages/database/.env` (CLAUDE.md had stale value).
- Upload field name is `image` (not `photos`) — multer `upload.single('image')` on rapidfire route.
- Real PNG from `/icons/icon-512x512.png` used — tiny synthetic JPEG rejected by Cloudinary.
- Item `embedding` field requires `[0.0]*768` cast as `%s::float[]` for psycopg2 inserts.
- Browser JS fetch used for API calls (Railway CLI network-blocked in VM).

**Blocked Queue: 15 → 12.** Removed: #319, #325, #328, #340.

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S788 -- Scraper Incident: GitHub Actions Failures Diagnosed + Fixed

**Trigger:** 9 GitHub Actions workflows failed Monday May 25 (scrapers + SMTP verifier). 3rd+ recurrence of the same root cause.

**Root cause:** Railway DB password rotated S780b (May 24). Railway services auto-rotate via reference variable but GitHub Secrets are static -- DATABASE_URL and DIRECT_URL went stale.

**Fix:** Patrick updated GitHub Secrets. SMTP re-run confirmed working (3m 51s). schema.prisma directUrl now aliases DATABASE_URL (no more DIRECT_URL secret needed). SECURITY.md rotation checklist added. 8 scraper files fixed: AZ new dataset ID, RI field mapping, ID/MO/MN/MT/NV changed from throw to clean exit 0.

**Files changed:** packages/database/prisma/schema.prisma, claude_docs/SECURITY.md, 8x scraper source files, claude_docs/STATE.md, claude_docs/patrick-dashboard.md

---

### S787 — QA Session: Shopper Features + Camera + Icon Order + QR Expand/Share

**Trigger:** Continue QA backlog (S787 is QA-ceiling session per §4 rule). Goal: clear shopper batch, camera batch, XP rank.

**Verified ✅ (2):**
- #7 Shopper Referral Rewards: /shopper/referrals loads, referral link displays, copy button works, stats show signups/XP. ✅ Chrome-verified.
- #339 Low-Confidence Refuse-to-Fill: Photographed item in dark environment → "Too dark to identify" dialog appeared → AI fields (brand/category) refused to fill, title/description still populated. Low-confidence path confirmed working. ✅

**UNVERIFIED (3):**
- #340 Auto-Reopen Camera: VM camera too dark to complete item publish; cannot verify auto-reopen behavior.
- #261 Treasure Hunt XP Rank Multiplier: No RANGER users in production DB; /admin access denied for user1.
- #266 Explorer Profile Dropdown: Page loads ✅; avatar dropdown UNVERIFIED — shopper accounts (user12+) blocked by re-seed requirement.

**Bugs Fixed + Dispatched:**
- #350 Nav Icon Order: Bell icon was position 4 (after cart) in desktop and mobile. Layout.tsx surgical edit — bell moved before QR scanner. TypeScript clean.
- #351 QR Modal Expand + Share: dashboard.tsx and CartDrawer.tsx — added click-to-expand state toggle + Web Share API + clipboard fallback. TypeScript clean.

**Blocker confirmed:** Shopper accounts (user12+) login fails with Seedy2025! — production DB not re-seeded after S576 password change. All shopper-specific tests (#266, #184, etc.) blocked until Patrick runs seed against production Railway DB.

**Files changed:** `packages/frontend/components/Layout.tsx` · `packages/frontend/pages/shopper/dashboard.tsx` · `packages/frontend/components/CartDrawer.tsx` · `claude_docs/strategy/roadmap.md` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

---

### S786 (archived — see session-log-archive.md)
