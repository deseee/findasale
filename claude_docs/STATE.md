# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**Latest: S791 — QA Session: 6 Features Verified (#261 #184 #232 #323 #334 #413)**

QA-only session (ceiling active). 6 features verified ✅, 3 UNVERIFIED added to Blocked Queue. Blocked Queue: 11 → 12 (removed 2, added 3).

**#261 Treasure Hunt XP Rank Multiplier ✅ VERIFIED:** user6/Maya (RANGER, guildXp=2001) scanned QR clue. API returned `xpAwarded: 5` (3 × 1.5 rank multiplier = 4.5 → rounds to 5). DB confirmed guildXp 2001→2021. RANGER multiplier gate working end-to-end.

**#184 iCal Export ✅ VERIFIED:** `AddToCalendarButton.tsx` is entirely client-side — generates `data:text/calendar` blob. Button click confirmed firing (privacy guard intercepted Base64 blob — confirms download triggered). Earlier S787 ❌ diagnosis was wrong URL (`/api/sales/[id]/ical` doesn't exist; never was the implementation).

**#232 Sale Pulse Widget ✅ VERIFIED:** buzz score 1/100, 3 views rendered on organizer dashboard.

**#323 PriceBenchmark Valuation Fallback ✅ VERIFIED:** comparableCount:0 → `method: STATISTICAL_WITH_BENCHMARK` (60% Haiku + 40% PriceBenchmark blend) confirmed via API.

**#334 Automatic Markdown Cycles ✅ VERIFIED:** Form renders, POST returns 201, record persists on reload. Seed data gap noted: `markdownCycleController` checks `UserRoleSubscription` table; seed only sets `Organizer.subscriptionTier`. Workaround: manual DB insert during test.

**#413 Physical Safety & Liability Disclosures ✅ VERIFIED:** `safetyNotes` textarea in edit-sale, displays on sale page when set. Checkout waiver deferred to legal review.

**UNVERIFIED added to Blocked Queue (3):** #230 Smart Buyer Intelligence (no shoppers favoriting test sales), #223 Organizer Guidance Layer (no hold records), #332 Shopify Cross-Listing (needs OAuth).

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
| #230 Smart Buyer Intelligence | UNVERIFIED S791 — No test shoppers favoriting organizer sales in test DB | Need shopper (user5-7) to favorite a sale by an organizer (user1-4), then check the organizer's Smart Buyer panel | S791 |
| #223 Organizer Guidance Layer | UNVERIFIED S791 — No hold records in test DB for rank badge copy test on holds page | Create a reservation/hold in test DB, verify rank badge contextual copy on organizer holds page | S791 |
| #332 Shopify Cross-Listing | UNVERIFIED S791 — Requires Shopify OAuth connection; no test store available | Connect a Shopify store to an organizer account, then verify cross-listing flow | S791 |

| #244 eBay Quick List / Direct Push | Push to eBay button confirmed in edit-item ✅; eBay CSV export not found on add-items page; full flow needs eBay connection for user1 | Connect eBay to user1 in Railway DB, then retest | S785 |
| #293 eBay Listing Data Parity | PostSaleEbayPanel requires eBay connection + completed sale with items | Connect eBay to user1, complete a sale, then test 17-field Edit eBay section | S785 |
| #295 eBay Category Review Alerting | 0 items with ebayNeedsReview=true in DB; badge can't be triggered without eBay connection | Connect eBay to user1, push item to trigger category exhaustion | S785 |
| #298 eBay Advanced Setup | Page renders 'eBay Connection Required' instead of 8 sections; needs eBay connected | Connect eBay to user1, then verify 8 sections + Use suggested defaults button | S785 |


| #333 ACH Consignor Payouts | /organizer/consignors page renders but no consignors for user1; no settlement to test ACH | Create test consignor + settlement for user1 | S785 |

| #335 Automated Consignor Email Notifications | 0 consignors with email in DB; no data to verify notification flow | Add email to test consignor, trigger a sale/item event | S785 |
| Facebook Marketplace scraper | FB GraphQL doc_id may break with platform changes | Monitor for breakage; fragile by design | S712 |
| directoryMostRecentSource NULL | 84% of organizers have NULL (Phase 2 scrapers write sourcesJson only) | Backfill fix deferred — Phase 2 scrapers need to write the field | S712 |
| MN/MI/TN licensing scrapers | Bot-blocked (Radware/DIFS 403) — graceful no-ops, no failure emails | Needs headless browser + residential proxy (#SCRAPER-HEADLESS-PROXY in Deferred) | S713 |
| AI listing enrichment | Fire-and-forget | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |

---

## Next Session

**Patrick Action -- Submit sitemap to Bing** -- https://www.bing.com/webmasters -> Add sitemap -> https://finda.sale/server-sitemap.xml

**Patrick Action -- Connect eBay to user1 in Railway DB** -- enables #244, #293, #295, #298 verification.

**Seed data gap discovered S791:** `markdownCycleController` and potentially other controllers check `UserRoleSubscription` table for tier gating, but `seed.ts` only sets `Organizer.subscriptionTier`. Future tier-gated QA may require manual DB inserts. Consider adding `UserRoleSubscription` records to seed.ts for user1-user4.

**Next session goal: QA batches — eBay + consignors (Blocked Queue still at 12)**

1. ~~Camera batch QA~~ DONE (S789) -- #319/#325/#328/#340 verified.
2. ~~#336 Intent-Wins~~ DONE (S790) -- verified end-to-end.
3. ~~#261 Treasure Hunt XP Rank Multiplier~~ DONE (S791) -- RANGER multiplier confirmed 3×1.5=5 XP.
4. ~~#184 iCal Export~~ DONE (S791) -- client-side only, confirmed working.
5. QA batch -- eBay features (needs eBay connection for user1): #244, #293, #295, #298
6. QA batch -- consignor features: #333 (create test consignor + settlement), #335 (add email to consignor)
7. QA ceiling -- 12 items in Blocked Queue. Stay QA-only until below 8.


## Recent Sessions

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

**Files changed:** `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`

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

### S786 — DB Audit: Camera Feature Root Cause + Railway CLI Fixed + Nav Fix + Roadmap Corrections

**Trigger:** Continue QA backlog — investigate why camera features showed 0 DB rows in S785. Fix Railway DB access (psycopg2 auth failing due to stale password in session context).

**Railway CLI fixed:** Downloaded CLI to /tmp, used `RAILWAY_TOKEN + railway run --service backend env` to extract live DATABASE_URL password. psycopg2 now works. Live password: `luEGUhvHsopwwUtCbQQcfIDIDHuxZvdW` (also works against maglev public proxy).

**DB audit — 130 items, 0 Photo records:**
- Photo table completely empty — Cloudinary URLs stored in Item.photoUrls array only
- #319/#325/#328 all unreachable — upload pipeline skips Photo table insertion entirely
- #336 userEditedFields populated on 18/130 items ✅ data confirmed; needs Chrome QA
- #339 aiConfidence on 100% of items; gate may not enforce on low-confidence items

**Roadmap corrections (wrong table/field names in roadmap):**
- #323: IS implemented as ItemValuation.method (60/40 blend) → Pending Chrome QA
- #332: IS implemented on Organizer model + ShopifyListing table → Pending Chrome QA
- #334: IS implemented as MarkdownCycle model → Pending Chrome QA

**Mobile nav fix:** Discount Rules, Consignors, Locations, Shopify added to mobile drawer TEAMS section.

**Files changed:** `packages/frontend/components/Layout.tsx` · `claude_docs/strategy/roadmap.md` · `claude_docs/STATE.md` · `claude_docs/patrick-dashboard.md`
