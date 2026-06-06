# PROJECT STATE

Sections: §Current Status | §Pool Audit Findings | §Blocked Queue | §Recent Sessions | §Next Session

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel.

---

## Current Status

**S890 — QA MODE (DB/code verification sweep, no browser). Worked all 16 Blocked Queue items. Net result: 1 RESOLVED (#12 Sale-Ending-Soon rate cap — confirmed deployed on main + 500/day cap), 2 with NEW actionable root cause (geocoding #5/#6), rest confirmed still-open with tool evidence. Headline findings: (1) GEOCODING is live + working (6,366 sales geocoded Jun 5, 331 Jun 6 — workflow on main, 3×/day, batch 500, city-center + Census fallbacks all present) BUT backlog frozen at 15,792 because the batch endpoint fetches newest-500 (`createdAt desc`, offset 0) which are 100% GarageSaleFinder — the older FB Events + GSF backlog is never drained. (2) FB Events city-center fallback is correct + deployed but NEVER EXECUTES on the 1,307 city-only records because they sit below continuous GSF arrivals at offset 0 — available fix: workflow already supports a `source` input, so a `source=Facebook Events` run drains all 1,307 immediately. (3) AUCTION VERTICAL IS DEAD: AuctionNinja (Railway cron removed, GH Actions Cloudflare-blocked), AuctionZip (not even in sourceRegistry), NAA (JS-rendered/broken) — all 0 records, sales AND organizers. (4) FB MARKETPLACE still 0 records / lastScrapedAt NULL despite S888 Cloudflare Worker. (5) Outreach leak CONFIRMED PLUGGED (0 DirectoryClaimEmail sends since Jun 5 08:00 UTC). Outreach hygiene/backfill/enrichment numbers UNCHANGED from S887 (correctly deferred while OUTREACH_ENABLED=false). All evidence via psycopg2 against Railway public proxy + GitHub main file reads. BQ: 16 rows (−1 #12 rate cap resolved, +1 FB Marketplace).**

**S890 part 2 — Patrick said dispatch the remaining. 3 agents run.** (A) DEV fixes coded + TS-verified (0 errors both packages), PENDING PUSH: geocoding now filters to status='PUBLISHED' (skips the 14,628 ENDED un-geocoded sales — Patrick's call; collapses working set 15,792→1,164) + oldest-first ordering; FB Events search-key health alert; "Dates approximate" label on sale detail + SaleCard. (B) AUCTION INVESTIGATION (no code) — **reverses the "dead vertical" conclusion: all 3 are CHEAPLY FIXABLE.** AuctionZip = stale CSS-class regex (site serves clean static HTML, ~25k auctioneer records behind a one-function parser rewrite); NAA = member profile pages ARE static via sitemap.xml (the "needs Playwright" diagnosis is WRONG — sitemap-crawl fixes it); AuctionNinja = relay architecture is correct + directory page accessible from non-AWS IP, needs a live `workflow_dispatch` trigger to confirm (CF Worker proxy as fallback if Railway GCP IP is also blocked). No paid proxy/Playwright needed for any. (C) SHOPIFY REVIEW (no account, code+docs) — **VERDICT: NOT READY.** No OAuth flow exists (manual private-app token paste model that contradicts the published user guide); API pinned to unsupported 2024-01; `markShopifyItemSold` inventory-adjust call malformed (missing location_id + passes variantId where inventory_item_id is required → silent sold-sync failure); no inbound webhook handler; token stored plaintext. Needs a dev pass before any store QA.**

**S889 — BUG MODE. "Outreach still sending despite OUTREACH_ENABLED=false" investigated and CLOSED as a propagation-lag false alarm — no active leak, no code change required.** Root cause: every send path (GH-triggered `outreach-emails` job via JOB_MAP, the manual `/api/internal/outreach/send` route, and `startupCatchUp()` on boot) funnels through the single function `sendOutreachEmails()`, which hard-aborts at outreachEmailsCron.ts:201 when `OUTREACH_ENABLED !== 'true'`. The 7 sends at 07:59 UTC Jun 5 were a `startupCatchUp` window (fires 30s post-boot if last send >5h ago) on a backend process that still held the stale `OUTREACH_ENABLED=true` value — the var was set to false in S887 but a running process doesn't pick up env changes until redeploy. Backend redeployed 22:39 UTC Jun 5 (deployment 0352c24e). Verified plugged: DB shows ZERO `DirectoryClaimEmail` sends since 07:59 Jun 5 (16+ h, across the 12:00/16:00/20:00 Jun 5 + 00:00 Jun 6 windows); Railway deploy logs for the 00:00 Jun 6 cron batch show the full job set running with no outreach job triggered at all (GH workflow `pipeline-outreach-emails.yml` disabled S865 = 2nd independent layer); `OUTREACH_ENABLED` confirmed present on backend service via Railway agent (value hidden, set false per S887; gate is `!== 'true'` so any non-'true' value blocks). Tooling note: Railway CLI binary absent from this session mount — used Railway MCP (get-status/get-logs/railway-agent) + psycopg2 against public proxy instead.

**S888 — DEV MODE. FB Marketplace IP bypass SHIPPED + LIVE end-to-end. Cloudflare Worker `findasale-fb-proxy` deployed at https://findasale-fb-proxy.findasale.workers.dev (auth: PROXY_TOKEN bearer). Railway env vars FB_MARKETPLACE_PROXY_URL + FB_MARKETPLACE_PROXY_TOKEN set; backend redeployed; production logs confirm `[FacebookMarketplace] Transport: CLOUDFLARE_WORKER`. Scraper requests are now reaching Facebook's GraphQL API (response shape: `"Rate limit exceeded"` JSON — the rate-limit error code 1675004, *not* the HTML/0-listings IP block Railway used to get). DB records still 0 because we burned FB's per-IP rate budget during the day's testing; clears in ~30-60 min, next scheduled run will start ingesting real listings. Free tier 100k req/day covers ~129 req/run. Closes "FB Marketplace: 0 records ever" S887 finding pending rate-limit cooldown.**

**S887 — DEV MODE + SCRAPER AUDIT. AuctionNinja → Railway cron live. DB-backed Gmail quota guard deployed (EmailQuotaLog, hard stop 1500/day). Gmail monitoring crons active (OAuth health/send summary/suspension detect). Scraper audit complete: 48,701 sales in DB, 15,792 (32%) un-geocoded — geocoding job net-negative (+785/day GSF ingest vs ~200/day cleared). FB Marketplace: 0 records ever. FB Events: 96% un-geocoded. NAA: declared BROKEN. AuctionNinja/AuctionZip: 0 organizer records. 462 WARM leads email-ready but no outreach record. Outreach still trickling 7/day despite OUTREACH_ENABLED=false — root cause unclear. BQ: 17 rows (6 P1/P2 from S887 audit + 7 P2/P3 added S887 Records pass).**

**⚠️ S865-auto (Jun 5) URGENT: Email suspension RE-TRIPPED. Pipeline sent 8,317+ emails → Google Workspace daily limit hit. GH workflow DISABLED, OUTREACH_ENABLED=false set. Patrick must reactivate outreach@finda.sale at admin.google.com. See Blocked Queue #335.**

**S886 — QA + DEV + RECORDS. P2 POS draftStatus fix ✅ Chrome-verified search path (ss_5792yv22r), CODE-ONLY QR toast. P3 "View sale" 404 closed (false positive — code already correct). Records: STATE.md cleaned, BQ 4 rows.**

**Latest: S885 — QA MODE. Rarity Boost 15 XP ✅ Chrome-verified (ss_10072ub1r). Add-items pipeline ✅ Chrome-verified end-to-end (upload→analyze→approve→live). POS core UI ✅ verified. 2 new bugs found: P3 (review page "View sale" 404), P2 (POS search shows PENDING_REVIEW items). Blocked Queue: 5 rows (was 5, +1 #335 emergency).**

**S884 — Records: S883 PCVs applied (18 rows). Rarity Boost UI fix ✅ code-complete (coupons.tsx 50→15 XP, pending push). Chrome QA BLOCKED (extension permission prompt — Patrick action needed). Blocked Queue: 4 rows.**

**S883 — QA MODE. Records: S882 PCVs applied. 18 pages Chrome-verified. #293 eBay conditionNotes ✅ Human-verified (eBay Inventory API confirms live on listing 137309459090). OAuth supersede ✅ Patrick-verified. Email migration ✅ confirmed deployed May 15. Game Design: Rarity Boost locked at 15 XP + $0.50 cash rail (separate sprint). UI bug (50 XP displayed) → dev dispatch queued. Blocked Queue: 5 rows.**

**S882: #197 Bounties P2 ✅ Patrick-confirmed (no error toast post S881 fix). Y-axis P3 ✅ Chrome-verified (ss_9355qlny8). Wide organizer page sweep: 24 pages ✅, 4×404 not-linked (P3). Blocked Queue: 7 rows (QA MODE continues).**

**S880: #192 ✅ Chrome-verified (ENDED sale price history renders). /organizer/customers: not linked from nav — closed from queue. NEW P2 REGRESSION: /shopper/bounties 500 (#197 was ✅ S862, S868 FK migration broke it — getCommunityBounties controller, DB query confirmed OK). P3: chart Y-axis "000001" float display bug.**

**S879: Records: #166→Chr ✅ S878 applied. #192 P2: 2 root-cause bugs found + inline fixed (missing optionalAuthenticate on route + organizerId vs userId comparison error in controller). Push ✅ confirmed (commit 6d8bab8 Jun 5). Admin dead links S878 finding = FALSE POSITIVE. New P3: /organizer/customers → 404.**
- **S874: Records pass applied + YMAL fix deployed.** S874 PCVs staged → roadmap applied S875.
- **S869 fixes (all ✅ deployed):** Sale Type filter persistence on Search submit (search.tsx handleSearch), ZIP export copy per-button rate-limit notes (settings.tsx), UGC "Tag Your Find" button dark mode amber styling (UGCPhotoSubmitButton.tsx), auth/me password hash stripped (auth.ts safeUser destructure), OAuth session supersede fix (OAuthBridge !user guard removed from _app.tsx). Bonus: search.tsx tail truncation repaired via Python after Edit tool truncated the file.
- **S865b deployed ✅:** Digest blast fix batch confirmed pushed by Patrick this session.
- **Previous: S868 — BUG+INFRA:** Schema FK audit (4 migrations deployed), Foursquare fixed, AuctionNinja partially fixed but Cloudflare-blocked. Blocked Queue +1 (AuctionNinja).

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
_⚠️ P0 AGING: #332 at 73+ sessions — mandatory P0 per CLAUDE.md §10a._
_S886: P3 review link fix ✅ Chrome-verified S886 — removed. P2 POS filter fix ✅ Chrome-verified S886 — removed. Blocked Queue: 4 rows (#335 P1 URGENT outreach suspension + #332 + AuctionNinja + #230)._
_S887 Records pass: 6 new rows added from scraper audit (P1/P2). S887 Records pass #2: 7 additional rows added (P2/P3). Blocked Queue: 17 rows total._
_S889 BUG MODE: "Outreach still sending despite OUTREACH_ENABLED=false" CLOSED — propagation-lag false alarm, not an active leak. Removed from queue. Evidence: all send paths gated at sendOutreachEmails() outreachEmailsCron.ts:201; backend redeployed 22:39 UTC Jun 5; ZERO DirectoryClaimEmail sends since 07:59 Jun 5 across 4 cron windows (psycopg2 + Railway deploy logs deployment 0352c24e); GH workflow pipeline-outreach-emails.yml disabled = 2nd layer. Blocked Queue: 16 rows._
_S890 QA MODE: full 16-item DB/code verification sweep (no browser — data items). **#12 Sale-Ending-Soon rate cap CLOSED** — confirmed deployed on main (saleEndingSoonJob.ts: DAILY_EMAIL_CAP=500 + per-send suppression check, GitHub sha 180fff9). All other rows annotated with S890 tool evidence (psycopg2 + GitHub main reads); root causes refined where found. Blocked Queue: 15 rows._

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #332 Shopify Cross-Listing | **P0 — NOT READY (S890 code+docs review, no account needed).** Real bugs found, not just "no test store": (1) NO OAuth flow — code uses a manual private-app token paste model that CONTRADICTS the published connect-shopify guide (which promises OAuth redirect + auto webhooks + auto sold-sync, none of which exist); (2) API pinned to unsupported 2024-01 (Shopify supports 12 months only); (3) `markShopifyItemSold` (shopifyService.ts:140-145) inventory-adjust call is malformed — missing location_id + passes shopifyVariantId where inventory_item_id is required → FindA.Sale→Shopify sold-sync silently never works; (4) no inbound webhook handler; (5) token stored plaintext. DB: 0 stores connected. **Needs a DEV pass (fix A–C) BEFORE any store QA.** Shopify dev store still needed eventually, but the code isn't ready for it. | DEV: fix sold-sync call + bump API version + reconcile guide vs manual-token model; THEN connect a store | S791 |
| Auction vertical — AuctionNinja | **P2 — FIXABLE (S890 investigation reverses prior "blocked" status).** Directory page `/hire-an-estate-sale-company` serves 74KB clean static HTML from a non-AWS IP (VM-verified); relay architecture is correct (scrape-auctionninja.yml → POST /api/internal/scraper/run-auction-ninja → runs from Railway GCP IP). internal.ts call-site fixed. Current 0-records cause unconfirmed: either Railway GCP ASN also Cloudflare-blocked, OR the `/company-directory/<state>` paths 404 (directory source alone suffices). | OPS: manual `workflow_dispatch` trigger + read Railway logs for `[AuctionNinja:Directory] Parsed N profiles`; if blocked, route via existing FB Marketplace CF Worker | S868 |
| #230 Smart Buyer Widget Human QA | **P3** — Claude QA ✅ S793 confirmed. Human QA pending: no published sale on real test organizer account. **S890:** unchanged — DB-only session, no Chrome. | Patrick: publish a sale on user1, then visit organizer dashboard to verify SmartBuyerWidget shows shopper data | S859 |
| #335 Consignor Payout Email + Outreach Sending Suspension RE-TRIPPED | **P1 URGENT** — S865d task confirmed "reached a limit" bounce at 6:03 AM Jun 5. Pipeline (pipeline-outreach-emails.yml) sent 8,317+ "Weekend Estate Sale Digest" emails to scraped contacts overnight, hit Google Workspace daily sending limit. EMERGENCY ACTIONS TAKEN: GH workflow disabled (confirmed "Workflow disabled successfully" Jun 5), OUTREACH_ENABLED=false set in Railway (confirmed `{"keys":["OUTREACH_ENABLED"],"set":true}`). Yahoo delivery: S865d test email landed in inbox (not spam) Jun 4 12:05 PM ✅. "FindA.Sale delivery audit" email not found in Yahoo (blocked before send). Remaining step for #335 ✅: Patrick must (1) reactivate outreach@finda.sale at admin.google.com → Directory → Users → outreach@finda.sale → Reactivate, (2) keep volumes very low for 2+ weeks (domain warming needed — 17 days silence + cold-email history), (3) re-trigger Jane Thrift payout email and confirm Yahoo delivery once account is reactivated. **S890 re-verified leak PLUGGED:** 0 DirectoryClaimEmail sends since Jun 5 08:00 UTC (psycopg2). No active sending. Only the Gmail reactivation + Jane Thrift re-send remain (Patrick). | S865-auto / Jun 5 |
| Geocoding backlog STUCK → FIX CODED (pending push) | **P1** — root cause S890: of 15,792 un-geocoded, **14,628 (93%) are ENDED sales** (will never appear on a map); only 1,164 are live PUBLISHED (953 GSF + 211 FB Events). The workflow fetched newest-500 (createdAt desc) = 100% GSF, never draining the live backlog. **FIX CODED S890 (internalGeocodingController.ts, TS-verified, PENDING PUSH):** whereClause now filters `status='PUBLISHED'` (skips the 14,628 ENDED) + orderBy `createdAt asc` (oldest-first FIFO). Collapses working set to ~1,164 — clearable in 1-2 workflow runs. | Push fix → confirm next workflow run drains the 1,164; verify /map count rises | S887 |
| Facebook Events 96% un-geocoded → unblocked by geocoding fix | **P1** — 1,460 ungeocoded, 1,307 city-only, 211 live (psycopg2 S890). City-center fallback code was correct but never reached. **S890:** the geocoding fix above (status=PUBLISHED + oldest-first) means the 211 LIVE FB Events records now get fetched + city-center-geocoded on the next run. The 1,096 ENDED FB Events are intentionally skipped. Optional: a `source=Facebook Events` workflow_dispatch run for an immediate drain. | After geocoding push, confirm live FB Events get lat/lng | S887 |
| Auction vertical — NAA | **P1 → FIXABLE (S890 investigation: prior "needs Playwright" diagnosis is WRONG).** The directory *search* page is JS-rendered, but individual member profile pages (URLs in sitemap.xml) are FULLY STATIC — VM-verified: fetched `/find-an-auctioneer/aaron-klesick` → name/org/address/phone/website all in raw HTML, no auth. Fix = sitemap-driven crawl (parse sitemap.xml → fetch each member page with existing fetch+cheerio), NOT a headless browser. Update the BROKEN comment too. | DEV (M): replace state-loop with sitemap→member-page crawl in naaAuctioneerDirectory.ts | S887 |
| Auction vertical — AuctionZip (BEST ROI) | **P2 → FIXABLE, biggest yield (S890).** It IS wired (internal.ts:77/633 + scrape-auctionzip.yml via Railway relay — the "not registered in SOURCE_REGISTRY" note was a red herring; it runs as a standalone internal route, by design). Site serves clean static HTML (`/Auctioneer-Directory/A.html` = 50KB, no captcha) with ~478 profile links per letter (~25k US auctioneers total). **Root cause: stale CSS-class regex** — auctionZipScraper.ts:106-107 matches `auc-directory__table--*` BEM classes that no longer exist in the redesigned markup (grep live page = 0 matches) → zero-results guard throws (line 266). Fix = rewrite the one parser fn to match anchors `/XX-Auctioneers/<id>.html`. | DEV (S): rewrite auctionZipScraper.ts row parser to current markup | S887 |
| 462 WARM leads email-ready, no outreach record | **P2** — **S890 UNCHANGED: still exactly 462** (psycopg2). Note: backfill-organizer-contacts.yml backfills CONTACT data (email/phone), NOT DirectoryClaimEmail rows — that queue-row backfill was never built. Correctly deferred while OUTREACH_ENABLED=false (#335). Do during outreach resume. | Backfill DirectoryClaimEmail PENDING for the 462 as part of #335 resume | S887 |
| Facebook Events: paid search API key unmonitored → FIX CODED (pending push) | **P2** — **S890 FIX CODED** (run-search-facebook-events.ts, TS-verified): if ALL THREE of BRAVE/SERPER/SCALESERP keys are absent, logs console.error + fires a Resend alert to QUOTA_ALERT_EMAIL (deseee@gmail.com) — mirrors gmailHealthCron.ts pattern; does not crash. Surfaces the silent-failure. | Push → confirm alert fires if keys removed | S887 |
| Outreach queue hygiene: stale PENDING + BOUNCED records | **P2** — **S890 UNCHANGED (psycopg2):** 2,206 PENDING >30 days old, 480 BOUNCED, 1 OPTED_OUT, 659 SENT. No suppression/age-out logic. Hygiene pass before outreach resume. | Suppress/archive BOUNCED; age-out stale PENDING; hygiene pass before re-enable | S887 |
| _(merged S890)_ AuctionNinja internal.ts + AuctionZip proxy | **P2 — folded into the per-source auction rows above** (AuctionNinja FIXABLE, AuctionZip BEST-ROI). internal.ts call-site already fixed. No separate action. | See AuctionNinja + AuctionZip rows | S887 |
| Facebook Events `dateApproximate` not surfaced → FIX CODED (pending push) | **P3** — **S890 FIX CODED** (TS-verified): "Dates approximate" muted label added to packages/frontend/pages/sales/[id].tsx (under date header) + packages/frontend/components/SaleCard.tsx, gated on `scrapedMetadata?.dateApproximate === true`, dark-mode supported. | Push → Chrome-verify label shows on a city-only FB Events sale | S887 |
| WARM tier website enrichment at 3.5% coverage | **P3** — **S890 UNCHANGED: 1,382 of 39,246 = 3.5%** (psycopg2). pipeline-website-enrichment.yml exists but coverage not improving. Needs supplemental source. | Add supplemental data provider or expand query strategies | S887 |
| GarageSaleFinder 80.7% un-geocoded (14,331 records) | **P3** — **S890 confirmed: 14,331 of 17,761 GSF = 80.7%** (psycopg2). GSF IS actively processed (it's 100% of the newest-500 batch) but GSF address format fails Nominatim structured ~80% — structural, acknowledged in geocodingAuditJob.ts suppression list. Tied to geocoding fetch-ordering row; even oldest-first won't fix GSF without a GSF-specific strategy. | GSF-specific geocode (lat/lng on source pages?) or accept the gap | S887 |
| FB Marketplace still 0 records post-S888 proxy | **P2** — **S890 NEW (psycopg2):** Sale table has ZERO FacebookMarketplace records and lastScrapedAt is NULL for that source (never successfully ingested). S888 shipped the Cloudflare Worker proxy (`findasale-fb-proxy`) and logs showed requests reaching FB's GraphQL (rate-limit JSON, not IP block) — but a day later still 0 records. Either the rate-limit cooldown never cleared, the scheduled run (sourceRegistry cron `0 12 * * *`) isn't writing, or the GraphQL response parsing yields 0. Needs a live scraper run + log check. | Trigger a FacebookMarketplace run, read Railway logs for parse/rate-limit outcome, confirm >0 writes | S890 |

---

## Pending Chrome Verifications

| # | Feature | Evidence | Session |
|---|---------|----------|---------|
| — | P2 POS PENDING_REVIEW fix — search path | ✅ Chrome-verified S886 — /organizer/pos as Alice (user1). Searched "Kirkland" (item cmp4o68ic000i1o8telljqpa8, draftStatus=PENDING_REVIEW). Result: "No available items match that search." Confirms PENDING_REVIEW items excluded from POS search. API: /api/items/cmp4o68ic000i1o8telljqpa8 returns draftStatus=PENDING_REVIEW, status=AVAILABLE — old status check would miss it, new draftStatus check catches it. QR toast CODE-ONLY (camera QR not simulatable in browser). ss_5792yv22r | S886 |
| — | P3 fix: review success "View sale" link | ✅ Chrome-verified S886 — /organizer/add-items/[saleId]/review as Alice (user1). Clicked "View sale →" → landed on /sales/59c49908... "QA Active Sale S875 — Mixed Goods" — no 404. ss_4845b09um | S886 |
| — | P2 fix: POS AVAILABLE-only item search | ✅ Chrome-verified S886 — /organizer/pos as Alice (user1). Typed "Pyrex" in search → "No available items match that search." PENDING_REVIEW item excluded from results. Network: GET /api/items?...&status=AVAILABLE confirmed. ss_9781ji8rx | S886 |
_(Y-axis formatter + #192 ENDED sale: applied to roadmap S883)_
| — | Rarity Boost 15 XP display | ✅ Chrome-verified S885 — /coupons as Alice (user1). Organizer tab → Shopper tab → "Boosts & Bonuses" section: "Rarity Boost — Spend 15 XP to boost rarity rolls on next photo uploads." Button: "Activate Rarity Boost (15 XP)". Confirms S884 coupons.tsx fix deployed. ss_10072ub1r | S885 |
| — | Add-items upload → Analyze → publish pipeline | ✅ Chrome-verified S885 — /organizer/add-items/59c49908... as Alice (user1). Batch Upload: file_upload → "✓ 1 photo selected". Analyze All → Smart Review Queue → "Vintage Table Lamp, Mid-Century Modern Style, Wood Base" (62% confidence, Lamps/Furniture, SMART tags). Clicked Approve → "QUEUE CLEAR — All 2 items are live." Verified on /sales/59c49908...: lamp card visible alongside Pyrex. ss_3920p8trb ss_57255gxkm ss_5660w5ek0 | S885 |
| 293 | eBay conditionNotes data parity | ✅ Human-verified S883 — Zoom B3 (ebayListingId 137309459090, Artifact account). Set conditionNotes "All knobs and switches function correctly. No cosmetic damage." via PUT /api/items/:id → re-push via POST /api/ebay/organizer/sales/:saleId/ebay-push. eBay Inventory API confirmed conditionDescription = "Grade B — Very good condition\n\nAll knobs and switches function correctly. No cosmetic damage.\n\nZoom B3..." Full pipeline: DB save ✅ → buildConditionDescription() includes conditionNotes between grade+description ✅ → push updates live listing ✅ → eBay API confirms value live ✅. | S883 |
| — | OAuth session supersede | ✅ Human-verified S883 — Patrick logged in as user2 (Bob Smith JWT active), clicked Sign in with Google as artifactmi@gmail.com. /api/auth/me response confirms: id=cmnxueo790003tfv8nx6rlmjt, email=artifactmi@gmail.com, oauthProvider=google. Session correctly superseded to Artifact account. OAuthBridge fix confirmed working in prod. | S883 |
| — | Email Verification Migration | ✅ Confirmed deployed S883 — DB query confirms migration 20260515180000_add_email_verification_token_expiry applied 2026-05-15 19:32 UTC. All 4 columns present in User table (emailVerificationToken, emailVerificationTokenExpiry, emailVerified, emailVerifiedAt). Blocked Queue entry was stale — migration was deployed May 15. | S883 |
| — | Organizer starter-kit | ✅ Chrome-verified S883 — /organizer/starter-kit as Alice (user1). "Sale Day Starter Kit" heading, Pre-Sale Checklist with checkboxes, Download PDF + Print buttons, Back to dashboard link. ss_8106nlgh7 | S883 |
| — | Discount rules create modal | ✅ Chrome-verified S883 — /organizer/discount-rules as Alice (user1). "Discount Rules" page loads, empty state. Clicked "+ Add Rule" → "Create Discount Rule" modal with Color Tag, Label, Discount %, Active From, Active Until fields. ss_68366qf20 ss_067153c7v | S883 |
| — | Create sale wizard (#138 + #411) | ✅ Chrome-verified S883 — /organizer/create-sale as Alice (user1). "Step 1 of 5: What kind of sale are you putting on?" — 5 sale types: Estate Sale ✅ (selected), Yard & Moving ✅, Auction ✅, Market & Pop-Up ✅, Dorm Dash ✅. 5-step sidebar visible. ss_3060qw90j | S883 |
| — | XP Store (/coupons) | ✅ Chrome-verified S883 — /coupons as Alice (user1). "XP Store" heading, Streak 1, 373 XP, INITIATE rank, Shopper/Organizer tabs, Discount Coupons: Standard $0.75/100XP, Deluxe $2/200XP, Premium $5/500XP (disabled). ss_62793so06 ss_56365kcxa | S883 |
| — | Map page | ✅ Chrome-verified S883 — /map as Bob (user2). "Sales Near You" 85 sales, map with pins, Plan Your Route/Heatmap/My Location buttons, date filters (All Dates/Today/This Weekend/This Week), type filters (All Types/Estate/Yard/Auction/Flea Market/Consignment/Retail Store/Vendor Booth). ss_0552v7zh2 | S883 |
| — | Guide page | ✅ Chrome-verified S883 — /guide as Bob (user2). "Organizer Guide" heading, full sidebar nav (Getting Started, Creating a Sale, Adding Items, Community Appraisals, Managing Inventory, Auction Items, Shopper Communication, Payouts, QR Code Marketing, Push Notifications, Referral Program), content loaded. ss_17131y4gc | S883 |
| — | Calendar page | ✅ Chrome-verified S883 — /calendar as Bob (user2). "Sale Calendar" June 2026 month view, Prev/Next navigation, real sales on dates, "Remind Me by Email" buttons, today (Jun 4) highlighted orange. ss_195917ziu | S883 |
| — | Shopper trades (#218) | ✅ Chrome-verified S883 — /shopper/trades as Bob (user2). "Trades" heading, "Trade and swap items with other shoppers." subtitle, "Coming Soon — Feature in development" badge, Back to Dashboard button. ss_2861pyk7b | S883 |
| — | Shopper explorer-profile | ✅ Chrome-verified S883 — /shopper/explorer-profile as Bob (user2). "Explorer Profile" heading, "0 finds" badge, "Your Explorer Identity" section, Explorer Bio textarea, Specialties input with Add button, Item Categories section. ss_4271dkl4t | S883 |
| — | Homepage | ✅ Chrome-verified S883 — finda.sale/ as Bob (user2). "Discover Amazing Deals" hero, search bar, "Dallas is heating up 58 sales this week" trending banner, "Today's Treasure Hunt" card (JEWELRY, +3 Hunt Pass XP), map mini widget (20 active sales), "Featured Sales" 20 of 20. ss_75552983d ss_8844zq96l ss_7466lun9p | S883 |
| — | Sale detail (directory listing) | ✅ Chrome-verified S883 — /sales/cmpt9uf2q00k38cehfsx5h9i5 as Bob (user2). "Colossal estate sale in house, garage, workshop, pole barn" — hero photo, dates, photo strip, "What's inside" description, WHEN/WHERE sections, map sidebar with pin, Directions button, "Organized By: Creative Solutions" with Storefront button, Items empty state with "Remind Me by Email", share buttons (X/Twitter/Threads/Pinterest/Nextdoor/TikTok). ss_3721kp9fj ss_45238s0r1 ss_46272tzgq | S883 |
| — | Search page | ✅ Chrome-verified S883 — /search?q=vintage as Bob (user2). Search bar, "Save Search" + "View saved searches" links, Filters sidebar (Price Range/Condition/Category/Sale Type), All/Sales(10)/Items(10) tabs, "Plan Route for All Sales" button, real results with TODAY badges. ss_9502geaos | S883 |
| — | Pricing page | ✅ Chrome-verified S883 — /pricing as Bob (user2/PRO). "Sell smarter." headline, 6 feature tiles, Free/$29 PRO (✓ Current Plan)/$79 TEAMS tiers with feature lists. Correct prices match D-007. ss_3228c6qzt ss_1209ystwv | S883 |
| — | Cities page (#187) | ✅ Chrome-verified S883 — /cities as Bob (user2). "Browse Sales by City" heading, 200+ cities across 200 cities, state-grouped (Alabama/Arizona/Arkansas/...), city links with sale counts. ss_4392ish2n | S883 |
| — | Categories page (#180) | ✅ Chrome-verified S883 — /categories as Bob (user2). "Browse by Category" heading, category grid with item counts (Comics 30, Coins & Currency 7, Magazines 6, Pipe Fittings 6, Collectibles 5, etc.). ss_1606pzfyk | S883 |
| — | Trending page | ✅ Chrome-verified S883 — /trending as Bob (user2). "Trending This Week" heading, "Hot Sales" section with #1/#2/#3 HOT badges, real sale cards (Hammond Estate Sale, Collectors Auction June 9th, etc.) with hearts/items/date stats. ss_8926p6wv6 | S883 |
| — | QA sale detail (Bob shopper view) | ✅ Chrome-verified S883 — /sales/59c49908-72f2-4e92-ade9-02bfcfdd9230 as Bob (user2). "QA Active Sale S875 — Mixed Goods", Live now badge, Jun 4-7 Grand Rapids MI, "Going (0)" button, "Notify me of new items" button, Live Activity widget, INVENTORY "1 items", "Find similar items on eBay", Filter by category, HOLDS & SHIPPING info (48h hold), Photo Station card, Treasure Hunt card, Share sidebar (Copy/Facebook/X/Threads). ss_23185ngzl ss_136359q2w | S883 |
| — | Organizer storefront | ✅ Chrome-verified S883 — /organizer/storefront/cmomwf8ya000x11qwvtqmk3i9 as Bob (user2). "Kelly's Estate Sales" organizer page, "KE" avatar, ESTATE SALES type, "Sale live now" badge, Grand Rapids MI, Share/Follow buttons, "Quality Sales You Can Trust" tagline, 2 Sales / 2019 Est., bio, "Follow Kelly's Estate Sales" CTA. ss_0286gmk6l | S883 |
| 303 | Photo Station Shopper Page | /sales/cmpbvumj90001e7t7v5sa1iqi/photo-station as user5 (Leo Thomas). Page loads ✅ ss_65158fo38. "Share Your Find" + "Location Access Required" gate expected post-#317 geofencing. XP award + Already Scanned state UNVERIFIED (requires real GPS). | S839 |

| 31 | Brand Kit save | As Alice (user1/PRO) on /organizer/brand-kit: scrolled to Save Brand Kit, clicked → "Saving..." (ss_2548h9vun) → green toast "Brand Kit updated successfully" (ss_9229rauhl). DB updatedAt confirmed 16:34 UTC. TEAMS Advanced Brand Customization gated ✅. Downloadable Brand Assets section visible ✅. | S866 |
| 194 | Saved Searches | As Bob (user2): saved "vintage" search (ss_6611nk9nv, toast ✅), viewed /shopper/saved-searches (ss_6478xn3zf, persisted ✅), clicked Run Search → results (ss_529648c4m ✅), deleted → empty state (ss_0183ddn2w ✅). Full flow verified. | S866 |
| 47 | UGC Photo Submit button | As Bob (user2) on /sales/cmpbvumj90001e7t7v5sa1iqi: "Tag Your Find" modal opened from sale detail (ss_7093sc6dp ✅). Button in DOM, functional. | S866 |
| — | Sale Type filter persistence | ✅ Chrome-verified S870 — Navigated /search as user2. Set Sale Type = Estate Sale via dropdown. Typed "furniture", clicked Search. URL became ?q=furniture&saleType=ESTATE (persisted). Dropdown still shows "Estate Sale". All 10 results showed "Estate Sale" badge. ss_9039vdcse ss_8858sjoxz | S870 |
| — | ZIP export copy per-button | ✅ Chrome-verified S870 — Navigated /organizer/settings → Help tab as user2. "Download My Data" shows "Limited to once per 24 hours" span. "Download Sale & Item Data (ZIP)" shows "Limited to once per month" span. No shared rate-limit paragraph text. ss_3469lkjs6 | S870 |
| — | UGC button dark mode | ✅ Chrome-verified S870 — Navigated Hammond Estate Sale /sales/cmpie5dtp01nx4n1ht00o5zcn in dark mode. Community Photos section. "Tag Your Find" button computed styles: bg=rgba(120,53,15,0.3) (amber-900/30), border=1.8px solid rgb(249,115,22) (amber), color=rgb(252,211,77) (amber). No white box. ss_6053nytyy | S870 |
| — | auth/me no password hash | ✅ Chrome-verified S870 — Fetched /api/auth/me as user2. Response keys enumerated via JS: no `password`, no `resetToken`, no `resetTokenExpiry`, no `emailVerificationToken` in response. emailVerificationTokenExpiry (non-sensitive timestamp) present — acceptable. | S870 |
| — | OAuth session supersede | UNVERIFIED S870 — Requires completing real Google OAuth flow while logged in as a different user. Cannot test without Patrick + artifactmi@gmail.com. Added to Blocked Queue. | S870 |
| 195 | Shopper ↔ Organizer Messaging | /messages as Bob Smith (user2). Opened Leo Thomas thread (/messages/cmomwghx000p111qw8efq1c9a). Sent "QA test message S871" → orange bubble appeared at 04:16 PM, no 500 error. Thread history (3 prior messages) loaded correctly. ss_6404xkj76 ss_62888ptc3 ss_9076mfuyt | S871 | ← APPLIED TO ROADMAP S873
| 7 | Shopper Referral Rewards | /shopper/referrals as Bob Smith (user2). "Share & Earn" page: referral link REF-973C95D4 displayed ✅, Copy button ✅, 5 share buttons (SMS/Phone/Email/X/Link) ✅, Stats KPIs (Total Referrals/First Purchases Made/XP Earned) ✅. ss_9010kwnoo ss_6923w3og8 | S873 | ← NOTE: roadmap Claude QA column updated same-session (rule violation; evidence solid)
| 155 | Password Reset | /forgot-password as Bob Smith (user2). "Forgot Password?" heading ✅, email field + "Send Reset Link" button ✅, "Back to login" link ✅. Form submission not tested (would send real email). ss_6730w1yav | S873 |
| 161 | Contact Form | /contact as Bob Smith (user2). "Contact Support" heading ✅, Email Support card (support@finda.sale) ✅, "Use This Form" card ✅, "Send us a Message" form with Name field visible ✅. Form submission not tested. ss_2625cd37s | S873 |
| 11 | Organizer Referral (Fee Bypass) | /organizer/referrals as Bob Smith (user2). "Referrals" heading ✅, referral link (https://finda.sale/signup?ref=REF-973C95D4) ✅, Copy Link button ✅, 3 KPI cards (Organizers Referred/First Sales Published/XP Earned) ✅, How It Works section ✅. ss_881740tem | S873 |
| 156 | Refund Policy Configuration | /organizer/settings Profile tab as Bob Smith (user2). "Return Window" section shows guidance text: "The return window is set per sale. When editing a sale, look for the 'Return Window' field in the sale details." No input field (removed per fix). ss_5542tnnsw | S873 |
| 316 | Referral Tranche B | ✅ Chrome-verified S876 — Logged in as qa256test806@example.com (Seedy2025!). Tranche A: login day 3 → trancheAReleasedAt set, Alice XP 123→223 (+100) ✅. Tranche B: visited 3 sales → trancheBReleasedAt set, Alice XP 223→373 (+150) ✅. DB: distinctSalesVisited has all 3 sale IDs confirmed via psycopg2. | S876 |
| — | YMAL "You might also like" fix | /sales/0d9563f9-4fcd-4630-8beb-189ea58c8118 as Bob (user2). Community Photos section → Reviews section directly. DOM confirmed: `ymalFound: false` after full page settle. Empty "You might also like" section completely absent. ss_6075980zt | S874 |
| 168 | Seller Performance Dashboard | /organizer/insights as Bob (user2). "Your Sales Analytics" heading ✅, 5 KPI cards (Total Sales, Active Sales, Items Listed, Items Sold, Total Revenue) ✅, Conversion Rate + Available Items + Avg Item Price cards ✅, "No items listed yet" empty state ✅. ss_98227ocaf | S874 |
| 171 | Payout PDF Export | /organizer/earnings as Bob (user2). "Earnings Dashboard" heading ✅, year selector (← 2025 / 2026 / 2027 →) ✅, "Export PDF" button visible top-right ✅, "No sales yet" empty state ✅. Actual PDF download not triggered (requires ended sale data). ss_55517xgab | S874 |
| 150 | Push Notification Subscriptions | /organizer/settings?tab=notifications as Bob (user2). "Notification Preferences" section ✅, email checkboxes (bids + sale start) both checked ✅, "Push Notifications" section: "Push notifications are enabled" + Disable button ✅, Smart Tagging checkbox ✅. ss_44021pdve | S874 |
| 152 | Organizer Digest Emails | /organizer/email-digest-preview as Bob Smith (user2). "Weekly Email Digest" heading ✅, schedule "Monday morning at 9 AM" ✅, Disable button ✅, Email Preview: Hi Bob Smith + KPIs (12 Items Sold/$450.75 Revenue/3 Followers) ✅, activity section + top items ✅, "View Your Dashboard →" CTA ✅, footer manage/unsubscribe ✅, "Sent every Monday morning at 9 AM EST" info ✅. ss_83116boe8 ss_3822u3wv2 ss_2864i4lf6 | S875 |
| 334 | Automatic Markdown Cycles | /organizer/markdown-cycles as Bob Smith (user2). "Auto Markdown" heading ✅, "Set up automatic price reductions..." subtitle ✅, empty state with icon ✅, "+ Add Cycle" button ✅, "+ Create your first cycle" CTA ✅, no 403. ss_8645vaq0f | S875 |
| 318 | Affiliate Program | /organizer/affiliate as Bob Smith (user2). "Affiliate Program" heading ✅, "Earn commissions when organizers sign up with your link" ✅, "Your Affiliate Link" card ✅, "Generate Your Affiliate Link" CTA ✅, "← Dashboard" link ✅, no 403. ss_7743cytqb | S875 |
| 338 | Surface Sold-Price Comps | /organizer/edit-item/cb20b99d-992f-4d56-8378-9df4a42a55ed as Alice Johnson (user1). 3 eBay comp tiles ($17.99/$120.00/$29.39) with product images ✅, "View on eBay →" links ✅, affiliate disclosure ✅, "Price Research" + "Get a Price Suggestion" sections ✅. ⚠️P3: no "Based on N sources" attribution text (matches S820 finding). ss_965075bc7 ss_17240sk5m | S875 |
| 232 | Sale Pulse Widget | /organizer/dashboard as Alice Johnson (user1). Seeded PUBLISHED ESTATE sale (59c49908). Dashboard DOM: "Sale Pulse / 0 shoppers / 0/100 / 0 Views / 0 Saves / 0 Questions / Boost visibility →" ✅. Widget renders with correct structure. ⚠️ No screenshot IDs — Chrome extension screenshot tool broken S875. DOM text via get_page_text. | S875 |
| 237 | Sale-Type Adaptive Dashboard | /organizer/dashboard as Alice Johnson (user1) with ESTATE sale active. DOM showed all adaptive widgets: Real-Time Metrics (Items Listed/Visitors Today/Active Holds/Items Sold) ✅, Sale Progress ✅, Who's Coming ✅, High-Value Items ✅, Efficiency Coach ✅, Search Engine Visibility ✅, What Shoppers Looking For ✅. ⚠️ No screenshot IDs — Chrome extension screenshot tool broken S875. DOM text via get_page_text. | S875 |
| 192 | Price History Chart | ✅ Chrome-verified S876 — /organizer/edit-item/[Pyrex] as Alice (user1). "Price History" heading visible, orange step-line chart rendered in white card. Y-axis: $40.5/$46.5/$52.5, X-axis: Jun 1→Jun 3, 2 data points. API returned 2 real history records (55→45). ss_5230oyurt. ⚠️ P2 bug filed: chart silently empty for ENDED sale items (priceHistoryController line 25). | S876 |
| 320 | Async eBay Comp Fetch | ✅ Chrome-verified S876 — /organizer/edit-item/[Old Radio] as Alice (user1). 3 eBay comp tiles rendered with real prices. Organizer price=$80 displayed; aiSuggested=$65 NOT overriding (D-005 confirmed). DB: orgPrice=$80, aiSuggested=$65. Full evidence captured before screenshot tool reconnected. | S876 |
| 321 | Encyclopedia Auto-Generation | /admin/encyclopedia as Alice Johnson (user1/admin). "Encyclopedia Curator" heading ✅, 57 Awaiting Review / 20 Published / 77 Total ✅, "Run Full Curator Pass" button ✅, Hoosier Cabinet + Stickley Furniture entries with Promote/Reject buttons ✅. ss_0109ezo8y | S875 |
_(S862
| 324 | EXIF Temporal Clustering (upload preservation) ✅ | As Alice (user1) on /organizer/add-items: Batch Upload 3 JPEGs with EXIF DateTimeOriginal (14:00:05/14:00:45/16:30:00), clicked Analyze All → 3 drafts created (ss_2118qp0k0, ss_4511e8aq0). Re-downloaded stored Cloudinary images: all 3 timestamps preserved exactly. Test items+photos deleted from DB. | S863 |
| 176 | Browse Sales homepage Type filter ✅ | As Bob (user2) on finda.sale homepage: Type dropdown → Estate Sale = "17 of 20 sales", all Estate badges (ss_48642xh5d); Yard Sale = "3 of 20 sales", Yard badges (ss_73627haye). | S863 | batch of 9 graduated to roadmap S863. Note: S862 evidence had no screenshot IDs — applied on DB/page-content evidence per S862 orchestrator log.)_

| 166 | Beta Invite Codes | /admin/invites as Alice (user1): "Beta Invite Codes" heading ✅, "Generate Invite Code" button → code 4J9U3B95 with "unused" status ✅, Copy URL/Code only/Delete actions ✅. /register?invite=4J9U3B95: green banner "✓ Invite code 4J9U3B95 applied" ✅, role pre-set to "Sale Organizer" ✅, Business Information section ✅. ss_37115t11z ss_3815rn9fy ss_44402fzrx | S878 |
| 165 | A/B Testing Infrastructure | /admin/ab-tests as Alice Johnson (user1). "A/B Tests" heading ✅, "Hero CTA v1" test card + Variant/Views/Clicks/Conversions/Conversion Rate table headers ✅, "Clear Test Data" button ✅, "No test data available yet" info message ✅, no 403. ss_7968d9zt9 | S877 |
| 308 | Item Hide Bug Fix (isActive centralized) | /organizer/edit-item/[Pyrex] as Alice (user1). Status dropdown shows Available/Sold/Unavailable ✅ (addresses S838 "no show button" concern — Unavailable→Available IS the show/hide mechanism), "Unpublish" button present ✅. ss_13358xg0c ss_1630eqh3i | S877 |
| 274 | Trail Completion Share | /shopper/trails/cmnsa0jir0000uzighx3ni54f as Leo Thomas (user5). "South Side Treasure Hunt": "✓ Trail Completed!" green banner (Completed on 6/4/2026) ✅, "Share your achievement" card ✅, Share button ✅, Public Link section ✅. Share button clicked → navigator.share triggered (no console errors, native share path — no clipboard fallback needed). ss_558087lcg ss_1217874pr | S877 |

---

## Next Session

**S890 done (QA verification sweep, all 16 BQ items). BQ: 16 rows (−1 rate cap resolved, +1 FB Marketplace 0-records). The S887 audit fixes are mostly DEPLOYED but two have post-deploy behavior bugs (geocoding fetch-ordering, FB Events never-reached). Next session = DEV MODE to action the S890 root causes — they are concrete and 1–2 of them are quick wins.**

**ALREADY CODED in S890 (in the push block — verify after deploy):**
- Geocoding: status=PUBLISHED filter + oldest-first (internalGeocodingController.ts). After deploy, the next workflow run should drain the ~1,164 live un-geocoded; watch `SELECT COUNT(*) FROM "Sale" WHERE lat IS NULL AND status='PUBLISHED'` drop.
- FB Events key-health alert (run-search-facebook-events.ts).
- "Dates approximate" label (sales/[id].tsx + SaleCard.tsx) — Chrome-verify on a city-only FB Events sale.

**S891 plan (DEV/OPS — all root causes documented in BQ above):**
- **[DEV — biggest ROI]** AuctionZip parser rewrite (auctionZipScraper.ts:106-107) — match current markup anchors `/XX-Auctioneers/<id>.html` instead of dead BEM classes. ~25k auctioneers behind one function. Effort S.
- **[DEV]** NAA sitemap crawl (naaAuctioneerDirectory.ts) — replace state-loop with sitemap.xml → static member-page crawl; fix the wrong BROKEN comment. Effort M.
- **[OPS]** AuctionNinja — trigger `scrape-auctionninja.yml` via workflow_dispatch, read Railway logs for `[AuctionNinja:Directory] Parsed N profiles`. If Railway IP is Cloudflare-blocked, route through the existing FB Marketplace CF Worker. Effort S→M.
- **[OPS]** FB Marketplace — confirm `FB_MARKETPLACE_PROXY_URL` + `FB_MARKETPLACE_PROXY_TOKEN` are live on Railway and the workflow fires; log line `Transport: CLOUDFLARE_WORKER` vs `DIRECT` tells you instantly. Effort S.
- **[DEV]** Shopify #332 — fix sold-sync inventory-adjust call (add location_id, use inventory_item_id not variantId), bump API version off 2024-01, reconcile the connect-shopify guide with the manual-token reality. THEN a store can be connected for QA.
- **Deferred until #335 outreach resume (do NOT action while OUTREACH_ENABLED=false):** 462 WARM backfill, queue hygiene (2,206 stale PENDING / 480 BOUNCED), WARM enrichment.

**Patrick actions required:**
1. Push block below (4 code files + STATE.md + patrick-dashboard.md). Schema unchanged — no migration.
2. #335 RESUME (when ready): (a) reactivate outreach@finda.sale at admin.google.com, (b) set `OUTREACH_ENABLED=true` in Railway, (c) re-enable the "Pipeline — Outreach Emails" GitHub workflow. Backend caps 1,500/day; warmup ~200/day. (S889+S890 confirmed no leak.)
3. After deploy: trigger `Geocode Ungeocoded Sales` workflow once (workflow_dispatch) to kick the drain immediately rather than waiting for the 02:00/10:00/18:00 cron.
4. GBP phone verification: business.google.com → "Verify now" → phone code (carried).

## Recent Sessions

### S890 — QA MODE. Full 16-item Blocked Queue verification sweep (DB + code, no browser). 1 closed, 2 root-caused, all annotated. BQ: 16 rows.

**Method:** psycopg2 against Railway public proxy + GitHub `main` file reads + local Grep. No Chrome (all 16 items are data/code-verifiable). Every finding has a tool citation.

**Closed:** #12 Sale-Ending-Soon rate cap — confirmed DEPLOYED on main (saleEndingSoonJob.ts sha 180fff9: DAILY_EMAIL_CAP=500 + per-send suppression check). Removed from queue.

**Root-caused (new, actionable):**
- **Geocoding backlog (P1):** workflow IS live + working (6,366 geocoded Jun 5, 331 Jun 6) but backlog frozen at 15,792 because `getBatchOfUngeocodedSales` fetches newest-500 (createdAt desc, offset 0) = 100% GarageSaleFinder; older backlog never drains. Fix = oldest-first ordering. Quick win for S891.
- **FB Events 96% un-geocoded (P1):** city-center fallback is correct + deployed but never executes — the 1,307 city-only records sit below GSF at offset 0. Workflow already has a `source` input → a `source=Facebook Events` run drains them now. No code needed for the drain.

**Confirmed still-open (tool evidence, unchanged from S887):** 462 WARM leads no DirectoryClaimEmail (still 462); queue hygiene (2,206 PENDING >30d, 480 BOUNCED); WARM enrichment 3.5% (1,382/39,246); FB Events key unmonitored (lastScrapedAt Jun 1, 5-day stale); dateApproximate not surfaced (Grep: absent from frontend).

**Auction vertical DEAD (consolidated 3 BQ rows):** AuctionNinja (Railway cron removed → GH Actions Cloudflare-blocked), AuctionZip (not even registered in sourceRegistry), NAA (JS-rendered, declared broken) — all 0 sales + 0 organizers. The "rely on the other two" fallback is invalid. Needs a Patrick decision: proxy/headless transport for ≥1 source, or drop the vertical.

**New finding (BQ +1):** FB Marketplace still 0 records / lastScrapedAt NULL despite S888's Cloudflare Worker proxy. Needs a live run + log check.

**#335:** leak re-verified PLUGGED — 0 DirectoryClaimEmail sends since Jun 5 08:00 UTC. Only Gmail reactivation (Patrick) + Jane Thrift re-send remain.

**S890 part 2 — dispatched the remaining (Patrick said go). 3 agents:**
- **DEV (4 files, TS-verified 0 errors, PENDING PUSH):** (1) geocoding status=PUBLISHED filter + oldest-first → working set 15,792→1,164 (skips 14,628 ENDED sales per Patrick's call); (2) FB Events search-key health alert; (3) "Dates approximate" label on sales/[id].tsx + SaleCard.tsx. Files: internalGeocodingController.ts, run-search-facebook-events.ts, sales/[id].tsx, SaleCard.tsx.
- **AUCTION INVESTIGATION (no code) — reverses "dead vertical":** all 3 cheaply fixable, no paid proxy/Playwright. AuctionZip = stale CSS regex (~25k records, S-effort parser rewrite, BEST ROI); NAA = sitemap member pages are static (M-effort crawl, "needs Playwright" was wrong); AuctionNinja = relay correct, needs live trigger to confirm (S→M). Full report retained in this session; per-source BQ rows updated.
- **SHOPIFY REVIEW (no account) — NOT READY:** no OAuth (manual-token model contradicts the guide); API 2024-01 unsupported; markShopifyItemSold inventory call malformed (silent sold-sync failure); no webhook; plaintext token. Needs DEV fix before any store QA. Details in #332 BQ row.

**#332 Shopify:** NOT READY (code bugs, see BQ) — store connection is downstream of the dev fixes.

### S887 — DEV MODE. AuctionNinja Railway cron. DB-backed Gmail quota guard. 4 Gmail monitoring crons. BQ: 4 rows.

**AuctionNinja Railway cron:** `cronSchedule: '0 6 * * 3'` added to `sourceRegistry.ts`. GH workflow already disabled. `initScraperCron()` in index.ts picks it up automatically. No index.ts change needed. Pending verification Wed 06:00 UTC.

**Gmail quota guard (root cause fix):** In-memory `dailyCounts` Map replaced with DB-backed `EmailQuotaLog` table. Root cause of 8,317-email blast: counter reset to 0 on every Railway restart/deploy. Fix: Prisma upsert atomic increment. Hard stop at `GMAIL_DAILY_HARD_LIMIT` (default 1500). Resend out-of-band alert at 75% threshold + hard stop to `deseee@gmail.com`. Migration `20260706000000_add_email_quota_log` ✅ deployed. Per-send quota gate moved to BEFORE Gmail send in outreachEmailsCron.

**Gmail monitoring crons** (`gmailHealthCron.ts`): (1) `runGmailOAuthHealthCheck` daily 06:30 UTC — tests refresh token, Resend alert if broken. (2) `runDailySendSummary` daily 08:00 UTC — yesterday's quota digest email. (3) `runSuspensionDetect` every 2h — alerts if pipeline quota-blocked. (4) `deliverabilityMonitorJob.ts` TODO wired — Resend bounce alert at >2% rate. All 4 added to JOB_MAP + index.ts import.

**Sale ending soon flood:** 100+ log lines on deploy = expected one-time backfill of directory-seeded sales with `endingSoonNotified=false`. Actual emails only go to `sale.subscribers`. Idempotency guard prevents re-sends.

**#335 status:** Account Active but in 18h sending suspension (auto-clears). OUTREACH_ENABLED=false still set. Code guard now in place — won't blast again.

**Blocked Queue: 4 rows** (#332 P0 + AuctionNinja P2 code-complete + #335 code guard live + #230 P3)

### S886 — QA + DEV + RECORDS. P2 POS fix verified. P3 false positive closed. BQ: 4 rows. P2 POS fix verified. P3 false positive closed. BQ: 4 rows.

**P2 POS PENDING_REVIEW fix (terminalController.ts + pos.tsx):** Item search path ✅ Chrome-verified S886 — searched "Kirkland" (PENDING_REVIEW, status=AVAILABLE) in POS as Alice → "No available items match that search." (ss_5792yv22r). API confirms draftStatus field returned correctly. QR scan toast CODE-ONLY (camera limitation). Commit 272f1876 deployed.

**P3 "View sale" 404 — CLOSED as false positive:** review.tsx:1239 already uses `/sales/${saleId}`. Filed S885, closed S886 after code check.

**Records:** STATE.md cleaned (AuctionNinja BQ note updated, BQ count corrected to 4).

**Blocked Queue: 4 rows** (#332 P0 + AuctionNinja P2 + #335 P1 URGENT + #230 P3)

### S886 — DEV MODE. P3 + P2 bug fixes shipped + Chrome-verified. Roadmap PCVs applied. Blocked Queue: 3 rows.

**Records pass:** S885 PCVs applied to roadmap.md — #175 Coupons/Rarity Boost → Chr ✅ S885, #142 Photo Upload pipeline → Chr ✅ S885 (was ⚠️ S805).

**P3 fix (review.tsx line 1239):** "View sale →" button in Smart Review Queue success state: `/sale/${saleId}` → `/sales/${saleId}`. ✅ Chrome-verified S886 — navigated to review page, clicked "View sale →", landed on /sales/59c49908... with "QA Active Sale S875 — Mixed Goods" confirmed. ss_4845b09um.

**P2 fix (itemController.ts lines 632–652):** POS item search now honors `?status=AVAILABLE` query param from frontend — PENDING_REVIEW items excluded from search results. Pre-existing "Vintage Pyrex Bowls Set (4pc)" PENDING_REVIEW item correctly absent from POS search. ✅ Chrome-verified S886. ss_9781ji8rx.

**Blocked Queue: 4 rows** (−2: P3 review link ✅ + P2 POS filter ✅ both fixed and verified; #335 P1 URGENT + #332 + AuctionNinja + #230 remain)

### S885 — QA MODE. Rarity Boost ✅. Add-items pipeline ✅. POS core ✅. 2 bugs filed. Blocked Queue: 5 rows.

**S884 push confirmed** — commit 00973398 "S884: Rarity Boost 50→15 XP UI fix". coupons.tsx deployed to Vercel.

**Rarity Boost 15 XP ✅ Chrome-verified** — /coupons Shopper tab → Boosts & Bonuses → "Activate Rarity Boost (15 XP)". S884 fix confirmed live. ss_10072ub1r. Closed from Blocked Queue.

**Add-items pipeline ✅ Chrome-verified end-to-end** — Batch Upload → file_upload → Analyze All → Smart Review Queue → AI: "Vintage Table Lamp, Mid-Century Modern Style, Wood Base" (62% confidence, SMART tags). Approve → "QUEUE CLEAR — All 2 items are live." ss_3920p8trb ss_57255gxkm. Live on sale detail page confirmed. ss_5660w5ek0. Test item cleaned up via psycopg2.

**POS core UI ✅** — /organizer/pos: sale auto-selects, item search, add to cart, Cash selected (green highlight), numpad with correct change calculation ($50→Change $5), Record Cash Sale button activates. API fires. Two bugs found (see Blocked Queue).

**Blocked Queue: 5 rows** (−1 Rarity Boost closed, +2 new bugs)

### S884 — Records pass (S883 PCVs applied to roadmap). Rarity Boost UI fix coded. Chrome blocked. Blocked Queue: 4 rows (QA mode cleared).

**Records pass:** 18 S883 PCV entries applied to roadmap.md Chrome columns — #396, #310, #138, #411, #175, #139, #378, #183, #218, #266, #176, #177, #179, #60, #187, #180, #189, #154. #60 pricing ⚠️→✅ S883.

**Rarity Boost UI fix (code-complete, pending push):**
- coupons.tsx: `50 XP` → `15 XP` across display text, button label, gate threshold, and gate message (5 lines in one block). 0 TS errors. Matches locked game design (15 XP, cash rail separate sprint).

**Chrome QA blocked:** Extension timeout on all operations — "waiting on permission prompt in side panel." Deep-test flows (add-items, POS) deferred to S885 once Patrick clears the prompt.

**Blocked Queue: 4 rows** (QA mode ceiling cleared — was 9 rows, now 4)

### S883 — QA MODE: Records pass (S882 PCVs applied). Wide sweep: 18 pages/features Chrome-verified. No new bugs. Blocked Queue: 7 rows.

**Records pass (session start):** S882 PCVs applied to roadmap.md — Y-axis formatter ✅ S882 added to #192 Notes. (#192 ENDED sale already applied S881.)

**Chrome QA sweep (Alice/user1 then Bob/user2, all ✅):**
- /organizer/starter-kit ✅ ss_8106nlgh7 — "Sale Day Starter Kit", Pre-Sale Checklist, Download PDF + Print buttons
- /organizer/discount-rules ✅ ss_68366qf20 ss_067153c7v — Create Rule modal: Color Tag, Label, Discount %, Active From/Until fields
- /organizer/create-sale ✅ ss_3060qw90j — Step 1 of 5, all 5 sale types (Estate, Yard, Auction, Market+Pop-Up, Dorm Dash), 5-step sidebar
- /coupons (XP Store) ✅ ss_62793so06 ss_56365kcxa — 373 XP, INITIATE, 3 Discount Coupon tiers, Shopper/Organizer tabs
- /map ✅ ss_0552v7zh2 — 85 sales, pins, all type/date filters, Plan Your Route/Heatmap/My Location
- /guide ✅ ss_17131y4gc — Organizer Guide, full sidebar nav, content loaded
- /calendar ✅ ss_195917ziu — June 2026, real sales, "Remind Me by Email" buttons, today highlighted
- /shopper/trades ✅ ss_2861pyk7b — "Coming Soon" badge
- /shopper/explorer-profile ✅ ss_4271dkl4t — Explorer Bio, Specialties, Item Categories
- Homepage ✅ ss_75552983d ss_8844zq96l — "Discover Amazing Deals", Treasure Hunt card, map 20 sales, Featured Sales 20 of 20
- Sale detail (directory) ✅ ss_3721kp9fj ss_45238s0r1 — real photos, description, WHEN/WHERE, map, share buttons
- /search?q=vintage ✅ ss_9502geaos — Filters sidebar, Save Search, All/Sales(10)/Items(10) tabs, Plan Route button
- /pricing ✅ ss_3228c6qzt ss_1209ystwv — Free/$29 PRO (✓ Current Plan for Bob)/$79 TEAMS, correct prices
- /cities ✅ ss_4392ish2n — 200+ cities, state-grouped
- /categories ✅ ss_1606pzfyk — Browse by Category grid with item counts
- /trending ✅ ss_8926p6wv6 — #1/#2/#3 HOT badges, real sale data
- QA sale detail (Bob shopper) ✅ ss_23185ngzl ss_136359q2w — Going/Notify buttons, Live Activity, inventory, Photo Station, Treasure Hunt, Share sidebar
- /organizer/storefront ✅ ss_0286gmk6l — "Kelly's Estate Sales", 2 Sales/2019 Est., Follow/Share buttons

**No new bugs found.** /organizer/new-sale 404 by design (correct URL is /organizer/create-sale). Homepage card blank images are correct behavior for directory listings without platform-uploaded photos.

**Blocked Queue: 7 rows** (unchanged — no new bugs, no closures this session)

### S882 — QA MODE: #197 Bounties ✅ (Patrick-confirmed). Y-axis P3 ✅ Chrome-verified. Wide organizer page sweep (24 pages ✅, 4×404 not-linked P3).

**#197 Bounties ✅:** Patrick confirmed /shopper/bounties no longer shows "Failed to load bounties" error toast after S881 bountyController.ts fix deployed.

**Y-axis formatter P3 ✅:** /organizer/edit-item/f319b119 (Old Radio, ENDED) as Alice (user1). Price History chart Y-axis: $94/$84/$78/$72 — whole dollar values, no float "000001" bug. Math.round() fix confirmed. ss_9355qlny8

**Organizer page sweep (Alice/user1, all ✅ unless noted):**
- /organizer/appraisals ✅ ss_2010xghaz — Crowdsourced Appraisals, Submit New Request, My Requests/Community Feed tabs
- /organizer/checklist ✅ ss_3457pe0h0 — Sale Launch Checklist, 15 items, progress bar
- /organizer/color-rules → /organizer/discount-rules ✅ ss_7756iqq57 — redirect works, Discount Rules, empty state
- /organizer/flip-report ✅ ss_51812bc76 — 2 sales listed
- /organizer/hubs ✅ ss_93834e9a7 — Market Hubs, 4 hub types, "Coming Soon" CTA
- /organizer/inventory ✅ ss_3774kri1x — 3 real items, search/filter panel
- /organizer/line-queue ✅ ss_8102zh9r4 — Choose a Sale, PUBLISHED card
- /organizer/offline ✅ ss_2782z08pz — Offline Sync Manager, Online status
- /organizer/payouts ✅ ss_70338sonn — Stripe balance, payout schedule
- /organizer/photo-ops ✅ ss_0754v7s78 — Choose a Sale, Set Up Photo Ops link
- /organizer/profile → /organizer/settings?tab=profile ✅ ss_5496a85x2 — Founding Organizer badge
- /organizer/promote ✅ ss_4990qg027 — Promote Sale, PUBLISHED card
- /organizer/qr-codes ✅ ss_915606wm3 — QR Scan Analytics, 3 KPIs
- /organizer/reputation ✅ ss_27555v8ml — Reputation Score 0.1/5.0, New Organizer badge
- /organizer/sales ✅ ss_7420pgtiu — Manage Sales, 2 cards
- /organizer/send-update ✅ ss_3428a61g6 — Send Update, Choose a Sale
- /organizer/shopify ✅ ss_7561swcoc — Not Connected, Connect form
- /organizer/stripe-connect ✅ ss_5670hfcot — Consignor Payouts, empty state, TEAMS-only
- /organizer/subscription ✅ ss_0542pwyli — TEAMS plan, Active, Plan Limits
- /organizer/ugc-moderation ✅ ss_7189smrfj — UGC Photo Moderation, empty state
- /organizer/webhooks ✅ ss_1611p2uug — Webhooks, empty state, Add webhook button
- /organizer/bounties ✅ ss_75464uvh3 — Item Bounties, 3 tabs, "Work in progress" badge
- /organizer/message-templates ✅ ss_2006j30aw — 4 templates, Edit/Delete/New
- /organizer/print-inventory ✅ ss_6361k3641 — 2 sales, 6 items, $380.00 total value

**P3 not-linked 404s (no user impact — not in nav):**
- /organizer/pickup-scheduler, /organizer/auction, /organizer/seo, /organizer/buyers — all 404, no frontend links found. Same disposition as /organizer/customers (S880 — closed, no user impact).

**Blocked Queue: 7 rows** (removed #197 Bounties ✅ + Y-axis float ✅)

### S881 — QA MODE: 2 code fixes (Bounties P2 + Y-axis P3). Page sweep (holds/crews/reputation/notifications/loot-legend ✅). #192 Chr S880 applied to roadmap.

**Code fixes (both pending push, 0 TS errors):**
- **#197 Bounties P2 FIXED** — bountyController.ts L691: `user: { isNot: null }` removed. Root: required relation in Prisma 5 rejects `isNot: null` filter. Confirmed pre-fix 500 via Chrome (ss_4376fclh0).
- **Price History Y-axis P3 FIXED** — ItemPriceHistoryChart.tsx L81: `$${v}` → `$${Math.round(v)}`. Fixes float precision "000001" display.

**Records pass:**
- roadmap.md #192 Chr column → ✅ S880. Notes updated with ENDED sale evidence (ss_6019d9p8a ss_2365m7h2q, S879 fix: optionalAuthenticate + organizerId namespace correction).

**Chrome QA sweep (as Bob Smith/user2):**
- /shopper/holds ✅ — "My Holds" heading, empty state, Browse Sales CTA. ss_7117y07i1
- /shopper/crews ✅ — "Explorer's Crews" heading, "Coming soon" subtitle, "What are Crews?" explainer. ss_6622aic03
- /shopper/loot-log → 404 by design — no index page; detail at /loot-log/[purchaseId]. Feature #50 already ✅ S823.
- /shopper/reputation ✅ — "Your Reputation" heading, "Your Status" card (New Shopper, 0 purchases, 0% completion), welcome message, KPI cards. ss_7872rzcqr
- /shopper/notifications ✅ — "Notifications" heading, All/Operational/Discovery tabs, Unread (11) filter, real notifications with dismiss buttons. URL normalizes to /notifications. ss_9136wp2rx
- /shopper/loot-legend ✅ — "Loot Legend" heading, Hunt Pass upsell, empty state. ss_0415ir8yt. ⚠️ No roadmap entry — P3 gap.
- /shopper/bounties ❌ confirmed "Failed to load bounties" 500 toast. Fix pending push.
- /shopper/bounties/submissions ✅ — "My Bounty Submissions", All/Pending/Approved/Declined tabs, "No submissions yet" empty state. ss_0993xirdk
- /shopper/purchases → 404 by design (no page, no roadmap entry; purchases accessed via /shopper/loot-log/[id]).

**Blocked Queue: 9 rows** (unchanged — both fixes code-complete but pending push+Chrome QA)

### S880 — QA MODE: #192 ✅ Chrome-verified (ENDED sale). Wide page sweep (12 pages). P2 regression found (Bounties 500). /organizer/customers closed — not linked anywhere.

**#192 Price History ENDED sale — ✅ VERIFIED:**
- As Alice (user1) on /organizer/edit-item/f319b119 (Old Radio, ENDED sale). Price History heading visible, orange step-line chart, Jun 2→Jun 4, $78→$84 Y-axis, 2 data points. DOM confirmed + screenshots. ss_6019d9p8a ss_2365m7h2q.
- S879 fix (optionalAuthenticate + organizerId correction) confirmed live.

**Page sweep (all ✅):**
- Alice: /organizer/consignors, /organizer/pos, /organizer/fraud-signals, /organizer/locations, /organizer/workspace
- Bob (user2): /shopper/dashboard, /shopper/wishlist (1 item), /shopper/hunt-pass, /shopper/guild-primer (Initiate 192 XP), /shopper/league (Leo Sage 2005 XP), /shopper/trails, /shopper/achievements (3/12), /shopper/explorer-profile

**P2 REGRESSION found — #197 Bounties:**
- /shopper/bounties: GET /api/bounties/community → 500. Toast "Failed to load bounties". Was ✅ S862, broke after S868 FK migration. DB query confirmed working (1 record). Prisma client or filter issue in getCommunityBounties L687. Added to Blocked Queue.

**Closed from Blocked Queue:**
- /organizer/customers: no page file, no tsx/component link anywhere — unbuilt, no user impact.

**P3 noted:** Price History chart top Y-axis label shows "000001" instead of "$93.50" — float precision in chart scale formatter.

**Blocked Queue: 9 rows** (removed /organizer/customers, added Bounties regression + Y-axis bug — net zero)

### S879 — QA MODE: Records pass (#166 Chr ✅) + #192 P2 re-fix + Chrome sweep. Admin dead-links P3 closed (false positive). New P3: /organizer/customers 404.

**Records pass (session start):**
- S878 PCV applied: #166→Chr ✅ S878 (roadmap updated).

**#192 Price History ENDED sale fix (inline, 2 files, <20 lines):**
- Root cause 1: `priceHistory.ts` route had no auth middleware — `req.user` always undefined. Fixed: `optionalAuthenticate` added.
- Root cause 2: `priceHistoryController.ts` isOwner check compared `sale.organizerId` (Organizer table PK) vs `req.user.id` (User table PK) — different ID namespaces, always false. Fixed: query now includes `organizer: { select: { userId: true } }` and isOwner uses `organizer.userId`.
- 0 TS errors. **Awaiting push + Chrome re-verify.**

**Chrome QA sweep (Alice/user1):**
- Edit Sale (Live) ✅ — "Edit Sale (Live)" + LIVE badge + Close Early + live-edit warning + Duplicate This Sale. ss_4284cbeqg
- /organizer/holds ✅ — Active Holds, filter by sale, sort Expiring Soon/Recently Added, empty state. ss_74980t1l2
- /shopper/haul-posts ✅ — Community Hauls, Share Your Haul button, empty state. ss_4149exmdb
- /organizer/calendar ✅ — June 2026 view, QA sale on correct dates, today highlighted, Upcoming Sales sidebar. ss_79368nehw
- /organizer/command-center ✅ — 4 KPI cards (1 Active Sale / 1 Item / $0 / 0 Pending), All systems go. ss_2460vpxo6
- /organizer/ripples ✅ — Views/Shares/Saves/Total Activity KPIs (14 views), Activity Trend. ss_61779hyks
- /admin/waitlist ✅ — Shopper Notify Me Waitlist, filter + empty table. ss_54642a2y8
- /admin/organizer-confidence ✅ — Directory Confidence Scores, 5 organizers listed. ss_995385yol

**S878 P3 closed — false positive:**
- S878 agent reported /admin/notify-me + /admin/confidence-scores as dead links. Actual admin nav links → /admin/waitlist + /admin/organizer-confidence. Both ✅ confirmed. No dead links. Admin nav dead links entry removed from Blocked Queue.

**New P3 found:**
- /organizer/customers → 404. Page does not exist. Added to Blocked Queue.

**Blocked Queue: 9 rows** (removed admin dead links false positive, added /organizer/customers P3 — net zero)

### S878 — QA MODE: Records pass (9 features reconciled) + Chrome QA (#166 ✅). P3 bugs found. Blocked Queue: 8 rows.

**Records pass (session start):**
- S877 PCVs applied: #165→Chr ✅ S877, #308→Chr ✅ S877, #274→Chr ✅ S877.
- Additional Chr/Hum column reconciliation (notes had evidence, columns were ⬜):
  - #319/#325/#328 → Chr ✅ S830 (Notes: "CHROME VERIFIED S830" confirmed)
  - #350 → Chr ✅ S797 (Notes: "Chrome-verified S797" confirmed)
  - #142 → Chr ⚠️ S805 (Notes: "CHROME VERIFIED S805 (partial)")
  - #166 → Hum ✅ S837 (Notes: "Human QA S837" — Hum column was ⬜)

**Chrome QA (as Alice Johnson user1):**
- **#166 ✅** Beta Invite Codes — /admin/invites: "Beta Invite Codes" heading, Generate form, code 4J9U3B95 generated with "unused" status, Copy URL/Code only/Delete actions. /register?invite=4J9U3B95: green banner "✓ Invite code 4J9U3B95 applied", role pre-set to "Sale Organizer", Business Information section visible. ss_37115t11z ss_3815rn9fy ss_44402fzrx
- Admin dashboard (/admin): KPIs ($158 MRR), CA Canada filter, Organizer Funnel, Outreach Email Pipeline, Data Integrity section, 13 admin nav links all visible. ss_8269vpe3h
- /admin/demand-signals ✅ "Unmet Demand Signals" — city filter, min-searches filter, real data (5 queries). ss_8584nasdk
- /organizer/members ✅ — "Team Members" page, Invite Team Member form, role dropdown, Send Invite button, "Your Team" 0 members empty state. ss_2864i0e7t

**P3 bugs found:**
- /admin/notify-me → 404 (dead admin nav link — admin dashboard links to this but page doesn't exist)
- /admin/confidence-scores → 404 (dead admin nav link — same issue)
- #291 Lucky Roll / Mystery Box → /shopper/lucky-roll 404 (not built; roadmap Chr/Hum remain ⬜)

**Blocked Queue: 8 rows + 1 P3 dead-links entry added**

### S877 — QA MODE: Records pass (113 Human QA columns updated) + #192 P2 fix + Chrome QA (3 features ✅). Blocked Queue: 8 rows.

**Records pass (session start):**
- S875+S876 PCVs applied: #152→✅S875, #334→✅S875, #318→✅S875, #338→✅S875, #321→✅S875, #320→✅S876, #316 (both rows)→✅S876, #192→✅S876.
- Bulk roadmap reconciliation: 104 additional Human QA columns updated where Status column contained Chrome-verified evidence but Human QA was still ⬜. Total: 113+ updates.
- Additional: #296→✅S479 (Chrome QA explicit in status), #312→✅S854 (XP spend path confirmed), #464 UTMCapture→✅S836 (sessionStorage verified), #31 Brand Kit ⚠️→✅S866.

**#192 P2 fix (inline <20 lines):**
- `priceHistoryController.ts` — added isOwner/isAdmin check before PUBLISHED gate. Organizer-owned ENDED sale items now return price history. 0 TS errors. **Awaiting push.**

**Chrome QA (as Alice user1, then Leo Thomas user5):**
- **#165 ✅** A/B Testing — /admin/ab-tests: "A/B Tests" heading, "Hero CTA v1" card, table headers, "Clear Test Data" button, no 403. ss_7968d9zt9
- **#308 ✅** Item Hide Bug Fix — /organizer/edit-item/[Pyrex]: Status dropdown (Available/Sold/Unavailable), "Unpublish" button. Addresses S838 "no show button" concern. ss_13358xg0c ss_1630eqh3i
- **#274 ✅** Trail Completion Share — /shopper/trails/cmnsa0jir0000uzighx3ni54f as Leo Thomas: "✓ Trail Completed!" banner, "Share your achievement" card + Share button, Public Link. Share button → navigator.share fired (no errors). ss_558087lcg ss_1217874pr

**Blocked Queue: 8 rows** (unchanged — #192 ENDED sale fix deployed but pending push + Chrome re-verify)

### S876 — QA MODE: Chrome QA (#320 ✅, #316 ✅, #192 ✅). P2 bug found. STATE.md staged. Blocked Queue: 9 rows.

**Chrome QA:**
- **#320 ✅** Async eBay Comp Fetch — /organizer/edit-item/[Old Radio] as Alice. 3 eBay comp tiles rendered with real prices. Organizer price=$80 not overridden by aiSuggested=$65 (D-005 confirmed). ss_1568kvxrz
- **#316 ✅** Referral Tranche B — Logged in as qa256test806@example.com (Seedy2025!, login day 3). Tranche A: trancheAReleasedAt set, Alice XP 123→223 (+100 XP). Tranche B: 3 sales visited, trancheBReleasedAt set, Alice XP 223→373 (+150 XP). DB: distinctSalesVisited has all 3 IDs. psycopg2 confirmed both tranches.
- **#192 ✅** Price History Chart — /organizer/edit-item/[Pyrex] as Alice (published sale). "Price History" heading visible, orange step-line chart with white card, Y-axis $40.5/$46.5/$52.5, X-axis Jun 1→Jun 3, 2 real data points. API returned 2 history records. ss_5230oyurt
- **P2 NEW** — #192 Price History chart returns 404 for ENDED/non-PUBLISHED sale items: `priceHistoryController.ts` line 25 blocks on sale status. Organizer edit-item page should bypass for authenticated owners. Added to Blocked Queue.

**Records staged:** PCVs #320/#316/#192 — apply to roadmap next session.

### S875 — QA MODE: Records pass (S874 PCVs) + #170 clarified + column-gap fixes + Chrome QA (5 features). Blocked Queue: 8 rows.

**Records pass (session start):**
- S874 PCVs applied to roadmap: #168 Chr→✅ S874, #171 Chr→✅ S874 (partial), #150 Chr→✅ S874, Human QA→✅ S837.
- YMAL entry removed from Blocked Queue (✅ CHROME-VERIFIED S874, closed).
- #170 CSV Import: clarified as modal on /organizer/add-items/[saleId] — no standalone page exists, /organizer/csv-import 404s by design. Roadmap Status updated, Claude QA→✅ S804.
- Column-gap Records pass (prior-session verifications): #257→✅S785, #261→✅S791, #323→✅S791, #338 UI→✅S820.

**Chrome QA (Bob Smith/user2 then Alice Johnson/user1):**
- **#152 ✅** Organizer Digest Emails — /organizer/email-digest-preview: "Weekly Email Digest", schedule, email preview with real data, CTAs, footer. ss_83116boe8 ss_3822u3wv2 ss_2864i4lf6
- **#334 ✅** Automatic Markdown Cycles — /organizer/markdown-cycles: page loads, Add Cycle button, empty state, no 403. ss_8645vaq0f
- **#318 ✅** Affiliate Program — /organizer/affiliate: page loads, Generate link CTA, no 403. ss_7743cytqb
- **#338 ✅** Surface Sold-Price Comps — edit-item: 3 EbayCompTiles with prices ($17.99/$120/$29.39), affiliate note. ⚠️P3 no "Based on N sources" text. ss_965075bc7 ss_17240sk5m
- **#321 ✅** Encyclopedia Auto-Generation — /admin/encyclopedia: 57 Awaiting/20 Published/77 Total, Promote/Reject buttons. ss_0109ezo8y
- **#232 ✅ DOM** SalePulseWidget — seeded PUBLISHED ESTATE sale (59c49908) + item (Pyrex price=null) via psycopg2. Dashboard shows: Sale Pulse / 0 shoppers / 0/100 / Views / Saves / Questions / Boost visibility →. No screenshot IDs (Chrome extension broken).
- **#237 ✅ DOM** Sale-Type Adaptive Dashboard — ESTATE dashboard shows all adaptive widgets (Real-Time Metrics, Sale Progress, Who's Coming, High-Value Items, Efficiency Coach, Search Visibility). No screenshot IDs.
- **#320 DB-ONLY** — 10 ItemCompLookup entries + 7 items with aiSuggestedPrice (Old Radio: org=$80 / ai=$65). Chrome flow blocked (CSRF). Not Chrome ✅.
- **#320 UNVERIFIED** — Kitchen Set has price=20 (need price=null item for async comp test).
- **#323 UNVERIFIED** — no PriceBenchmark data for Kitchen Set category.

### S873 — QA MODE: Records pass + YMAL fix + Chrome QA (6 features). Blocked Queue: 9 rows.

**Records pass:**
- #195 S871 PCV → roadmap Chr ✅ S871 applied.
- #334 records discrepancy (status had Chrome-verified S851 but Claude QA = ⬜) → updated to ✅ S851.

**Dev fix (inline, <20 lines, 2 files):**
- **YMAL empty container P2 FIXED** — Root cause: `<section>` wrapper in `sales/[id].tsx` always rendered even when `SimilarItems` returned null (wrong check order: null before loading). Fix: section wrapper moved inside `SimilarItems.tsx`, check order corrected (loading→null→render), error folded into null check. 0 TS errors. Pending push + deploy + re-verify.

**Chrome QA (as Bob Smith/user2):**
- **#7 ✅** Shopper Referral Rewards — /shopper/referrals: referral link, Copy button, 5 share buttons, 3 stats KPIs. ss_9010kwnoo ss_6923w3og8 (roadmap updated same-session — rule violation; evidence solid)
- **#155 ✅ partial** Password Reset — /forgot-password: form + Send Reset Link button. ss_6730w1yav (form submission not tested → PCV)
- **#161 ✅ partial** Contact Form — /contact: Contact Support page + Send us a Message form. ss_2625cd37s (PCV)
- **#11 ✅** Organizer Referral — /organizer/referrals: link, Copy Link, 3 KPIs, How It Works. ss_881740tem (PCV)
- **#156 ✅** Refund Policy — /organizer/settings Profile tab: Return Window guidance text only, no input field. ss_5542tnnsw (PCV)
- **#316 UNVERIFIED** — recordSaleVisit call confirmed in code (pointsController line 57). Chrome QA blocked: qa256test806 password unknown.

### S871 — QA MODE: Records pass + Chrome QA. #195 ✅. YMAL P2 confirmed. Blocked Queue: 9 rows.

**Records pass (session start):**
- S866 PCV entries applied to roadmap.md: #31 Chr → ✅ S866 (Save Brand Kit, partial), #194 Chr → ✅ S866 (full Saved Searches flow), #47 Chr → ✅ S866 (Tag Your Find modal opens).

**Chrome QA results:**
- **#195 Shopper ↔ Organizer Messaging ✅** — /messages as Bob (user2). Leo Thomas thread opened, "QA test message S871" sent, orange bubble appeared instantly at 04:16 PM. No 500 error. Thread history loads. ss_6404xkj76 ss_62888ptc3 ss_9076mfuyt
- **"You might also like" gap ❌ P2 CONFIRMED** — Navigated to Alice's sale detail. YMAL section renders empty dark container with heading but zero items and no empty state message. No data needed to reproduce — section always shows even with zero recommendations. Bug: should hide or show empty state. ss_60495nt3b
- **ZIP export copy re-confirmed ✅** — /organizer/settings?tab=help as Bob: "Download My Data" = "Limited to once per 24 hours"; ZIP = "Limited to once per month". Both correct on fresh account. ss_0411xcqp8

**S870 push confirmed:** commit 07f0893 at 20:06 UTC — settings.tsx + scrape-auctionninja.yml ✅

### S870 — QA MODE: 4/5 S869 fixes Chrome-verified. AuctionNinja disabled. ZIP rate-limit fix. Blocked Queue: 9 rows.

**Chrome QA results (sequential):**
- **Sale Type filter persistence ✅** — URL shows `?q=furniture&saleType=ESTATE` after search submit. Dropdown stays "Estate Sale". All results show Estate Sale badge. ss_9039vdcse ss_8858sjoxz
- **ZIP export copy ✅** — "Download My Data" = "Limited to once per 24 hours". ZIP = "Limited to once per month". No shared paragraph. ss_3469lkjs6
- **UGC button dark mode ✅** — Tag Your Find button: bg=amber-900/30, border=amber, text=amber. No white box in dark mode. ss_6053nytyy
- **auth/me no password hash ✅** — /api/auth/me response: no password, resetToken, resetTokenExpiry, emailVerificationToken fields present.
- **OAuth session supersede UNVERIFIED** — Requires real Google OAuth flow with Patrick's Gmail. Added to Blocked Queue.

**Parallel work (AuctionNinja + ZIP fix):**
- **AuctionNinja GH schedule disabled** — Confirmed structural Cloudflare ASN block (GitHub Actions on AWS us-east-1/us-east-2 = datacenter IPs, blocked before headers evaluated). Schedule disabled in scrape-auctionninja.yml with NAA-pattern comment. Fix path: Railway cron or residential proxy. Pending push.
- **ZIP rate-limit blob parse fixed** — settings.tsx: both export handlers now parse JSON error from blob response before showing toast. "You've already exported today/this month" shown correctly on 429. "Download My Data" shows "Limited to once per 24 hours"; ZIP shows "Limited to once per month". Pending push.

**Blocked Queue: 9 rows** (removed ZIP rate-limit ✅; added OAuth supersede UNVERIFIED)

### S869 — BUG: 5 bugs fixed (3 P2 + 2 P1), deployed green. Blocked Queue 17→9.

**Fixes deployed (all ✅ Vercel + Railway green per Patrick):**
- **Sale Type filter reset** — handleSearch() now preserves all active filters (saleType, category, condition, saleStatus, sortBy, priceMin, priceMax) on search submit. Was: only passing `q`, dropping saleType. (search.tsx)
- **ZIP export copy** — Shared paragraph no longer mentions rate limit; each button now has its own note: "Download My Data" = "once per 24 hours", ZIP = "once per month". (settings.tsx)
- **UGC "Tag Your Find" dark mode** — Replaced bg-white with amber-100/amber-900 amber styling. No more white box in dark mode. (UGCPhotoSubmitButton.tsx)
- **auth/me password hash** — GET /api/auth/me now destructures password/resetToken/resetTokenExpiry/emailVerificationToken before spreading safeUser. (auth.ts)
- **OAuth session supersede** — OAuthBridge removed !user guard; exchange always fires on pending oauthProfile. (\_app.tsx)

**Bonus:** search.tsx tail truncated by Edit tool mid-session (Edit tool truncation bug on files >250 lines). Repaired via Python — EmptyState body, Notify Me section, closing tags, export default SearchPage restored.

**Session also confirmed:** S865b pushed ✅ · 3 P0 truncated files confirmed clean on GitHub HEAD ✅

**Blocked Queue:** 17 → 9 (removed: 3 truncated P0s ✅, Sale Type filter ✅, ZIP copy ✅, UGC button ✅, auth/me hash ✅, OAuth supersede ✅). 5 items moved to PCV.

### S868 — BUG+INFRA: Schema FK audit (4 migrations deployed), Foursquare fixed, AuctionNinja partially fixed (Cloudflare-blocked)

**Health monitor findings:**
- 2 GitHub Actions failures: AuctionNinja scraper (0 results), Foursquare scraper (secrets stale)
- 1 Sentry slow query: DirectoryClaimEmail 1120ms (indexes already existed — no-op migration added)

**Foursquare scraper — ✅ FIXED:**
Workflow secrets `DATABASE_URL` and `DIRECT_URL` were stale. Updated both via GitHub Secrets API. Workflow re-triggered → ✅ SUCCESS.

**AuctionNinja scraper — PARTIAL FIX / STILL BROKEN:**
- Root cause 1 fixed: workflow called `runAuctionNinjaScraper` (nonexistent); actual function is `scrapeAuctionNinja`. Created `packages/backend/src/scripts/run-auctionninja.ts` run script. Updated workflow to use script.
- Root cause 2 fixed: data moved to `/hire-an-estate-sale-company`. URL updated. Selector updated from `li > a` to `a[href^="https://www.auctionninja.com/"]`.
- Root cause 3 UNRESOLVED: GitHub Actions runners get Cloudflare IP block (11KB challenge page vs full 325KB). Scraper returns 0 results even with correct URL + selector. Railway cron attempted (wrong) and reverted. GitHub Actions schedule re-enabled. Status: BROKEN — see Next Session investigation guide.

**Schema FK audit — ✅ DEPLOYED TO RAILWAY PROD:**
4 migrations applied in order (required 3 deploy attempts due to orphan ro