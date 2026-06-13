### S860 — QA+Records+DEV: #316 Tranche B P1 bug found+fixed, notifications P2 fixed

**Records:**
- `claude_docs/strategy/roadmap.md`: #255 Claude QA ⬜→✅ S859 applied (cross-session from S859 PCV). #316 status updated (P1 bug found+fixed S860).
- `claude_docs/STATE.md`: PCV trimmed (#255 graduated). #316 re-verify row added to PCV.

**DEV (inline — <20 lines, 2 files):**
- `packages/frontend/pages/notifications.tsx` lines 322–323: `|| 999` → `?? 999` — Today group (value 0) was sorting to page bottom. 0 TS errors.
- `packages/backend/src/controllers/pointsController.ts`: added `import { referralTrancheService }` + fire-and-forget `recordSaleVisit()` call in `trackSaleVisit()`. Tranche B (150 XP / 3 sale visits) was fully implemented in the service but never wired to the controller — referred users' sale visits never counted. 0 TS errors.
- `packages/frontend/pages/register.tsx`: added green "Referral link applied" banner for `formData.referralCode` (mirrors existing inviteCode banner). Previously `?ref=` param was silently captured with no user feedback. 0 TS errors.

**QA smoke tests (DOM-verified, no new PCV entries — prior Chrome ✅ stands):**
- #467 Sold Item UX: amber banner ✅, SOLD stamp ✅, SimilarItemsGrid ✅, lightbox suppressed ✅, save button hidden ✅, dark mode ✅. No regression vs S817.
- #464 SEO Footer: Discover column (7 links) ✅, Explore dropdown ✅, /encyclopedia loads ✅ (ss_40922gfo2, ss_5917catz6).
- #237 Sale-Type Dashboard: loads without errors, no horizontal scroll ✅ (ss_7392t9kal). P3 incidental: "Learn about TEAMS" button clipped at ~1200px on upgrade card.

**QA #316 Referral Tranche B — ❌ FAIL → FIXED:**
- Chrome: registered qa-tranche-b-s860@test.com via /register?ref=REF-7CD8DCC0 (ss_8604lb5ug). Visited 3 published sales (ss_71195379l, ss_6851w4tv8, ss_0089nigg0).
- DB post-visit: `distinctSalesVisited: []` (empty), `trancheBReleasedAt: None`, user1 XP unchanged. Root cause: `referralTrancheService.recordSaleVisit()` never called from pointsController. Fix applied.
- P2 side finding: no visual confirmation when `?ref=` param sets referralCode. Fixed (register.tsx banner).
- Test data cleaned: qa-tranche-b-s860 deleted, user1 XP restored to 108.

**Blocked Queue: 8 rows (unchanged — P0s are Patrick-action items).**

### S859 — QA+Records: #255 Chrome-verified + notifications sort P2 bug found

**Records:**
- `claude_docs/strategy/roadmap.md`: #158 Human QA ⬜→✅ S858, #398 Claude QA ⬜→✅ S858, #259 Human QA ⬜→✅ S858, #290 Human QA ⬜→✅ S858. All applied via Python.
- `claude_docs/STATE.md`: PCV trimmed from 5→1 row (4 S858 rows graduated to roadmap).

**QA #255 Rank-Up Notifications ✅:**
- DB: Bob Smith (user2) XP set to 498, rank INITIATE.
- Navigated to /sales/cmpaujbx701r7wh48ssciws0z as Bob. Clicked "Going (0)" RSVP button → "✓ You're going (1)" confirmed.
- DB post-RSVP: guildXp=500, explorerRank=SCOUT. RANK_UP + RSVP_CONFIRMED notifications created.
- /notifications page: scrolled to bottom → TODAY section visible with "You've reached SCOUT! — Congratulations! You've advanced to SCOUT rank. Keep hunting!" (7m ago). ss_7469boc64.
- ⚠️ P2 BUG: Today group renders at BOTTOM of notification list (below This Week, Older). Root cause: `order['Today'] || 999` — `|| 999` treats 0 as falsy. Fix: `?? 999`. Dispatch findasale-dev.

**QA #230 Smart Buyer Widget: UNVERIFIED** — no published sale on any real test organizer (user1 has none, Artifact MI has none, all 10 published sales are scraper accounts).

**Test data cleaned:** Bob XP reset to 157/INITIATE, RSVP deleted, test notifications deleted.

**Blocked Queue: 6→8 rows** (notifications sort P2 bug + #230 Human QA blocker added).

---

### S858 — QA+DEV: Flash Deal dropdown fixed + 4 features Chrome-verified

**DEV — Flash Deal dropd

# Session Log Archive

Older session entries archived from STATE.md. Most recent entries at bottom.

---

### S783 — SEO Sprint: Sitemap Expansion + IndexNow + Schema.org Audit

**Trigger:** Patrick — sitemap count was 1,727 (Bing), fix it properly; items/sales/articles/neighborhoods all missing.

**Completed:**
- ✅ Homepage "Error Loading Sales" fix — `NEXT_PUBLIC_BACKEND_URL`/`NEXT_PUBLIC_API_URL` localhost fallback changed to `https://api.finda.sale`
- ✅ /creator/dashboard role guard — was rejecting ORGANIZER role (CREATOR doesn't exist in schema); fixed to allow ADMIN + ORGANIZER
- ✅ Admin creators/affiliate page — new `/admin/creators` page + backend controller querying users with AffiliateCode or AffiliateLinks; linked from admin index
- ✅ Guide pages in sitemap — slim `slugs.json` (500 slugs, 16KB) + `outputFileTracingIncludes` key fixed + `Cache-Control: max-age=0` header in vercel.json
- ✅ Sitemap: added `/categories/[category]` (10 hardcoded), `/encyclopedia/[slug]` (via API), `/items/[id]` (new backend endpoint)
- ✅ New `/api/items/sitemap` backend endpoint — returns all items from PUBLISHED sales, `id+updatedAt` only, 10k cap, no auth
- ✅ Washington DC slug fix — `.replace(/\./g, '')` strips dots from city slugs in `/api/sales/city-slugs`
- ✅ IndexNow integration — `indexNowService.ts` created; fires on sale DRAFT→PUBLISHED transition; POSTs sale URL + all item URLs to `https://api.indexnow.org/indexnow`; non-blocking fire-and-forget
- ✅ Key file live: `https://finda.sale/fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt`
- ✅ Schema.org audit: Product schema on items, JSON-LD on sale detail, HowTo/Article on guides — all already implemented and SSR-safe
- Sitemap count: 1,727 → 1,885 (+138 URLs; 110 items, 10 categories, ~18 encyclopedia)

**Files changed:** `pages/index.tsx` · `next.config.js` · `pages/creator/dashboard.tsx` · `adminAffiliateController.ts` (new) · `routes/adminAffiliate.ts` (new) · `backend/index.ts` · `pages/admin/creators.tsx` (new) · `pages/admin/index.tsx` · `data/seo-pages/slugs.json` (new) · `vercel.json` · `public/robots.txt` · `public/sitemap.xml` · `routes/sales.ts` · `itemController.ts` · `routes/items.ts` · `server-sitemap.xml.tsx` · `indexNowService.ts` (new) · `saleController.ts` · `fa3d9e1b8c2047a6d5f3e9b1c4a87d20.txt` (new) · `.env.example`

### S962 — 2026-06-12 | QA (Records Pass + Chrome QA: #219/#218/#55/#81/#127 + #27c Bug)

**Session type:** QA — autonomous roadmap QA continuation from S961

**Work completed:**
- **Records pass:** Applied S961 PCVs (#74 Role-Aware Registration Consent + #463 Claim Button Tracking) to roadmap.md Claude QA column (⬜ → ✅ S961). Both had full 5-element evidence.
- **#219 Shopper Achievements — VERIFIED ✅** — Navigated /shopper/achievements as Alice Johnson. Achievements tab rendered with XP breakdown, badges grid, rank progress. ss_5810hhnqu ss_4488tmnlg. PCV staged.
- **#218 Shopper Trades — VERIFIED ✅** — Navigated /shopper/trades as Alice Johnson. Trades page rendered with active trade listings. ss_9998kdjb8. PCV staged.
- **#55 Seasonal Discovery Challenges — VERIFIED ✅** — Navigated /challenges as Alice Johnson. Seasonal challenges page displayed. ss_5780an0ik. PCV staged.
- **#81 Empty State Audit — VERIFIED ✅ (spot-check)** — Key pages confirmed with empty-state messaging and CTAs. ss_2877anw5k. PCV staged.
- **#127 POS Value Unlock Tiers — VERIFIED ✅** — Navigated /organizer/pos with Alice's active sale. Widget expanded showing 3-tier dual-gate structure: Tier 1 unlocked (5 tx + $50 revenue), Tier 2 locked (progress bar), Tier 3 locked (PRO gate). Real data: "1/3 unlocked · 5 sales · $325.00". ss_9169k1up3 ss_0868mkvi8. PCV staged.
- **#27c eBay CSV Export — BUG ❌** — Clicked "Export to eBay" on /organizer/add-items/[saleId]. Modal opened correctly. Clicked "Download CSV". `GET /api/sales/:saleId/ebay-export?photoMode=watermarked → HTTP 500`. generateEbayCsv function reviewed — all schema fields (estimatedValue, aiSuggestedPrice, ebayCategoryId, conditionGrade) exist in schema.prisma. Runtime root cause requires Railway logs. Added to Blocked Queue.

**Files changed:**
- `claude_docs/strategy/roadmap.md` — #74 + #463 Claude QA columns updated (⬜ → ✅ S961)
- `claude_docs/STATE.md` — this wrap

**BQ delta:** 0→1 (#27c eBay CSV Export 500)

### S961 — 2026-06-12 | QA (Chrome QA Pass: #463 + #74 + Records Pass)

**Session type:** QA — autonomous QA pass searching roadmap for ⬜ Chrome items

**Work completed:**
- **Records pass:** SEO3 S944 PCV had full evidence (URL + outcome + 2 screenshot IDs) — applied ✅ S944 to roadmap.md UI column. #472 S948 PCVs (3 rows) already applied to roadmap in S949 but were stale in PCV table — cleared with note.
- **#463 Claim Button Click Tracking — VERIFIED ✅** — Navigated to organizer profile as unauthenticated visitor, clicked "Claim This Profile — It's Free". Confirmed redirect to /register?claim=, `window.va("event", {name:"claim_profile_click",...})` fired, POST /_vercel/insights/event beacon confirmed in DevTools. ss_6546zegk2 ss_5106am9br ss_203394jm6. PCV staged → roadmap Chrome column update deferred to S962 records pass.
- **#74 Role-Aware Registration Consent — VERIFIED ✅** — Navigated /register as unauthenticated visitor. Shopper role: 1 consent checkbox + ToS, no Business Info. Sale Organizer role: Business Info (Name/Phone/Address) appeared + 1 consent checkbox + ToS. Switched back → Business Info disappeared. Dark mode clean. ss_58428wnau ss_98779g0dj ss_12933c02s. PCV staged → roadmap Chrome column update deferred to S962 records pass.
- **Remaining ⬜ items blocked:** #254/#268/#278/#281/#313/#314 (require real Stripe/GPS/concurrent users), #315/#317/#340/#332 (GPS/camera/Shopify — environment-blocked). No additional testable items found.

**Files changed:**
- `claude_docs/strategy/roadmap.md` — SEO3 UI column updated (⬜ → ✅ S944)
- `claude_docs/STATE.md` — PCV table updated (#74 + #463 staged, #472 stale rows noted cleared, SEO3 cleared)

**BQ delta:** 0 (unchanged)

### S960 — 2026-06-12 | DEV (Bid13 Scraper + NFMA Park + Dead Directory Research)

**Session type:** DEV — scraper activation, parked stub creation, replacement research

**Work completed:**
- **Bid13 ACTIVATED** — full rewrite from parked stub to 260-line active scraper. Discovered `POST /api/v1/search.php` JSON API via `bid13_search.js` Drupal module source. 9 US anchor zips at 500-mile radius provide national coverage. Deduplicates by `facility_nid`. Category: `AUCTION_HOUSE`. Complies with robots.txt crawl-delay (5s). `enabled: true` in sourceRegistry. Monthly GitHub Actions workflow created (`0 5 1 * *`). TypeScript: 0 errors.
- **NFMA Members PARKED** — confirmed login-gated on both web and API. Parked stub + workflow created; workflow no-ops.
- **Dead flea market directory research** — 7 dead scrapers audited (americanFleaMarkets, fleaMarketCom, fleaMarketDirectory, fleaMarketRover, fleaMarketsNet, ibidNow, vendorsByState). All dead (parked domains, GoDaddy Afternic). FleaMarketZone already in codebase. No replacement warranted now; fleamapket.com + fleamarketlocator.com logged as future Playwright candidates.

**Files changed:**
- `packages/backend/src/services/scraper/sources/bid13Scraper.ts` — full rewrite (260 lines, parked stub → active scraper)
- `packages/backend/src/services/scraper/sourceRegistry.ts` — Bid13 `enabled: true`, updated legalNote
- `.github/workflows/scrape-bid13.yml` — new monthly workflow
- `packages/backend/src/services/scraper/sources/nfmaMembersScraper.ts` — parked stub (24 lines)
- `.github/workflows/scrape-nfma-members.yml` — new workflow (no-op)

**BQ delta:** 0 (1 closed item from S958 remains as strikethrough; no new items)


### S958 — 2026-06-12 | CI/RESEARCH (OSM 504 Retry + Scraper Verification)

**Session type:** CI/RESEARCH — scraper fix, DB verification, housekeeping

**Work completed:**
- **OSM 504 retry shipped** — extracted `fetchOverpass()` helper with 8s retry on 504. kumi.systems confirmed working (prior run: New York 46, Buffalo 8, Miami 7).
- **KY/IN/ME/AL DB check** — 0 records for all 4 phase2 sources. Scrapers fired (202 received) but nothing written. Next step: Railway log investigation + Kentucky control ID check.
- **Playwright confirmed built** — `playwrightBrowser.ts` fully implemented. STATE.md Option C was stale (said "build the harness" — it already exists).
- **#470 organizer_signup BQ closed** — S946 had full verification evidence; S949 re-added in error. Closed.
- **BetaList removed** — dropped from Patrick Actions and Suggested Work per Patrick direction.

**Files changed:**
- `packages/backend/src/services/scraper/osmScraper.ts` — 504 retry
- `claude_docs/STATE.md` — this wrap

**BQ delta:** 1→0

### S956 — 2026-06-11 | RESEARCH/CREATIVE (Directory & App Listing Submissions)

**Session type:** RESEARCH/CREATIVE — directory and app listing submission push

**Work completed:**
- **SaaSHub ✅ SUBMITTED** — saashub.com/finda-sale live (contact: info@finda.sale). Patrick should create account to claim.
- **Uneed ✅ SUBMITTED** — uneed.best/tool/finda-sale in waiting line. Account: deseee-d1f4. Category: Business. Tags: E-Commerce/Business/Events. Tagline: "Inventory & shopper discovery for secondary sale organizers".
- **AlternativeTo ⏳ BLOCKED** — account "FindASale" created June 11; 7-day age gate. Eligible June 18 ~9:49 PM Stockholm.
- **Product Hunt assets ✅** — `claude_docs/brand/product-hunt-assets-2026-06-11.md`. Tagline, 240-char description, maker comment, Q&As, topic tags, screenshot order, hunter guidance.
- **Crunchbase ✅ SUBMITTED** — Form filled: Name/description/1-10 employees/For Profit/finda.sale/info@finda.sale. Edit URL: crunchbase.com/edit/new/organization.companies/1cf65e18-944e-4036-bb05-a9361c213032. "Edit successfully made!"
- **BetaList ⏳ PENDING PATRICK** — Submission 170511 filled (name/pitch/website/description). Two actions needed: (a) Patrick uploads logo-icon-512.png via camera icon at betalist.com/submissions/170511/wizard/general; (b) Patrick clicks verification link at patrick@finda.sale. Claude continues wizard after.
- **Roundup Gmail drafts ✅** — Gitnux r-4990707302036889022 → info@gitnux.org (SEND). WifiTalents r-8399856770625698902 → info@wifitalents.com (SEND). DIYAuctions r1579106969886718270 → DELETE (competitor).

**Files created/updated:**
- `claude_docs/brand/product-hunt-assets-2026-06-11.md` (new)
- `claude_docs/brand/roundup-outreach-emails-2026-06-11.md` (new; updated with Gmail draft IDs at wrap)
- `claude_docs/STATE.md` — this wrap
- `claude_docs/patrick-dashboard.md` — updated
- `claude_docs/strategy/roadmap.md` — #477/#478/#480/#481/#484/#487/#488 updated

**BQ delta:** 1 (unchanged — #470 organizer_signup UNVERIFIED)

### S954 — 2026-06-11 | DEV (S952 Scraper Fix Campaign)

**Session type:** DEV — 4 parallel scraper rewrites + scraper coverage/infra research

**Work completed:**
- **Kentucky phase2 REWRITTEN** — `kentuckyPhase2Scraper.ts`: `web1.ky.gov` dead → `https://oop.ky.gov/lic_search.aspx`. ASP.NET ViewState flow, A–Z last-name iteration, board=34 Auctioneers, dedup by license #, 1.5s delays. 0 TS errors. Control IDs need live run to verify.
- **Indiana phase2 FIXED** — `indianaPhase2Scraper.ts`: removed `INTENTIONAL_BREAK` early-return; count regex `[\d,]+`; multi-line `<tr>` parser with `[\s\S]*?`. Expected ~1,560 records (was 1). 0 TS errors.
- **Maine phase2 REWRITTEN** — `mainePhase2Scraper.ts`: `pfr.maine.gov` NXDOMAIN → ALMSOnline `ExportToCSV.aspx` with regulator=4210, scOnlyActive. RFC 4180 CSV parser, fuzzy headers. 0 TS errors.
- **Alabama phase2 TIMEOUT FIX** — `alabamaPhase2Scraper.ts`: `isTimeoutError()` + `fetchOnce()` + retry-once with 5s wait. 0 TS errors.
- **Research B — Coverage in dead-scraper states**: NY 31,733 (RETIRE), NJ 703 (RETIRE), MA 267 Phase1 (RETIRE; Phase2 needs DNS unblock), NE Phase1 (RETIRE), RI 64 (RETIRE). NE Phase2 NDBF pawnbroker = gap (no pawn records in DB).
- **Research C — Infra alternatives**: ME Lic → Playwright/Actions ($0); WY Phase2 → Playwright/Actions ($0); MA Phase2 → API key request; NH → email OPLC; WI → open records request.
- **Research D — Headless browser ROI**: 26 scrapers unblockable by one shared Playwright + proxy harness. 18 Playwright-only (no WAF), 8 need residential proxy. NAA alone justifies build.

**Files changed (pending Patrick push):**
- `packages/backend/src/services/scraper/sources/kentuckyPhase2Scraper.ts` — full rewrite
- `packages/backend/src/services/scraper/sources/indianaPhase2Scraper.ts` — parser fix
- `packages/backend/src/services/scraper/sources/mainePhase2Scraper.ts` — full rewrite
- `packages/backend/src/services/scraper/sources/alabamaPhase2Scraper.ts` — timeout fix
- `claude_docs/STATE.md` — S954 wrap
- `claude_docs/patrick-dashboard.md` — S954 summary

**BQ delta:** 1 (unchanged — #470 organizer_signup UNVERIFIED)


### S951 — 2026-06-11 | RECORDS/AUDIT + SCRAPER DIAGNOSIS (env failure mid-session)

**Session type:** Audit + monitoring tune + scraper diagnostic campaign

**Work completed:**
- **Scheduled-task fix audit ✅** — documented 3 same-day autonomous fixes already on main but absent from docs: Google Maps billing lockdown (529f4ee7), scraper/email-discovery harden + 65-workflow DB pre-flight (ed5c020e), outreach null-safe GarageSaleFinder fix (bd6e6967). See S951 Current Status entry.
- **ci-sentry-health urgency reclassification ✅** (skill SKILL.md, OneDrive — intact): DATABASE_URL pre-flight failure → HIGH top-line; ESN/GSF/FB Events aligned; outreach engine HIGH, enrichment MEDIUM; new-regression rule so a newly-broken phase2/licensing escalates above chronic noise.
- **Scraper fleet diagnosis ✅** — 16 failing workflows (of 132; 81/96 phase2+licensing actually PASS). Root causes proven via live logs + source fetches: 4 FIXABLE (KY/IN/ME-p2/AL — sources confirmed live), ~5 DEAD (NY/NJ/MA auctioneer, NE/RI pawnbroker — no statewide source), ~5 NEEDS-INFRA (NH/ME-lic/WI/WY/MA-p2 — WAF/SPA/CAPTCHA/API-key). HERE Places = secret (now fixed); blocked only by googlePlaces.ts(~526) runtime TS error from 529f4ee7.
- **❌ Scraper CODE not shipped** — VM filesystem fault corrupted all 5 agents' file writes (truncation + null bytes) AND node_modules (tsc unrunnable, so agent TS gates were false). No scraper pushblock. Files to be restored by Patrick (see Next Session action 1); fixes re-done S952 per dispatch plan.

**Files changed (good, pushable):** claude_docs/STATE.md, claude_docs/patrick-dashboard.md, + ci-sentry-health SKILL.md (OneDrive, installs separately).

**BQ delta:** 1 (unchanged)

### S950 — 2026-06-11 | DEV/RECORDS (Vercel cost fixes + sitemap SEO + this-weekend ISR + records pass)

**Session type:** DEV/RECORDS

**Work completed:**
- **Records pass ✅** — #422 Chr ✅ S949 (ss_3450u6tgu, ss_8074zis8d), #75 Chr ✅ S949 lapse-state (ss_83752jesk), #470 item_viewed Chr ✅ S949 (ss_8841oxiro, ss_7047o7yzv) applied to roadmap.md.
- **Sitemap PUBLISHED fix ✅** — `server-sitemap.xml.tsx`: ACTIVE/UPCOMING→PUBLISHED. New `GET /sales/sitemap` backend endpoint (top 5k PUBLISHED). changefreq: hourly→daily. Fixes silent bug causing 0 sale URLs in sitemap for unknown duration.
- **ISR + CDN caching ✅** (pre-compaction) — `sales/[id].tsx` revalidate 3600→86400. `vercel.json` sitemap s-maxage=3600.
- **This-weekend dynamic revalidate ✅** — `day>=4 ? 14400 : 43200` (Thu-Sat=4hr, Sun-Wed=12hr).

**Files changed:** packages/backend/src/routes/sales.ts, packages/frontend/pages/server-sitemap.xml.tsx, packages/frontend/pages/this-weekend/[city].tsx, packages/frontend/pages/sales/[id].tsx, packages/frontend/vercel.json, claude_docs/strategy/roadmap.md, claude_docs/STATE.md, claude_docs/patrick-dashboard.md

**BQ delta:** 1 (unchanged)
