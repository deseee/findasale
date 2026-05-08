# PROJECT STATE

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel. Mobile: React Native (future).

## Current Status

**Latest: S699 — Design Strategy Session: 5 design briefs commissioned + implementation order mapped (COMPLETE — push block below)**

S699 was a pure design strategy session. Reviewed all 5 Claude Design handoff zip files (Sessions 1–5). Created 5 design brief/reply documents in `claude_docs/design/`. Answered all design open questions. Mapped implementation priority against the roadmap. No code changes this session — all deliverables are documentation files for the design pipeline.

**Design docs created:**
- `storefront-design-reply-v1.md` — answers to all 11 design question categories from the Session 1 handoff
- `session-2-sale-detail-shopper-onboarding.md` — sale detail page (all states) + shopper first-run experience
- `session-3-organizer-sale-creation-wizard.md` — 5-step creation wizard + item manager entry + quick-add flow
- `session-4-email-design-system.md` — base template + 5 modules + 7 emails (9 counting onboarding series)
- `session-5-smart-queue-broadcast-saletypes.md` — Smart review queue, broadcast composer, sale type matrix

**Implementation priority:**
1. Sale detail page (Session 2) — highest-traffic public page, cold Google traffic lands here
2. Sale creation wizard (Session 3) — activation gate, highest organizer churn point
3. Email design system (Session 4) — every user receives these; base template unlocks broadcast too
4. Smart review queue (Session 5 Brief D) — completes the camera pipeline (PENDING_REVIEW flow)
5. Broadcast composer (Session 5 Brief E) — OrganizerBroadcast in schema (#356), Pro/Teams monetization
6. Sale type badge system (Session 5 Brief F) — display-only, no new schema
7. Storefront v0.2 (zip 4 design update) — light-default flip, not blocking

**One dev gap flagged:** Online Only toggle (Brief F) designed in `sale-types.jsx` but NOT wired into `wizard.jsx` Step 2. Dev must pull it from the sale-types canvas and wire into wizard Step 2 (dates & location).

---

**Previous: S698 — All S691–S697 push blocks landed + Batch 2 complete + Auction P0s fixed + Scraper phone/website dropout fixed (COMPLETE — push block below)**

S698 verified all S691–S697 commits on GitHub. Dispatched Batch 2 agents + QA + scraper audit — all returned clean (zero TS errors):

- **email-discovery-spec.md cleanup** — Hunter.io/Clearbit/Apollo refs stripped from 5 locations. Free pipeline (website scraping + SMTP probe + pattern permutation) fully intact.
- **MailerLite tier group wiring** — `mailerliteService.ts` + `syncLeadTierGroups()` added to `outreachEmailsCron.ts`. Weekly cron (Sundays 02:00 UTC). Gates on `OUTREACH_ENABLED=true`. Patrick must add 3 Railway env vars: `MAILERLITE_COLD_GROUP_ID`, `MAILERLITE_WARM_GROUP_ID`, `MAILERLITE_HOT_GROUP_ID`.
- **Email discovery schema migration** — 3 new Organizer fields: `emailDiscoveryMethod`, `emailDiscoveryConfidence`, `emailDiscoveredAt`. Migration `20260508000002_email_discovery_fields` created. `emailDiscoveryService.ts` now writes all 3 fields on successful discovery. **Patrick must run `prisma migrate deploy` + `prisma generate` after pushing.**
- **#174 Auction P0 #1 fixed** — `itemController.ts` `placeBid`: `actualBidAmount` was computed as `Math.max(auctionStartPrice, auctionReservePrice)`, completely ignoring submitted bid amount. Fixed: `actualBidAmount = maxBidAmount`. Every bid was recording the starting price instead of the actual bid.
- **#174 Auction P0 #2 fixed** — `items/[id].tsx`: `isAuction` only checked for `AUCTION` type, not `REVERSE_AUCTION`. Reverse auction items rendered as standard items with no price decay. Fixed: added `REVERSE_AUCTION` to detection, computed `reverseDecayedPrice` (days elapsed × daily drop, clamped to floor), fixed floor price display (was dividing cents incorrectly — showed $1200 instead of $12). `ReverseAuctionBadge.tsx` updated to accept `currentPrice` prop and use `<=` for `isAtFloor`.
- **Scraper phone/website dropout fixed** — `getOrCreateScrapedOrganizer()` had no phone/website params so all Foursquare, HERE, and OSM phone/website data was silently dropped into scrapedMetadata. Fixed: added params, threaded phone/website through from all 3 sources. `ParsedListing` interface updated in `htmlParser.ts`. Null-check-before-write: never overwrites organizer-provided data.
- **Scraper audit findings (strategic — decision needed):** (1) Yelp Fusion API not yet integrated — 5K free calls/day, returns phone+website pre-populated, ToS-clean. Highest-yield untapped source. (2) GarageSaleFinder scrapes consumer homeowner posts, not organizer businesses — wrong entity type. (3) AuctionZip.com (~25K auction houses) — ToS gray zone, decision needed before build. (4) SaleSeeker CSS selectors likely returning zero results — `[data-listing]` and `.listing-card` may not match live markup.

**Previous: S697 — Scraper URL Corrections + WCAG ARIA + Outreach Lead Priority + Phase 2 Scrapers + Email Discovery (COMPLETE — pushed S698)**

S697 ran 3 parallel dispatch batches: WCAG error ARIA fixes (4 frontend files), 13 state scraper URL corrections + WA scraper (NEW), outreach cron lead tier prioritization, AK/NJ/WY/OK Phase 2 scrapers, email discovery service, and a P1 settings bug fix.

**Completed this session:**

**Batch 1 — WCAG error ARIA + 13 scraper URL corrections:**
- **WCAG error ARIA** — `aria-invalid` + `aria-describedby` added to: EbayCategoryPicker (search input), ReturnRequestModal (textarea), admin/broadcast.tsx (3 inputs), admin/feature-flags.tsx (2 inputs). WCAG error ARIA queue item can now be cleared — sufficient coverage achieved across all sprint batches.
- **13 state scraper URLs corrected** — AL, AR, FL, GA, IA, KY, LA, ME, MS, ND, SC, SD, WV all pointed to wrong or placeholder endpoints. Now corrected to live government licensing lookup pages. MA/NH/PA/WI confirmed already correct. IN untouched (resolved S696).

**Batch 2 — WA scraper + outreach lead tier priority + AK/NJ/WY Phase 2:**
- **Washington scraper (NEW)** — `washingtonLicensingScraper.ts` hitting Washington DOL brkrlocator endpoint with ASP.NET form state handling. `directoryMostRecentSource: 'WashingtonLicensing'`. Workflow: Monday 4:30am UTC. This was the 18th confirmed state missing from the S696 corrections.
- **Outreach lead tier priority** — `outreachEmailsCron.ts` single `findMany` replaced with 4-pass HOT/WARM/COLD/fallback system. HOT gets 40% of `quotaPerWindow`, WARM 35%, COLD 25%, all floored at 1. Backward-compatible: ENTERPRISE and untiered orgs go to fallback pool.
- **AK Phase 2 scraper (NEW)** — Alaska pawnbroker licenses from commerce.alaska.gov (Program ID 41).
- **NJ Phase 2 scraper (NEW)** — NJ pawnbroker (type 1306) from NJDOBI A-Z search.
- **WY Phase 2 scraper (NEW)** — Wyoming pawnbroker from Wyoming Banking Division licensee list.
- **3 workflow YMLs** — scrape-ak-phase2.yml, scrape-nj-phase2.yml, scrape-wy-phase2.yml (Monday cadence, staggered times).

**Phase 2 research finding (blocked):** AZ/DE/ID/IL/KS/MI/MN/MO all have city/county-level licensing or restricted databases — no viable state-level machine-readable source found. IL has a potential IDFPR eLicense portal needing manual form inspection before building. CA/CO/CT/HI/NE blocked entirely (city-level or bot protection).

**Batch 3 — OK Phase 2 + Email Discovery + Settings bug fix:**
- **OK Phase 2 scraper (NEW)** — `oklahomaphase2Scraper.ts` — Oklahoma pawnbroker from PDF roster at oklahoma.gov. Workflow: Monday 6:00am UTC.
- **Email discovery service (NEW)** — `emailDiscoveryService.ts` (277 lines): 3-stage free pipeline: (1) website scrape for mailto: links + regex patterns, (2) 12 candidate pattern generation from businessName + domain, (3) MX lookup + RCPT TO probe on port 25 (no actual email sent, 30s timeout). On success: updates `organizer.contactEmail` in DB.
- **Email discovery batch job (NEW)** — `emailDiscoveryJob.ts` (33 lines): cursor-paginated batch, targets `contactEmail IS NULL AND website IS NOT NULL AND isUnmanagedListing = true`. `batchSize=50, delayMs=2000`.
- **P1 settings bug fixed** — `#352 tagline` and `#353 yearFounded` were accepting input but not surviving page reload. Root cause: `GET /organizers/me` response was missing `organizerTypes` from the return shape, causing the frontend's post-PATCH refetch to fail to populate form state. Fixed: added `organizerTypes: (organizer as any).organizerTypes || []` to GET /me response at line 495 (tagline at 494 and yearFounded at 496 were already present). Backend TS: 0 errors. Frontend TS: 0 errors.

**Files changed this session (push block provided above):**
- `packages/frontend/components/EbayCategoryPicker.tsx` — aria-invalid + aria-describedby
- `packages/frontend/components/ReturnRequestModal.tsx` — aria-invalid + aria-describedby
- `packages/frontend/pages/admin/broadcast.tsx` — aria-invalid + aria-describedby (3 inputs)
- `packages/frontend/pages/admin/feature-flags.tsx` — aria-invalid + aria-describedby (2 inputs)
- 13 state scraper source files — URL corrections (AL AR FL GA IA KY LA ME MS ND SC SD WV)
- `packages/backend/src/services/scraper/sources/washingtonLicensingScraper.ts` — NEW
- `.github/workflows/scrape-washington-licensing.yml` — NEW
- `packages/backend/src/jobs/outreachEmailsCron.ts` — 4-pass lead tier priority
- `packages/backend/src/services/scraper/sources/alaskaPhase2Scraper.ts` — NEW
- `packages/backend/src/services/scraper/sources/newjerseyPhase2Scraper.ts` — NEW
- `packages/backend/src/services/scraper/sources/wyomingPhase2Scraper.ts` — NEW
- `.github/workflows/scrape-ak-phase2.yml` — NEW
- `.github/workflows/scrape-nj-phase2.yml` — NEW
- `.github/workflows/scrape-wy-phase2.yml` — NEW
- `packages/backend/src/services/scraper/sources/oklahomaphase2Scraper.ts` — NEW
- `.github/workflows/scrape-ok-phase2.yml` — NEW
- `packages/backend/src/services/emailDiscoveryService.ts` — NEW
- `packages/backend/src/jobs/emailDiscoveryJob.ts` — NEW
- `packages/backend/src/routes/organizers.ts` — organizerTypes added to GET /me

---

**Previous: S696 — Scraper Infrastructure Batch 1: Indiana Licensing Fix + Source Tracking + Matrix Throughput (COMPLETE)**

S696 ran Innovation + Architect on 5 scraper problems, then dispatched 3 parallel dev agents for Batch 1 (no schema changes). All verified TS clean.

**Completed this session:**
- **Indiana scraper conflict resolved** — `indianaLicensingScraper.ts` had 31 merge conflict markers from a botched push. Resolved all conflicts (kept HEAD's descriptive comments + origin/main's `AbortSignal.timeout` fix). Added `isStateLicensed: true`, `licenseState: 'IN'`, `licenseNumber`, `directoryMostRecentSource: 'IndianaLicensing'` via post-upsert `prisma.organizer.update()`. When Indiana scraper runs, 200–500 organizers will reach HOT tier (currently 0 HOT).
- **Source tracking forward-fix** — `scraper/index.ts` now sets `directoryMostRecentSource` + `directoryMostRecentAt` for all Foursquare, HEREPlaces, and OSM upserts. Admin scrape pool dashboard will show attribution for all future scrape runs.
- **GitHub Actions matrix** — `scrape-foursquare.yml` and `scrape-here-places.yml` updated to 6-job parallel matrix (batch_index 0–5, 5-second stagger). `run-foursquare-places.ts` and `run-here-places.ts` updated with `SCRAPER_BATCH_INDEX` / `SCRAPER_BATCH_COUNT` slicing. 301 metros in ~10–15 min vs 60+ min sequential. Zero rate limit impact (still ~301 calls/run total).
- **Innovation output saved** — `claude_docs/research/innovation-scraper-throughput-2026-05-08.md` (5 problem analyses, 3 options each, recommendations).

---

**Previous: S695 — Scraper Audit: Paid APIs Stripped, Metro List 100→301, Admin Stats Fixed (COMPLETE)**

S695 audited the full scraping/outreach infrastructure. Key outcomes:

- **Google Places stripped** — `enrichment.ts` had live calls to Google Places API ($200/run confirmed). All three functions (`lookupGooglePlace`, `fetchGooglePlaceDetails`, `getGooglePhotoUrl`) removed. Cron in `scrape-google-places.yml` disabled. Delete `GOOGLE_PLACES_API_KEY` from Railway env vars + GitHub Secrets.
- **Foursquare confirmed safe** — Investigated June 1 2026 pricing cliff. Verified: account is Sandbox plan, 9,450 free calls remaining, no card on file, cannot be billed. Actual usage: ~550 calls/2-run cycle (confirmed from billing screen: May 3=390, May 4=160). Cron re-enabled.
- **HERE confirmed free** — 250K free/month, our volume ~6,923/month at 301 metros. Well within free tier.
- **Metro list expanded 100→301** — Original list was top-100 US cities by population. Replaced with estate-sale-weighted coverage: all 50 states + DC, Florida fully expanded (4→30 cities), Michigan expanded (Grand Rapids only → 11 cities), Oregon/Utah/SC/WV/AR added from scratch. HERE volume impact: ~2,852 → ~6,923/month (3% of free tier).
- **Admin stats contamination fixed** — All 6 real-organizer stat queries in `adminController.ts` now filter `isUnmanagedListing: false`. Scraped directory orgs no longer inflate real user counts.
- **Scrape pool admin dashboard** — New `getScrapePoolStats()` endpoint + `/admin/scrape-pool` page showing tier distribution, enrichment coverage, outreach status, last run by source.
- **Outreach strategy written** — `outreach-email-strategy.md`: COLD/WARM/HOT message variants, 4-touch sequence, 8-week warming ramp, MailerLite automation structure.
- **Email discovery spec written** — `email-discovery-spec.md`: 6-stage free pipeline. ⚠️ Still contains Hunter.io/Clearbit/Apollo references — strip before implementing.

**Critical gap uncovered:** Scraper throughput. GitHub Actions 60-min timeout kills runs at ~550 calls. Full 301-metro coverage requires 6,923 calls/run. At current rate, ~8% of metros get scraped per month. Architect + Innovation dispatch needed before Dev implementation.

**Files changed this session (need Patrick push):**
- `packages/backend/src/services/scraper/enrichment.ts` — Google Places stripped
- `packages/backend/src/services/scraper/sources/googlePlaces.ts` — 301 metros
- `packages/backend/src/controllers/adminController.ts` — isUnmanagedListing filter + getScrapePoolStats
- `packages/backend/src/routes/admin.ts` — /scrape-pool-stats route
- `packages/frontend/pages/admin/scrape-pool.tsx` — NEW scrape pool dashboard
- `.github/workflows/scrape-google-places.yml` — cron disabled
- `.github/workflows/scrape-foursquare.yml` — cron re-enabled (Sandbox safe)
- `claude_docs/strategy/outreach-email-strategy.md` — NEW
- `claude_docs/strategy/email-discovery-spec.md` — NEW

**Previous: S693 — #174 Auction QA Setup + Bid Fix (COMPLETE)**

S693 seeded production auction data for #174 and fixed two blocking bugs, but QA re-run after deploy is still pending.

**Completed this session:**
- **Auction data seeded** — user2@example.com's sale "QA Test Auction — Antiques & Collectibles" (`c5hykxxecanngwcrkvq92n1va`) now has 5 AVAILABLE items: Art Deco Brooch ($150 start), Signed First Edition Novel ($500), Victorian Silver Pocket Watch ($75), Vintage Brass Compass ($25), Vintage Brass Compass Reverse Auction ($120 drops $15/day, floor $45, started 3 days ago → ~$75 today). All `draftStatus=PUBLISHED`, `auctionEndTime` 24h from seeding.
- **Bid field name mismatch fixed** — `packages/frontend/pages/items/[id].tsx` line 259: `{ bidAmount: amount }` → `{ maxBidAmount: amount }`. Backend (ADR-013) expects `maxBidAmount`; frontend was sending `bidAmount` → 400 on every bid attempt. Fix is on disk, needs Patrick to push.
- **draftStatus filter fixed (DB)** — Items were filtered from public sale page by `PUBLIC_ITEM_FILTER` (`draftStatus: 'PUBLISHED'`). Two items had wrong status: Vintage Brass Compass was `DRAFT`, Reverse Auction item was `APPROVED`. Fixed directly in DB — all 5 items now `PUBLISHED` and visible immediately.
- **QA run attempted** — Chrome QA agent confirmed: 3 of 5 items were visible (draftStatus issue), bids returned 400 (field name issue). Reverse auction item not visible. Both root causes found and fixed.

**QA re-run needed after Patrick pushes `items/[id].tsx` fix:**
- Login as user12@example.com / Seedy2025! (shopper)
- Navigate to auction sale (finda.sale/sales/c5hykxxecanngwcrkvq92n1va)
- Verify all 5 items visible
- Place bid on Vintage Brass Compass (bid $30 on $25 start)
- Verify reverse auction item shows ~$75 dropping price with floor $45
- Check organizer view (user2@example.com) for bid status

**Files changed this session (need Patrick push):**
- `packages/frontend/pages/items/[id].tsx` — `maxBidAmount` field name fix (line 259)

**Previous: S692 — Backend Crash + Camera Fix (COMPLETE)**

S692 diagnosed and fixed two production P0s:

**Completed this session:**
- **Backend crash fixed** — Commit `4756009b` (S691, today 9:22am) added 44+ state scraper imports to `internal.ts` without committing the actual source files. Railway crashed on boot with `MODULE_NOT_FOUND: northCarolinaLicensingScraper`. Fix: Patrick pushed all scraper source files (already existed locally, never committed).
- **Camera upload fixed** — `[rapidfire] Cloudinary upload failed: http_code: 420`. Root cause: `aws_rek_tagging` (AWS Rekognition content moderation add-on) was configured in `uploadToCloudinary` but the Cloudinary add-on is not active. Cloudinary returned 420 on every single upload. Fixed by removing `categorization: 'aws_rek_tagging'` and `auto_tagging: 0.7` from the upload options, and removing the dependent NSFW check block. Also added `uploadToCloudinaryWithRetry` wrapper (3 retries, exponential backoff) for transient 420s.
- **Roadmap #394 added** — Content moderation decision logged in Decisions Needed. Options: Cloudinary built-in (free), Rekognition add-on (~$0.001/img), or leave off for beta.

**Files changed this session:**
- `packages/backend/src/controllers/uploadController.ts` — remove aws_rek_tagging, add retry wrapper
- `claude_docs/strategy/roadmap.md` — v137, added #394

**Previous: S691 — 50-State Scraper Audit + Safe Fixes (PARTIAL — push block below)**

S691 audited the S690 rubber-stamped scrapers. Research confirmed which states have real auctioneer licensing, which don't, and what Phase 2 license types can replace no-auctioneer scrapers. Three safe fixes applied:

**Completed this session:**
- **TX scraper rewritten** — Socrata REST API (`data.texas.gov/resource/7358-krk7.json`) replaces brittle ASP.NET form scraping. Paginates 1000/page, filters Active Auctioneers, optional `SOCRATA_APP_TOKEN` header. TS check: zero errors.
- **NC workflow yml renamed** — `scrape-north-carolina-licensing.yml` (full name, consistent with all other states). Old `scrape-nc-licensing.yml` needs `git rm` by Patrick.
- **WV space-named duplicate** — `westVirginia LicensingScraper.ts` (space) needs `git rm` by Patrick. True duplicate of `westVirginiaLicensingScraper.ts`.

**Research findings locked (S691):**
- **18 states with confirmed auctioneer licensing + verified URLs:** AL, AR, FL, GA, IA, KY, LA, MA, ME, MS, ND, NH, PA, SC, SD, WA, WI, WV
- **16 states with NO auctioneer license:** AZ, DE, ID, IL, KS, MI, MN, MO, MT, NM, NV, NY, OK, OR, RI, UT → need Phase 2 replacement (secondhand dealer, pawnbroker, SoS business name search)
- **8 original no-license states from S690 batch:** AK, CA, CO, CT, HI, NE, NJ, WY → same Phase 2 treatment
- **Phase 2 best sources:** CA ERDS (CA DOJ secondhand dealer/pawnbroker) is richest alternative nationally. All states have pawnbroker licensing. SoS keyword search works everywhere.
- **Locked rule:** Never delete a state scraper before exhausting Phase 2 alternatives.

**Still pending (next dispatch wave):**
- Rewrite the 18 states with confirmed real URLs to correct endpoints
- Replace the 24 no-auctioneer states with Phase 2 license type scrapers
- Push the full scraper batch + all 50 workflow YMLs (blocked on MCP `workflow` scope — Patrick must push)

**Files changed this session (need Patrick push):**
- `packages/backend/src/services/scraper/sources/texasLicensingScraper.ts` — Socrata API rewrite
- `.github/workflows/scrape-north-carolina-licensing.yml` — NEW (renamed from scrape-nc-licensing.yml)
- `claude_docs/strategy/roadmap.md` — v136, added #393

**Patrick manual actions needed:**
```powershell
git rm ".github/workflows/scrape-nc-licensing.yml"
git rm "packages/backend/src/services/scraper/sources/westVirginia LicensingScraper.ts"
```

---

**Previous: S689 (continued) — Roadmap Audit + Full Graduation Pass (COMPLETE)**

Full cross-reference of STATE.md vs roadmap.md. roadmap.md updated to v135. Stale statuses corrected, items moved to correct sections. Full graduation pass: 23 items promoted to SHIPPED & VERIFIED.

**What changed in roadmap.md:**
- BROKEN → TESTING: #7, #13, #41, #48, #50, #184 (bugs confirmed fixed, pending Chrome QA)
- BROKEN → SHIPPED & VERIFIED: #80 Purchase Confirmation (✅ S685)
- #174 Auction: Notes updated — code fixed, blocked on test data
- #46: Marked Deprecated
- Status column updates: #146/#147/#24 ✅ S685, #253 ✅ S685, #361 ✅ S688, #235 bug fix S688, #310 page confirmed, #386 ✅ S685, #388/#389 Shipped S678, #94 ✅ S661
- Graduation pass (Chrome-verified rows moved to SHIPPED & VERIFIED): #49 #64 #80 #92 #177 #212 #231 #233 #234 #240 #242 #249 #252 #253 #264 #269 #270 #276 #277 #282 #287 #361 + #13 #48 from TESTING

**Files changed:**
- `claude_docs/strategy/roadmap.md` — v135 S688/S689 sync

---

**Previous: S689 (continued) — Chrome QA Sprint + Auth/me Fix + Dashboard Lapse Bug (COMPLETE)**

Chrome QA sprint continuing from S688 context. auth/me subscriptionLapsed field bug fixed (two Railway deploys). Dashboard lapse banner split-brain fixed. WCAG error ARIA sprint extended (4 more files). Four roadmap items Chrome-verified.

**What shipped:**
- **auth/me subscriptionLapsed fix (2nd commit `040db6a4`)** — First fix (S689 Part 1) incorrectly selected `subscriptionLapsed` from Prisma Organizer model (field doesn't exist on DB table). `.catch(() => null)` silently returned null → tier fell back to SIMPLE. Fixed: removed from Prisma select, use `req.user.subscriptionLapsed` (already computed by `checkTierLapse` middleware).
- **Dashboard lapse banner fix** — `GET /organizers/me` was computing `subscriptionLapsed` from `Organizer.subscriptionStatus` (null → lapsed), while `auth/me` used `UserRoleSubscription.tierLapsedAt`. Split-brain showed PRO lapse banner for manually-promoted organizers. Fixed: added `checkTierLapse` middleware to `GET /organizers/me` route, use `req.user.subscriptionLapsed` as single source of truth. Import updated. In Patrick's pushblock.
- **WCAG error ARIA — 4 more files** — CheckoutModal coupon input (aria-label fix — agent had hardcoded wrong aria-invalid/aria-describedby), BoostPurchaseModal (role="alert" on error divs), CSVImportModal (role="alert" on upload result), DisputeForm (aria-invalid + aria-describedby on select + textarea). In Patrick's pushblock.

**QA results (Chrome-verified):**
- **#235 DonationModal** — ✅ VERIFIED end-to-end. Root cause chain resolved: S688 fixed double /api/ prefix → S689 P1 fixed auth/me async → S689 P2 fixed subscriptionLapsed Prisma field. PRO gate opens correctly.
- **#271 TEAMS pricing copy** — ✅ VERIFIED. "Webhooks - Connect your systems" + "API Access" in comparison table. Solo power user pitch present.
- **#310 Color-tagged Discount Rules** — ✅ VERIFIED. TierGate correctly gates PRO users with blurred overlay + upgrade card. `pointer-events-none` blocks button clicks. TEAMS content itself UNVERIFIED (no TEAMS account).
- **#386 JSON-LD structured data** — ✅ VERIFIED on all 4 pages: pricing (WebPage+Offer), about (Organization), faq (FAQPage+BreadcrumbList+WebPage), index (Organization+WebSite+LocalBusiness).
- **#223 Organizer Guidance Layer** — ⚠️ partial. Tier tooltips (SIMPLE/PRO/TEAMS Help buttons) ✅ on pricing. `explorerRank` confirmed in reservationController lines 469+595. Rank badge visual UNVERIFIED (no active holds in prod).

**Files changed (Patrick pushblock needed):**
- `packages/backend/src/routes/organizers.ts` — `checkTierLapse` middleware added to `/me` route + import
- `packages/frontend/components/CheckoutModal.tsx` — coupon input aria-label fixed
- `packages/frontend/components/BoostPurchaseModal.tsx` — role="alert" on error divs
- `packages/frontend/components/CSVImportModal.tsx` — role="alert" on upload result
- `packages/frontend/components/DisputeForm.tsx` — aria-invalid + aria-describedby

**Previous: S689 (Part 1) — Lead Scoring Service + Scraper Crash Loop Fixes (COMPLETE)**

S689 Part 1 completed ADR-076 Phase 2 (lead scoring) and fixed a cascade of Railway MODULE_NOT_FOUND crash loops caused by subagent-written files that were never pushed to GitHub.

**What shipped:**
- **`leadScoringService.ts`** — 5-signal 0–100 scoring engine. Dimensions: contact reachability (20), corroboration depth (20), licensing (25), review strength (20), physical presence (15). Pure `calculateLeadScore()` + batched `runLeadScoringBackfill()` (cursor-paginated, 200/batch).
- **`leadScoringJob.ts`** — weekly cron Sundays 2 AM UTC via `cronGuard`.
- **`POST /api/internal/scoring/run-backfill`** — wired in `internal.ts` (already confirmed on GitHub).
- **Backfill run:** 7,897 organizers scored in 29s — COLD=3,235 WARM=4,662 HOT=0 ENTERPRISE=0. Zero HOT/ENTERPRISE expected: those tiers require `isStateLicensed` (25 pts) or 10+ Google reviews, which scraped orgs don't have yet. Will climb as Indiana licensing + Places enrichment runs.

**Crash loop fixes (all MCP pushed):**
- `saleSeeker.ts` — was never on GitHub; `internal.ts` imports it at startup → instant crash
- `indianaLicensingScraper.ts` — same issue
- `osmScraper.ts` — same issue

**Workflow files — need Patrick push (MCP blocked by GitHub `workflow` scope):**
- `.github/workflows/scrape-indiana-licensing.yml`
- `.github/workflows/scrape-osm.yml`
- `.github/workflows/scrape-sale-seeker.yml`

**Migration status:** `20260508000001_organizer_corroboration_and_lead_scoring` was deployed in S687 ✅ (confirmed — backfill ran successfully against Railway DB).

---

**Previous: S688 — Chrome QA Sprint: COPPA ✅ Claim Verify ✅ DonationModal Bug Found (COMPLETE)**

S688 ran live Chrome QA against the Blocked/Unverified Queue. Three features verified, one bug found and fixed inline.

**QA Results:**
- **COPPA age gate** — ✅ VERIFIED. Navigated to `/register`, entered DOB with year 2015 (age ~11). Form blocked submission with "You must be 18 or older" error. Birth year guard working correctly.
- **Claim verify flow (#361)** — ✅ VERIFIED (all 3 states):
  - Invalid token: `/claim/verify/invalid-token-qa-test-12345` → "Invalid Link" state with "This verification link is invalid or has expired" ✅
  - Success: `/claim/verify/[real-token]` → "Email Verified!" with business name "Sunrise Consignment & Collectibles", 2-3 day review message ✅
  - Already-used: Same token revisited → "Already Verified — This verification link has already been used. Your claim request is being reviewed." ✅
- **#251 priceBeforeMarkdown** — ⚠️ UNVERIFIED. Feature requires TEAMS-tier organizer with active color-coded discount rules. No TEAMS test account available with a qualified item. Stays in queue.
- **#235 DonationModal** — ❌ Bug found. SettlementWizard.tsx line 72: `api.get('/api/ebay/organizer/sales/...')` — double `/api/` prefix since `api` baseURL is already `/api`. Network call goes to `/api/api/ebay/...` → 404. `availableItems` always empty → Donate button never appears on Receipt tab. **Fix applied inline**: removed leading `/api` from the path. Pending Vercel deploy + re-verify.

**File changed:**
- `packages/frontend/components/SettlementWizard.tsx` — line 72: `/api/ebay/organizer/...` → `/ebay/organizer/...`

---

**Previous: S687 — Directory Rebuild: Schema + 3 New Scrapers (COMPLETE — Vercel ✅ Railway ✅)**

S687 dispatched all directory rebuild work from S686 specs. Six parallel agents. Everything shipped and confirmed green.

**What shipped:**
- **Organizer schema** — 14 new fields + 3 indexes: corroboration (sourceCount, sourcesJson, corroborationScore, dedupeKey) + lead scoring (leadScore, leadTier, lastScoredAt, annualSalesEstimate, hasPhysicalOffice, isStateLicensed, licenseState, licenseNumber, staffSizeEstimate, reviewCount, reviewVelocity). Migration `20260508000001_organizer_corroboration_and_lead_scoring` deployed to Railway ✅
- **Merge algorithm** — `getOrCreateScrapedOrganizer()` updated with 5-path dedup (googlePlaceId, foursquareVenueId, hereBusinessId, dedupeKey, name+city) + corroboration scoring helpers (generateDedupeKey, geocodeToGrid, recalculateCorroborationScore)
- **OSM/Overpass scraper** — New scraper hitting Overpass API, 20 US metros, 5 tag types (antiques, secondhand, used_goods, auction_house, auctioneer). Weekly Monday 3am UTC cron.
- **Indiana licensing scraper** — Hits mylicense.in.gov ASP.NET form, active licenses only, maps licenseNumber/licenseState/isStateLicensed. Weekly Monday 4am UTC cron.
- **Sale Seeker scraper** — Hits thesaleseeker.com (no ToS — legal). Cheerio HTML parsing, city-based search. Weekly Monday 5am UTC cron. May need selector refinement after first live run.

**Research findings (C dispatch):**
- EstateSales.org — **PROHIBITED** (explicit anti-scraping clause). Remove from candidate list.
- EstatePros — **PROHIBITED**. Remove.
- Sale Seeker — No ToS found → built scraper (legally permissive).
- OSM cron — **was never active**. S686 assessment ("71 entries, workflow running") was wrong — entries were from a manual run, no workflow file existed in GitHub. Now built.
- DataForSEO — SKIP ($0.01–0.05/record vs HERE's $0.0005).

**Pending first runs:** Trigger Indiana scraper first (structured government data, highest confidence). OSM second. Sale Seeker may need selector tweak.

---

**Previous: S685 — #393 Chrome QA Sprint: Holds + Settlement + Purchase Confirmation (IN PROGRESS)**

S685 is an active QA sprint. Holds ✅, Settlement ✅, Purchase Confirmation ✅ verified. P2 fixes shipped mid-session (green). Additional bugs found and fixed inline during #80 QA pass.

**#146/#147 Holds E2E — ✅ VERIFIED:**
- Shopper places hold on AVAILABLE item → item becomes RESERVED ✅
- Organizer `/organizer/holds` page shows hold with Extend/Cancel actions ✅
- Extend: resets timer to 30min from click ✅
- Cancel: removes hold, item returns to AVAILABLE ✅

**#253 Settlement Wizard — ✅ VERIFIED (5 tabs):**
- Summary, Expenses, Commission, Payout, Receipt tabs all navigate ✅
- Commission math live-updates correctly ✅
- Payout records successfully (COMPLETED badge + date) ✅
- P2 fixed: `ClientPayoutPanel.tsx` payout confirmation blank fields → reads from mutation response on save

**#80 Purchase Confirmation — ✅ VERIFIED:**
- `/purchases/[id]` renders "It's yours! 🎉", ✓ Paid, item name, seller, pickup info, bid breakdown, confirmation date ✅
- P1 fixed: "View My Purchases" → `/shopper/history` (was `/shopper/purchases`, 404)
- P2 fixed: "Amount Paid" for auction items now shows total with buyer premium (hammer × 1.05)
- `/shopper/history` page confirmed working — shows user's purchases with correct data

**Sales/Items SSR JSON-LD — ✅ VERIFIED (clearing unverified queue):**
- `/sales/[id]`: Event schema + BreadcrumbList ✅
- `/items/[id]`: Product schema with Offer ✅
- `pageProps` present (`ogData`, `initialData`) confirming SSR

**All fixes in this session (not yet pushed):**
- `items/[id].tsx`: hold card dark mode fix
- `ClientPayoutPanel.tsx`: settlement payout confirmation blank fields
- `purchases/[id].tsx`: "View My Purchases" → `/shopper/history`; "Amount Paid" shows total for auction buyers

**Remaining in #393 QA Sprint:**
- #174 Auction — needs items listed in a production auction sale before QA can proceed

**Seeded test item:** `ce65ser7xo2ef073v8w3ud0ac` ("Vintage Brass Compass") in DB as QA fixture. `isActive=true`, `draftStatus=APPROVED`.

**Previous: S684 — WCAG Error ARIA Sprint + #310 Discount Rules Fix (COMPLETE — Vercel GREEN)**

S684 completed the WCAG error ARIA sprint (`aria-invalid` + `aria-describedby` on all form inputs with inline validation error states) and applied a minor decimal precision fix to the #310 Discount Rules page.

**WCAG error ARIA — what shipped:**
- **Batch A (9 components):** BecomeOrganizerModal, BulkPriceModal, BulkCategoryModal, BulkPhotoModal, BulkStatusModal, BulkTagModal, BrandFollowManager, MessageComposeModal, PosInvoiceModal
- **Batch B (5 pages):** login, register, forgot-password, reset-password, organizer/create-sale
- Remaining components (HoldButton, PriceResearchPanel, etc.) confirmed to have no inline error states — no changes needed
- TS check: zero errors

**#310 Discount Rules:**
- Page already existed at `/organizer/color-rules` (roadmap was stale — never updated)
- Fix: `parseInt` → `parseFloat` for decimal discount percentages (Prisma Decimal field compatibility)
- TEAMS-gated, full CRUD wired to live backend endpoints

**Non-QA dev work status: COMPLETE.** QA queue (#393 Chrome QA Sprint) active.

---

**Previous: S683 — WCAG #391 Full Sweep + #390 Pagination Fix (COMPLETE — Vercel GREEN)**

S683 completed the WCAG #391 accessibility sweep across the entire frontend codebase (components + pages), fixed 3 Health Scout High findings (#390), and partially QA'd iCal (#184 ✅).

**WCAG #391 — what shipped this session:**
- **Batch A:** Ghost button dark-mode contrast fix (`globals.css`), 4 interactive divs made keyboard-accessible (`BottomTabNav`, `RapidCapture`, `SaleQRCode`, `pos.tsx`), heading hierarchy fix (`organizer/dashboard.tsx`)
- **Input labels (Round 1C):** 25+ inputs labeled across 13 component files (`BidModal`, `BulkPriceModal`, `BuyingPoolCard`, `CommissionCalculator`, `DateRangeSelector`, `PickupSlotManager`, `PriceResearchPanel`, `ReferralWidget`, `SmartInventoryUpload`, `UGCPhotoSubmitButton`, `WishlistShareButton`, `admin/feature-flags`, `index.tsx`)
- **Icon button labels:** ~25 elements across 20 files (`ActionBar`, `AddToCalendarButton`, `BulkActionDropdown`, `camera/PreviewModal`, `RSVPAttendeesModal`, `HighValueTrackerWidget`, `DisputeForm`, `RarityBoostModal`, `ExpenseLineItemList`, `BoostPurchaseModal`, `SyncQueueModal`, `TeamSeatUpsellModal`, `ValuationWidget`, `organizer/members.tsx` + others)
- **Full codebase pages sweep:** 91 page files checked — only `organizer/members.tsx` had gaps (chevron expand/collapse + trash icon)
- **Total: 33 files modified, ~50+ accessibility elements fixed**

**WCAG remaining (next sprint):**
- Error ARIA: `aria-invalid` + `aria-describedby` on form inputs with error states (~20+ files) — not touched this session
- No remaining aria-label or input-label gaps found in codebase-wide sweep

**#390 Health Scout High findings — fixed:**
- `adminBroadcastController.ts` — 5 unbounded `findMany` → `take: 50000`
- `adminController.ts` — 6 unbounded `findMany` → `take: 10000`/`take: 1000`
- `buyingPoolController.ts` — 1 unbounded `findMany` → `take: 100`
- TS check: zero errors

**#184 iCal — partially ✅ Chrome-verified:**
- "📆 Add to Calendar" button visible on all sale pages, download triggers with success toast, real sale data confirmed
- Item-level export UNVERIFIED (no items in test sales)

**#174 Auction — UNVERIFIED:**
- Both production auction sales have zero items listed — cannot QA bid mechanics, close flow, or purchase confirmation

**Previous: S682 — WCAG Corruption Recovery (COMPLETE — Vercel GREEN)**

The WCAG #391 bulk-label agent introduced 5 distinct corruption patterns across ~86 files. The entire session was spent diagnosing and repairing them before Vercel would build.

**Corruption patterns found and fixed:**
1. **Arrow function splits** — agent split `=>` inserting aria-label between `=` and `>`. Fixed via Python regex across 30 files.
2. **Self-closing tag splits** — agent split `/>` inserting aria-label between `/` and `>`. Fixed via Python regex across 11 files.
3. **Lucide icon alt props** — agent added `alt=""` to SVG React components that don't accept `alt`. Fixed in 4 instances.
4. **Duplicate aria-labels** — agent added second aria-label where one already existed. Fixed in 3 files.
5. **File truncations + null bytes** — 23 files had content cut off mid-expression; 13 files had null bytes appended post-EOF. Fixed: 23 restored from pre-WCAG commit `2062556d`; null bytes stripped via Python; 3 truncated exports fixed manually (inventory.tsx, members.tsx, feature-flags.tsx).

**Net result:** 152 valid aria-labels committed in S682's first batch (non-corrupted files) remain in place. Vercel build GREEN.

**#390 Health Scout, #392 Brand Voice** — completed earlier in S682, still valid. Reports on disk.

**⚠️ WCAG #391 — 189 remaining labels in ~25 complex files. DO NOT use bulk automation again. See Next Session for safe dispatch protocol.**

**Previous: S681 — WCAG #391 Chrome Keyboard/Focus QA (COMPLETE — 3 bugs fixed)**

Live keyboard/focus testing in Chrome. Three bugs found and fixed.

1. **Skip link z-index** (`Layout.tsx` line 700) — `focus:z-50` collided with header's `z-50`; header (later in DOM) painted over skip link when focused. Fixed: `focus:z-[100]`. ⚠️ **In Patrick pushblock below — not yet on GitHub.**

2. **Duplicate `id="main-content"`** (`Layout.tsx`) — S680 added `<main id="main-content">` inside existing `<div id="main-content">`. Browser jumped to wrong element. Fixed: removed `id` + `tabIndex={-1}` from outer div, kept only on `<main>`. ⚠️ **In Patrick pushblock below — not yet on GitHub.**

3. **Modal focus-on-open** (`AccessibleModal.tsx`) — `initialFocus: false` prevented focus-trap-react from moving focus into modal when it opened (WCAG 2.4.3 violation). Affected all 20+ modal instances. Fixed: removed `initialFocus: false`. ✅ **MCP pushed + Vercel deployed + Chrome verified.**

**Verified working in Chrome:**
- Tab order: Skip → Logo → Nav links → Register → Hero ✅
- Focus rings: nav links, buttons, icon buttons (amber/white outlines) ✅
- Modal tab trap cycles correctly (Input → Textarea → Cancel → wrap) ✅
- Disabled buttons correctly skipped in trap ✅
- Escape closes modal ✅
- Focus returns to trigger after modal close ✅
- Modal focus-on-open: `modalContainsFocus: true` confirmed ✅

**WCAG deferred (separate sprint):** alt text sweep (104+ img), form labels (200+ inputs), error ARIA.

**S681 files changed:**
- `packages/frontend/components/AccessibleModal.tsx` — removed `initialFocus: false` (MCP pushed)
- `packages/frontend/components/Layout.tsx` — skip link `z-[100]` + duplicate id removed (**Patrick pushblock**)

**Patrick action needed:**
```powershell
git add packages/frontend/components/Layout.tsx
git commit -m "S681: Fix skip link visibility + duplicate main-content id

- Skip link z-index raised from z-50 to z-[100] (header was painting over it)
- Removed duplicate id=main-content from outer div (kept on <main> only)"
.\push.ps1
```

**Remaining carry-forward:**
- Google Business Profile — Patrick manual at business.google.com
- Business cards — files in `claude_docs/brand/`
- WCAG deferred: alt text sweep, form labels, error ARIA
- Pre-launch audits #392–#394 still pending

---

**Previous: S679 — Pre-Launch Checklist + mcp.finda.sale Domain (COMPLETE)**

Pre-launch checklist substantially cleared. mcp.finda.sale fully wired. Brand voice system shipped. Pre-launch audit queue established. VAPID keys, GSC, Resend, Stripe business confirmed. `MAILERLITE_SHOPPERS_GROUP_ID=182012431062533831` set on Railway. mcp.finda.sale confirmed healthy `{"status":"ok","tools":7}`.

---

**Previous: S677 — Audio Note UX Fix + Build Fixes (COMPLETE — pushed)**

Audio note feature audited and relocated. Two build errors fixed (pnpm lockfile + TS type mismatch).

1. **Audio notes UX (#audio-ux)** — UX audit found two voice features: `VoiceTagButton` (misplaced in tags section, discarding extracted name/category/price) and `VoiceTagButtonThumbnail` (RapidCapture — already correct, untouched). Fix: created `VoiceDescriptionInput.tsx` alongside the description textarea. Records → always saves full transcript as description → auto-populates empty fields → shows inline "Voice suggestion: [value] · Accept / Keep" for fields that already have content (no silent overwrites). VoiceTagButton removed from edit-item tags section.

2. **pnpm lockfile fix** — `packages/mcp-server/package.json` from S676 was not reflected in `pnpm-lock.yaml`. Vercel build was failing with `ERR_PNPM_OUTDATED_LOCKFILE`. Patrick ran `pnpm install` from monorepo root to regenerate lockfile.

3. **VoiceDescriptionInput TS fix** — `fieldUpdate` typed as `Record<string, any>` was not assignable to the `onFieldUpdate` prop type. Fixed inline: replaced with explicit typed object matching the prop interface.

**S677 files changed:**
- `packages/frontend/components/VoiceDescriptionInput.tsx` — NEW (voice button alongside description, smart field suggestions)
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — VoiceTagButton removed, VoiceDescriptionInput wired in
- `pnpm-lock.yaml` — regenerated to include mcp-server dependencies

---

**Previous: S676 — AI Agent Discoverability + MCP Server Phase 1 (COMPLETE — pushed)**

AI agent discovery initiative shipped. 5 items landed, 1 assessed:

1. **llms.txt (#384)** — LLM-readable site summary at `/llms.txt`. Platform overview, features, pricing, key pages — structured for AI parsing.
2. **robots.txt AI crawlers (#385)** — GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, Bytespider all explicitly allowed.
3. **JSON-LD structured data (#386)** — WebPage/Offer on pricing.tsx, Organization on about.tsx, enhanced FAQPage on faq.tsx, LocalBusiness on index.tsx. Pending Chrome QA.
4. **MCP Server Phase 1 (#388)** — New `packages/mcp-server` with 7 tools (search_sales, get_sale, search_items, get_item, list_cities, list_sale_types, list_categories). HTTP/SSE transport. Calls existing public backend routes — no backend changes needed. Railway-ready. Spec: `claude_docs/strategy/mcp-server-spec.md`.
5. **.well-known/mcp.json (#389)** — AI platform discovery file. Status set to `coming-soon` — update to `active` once Railway service is live at mcp.finda.sale.
6. **SSR assessment (#387)** — All 3 public pages (pricing, about, faq) already SSR-safe (content hardcoded in JSX constants). No code changes needed.

**S676 files changed:**
- `packages/frontend/public/llms.txt` — NEW
- `packages/frontend/public/robots.txt` — AI crawler Allow blocks added
- `packages/frontend/pages/index.tsx` — LocalBusiness JSON-LD
- `packages/frontend/pages/pricing.tsx` — WebPage + Offer JSON-LD
- `packages/frontend/pages/about.tsx` — Organization JSON-LD
- `packages/frontend/pages/faq.tsx` — enhanced FAQPage JSON-LD
- `packages/frontend/public/.well-known/mcp.json` — NEW
- `packages/mcp-server/` — NEW (17 files: index.ts, handlers.ts, types.ts, lib/apiClient.ts, lib/rateLimiter.ts, 7 tool files, package.json, tsconfig.json, Dockerfile.production, .env.example, README.md)
- `claude_docs/strategy/mcp-server-spec.md` — NEW
- `claude_docs/strategy/roadmap.md` — v133, #384–389 added

**MCP server Railway deploy still needed.** Service not yet added to Railway. See Next Session.

---

**Previous: S675 — Sentry P0 Sale Indexes + Enrichment Guard + user11 DB Fix (COMPLETE — push needed)**

Three issues resolved:

1. **Sentry P0: Slow Sale query (1391–1656ms escalating)** — Missing indexes on public feed. Added 4 indexes to Sale model + migration `20260507000004_sale_feed_indexes`: `[status, endDate]`, `[city, status, endDate]`, `[status, startDate]`, `[sourceUrl]`. Migration not yet deployed to Railway — in push block below.

2. **user11 organizer websiteUrl contaminated** — Enrichment backfill (`internalEnrichmentController.ts`) targets `isUnmanagedListing: true` organizers. user11 is seeded with that flag for #361 claim-listing testing. Backfill found "Love Inc of Muskegon" as a Google Places false-positive match for "Sunrise Consignment & Collectibles" and overwrote the fake URL. Reset manually via SQL (`website` = `https://organizer11.example.com`, `googlePlaceId` = NULL). Fixed forward: added `@example.com` email guard in both `internalEnrichmentController.ts` (query-level filter) and `enrichment.ts` (service-level bail-out).

3. **schema.prisma truncated mid-file** — Dev agent's edit corrupted the file at line 4549 (`OutreachAuditLog` model). Restored from GitHub backup using Python merge: kept local lines 1–842 (Sale model with new indexes) + GitHub tail from line 843 onward. Prisma validate ✅.

**S675 files changed:**
- `packages/database/prisma/schema.prisma` — 4 new Sale @@index lines (838–841) + restored truncated tail
- `packages/database/prisma/migrations/20260507000004_sale_feed_indexes/migration.sql` — NEW
- `packages/backend/src/controllers/internalEnrichmentController.ts` — @example.com email filter in backfill query
- `packages/backend/src/services/scraper/enrichment.ts` — @example.com bail-out guard in enrichOrganizer()

**TS check:** ✅ Zero errors (backend). Migration NOT yet deployed. Push block below.

---

**Previous: S674 — Post-S673 Bug Fixes: OAuth redirect, incognito loop, empty homepage, frozen modal (COMPLETE)**

S673 shipped the OAuth architecture but left 3 live bugs and a 4th was found during S674. All 4 fixed:

1. **Google OAuth lands on login screen** — OAuthBridge exchanged the token but never redirected. Fixed: added `router.replace(destination)` in `_app.tsx` after `login(data.token)`, with role-based routing (organizers → `/organizer/dashboard`, shoppers → `/`).

2. **Incognito homepage → login redirect** — `useRankUp` called `useXpProfile()` without an `enabled` gate, firing an authenticated query for unauthenticated users → 401 → interceptor → `/login`. Fixed: `useXpProfile(!!user)` in `useRankUp.ts`.

3. **Homepage shows "No sales yet"** — `getStaticProps` can't reach Railway at Vercel build time (uses `localhost:3001` fallback) → returns `initialSalesData: null` → react-query treated null as valid cached data, skipped the `/api/feed` fetch entirely. Fixed: removed `initialData: initialSalesData` from the useQuery options in `index.tsx`.

4. **OrganizerOnboardingModal can't be closed** — Both `OrganizerOnboardingModal` (wraps in `FocusTrap` via `AccessibleModal`) and `OnboardingWizard` rendered simultaneously for new organizers. `OnboardingWizard` (later in DOM, same `z-50`) painted on top visually; FocusTrap from the underlying modal locked input on the wizard's buttons. Fixed: added `dashboardState !== 'new'` guard to `OnboardingWizard` render condition — new organizers only see `OrganizerOnboardingModal`.

**S674 files changed:**
- `packages/frontend/pages/_app.tsx` — OAuthBridge: role-based redirect after token exchange
- `packages/frontend/hooks/useRankUp.ts` — gate `useXpProfile(!!user)`
- `packages/frontend/pages/index.tsx` — remove `initialData: initialSalesData` from feed useQuery
- `packages/frontend/pages/organizer/dashboard.tsx` — add `dashboardState !== 'new'` to OnboardingWizard condition

TS check: zero errors. Not yet pushed.

---

**Previous: S673 — OAuth Path C Implemented (INCOMPLETE — Google OAuth still broken at wrap)**

Path C fully shipped: NextAuth moved to standard `/api/auth/[...nextauth].ts`. `beforeFiles` rewrites in `next.config.js` protect 14 backend `/api/auth/*` paths from the NextAuth catch-all. OAuth exchange moved from server-side (Vercel→Railway, cookies never reach browser) to browser-side (OAuthBridge POSTs to `/api/auth/oauth` with `credentials:'include'`). Homepage redirect bug fixed (api.ts 401 interceptor now guards `/auth/me`). Dockerfile cache-bust pushed to force Railway rebuild. All code shipped and deployed. Patrick confirmed at wrap: "still the same error with google oauth."

**Root cause hypothesis for next session:** Google OAuth was last known working **before S655**. Compare git history S655→S667 to find the exact commit that broke it. Key suspect: S667 moved NextAuth from `/api/auth/` to `/api/oauth/` and changed `AuthContext.tsx` to use `GET /auth/me` — this likely disrupted the cookie auth flow. The browser-side exchange fix in S673 should be the correct architecture, but something may still be wrong with how OAuthBridge reads the session, or the `/api/auth/oauth` proxy rewrite.

**S673 files shipped:**
- `packages/frontend/next.config.js` — `beforeFiles` rewrites for 14 backend paths (MCP pushed earlier)
- `packages/frontend/pages/api/auth/[...nextauth].ts` (NEW) — jwt callback stores OAuth profile in token; session callback exposes oauthProfile to browser; no server-side Railway call
- `packages/frontend/pages/_app.tsx` — OAuthBridge rewritten: browser-side POST to `/api/auth/oauth` with `credentials:'include'`; SessionProvider basePath → `/api/auth`
- `packages/frontend/lib/api.ts` — `/auth/me` guarded from 401 redirect (homepage fix)
- `packages/backend/Dockerfile.production` — cache-bust bumped to `2026-05-07b`
- `packages/frontend/pages/api/oauth/[...nextauth].ts` — DELETED (`git rm`)

**Previous: S671 — OAuth Revert + S669 Audit P0/P1 Batch Complete (COMPLETE — all pushed)**

Diagnosed root cause of persistent login bounce: `NEXT_PUBLIC_API_URL` pointed browser API calls directly to Railway (cross-domain XHR), blocking SameSite=Lax auth cookies and SameSite=Strict CSRF cookie. Fixed in 5 files: proxy routing (api.ts), refreshToken cookie path (authController.ts), clearCookie paths (auth.ts routes), CSRF bypass for /auth/refresh + /auth/logout (csrf.ts), and an infinite 401 loop guard in the response interceptor (api.ts). All pushed via MCP. Login ✅ VERIFIED in Chrome: signed in as user1@example.com (Alice Johnson), landed on /organizer/dashboard, no bounce.

**S670 items shipped:**
- P0 fix: `packages/frontend/lib/api.ts` — browser baseURL changed from NEXT_PUBLIC_API_URL to `/api` proxy; added guard to prevent 401 interceptor looping on `/auth/refresh` itself
- P0 fix: `packages/backend/src/controllers/authController.ts` — refreshToken cookie path `/auth/refresh` → `/` in all 4 cookie-setting locations (login, oauthLogin, register, refresh)
- P0 fix: `packages/backend/src/routes/auth.ts` — clearCookie path for refreshToken fixed to `/` in logout + refresh error handler; `/auth/refresh` + `/auth/logout` added to CSRF bypass
- P0 fix: `packages/backend/src/middleware/csrf.ts` — `/auth/refresh` and `/auth/logout` added to CSRF skip list

**Note:** Existing users with a stale refreshToken scoped to old path `/auth/refresh` will need to log in fresh once — this is expected and correct.

**Previous: S669 — 7-Lens Audit + Vercel Build Fix + Organizer.stripeOnboarded P0 (COMPLETE — pushed)**

7 parallel audit lenses run (mobile/PWA, performance, shopper competitive, shopper SEO, error states, pricing funnel, email). P0 login crash diagnosed from Railway logs and fixed via migration. Vercel build ERROR from S668 diagnosed and fixed. Chrome authenticated audit UNVERIFIED — auth cookie mechanism blocks programmatic login in Chrome MCP.

**S669 items shipped:**
- P0: `Organizer.stripeOnboarded` missing from production DB — caused "column does not exist" crash on every login. Migration `20260507000003_add_organizer_stripe_onboarded` created + Patrick ran `prisma migrate deploy` ✅
- Build fix: `ItemSearchResults.tsx` — `ItemSearchResult` type not assignable to `UnifiedItemCardItem | Item` (S668 SocialProofBadge wiring introduced mismatch). Fixed: imported `UnifiedItemCardItem`, cast `item as unknown as UnifiedItemCardItem` at line 132. Vercel should build green now.

**Audit findings (code-level — dev dispatch pending S670):**

*Mobile/PWA:*
- ✅ Viewport meta, safe-area-inset, 56px touch targets, manifest.json (8 icons, maskable)
- ❌ P1: `public/sw.js` pre-caches `/offline.html` but file doesn't exist — PWA falls back to network error

*Performance/Core Web Vitals:*
- ❌ P0: `SaleCard.tsx` — `<img loading="lazy">` on all cards including above-fold. Should be `loading="eager"` for first 4 cards (LCP hit)
- ❌ P0: `pages/sales/[id].tsx` — hero image client-side rendered, not in SSR pass (LCP risk)
- ❌ P1: `pages/index.tsx` — feed data fetched client-side via react-query; no ISR/SSG (slow initial paint)
- ✅ Cache-Control headers, PWA runtime caching

*Shopper-side SEO:*
- ❌ P0: Item pages (`/items/[id]`) have zero Product structured data (JSON-LD) — no rich snippets in Google
- ❌ P1: City pages silently `noindex` when empty — prevents Google from crawling new city pages
- ❌ P1: Category pages content-thin (list only, no editorial text) — weak signals for "estate sales in [city]" queries

*Email content:*
- ❌ P1: 6 email templates with CAN-SPAM compliance gaps (missing unsubscribe header in some)
- ❌ P1: "estate sale" banned term appears 5× across email templates (policy violation per decisions-log)
- ❌ P1: Unsubscribe links expose email as plain URL parameter (`?email=user@example.com`) — PII leak in server logs

*Not captured (agents lost to context compression):*
- Error/empty states audit — rerun in S670
- Shopper competitive audit — rerun in S670

*UNVERIFIED (Chrome login blocked):*
- Pricing/upgrade funnel walkthrough (FREE→SIMPLE→PRO→TEAMS)
- Mobile authenticated flows (organizer dashboard, rapid capture, POS)

**Previous: S668 — Multi-Lens Product Audit + P0/P1 Fix Batch (COMPLETE — pushed)**

4-lens audit (CRO, game design, organizer competitive, session integrity) + Lens 5 (organizer onboarding funnel). Two P0s found and fixed. P1s dispatched and shipped.

**S668 items shipped:**
- P0: Login loop — `_app.tsx` SessionProvider basePath `/api/oauth` + `api.ts` 401 redirect guard (fixes S667 NextAuth path migration regression)
- P0: `Item.moderationStatus` not in production DB — migration `20260507000002_add_item_moderation_status` (fixes auctionAutoCloseCron CRON FAIL every 5min)
- P1: SocialProofBadge + CountdownTimer wired into ItemCard/search/ItemSearchResults (existing components, now visible on browse/search)
- P1: Scout→Ranger XP threshold 2000→1200 (xpService, rankUtils, guild-primer — game balance fix)
- P1: Organizer MailerLite enrollment on signup — `addOrganizerSubscriber()` added + called on register/oauthLogin; organizers now enter Beta Onboarding automation
- UX: `index.tsx` — "Running a sale? List it free" subtle text link below hero search bar (tasteful, hidden when searching)
- Env var needed: `MAILERLITE_ORGANIZERS_GROUP_ID` in Railway

**Previous: S667 — S666 Backlog Sweep: All 16 Meta-Audit Items Shipped (COMPLETE — pushed)**

S666 deferred 16 items. Patrick decided: (A) NextAuth → `/api/oauth/`, (B) Sentry Crons for observability. All 16 items dispatched via 7 parallel dev agents, verified, and pushed via `.\push.ps1`.

**Post-session fixes (pushed via MCP):**
- `packages/frontend/pages/organizer/settings.tsx` — `link.parentChild` → `link.parentNode` (TS error blocking Vercel)
- `packages/backend/src/routes/auth.ts` — `ipKeyGenerator` helper in `resetPasswordLimiter` (ERR_ERL_KEY_GEN_IPV6 on startup)
- `packages/backend/Dockerfile.production` — cache-bust bumped 2026-05-06 → 2026-05-07 (forced Railway rebuild)
- Facebook OAuth redirect URI updated: `/api/auth/callback/facebook` → `/api/oauth/callback/facebook` ✅
- Google OAuth redirect URI updated in Google Cloud Console ✅
- CCPA migration (`20260507000001_add_ccpa_opt_out`) — `prisma migrate deploy` run ✅
- Stripe Tax: `automatic_tax: {enabled: true}` is wired but intentionally NOT activated in Stripe Dashboard. One dashboard toggle activates it if ever needed — no code changes required.

**Railway:** ✅ Green (backend active, IPv6 rate-limit warning resolved)
**Vercel:** ✅ Green

**S667 items completed:**

*Auth (Batch 1):*
- `/api/oauth/[...nextauth].ts` — NextAuth moved from `/api/auth/`; resolves V5 routing conflict blocking JWT cookie auth
- `AuthContext.tsx` — removed localStorage JWT reads, now calls `GET /api/auth/me` with `credentials:'include'` on mount
- `lib/api.ts` — `withCredentials:true` on axios instance, 401 interceptor calls `/auth/refresh` once then redirects
- All cookies now have `secure: true` unconditionally (was conditional on NODE_ENV)
- Old file `packages/frontend/pages/api/auth/[...nextauth].ts` deleted (`git rm`)
- 15 frontend files still use localStorage JWT — non-blocking, flagged for future sweep

*GDPR/Legal (Batch 2):*
- `userController.ts` — `exportMyData()`: 24h rate limit, queries all user data, returns JSON download
- `routes/users.ts` — `GET /me/export` + `POST /me/do-not-sell` routes
- `pages/do-not-sell.tsx` (NEW) — CCPA opt-out page
- `organizer/settings.tsx` — "Download My Data" button
- `terms.tsx` — Section 15 arbitration clause (AAA, Kent County MI, class action waiver, 30-day opt-out)
- `outreachEmailsCron.ts` — CAN-SPAM address: `'219 E Michigan Ave, Suite F, Paw Paw, MI 49079'`
- `schema.prisma` — `ccpaOptOut Boolean @default(false)` on User
- Migration: `20260507000001_add_ccpa_opt_out` ✅ deployed

*Stripe + Auction (Batch 3):*
- `stripeController.ts` — `charge.refunded` webhook handler + `automatic_tax:{enabled:true}` on PaymentIntent/Checkout
- `tierLapseService.ts` — dunning grace: was immediate downgrade, now `TIER_GRACE_DAYS` env (default 7)
- `itemController.ts` — bid validation: type check + positive + must exceed currentHighBid

*SEO + Accessibility (Batch 4):*
- Canonical URLs on 5 pages: `sales/[id]`, `items/[id]`, `organizers/[id]`, `categories/[category]`, `search`
- `globals.css` — `@media (prefers-reduced-motion: reduce)` block

*Observability (Batch 5):*
- `cronGuard.ts` — Sentry Cron check-ins (`in_progress`/`ok`/`error` per run) on all 38 cron jobs
- `prisma.ts` — slow-query listener (>1000ms → Sentry), connection pool monitor (>8 busy → Sentry)
- `index.ts` — SIGTERM/SIGINT graceful shutdown (30s drain), deliverabilityMonitorJob wired
- `deliverabilityMonitorJob.ts` (NEW) — weekly cron, bounce rate alert if >2% in 7 days

*Scraper hardening (Batch 6):*
- `dedupe.ts` — `normalizeAddress()` (suffix/directional normalization), multi-level dedup pipeline
- `processRapidDraft.ts` — camera race fix: optimistic lock with `updatedAt` snapshot; organizer-set values win on conflict
- `geocodingAuditJob.ts` (NEW) — daily 6AM UTC, Sentry alert if any source has >10% null geocoding
- `dedupe.test.ts` (NEW) — 20+ unit tests for normalizeAddress + checkDuplicate
- `backend/package.json` — jest/ts-jest/@types/jest added

*Claim/Content/Games (Batch 7):*
- `organizers.ts` — `GET /organizers/claim/verify/:token` (24h expiry, sets VERIFIED status)
- `pages/claim/verify/[token].tsx` (NEW) — loading/success/expired/invalid states
- `uploadController.ts` — NSFW detection via Cloudinary AWS Rekognition; auto-deletes flagged images
- `itemController.ts` — Cloudinary orphan cleanup when item deleted
- `admin/feature-flags.tsx` — D-006: "Enable AI camera tagging" → "Enable Smart camera tagging"
- `routes/admin.ts` — `GET /admin/xp-velocity` endpoint (flags users >500 XP/hr in 7-day window)
- `pages/admin/xp-velocity.tsx` (NEW) — admin table of flagged users
- `claude_docs/API_RESPONSE_FORMAT.md` (NEW) — standard response shapes reference

---

**Previous: S666 — Meta-Audit + Comprehensive P0/P1 Fix Batch (COMPLETE — pushed)**

Audit-of-audits sweep against S657–S665 work. 4 parallel meta-audit agents found 28 gaps; 5 verification probes confirmed which "shipped" claims were live. Three S664 deliverables were silently broken: (1) DOB field absent from `/register` HTML; (2) `/sales/[id]` + `/items/[id]` returning 200 with zero JSON-LD blocks; (3) `/api/auth/*` all 400 — NextAuth catch-all intercepting before Vercel rewrite to backend.

Migration deploy CONFIRMED: `ProcessedWebhookEvent` + `OutreachAuditLog` tables exist, `ageVerifiedAt` + `tokenVersion` present, `20260506000001_add_age_verified` live.

**S666 critical fixes shipped (51 files):**
- `adminAuth.ts` — multi-role regression fixed: checks `roles?.includes('ADMIN')` AND legacy `role === 'ADMIN'`
- `authController.ts` — `oauthVerifyAge` handler (validates DOB, sets ageVerifiedAt, blocks <18)
- `routes/auth.ts` — POST `/auth/oauth-verify-age` added; resetPasswordLimiter + verifyEmailLimiter added
- Auction close wrapped in `prisma.$transaction()` with optimistic-lock guard (P0 — dual-winner race eliminated)
- `settlementController.ts` — addExpense/removeExpense/updateSettlement now atomic
- Stripe webhook idempotency switched to INSERT-FIRST with P2002 catch
- `cronGuard.ts` (NEW) — Sentry error wrapper, consecutive-failure counter
- All 38 cron jobs wrapped with cronGuard
- `weeklyEmailJob.ts` — cron string fixed from `'minute hour day-of-month month day-of-week'` placeholder to `'0 18 * * 0'`
- 4 new rate limiters: feedLimiter, searchLimiter, aiAnalyzeLimiter, paymentLimiter
- `pages/age-verify.tsx` (NEW) — OAuth signup age gate UI
- `pages/auth/oauth-callback.tsx` — redirects to `/age-verify` if ageVerifiedAt null

---

**Previous: S665 — Vercel Build Fix + S664 Code Audit (COMPLETE)**

Fixed `AccessibleModal.tsx` `handleKeyDown` using native DOM `KeyboardEvent` instead of `React.KeyboardEvent<HTMLDivElement>`. Confirmed `DELETE /users/me` in `routes/users.ts` line 439. Code audits verified JWT cookies on all 4 auth paths ✅, loginLimiter+registerLimiter ✅, /logout+/refresh+/me ✅, JSON-LD in sales/items ✅.

---

**Previous: S664 — Fortune 1000 Pre-Launch Sprint: 6-Audit + 13-Agent Implementation (COMPLETE)**

6 parallel audits → 13 implementation agents fixing all P0/P1/P2. COPPA age gate, JWT httpOnly cookies, 34/34 modals focus-trapped (AccessibleModal), homepage + sale/item SSR + JSON-LD, cookie consent banner, ToS legal gaps, sage contrast fix (3.2:1 → 4.5:1), bulk rate limiting, POS currency precision, account deletion UI, Stripe webhook idempotency, `ProcessedWebhookEvent` model, `ageVerifiedAt` schema field + migration `20260506000001_add_age_verified`.

---

**Previous: S663 — Fortune 1000 Pre-Launch Chrome QA + 9-File Fix Batch (COMPLETE)**

Full buyer journey QA. 9 files fixed: Shopper Pickups tab, Cart 404 redirect, CAN-SPAM unsubscribe footer in all emails, hold-placed email to shopper, vaporware copy removed, TODO comments cleaned.

---

**Previous: S662 — Pre-Launch Sitewide Audit + 23-File Fix Batch (COMPLETE)**

24 issues found (6 P0, 10 P1, 8 P2), all fixed. useLiveFeed 500 fix (null ref on `fav.user.name`), next.config.js proxy fix (moved Railway proxy to `fallback`), broken sale card images (onError SVG placeholder), hold button feedback (1.5s delay + toast), forgot-password error state, reset-password styled loading, "Remember me" dead UI removed, Tour CTA href="#" → /guide, add-items empty state, edit-sale 0-items warning, condition label fix, PWA install spam throttle, `prefers-reduced-motion` CSS, brand copy fixes.

---

**Previous: S661 — Chrome QA: #228 ✅ #94 ✅ | #251 #235 UNVERIFIED (COMPLETE)**

#228 Settlement Hub — ✅ VERIFIED as `artifactmi@gmail.com`. All 4 wizard steps render. #94 /admin/bid-review — ✅ VERIFIED as `user1@example.com`. #251 priceBeforeMarkdown — ⚠️ UNVERIFIED (no item with markdownApplied=true in prod). #235 DonationModal — ⚠️ UNVERIFIED (needs SaleDonation record + available items).

---

**Previous: S659 — CategorySync Debugging (COMPLETE)**

Fixed multi-layer failure in `categorySyncCron.ts`. eBay marketplace header, direct OAuth revert, pre-encoded filter syntax. pnpm-lock.yaml fixed. CategoryTopFinds re-triggered in S660.

---

**Previous: S658 — Comprehensive Pre-Outreach Security Audit + 15 Fixes (COMPLETE)**

Resend webhook signature verification (svix), image upload MIME whitelist + magic bytes, Cloudinary `resource_type: 'image'`, Stripe Connect ownership validation + audit logging, outreach rate limits, error log credential redaction, subject line newline injection fix, CAN-SPAM audit trail (`OutreachAuditLog` model + migration `20260506000000_add_outreach_audit_log` ✅ deployed), processedWebhookEvent pruning cron.

---

**Previous: S657 — Outreach Security Audit + Fixes + Chrome QA (COMPLETE)**

Open redirect fix in `/api/outreach/click` (added finda.sale allowlist). PII in Railway logs fixed. #382 Sale Type Ordering ✅ VERIFIED in Chrome (yard sales first across all 5 locations).

---

**Previous: S654 — Scraper Hardening + Crash Fix + Nav Bug (COMPLETE)**

UA pool updated (Chrome 134/135, Firefox 135/136, Safari 18.3). Log fingerprinting scrubbed. GitHub Actions DATABASE_URL fix (4 workflows). Orphaned claim email system removed (`claimEmailService` + `claimEmailCron`). P0 crash fix in `routes/internal.ts` (truncated file → crash loop). Explore nav dropdown fixed.

---

**Previous: S653 — CF Image Proxy Audit + Security Hardening (COMPLETE)**

19 image proxy locations fixed across frontend. Trending algorithm fixed (permanent retail flooding "Hot Sales"). Three security P0s fixed. `onLoadingComplete` deprecated across all `<Image>` components.

---

**Previous: S652 — CF Image Proxy End-to-End Verified (COMPLETE)**

ESN scraped sale photos load on browse and detail pages. SW intercept fix (excluded CF Worker domain from SW catch-all in `next.config.js`).

---

**Previous: S651 — Search Console Audit + Scraper Stealth + P0 Fix (COMPLETE)**

Soft 404 fix (`{ notFound: true }` for 404 API responses). Playwright stealth scraper in `saleDetailEnrichment.ts`. Conditional GETs in `httpCache.ts`. AI listing enrichment (`listingEnrichmentService.ts`). Cloudflare Worker image proxy deployed. P0 crashes fixed: playwright-extra default import, truncated saleDetailEnrichment.ts.

---

**Previous: S649 — Cold Outreach Pipeline Activated (COMPLETE — e2e verified)**

Full cold outreach pipeline live. DKIM activated for outreach.finda.sale. "Send mail as" `find@outreach.finda.sale` alias registered. E2E verified: Yahoo primary tab, Gmail signed-by DKIM, pixel flip, unsubscribe JWT. 3,301 organizers in queue. Railway env vars set: OUTREACH_ENABLED, OUTREACH_FROM_EMAIL, OUTREACH_PHYSICAL_ADDRESS.

---

**Previous: S647 — Settlement Hub Fix + Cold Outreach Pipeline + SEO P0/P1 + 75 Guide Drafts (COMPLETE)**

Settlement Hub (#228): `platformFeeAmount` + `netProceeds` computed at creation. Cold Outreach Pipeline: EmailSuppression + touch-tracking columns (migration `20260505000000`), `outreachEmailsCron.ts`, suppressionService. SEO: category pages ISR, sale pages Event JSON-LD. 75 guide drafts written to `claude_docs/strategy/guides-drafts/`.

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| WCAG skip link re-verify | ✅ S682 VERIFIED — Tab once on finda.sale, amber "Skip to main content" button appears overlaying header top-left, disappears when focus moves. z-[100] fix working correctly. | — | S681 |
| WCAG error ARIA | ✅ S697 SUFFICIENT COVERAGE — Batches S684 (9 components + 5 pages) + S689 (4 more) + S697 (4 files: EbayCategoryPicker, ReturnRequestModal, broadcast, feature-flags). All high-traffic error states covered. | — | S683 |
| JWT httpOnly cookies | ✅ VERIFIED S670 — login worked through proxy, cookies set correctly | — | S664/S667 |
| COPPA age gate | ✅ S688 VERIFIED — DOB <18 on /register correctly blocked with "You must be 18 or older" error. | — | S664 |
| Sales/Items SSR JSON-LD | ✅ S689 VERIFIED — JS extraction confirmed `<script type="application/ld+json">` present on pricing/about/faq/index with correct schema types. | — | S664 |
| Modal focus traps (34 modals) | ✅ S681 VERIFIED — MessageComposeModal tested. Tab trap ✅, Escape ✅, focus-on-open ✅ (fix shipped). Other modals assumed covered by AccessibleModal fix. | — | S664 |
| Claim verify flow | ✅ S688 VERIFIED — All 3 states confirmed: invalid token → "Invalid Link", valid token → "Email Verified!" with business name, already-used → "Already Verified". | — | S667 |
| NSFW detection | Code shipped S667 but not browser-tested | Upload an image via organizer flow, confirm Cloudinary moderation runs | S667 |
| **#174 Auction — bid flow + reverse auction** | `items/[id].tsx` `maxBidAmount` fix needs deploy. Data is seeded (sale `c5hykxxecanngwcrkvq92n1va`, user2@example.com). | Push `items/[id].tsx`, then QA: login as user12/Seedy2025!, navigate to sale, bid on Vintage Brass Compass ($30 on $25 start), verify reverse auction item shows ~$75 dropping price, check organizer bid view. | S693 |
| #251 priceBeforeMarkdown | No production item with markdownApplied=true | Seed item with markdownApplied=true, verify strikethrough price renders | S661 |
| #235 DonationModal | ✅ S689 VERIFIED end-to-end. Two-iteration fix: double /api/ prefix (S688) + auth/me subscriptionLapsed field (S689). PRO tier gate opens correctly, all 3 steps render. | — | S661 |
| AI listing enrichment | Fire-and-forget — needs scraped sale with description >50 chars | Check Railway logs for `[listingEnrichmentService]` or query `scrapedMetadata.aiEnriched` | S651 |
| CategoryTopFinds TrendingSection | Cron runs 05:00 UTC — no data until first run | QA after first nightly run; verify TrendingSection renders on `/categories/[category]` | S647 |
| Outreach pipeline open/click tracking | Can't verify without real sends | After `OUTREACH_ENABLED=true` + first cron run: check Railway logs, confirm pixel route 200 | S647 |

---

### S693 — #174 Auction QA Setup + Bid Fix (COMPLETE — push needed)

Seeded 5 auction items on user2's production auction sale. QA run found two bugs: (1) `bidAmount` → `maxBidAmount` field name mismatch (ADR-013 contract) causing 400 on all bid attempts — fixed in `items/[id].tsx`; (2) 2 of 5 items hidden by `PUBLIC_ITEM_FILTER` due to wrong `draftStatus` (DRAFT/APPROVED instead of PUBLISHED) — fixed directly in DB. Re-run QA after `items/[id].tsx` deploy to verify full bid flow + reverse auction display.

---

## Recent Sessions (S693–S699)

### S699 — Design Strategy Session: 5 briefs + implementation order (COMPLETE — push block provided)

Pure design strategy session. Reviewed 5 Claude Design handoff zip files (Sessions 1–5 returns). Created 5 design brief/reply files in `claude_docs/design/`. Key answers to design open questions: light is the default tone (dark is organizer-selectable); DRAFT/PUBLISHED/ENDED are schema values (UPCOMING/LIVE are derived at render); storefront identity = Simple/Pro/Teams (BRONZE/SILVER/GOLD = activity reputation, not identity); aiSuggestedPrice must always be a ghost placeholder, never pre-filled; no "AI" in copy. Recommended session order for next design cycle: storefront v0.2 → broadcast + sale types. Identified one dev gap: Online Only wizard toggle designed in `sale-types.jsx` but not integrated into `wizard.jsx` Step 2 — dev must pull and wire it.

---

### S697 — WCAG ARIA + 13 Scraper URL Corrections + WA Scraper + Lead Priority + Phase 2 Scrapers + Email Discovery + Settings P1 Fix (COMPLETE — push block provided)

3 parallel dispatch batches. WCAG error ARIA on 4 frontend files. 13 state licensing scraper endpoints corrected (AL AR FL GA IA KY LA ME MS ND SC SD WV). Washington scraper NEW. outreachEmailsCron HOT/WARM/COLD/fallback 4-pass prioritization. AK/NJ/WY Phase 2 pawnbroker scrapers + OK Phase 2 PDF scraper. emailDiscoveryService (3-stage: website scrape → pattern probe → SMTP RCPT TO) + emailDiscoveryJob (cursor-paginated batch). P1 fix: GET /organizers/me missing organizerTypes caused #352/#353 settings fields not persisting on reload. Phase 2 research blocked: AZ/DE/ID/IL/KS/MI/MN/MO all city-level or restricted. IL IDFPR portal needs manual inspection.

---

### S696 — Indiana Licensing Fix + Source Tracking + Matrix Throughput (COMPLETE — push pending)

Indiana scraper conflict resolved (31 merge conflict markers). Source tracking forward-fix (all Foursquare/HERE/OSM upserts now set directoryMostRecentSource). GitHub Actions 6-job parallel matrix for Foursquare + HERE scrapers (301 metros in 10–15min vs 60+ min sequential).

---

### S695 — Google Maps Lockdown + Metro List 100→301 + Admin Stats Fix (COMPLETE — push pending)

Google Places stripped from enrichment.ts. Foursquare confirmed safe (Sandbox plan, no billing). Metro list expanded 100→301 (estate-sale weighted). Admin stat contamination fixed (isUnmanagedListing filter on all 6 real-user queries). Scrape pool admin dashboard added.

---

### S693 — #174 Auction QA Setup + Bid Fix (COMPLETE — push pending)

5 auction items seeded on user2's production sale. maxBidAmount field name fix. draftStatus filter fixed in DB. QA re-run needed after bid fix deploys.

---

### S692 — Backend Crash + Camera Fix (COMPLETE)

Backend crash fixed (MODULE_NOT_FOUND for scraper source files). Camera upload fixed (aws_rek_tagging add-on not active, returning 420 on every upload — removed). uploadToCloudinaryWithRetry wrapper added.

---

### S691 — 50-State Scraper Audit + Safe Fixes (PARTIAL — push block below)

Research confirmed 18 states with real auctioneer licensing + verified URLs, 16 states with no auctioneer license (Phase 2 alternatives: secondhand dealer, pawnbroker, SoS keyword search), and 8 more from the S690 batch needing Phase 2 treatment. TX scraper rewritten to Socrata API. NC yml renamed. WV space-named duplicate queued for manual deletion. Roadmap updated (v136, #393 added). Phase 2 URL-correction and replacement dispatch is next session's priority. Locked rule: never delete a state until all Phase 2 alternatives exhausted.

---

### S690 — Roadmap Audit + Full Graduation Pass (COMPLETE)

Full STATE.md vs roadmap.md cross-reference. roadmap.md updated to v135. BROKEN items reorganized: #7/#13/#41/#48/#50/#184 → TESTING, #80 → SHIPPED & VERIFIED, #46 marked Deprecated. Status columns updated for 12 features verified S684–S688. Full graduation pass: 23 Chrome-verified rows promoted to SHIPPED & VERIFIED. Memory feedback saved: complete-the-full-assignment.

---

### S689 — Lead Scoring Service + Scraper Crash Loop Fixes (COMPLETE — MCP pushed)

ADR-076 Phase 2 complete. `leadScoringService.ts` + `leadScoringJob.ts` built and MCP-pushed. Three scraper source files that were local-only (saleSeeker, indianaLicensingScraper, osmScraper) pushed to fix Railway crash loops. Backfill triggered: 7,897 scored — COLD=3,235 WARM=4,662 HOT=0 ENTERPRISE=0. Weekly re-score wired (Sundays 2 AM UTC). Workflow YMLs for 3 scrapers still need Patrick manual push (MCP lacks `workflow` scope).

---

### S688 — Chrome QA Sprint: COPPA ✅ Claim Verify ✅ DonationModal Bug Found (COMPLETE)

COPPA and claim verify flow verified in Chrome. DonationModal double-`/api/` prefix bug found and fixed inline in `SettlementWizard.tsx`.

---

### S687 — Directory Rebuild: Schema + 3 New Scrapers (COMPLETE — Vercel ✅ Railway ✅)

14 schema fields + 3 indexes (migration `20260508000001`). OSM, Indiana licensing, Sale Seeker scrapers built. Merge algorithm updated with 5-path dedup.

---

### S685 — #393 Chrome QA Sprint: Holds + Settlement + Purchase Confirmation (COMPLETE)

Holds ✅, Settlement Wizard ✅, Purchase Confirmation ✅ all verified in Chrome. P2 fixes shipped mid-session.

---

### S684 — WCAG Error ARIA Sprint + #310 Discount Rules Fix (COMPLETE — Vercel GREEN)

`aria-invalid` + `aria-describedby` on 14 files (Batch A + B). Discount Rules `parseInt` → `parseFloat` decimal fix.

---

### S681 — WCAG #391 Chrome Keyboard/Focus QA (COMPLETE — partially pushed)

Live keyboard testing in Chrome against finda.sale. Three bugs found: (1) Skip link invisible when focused — `z-50` collided with header's `z-50`, fixed `z-[100]`. (2) Duplicate `id="main-content"` — S680 added `<main id>` inside existing `<div id="main-content">`, browser jumped to wrong element, removed from outer div. (3) Modal focus-on-open — `initialFocus: false` in AccessibleModal.tsx prevented focus-trap-react from moving focus inside modal (WCAG 2.4.3 violation, affected all 20+ modals), fixed by removing the option. AccessibleModal fix pushed via MCP + Vercel verified. Layout.tsx fix in Patrick pushblock.

---

### S678 — MCP Server Railway Deploy + DNS + mcp.json Active (COMPLETE — MCP pushed)

Root cause of repeated Railway build failures: repo-root `railway.toml` hardcoded `dockerfilePath = "packages/backend/Dockerfile.production"`, overriding the new MCP service's settings regardless of Root Directory configuration. Fix: added `packages/mcp-server/railway.toml` with `dockerfilePath = "Dockerfile.production"`. Two TypeScript compile errors also fixed (unused params + noUnusedLocals/Parameters → false in tsconfig). Server deployed and verified: `findasale-production.up.railway.app/health` returns `{"status":"ok","tools":7,"environment":"production"}`. DNS CNAME `mcp.finda.sale` → Railway added in Vercel. `.well-known/mcp.json` status updated to `active`.

---

### S677 — Audio Notes UX Fix + Build Fixes (COMPLETE — pushed)

VoiceTagButton in edit-item tags section was silently discarding transcript data (name/category/price extracted but never saved). Replaced with `VoiceDescriptionInput.tsx` alongside the description textarea: always saves full transcript as description, auto-populates empty fields, shows inline "Voice suggestion · Accept / Keep" for pre-filled fields. VoiceTagButton removed from tags section. pnpm lockfile regenerated (mcp-server was missing). TS type mismatch on fieldUpdate prop fixed.

---

### S676 — AI Agent Discoverability + MCP Server Phase 1 (COMPLETE — pushed)

llms.txt, robots.txt AI crawler allowlist, JSON-LD on pricing/about/faq/homepage, `.well-known/mcp.json` (status: coming-soon), MCP server package with 7 tools built and Railway-ready. SSR assessment: all 3 public pages already SSR-safe, no changes needed.

---

### S675 — Sentry P0 Sale Indexes + Enrichment Guard (COMPLETE — pushed)

4 Sale model indexes added (migration `20260507000004_sale_feed_indexes`) fixing 1391ms slow query. user11 contamination fixed + `@example.com` guard added to enrichment pipeline. schema.prisma truncation repaired.

---

### S674 — Post-S673 Bug Fixes: OAuth redirect + incognito loop + empty homepage + frozen modal (COMPLETE — pushed)

4 live bugs found and fixed. (1) Google OAuth post-login landed back on `/login` — OAuthBridge exchanged token but never redirected; added role-based `router.replace()` after `login()`. (2) Incognito homepage redirected to `/login` — `useRankUp` called `useXpProfile()` with no auth gate, triggering 401 → interceptor → redirect for unauthenticated users; fixed by passing `!!user` to `useXpProfile`. (3) Homepage showed "No sales yet" despite active sales — `getStaticProps` returns `initialSalesData: null` at Vercel build time; `initialData: null` made react-query skip the `/api/feed` fetch; fixed by removing `initialData` from useQuery. (4) OrganizerOnboardingModal buttons frozen — `OnboardingWizard` and `OrganizerOnboardingModal` both rendered at `z-50`; wizard is on top visually, FocusTrap from underlying modal locked wizard buttons; fixed by adding `dashboardState !== 'new'` guard to wizard render condition. TS: zero errors.

---

### S673 — OAuth Path C Implementation (INCOMPLETE — OAuth still broken at wrap)

Path C: moved NextAuth from `/api/oauth/[...nextauth].ts` to standard `/api/auth/[...nextauth].ts`. Added `beforeFiles` rewrites in `next.config.js` to protect 14 backend `/api/auth/*` routes from NextAuth catch-all (beforeFiles run before all filesystem routes). Fixed the fundamental httpOnly cookie problem: server-side OAuth exchange (Vercel→Railway in jwt callback) means Railway's Set-Cookie headers go to Vercel's node process, not the browser — auth cookies never reach browser. Fix: OAuthBridge now makes browser-side POST to `/api/auth/oauth` (proxied via beforeFiles rewrite) with `credentials:'include'`. Also fixed homepage redirect bug — api.ts 401 interceptor was redirecting ALL 401s including `/auth/me`'s normal 401 for unauthenticated users. Patrick confirmed OAuth still broken at wrap. Last known working: before S655. Pushes needed in next-session pushblock below.

---

### S672 — OAuth Diagnosis (INCOMPLETE — fix attempt failed)

Confirmed NextAuth v4 doesn't honor NEXTAUTH_URL pathname — Google always sends callback to `/api/auth/callback/google` regardless of handler location. Stripped redirect_uri overrides (commit b98b3d8). Concluded: stop fighting the routing, implement Path C (standard `/api/auth/` with beforeFiles protecting backend routes).

---

### S671 — OAuth Revert + S669 Audit P0/P1 Batch (COMPLETE — MCP pushed)

OAuth redirect_uri_mismatch fixed + revert: `/api/oauth/[...nextauth].ts` restored with redirect_uri overrides. Bad attempt to move to `/api/auth/` deleted. S669 audit P0/P1 batch: 16 files MCP-pushed — SaleCard LCP eager load, ISR on index.tsx, offline.html, city noindex fix, email compliance (token-based unsubscribe in 6 email services, "estate sale" banned terms removed).

---

### S670 — P0 Login Bounce Fixed + Chrome Verified (COMPLETE — MCP pushed)

Root cause of login bounce: browser API calls bypassed the Next.js proxy, going cross-domain to Railway and breaking SameSite cookie restrictions. Fixed in 5 files across frontend + backend. Also patched an infinite 401 loop in the response interceptor (api.post('/auth/refresh') was triggering its own interceptor, flooding the refresh endpoint with 90+ calls per page load — now guarded). All 5 files pushed to GitHub via MCP. Vercel deployed and Chrome-tested: login as user1@example.com → /organizer/dashboard ✅ no bounce.

---

### S669 — 7-Lens Audit + Build Fix + Organizer.stripeOnboarded P0 (COMPLETE — pushed)

7-lens parallel audit (mobile/PWA, performance, shopper competitive, shopper SEO, error states, pricing funnel, email). P0 discovered from Railway logs: `Organizer.stripeOnboarded` column missing from production DB — was crashing every login. Migration created + deployed. Vercel build ERROR (S668 SocialProofBadge wiring introduced `ItemSearchResult` type mismatch) — fixed in `ItemSearchResults.tsx`. Chrome authenticated audit fully blocked: auth cookie flow (httpOnly cross-domain) cannot be established via Chrome MCP's programmatic fetch approach. All authenticated flows remain UNVERIFIED. Audit findings documented above; dev dispatch is S670 first action.

---

### S668 — Multi-Lens Product Audit + P0/P1 Fix Batch (COMPLETE — pushed)

5-lens parallel audit. Lens 1 (CRO): SocialProofBadge + CountdownTimer were built but never deployed — now wired into browse/search item cards. Lens 2 (Game design): Scout→Ranger XP curve too steep — fixed 2000→1200. Lens 3 (Organizer competitive): onboarding email gap found — organizers never enrolled in MailerLite automation on signup, now fixed. Lens 4 (Session integrity): #336 race fix confirmed present, #228 roadmap row stale. Lens 5 (Onboarding funnel): 3-email drip automation exists in MailerLite but organizers were never subscribed — enrollment fix shipped. Two P0s found and fixed: login loop from S667 SessionProvider basePath mismatch, and Item.moderationStatus missing from prod DB crashing auctionAutoCloseCron every 5 min. Homepage: subtle "Running a sale? List it free" text link added below search bar. Patrick direction: no fake social proof, no copy bloat — lean into being new and fresh.

---

### S674 — Post-S673 Bug Fixes: OAuth redirect + incognito loop + empty homepage + frozen modal (COMPLETE — pushed)

4 live bugs found and fixed. Google OAuth post-login landed back on `/login` — OAuthBridge exchanged token but never redirected. Incognito homepage redirected to `/login` — `useRankUp` called `useXpProfile()` with no auth gate. Homepage showed "No sales yet" — `initialData: null` made react-query skip the `/api/feed` fetch. OrganizerOnboardingModal buttons frozen — `OnboardingWizard` and `OrganizerOnboardingModal` both at `z-50`, wizard on top visually, FocusTrap from underlying modal locked wizard buttons.

---

### S664 — Fortune 1000 Pre-Launch Sprint (COMPLETE — pushed)

6 parallel audits + 13 implementation agents. COPPA age gate, JWT httpOnly cookies, 34/34 modals focus-trapped, SSR + JSON-LD on sale/item pages, cookie consent, ToS gaps, sage contrast fix, POS currency precision, Stripe webhook idempotency, account deletion UI.

---

### S665 — Vercel Build Fix + S664 Code Audit (COMPLETE)

`AccessibleModal.tsx` KeyboardEvent type fix. Confirmed account deletion endpoint. Code-level audit of S664 batch verified all key changes present.

---

## Recent Sessions (S666–S671)

### S671 — OAuth Login Investigation (INCOMPLETE — Google/Facebook OAuth still broken)

Entire session consumed by OAuth `redirect_uri_mismatch` and followup issues. Root cause chain:

1. **redirect_uri_mismatch**: NextAuth v4 internally hardcodes `/api/auth/` in callback URLs regardless of handler file location. Since S667 moved the handler to `/api/oauth/[...nextauth].ts`, the fix is explicit `authorization.params.redirect_uri` override in GoogleProvider and FacebookProvider pointing to `/api/oauth/callback/[provider]`.

2. **Bad fix attempted**: A general-purpose agent concluded the move to `/api/oauth/` was unnecessary and that moving back to `/api/auth/` was safe. That was wrong. Moving NextAuth back to `/api/auth/[...nextauth].ts` created a catch-all that intercepted `POST /api/auth/refresh` and `GET /api/auth/me` (backend Railway routes), both returning 400. Result: immediate logout after every login attempt.

3. **Revert shipped**: `pages/api/oauth/[...nextauth].ts` restored with `redirect_uri` overrides for both providers. `pages/api/auth/[...nextauth].ts` deleted via `git rm`. `_app.tsx` SessionProvider basePath reverted to `/api/oauth`. Pushed and deployed.

4. **Error page fix**: Added `pages.error: '/login'` to NextAuth config — NextAuth v4 hardcodes `/api/auth/error` for errors, which no longer exists. This routes OAuth errors to login page instead of a broken URL.

5. **Rate limiter triggered**: All the failed `/auth/oauth` calls during the bad deployment triggered the backend's in-memory rate limiter. "Too many authentication attempts, please try again later." Railway restart needed to clear it.

6. **Status at wrap**: Rate limit still active. OAuth login unverified end-to-end. Railway backend needs restart to clear rate limit before next test.

**Files changed this session:**
- `packages/frontend/pages/api/oauth/[...nextauth].ts` — redirect_uri overrides + `error: '/login'` in pages config
- `packages/frontend/pages/_app.tsx` — basePath reverted to `/api/oauth`
- `packages/frontend/pages/api/auth/[...nextauth].ts` — DELETED (`git rm`)

**Google/Facebook Console state at wrap:** Both `/api/auth/callback/[provider]` AND `/api/oauth/callback/[provider]` are registered. Both being registered is fine. The `/api/oauth/` ones are what matter and are correctly registered.

**S671 continuation — S669 audit P0/P1 batch (16 files, all MCP pushed):**
Root cause: subagent writes to VM mount don't always flush to Windows git staging before `.\push.ps1`. MCP `push_files` reads Windows path directly, bypassing the sync window. Process rule added to `feedback_subagent_write_verification.md`.

Files: `SaleCard.tsx` (P0 LCP — eager loading above-fold), `feed.tsx`, `public/offline.html` (P1 — sw.js gap), `city/[slug].tsx` (P1 — noindex fix), `notifications.tsx`, `search.tsx`, `sales/[id].tsx` (hero LCP), `index.tsx` (P0 ISR revalidate:300 + priority), `shopper/dashboard.tsx` (error banner), `mailerliteService.ts`, `weeklyEmailService.ts`, `emailReminderService.ts`, `buyerMatchService.ts`, `organizerAnalyticsService.ts`, `curatorEmailJob.ts`, `waitlistController.ts` — all 6 email services: token-based unsubscribe replacing raw `?email=` PII (P1 compliance).

---

### S670 — P0 Login Bounce Fixed + Chrome Verified (COMPLETE — MCP pushed)

Root cause of login bounce: browser API calls bypassed the Next.js proxy, going cross-domain to Railway and breaking SameSite cookie restrictions. Fixed in 5 files across frontend + backend. Also patched an infinite 401 loop in the response interceptor (api.post('/auth/refresh') was triggering its own interceptor, flooding the refresh endpoint with 90+ calls per page load — now guarded). All 5 files pushed to GitHub via MCP. Vercel deployed and Chrome-tested: login as user1@example.com → /organizer/dashboard ✅ no bounce.

---

### S669 — 7-Lens Audit + Build Fix + Organizer.stripeOnboarded P0 (COMPLETE — pushed)

7-lens parallel audit (mobile/PWA, performance, shopper competitive, shopper SEO, error states, pricing funnel, email). P0 discovered from Railway logs: `Organizer.stripeOnboarded` column missing from production DB — was crashing every login. Migration created + deployed. Vercel build ERROR (S668 SocialProofBadge wiring introduced `ItemSearchResult` type mismatch) — fixed in `ItemSearchResults.tsx`. Chrome authenticated audit fully blocked: auth cookie flow (httpOnly cross-domain) cannot be established via Chrome MCP's programmatic fetch approach. All authenticated flows remain UNVERIFIED. Audit findings documented above; dev dispatch is S670 first action.

---

### S668 — Multi-Lens Product Audit + P0/P1 Fix Batch (COMPLETE — pushed)

5-lens parallel audit. Lens 1 (CRO): SocialProofBadge + CountdownTimer were built but never deployed — now wired into browse/search item cards. Lens 2 (Game design): Scout→Ranger XP curve too steep — fixed 2000→1200. Lens 3 (Organizer competitive): onboarding email gap found — organizers never enrolled in MailerLite automation on signup, now fixed. Lens 4 (Session integrity): #336 race fix confirmed present, #228 roadmap row stale. Lens 5 (Onboarding funnel): 3-email drip automation exists in MailerLite but organizers were never subscribed — enrollment fix shipped. Two P0s found and fixed: login loop from S667 SessionProvider basePath mismatch, and Item.moderationStatus missing from prod DB crashing auctionAutoCloseCron every 5 min. Homepage: subtle "Running a sale? List it free" text link added below search bar. Patrick direction: no fake social proof, no copy bloat — lean into being new and fresh.

---

### S667 — S666 Backlog Sweep: All 16 Meta-Audit Items Shipped (COMPLETE — pushed)

All 16 S666-deferred items dispatched in 7 parallel dev batches. NextAuth → `/api/oauth/`. AuthContext + api.ts off localStorage. GDPR export + CCPA opt-out page + schema migration. ToS arbitration. CAN-SPAM address fixed. Stripe refund webhook + dunning grace. Canonical URLs on 5 pages. `prefers-reduced-motion`. Sentry Crons on all 38 jobs. Slow-query + pool monitoring. SIGTERM graceful shutdown. Deliverability monitor. Address normalization + 20 tests. Camera race fix. Geocoding audit cron. Claim verify endpoint + page. NSFW detection. Cloudinary orphan cleanup. XP velocity admin page. D-006 "AI" → "Smart". API_RESPONSE_FORMAT.md. Post-session: settings.tsx TS fix, ipKeyGenerator rate limiter fix, Railway cache-bust, OAuth redirects updated, CCPA migration deployed.

---

### S666 — Meta-Audit + Comprehensive P0/P1 Sweep (COMPLETE — pushed)

28 gaps found by 4 meta-audit agents. Key discoveries: admin role regression (IDOR), isUnmanagedListing missing on 4 controllers, auction dual-winner race, settlement non-atomic, weekly email cron with placeholder string never firing. All fixed. 38 cron jobs wrapped with Sentry. 4 new rate limiters. OAuth age gate UI added.

---

## Recent Sessions (S695)

### S695 — Google Maps API Lockdown + Directory Source Strategy (COMPLETE)

Full Google Maps Platform incident response and lockdown. Root cause: monthly GitHub Actions cron (`scrape-google-places.yml`) fired May 1, 2026 and ran 23 categories × 100+ metros × 3 pages, generating a $201.61 charge. Response:

- API key restricted to Places API + Places API (New) only (25 APIs stripped)
- 30/day quota cap on both remaining APIs (within free tier)
- `scrape-google-places.yml` workflow disabled manually in GitHub Actions
- Railway `GOOGLE_PLACES_API_KEY` env var deleted (prior session)
- GitHub Actions secret `GOOGLE_PLACES_API_KEY` deleted this session
- `requireSecret` middleware added to `/scraper/enrich-backfill` endpoint (was unauthenticated)
- 5,314 Organizer records cleared of `googlePlaceId`, `googleRating`, `googleRatingCount` (Google ToS compliance — persistent storage prohibited)
- 594 queued `DirectoryCrawlQueue` GooglePlaces jobs deleted
- Edward (Google support) response drafted confirming all preventive measures + data deletion

**Google Vision API confirmed active** — `cloudAIService.ts` uses it for photo label extraction → Haiku tag pipeline. Keep `GOOGLE_VISION_API_KEY` in `.env.example`. Not affected by this lockdown.

**Directory source audit findings:**
- Sale table: EstateSalesNet (7,492), Foursquare (3,656), Facebook Events (699), HEREPlaces (596) — zero GooglePlaces records
- DirectoryCrawlLog: Foursquare (301 runs), HEREPlaces (144 runs), OSM (71 runs) — GooglePlaces: 0 runs
- Organizer table: Google fields purged. Data now sourced from non-Google workflows only.

**Next session prompt written** (in claude_docs or Patrick's notes) — dispatches Innovation + Architect + Dev + Sales Ops in parallel to build comprehensive multi-source organizer directory from Foursquare, HERE, EstateSales.NET, Facebook Events, Eventbrite, OSM, and new sources. Cross-source deduplication and Teams/Enterprise lead scoring are the key deliverables.

---

## Next Session — S700

### Step 0 — All S691–S697 pushes complete ✅ (verified S698)

All push blocks cleared. S691–S697 commits confirmed on GitHub.

⚠️ Still pending (Patrick manual action): Delete `GOOGLE_PLACES_API_KEY` from Railway env vars + GitHub Secrets (S695 lockdown).

### Step 0 — Push S698 block

⚠️ Schema migration included — Patrick must run `prisma migrate deploy` + `prisma generate` after pushing.

```powershell
git add claude_docs/strategy/email-discovery-spec.md
git add packages/backend/src/services/mailerliteService.ts
git add packages/backend/src/jobs/outreachEmailsCron.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260508000002_email_discovery_fields/migration.sql
git add packages/backend/src/services/emailDiscoveryService.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "S698: MailerLite tier group wiring, email discovery schema, email-discovery-spec cleanup"
.\push.ps1
```

Then run migration (use PUBLIC proxy URL — not internal):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

Then add Railway env vars (Railway dashboard → findasale-backend → Variables):
- `MAILERLITE_COLD_GROUP_ID` — MailerLite group ID for COLD tier
- `MAILERLITE_WARM_GROUP_ID` — MailerLite group ID for WARM tier
- `MAILERLITE_HOT_GROUP_ID` — MailerLite group ID for HOT tier

### Step 1 — QA (#174 Auction — ready now)

S693 bid fix is deployed. Run Chrome QA:
- Login: user12@example.com / Seedy2025!
- URL: finda.sale/sales/c5hykxxecanngwcrkvq92n1va
- Bid $30 on Vintage Brass Compass ($25 start) — verify bid accepted, item shows RESERVED
- Verify reverse auction item shows ~$75 dropping price, floor $45
- Check organizer bid view as user2@example.com

Before any subagent runs, verify these S695 claims are actually on disk:

1. `enrichment.ts` — confirm `lookupGooglePlace`, `fetchGooglePlaceDetails`, `getGooglePhotoUrl` functions are gone. Grep for `GOOGLE_PLACES_API_KEY` in the file — should return nothing.
2. `googlePlaces.ts` — confirm `GOOGLE_PLACES_METROS` array has 301 entries (`grep -c "', '" ...` or count in Python).
3. `adminController.ts` — grep for `isUnmanagedListing: false` — should appear in 6 stat queries. Grep for `getScrapePoolStats` — should exist.
4. `scrape-pool.tsx` — confirm file exists at `packages/frontend/pages/admin/scrape-pool.tsx`.
5. `email-discovery-spec.md` — grep for `hunter\|clearbit\|apollo` — should return hits. This needs paid API refs stripped before Dev implements it.

---

### Step 2 — Innovation Dispatch (before Architect or Dev)

**Dispatch `findasale-innovation` with this brief:**

**Context:**
FindA.Sale scrapes secondhand/resale businesses as directory entries for outreach. We have scrapers for: ESN (EstateSales.NET company profiles), HERE Places API (free, 250K/month), Foursquare Places API (Sandbox, 9,450 free calls), state licensing databases (auctioneer/secondhand dealer), OSM/Overpass, Sale Seeker, and Facebook events.

**The core problem — throughput:**
GitHub Actions workflows have a 60-minute timeout. Our scrapers process metros sequentially. With 301 metros × 23 queries = 6,923 calls/run, the workflow dies at ~550 calls (~8% coverage). There is no cursor or queue — each run starts from metro 1. This means the same ~8 metros get scraped every month while 293 metros never get touched.

**Five problems that need creative solutions (generate ideas for all five, evaluate top 3 per problem):**

1. **Throughput / Coverage** — How do we get all 301 metros scraped reliably within GitHub Actions free tier constraints? Options to explore: cursor-based queue stored in DB (scraper picks up where it left off), splitting metros into batches across multiple workflow files, parallel matrix strategy in a single workflow, self-hosted runner, external trigger (cron via Railway instead of GitHub Actions), reducing calls per metro via smarter query selection.

2. **Source tracking gap** — 7,897 existing scraped orgs have `directoryMostRecentSource = NULL` and `sourcesJson = NULL`. The admin scrape pool dashboard can't show run history. Options: backfill job that infers source from existing data patterns, forward-fix only (new runs populate), hybrid approach.

3. **HOT lead score = 0** — All 7,897 scraped orgs score COLD or WARM. HOT requires `isStateLicensed` (25 pts) or 10+ Google reviews (now stripped). With Google Places gone, the scoring engine may never produce HOT leads from Places-sourced orgs. Options: recalibrate HOT threshold, add alternative signals (ESN membership = proxy for licensed?, website + phone + social media count = physical presence proxy), use state licensing scraper matches as `isStateLicensed` signal.

4. **Email discovery pipeline** — `email-discovery-spec.md` exists but: (a) has Hunter.io/Clearbit/Apollo references that must be removed, (b) `emailDiscoveryService.ts` is not built. Spec the correct free-only implementation using: website contact page scraping (Playwright/cheerio), SMTP RCPT-TO probing (smtp-validate-email), WHOIS lookup (whois-parser), and email pattern permutation. What's the right architecture — standalone service, enrichment pipeline step, or triggered on bounce?

5. **MailerLite sequence wiring** — `outreach-email-strategy.md` has COLD/WARM/HOT sequences designed but `outreachEmailsCron.ts` is not wired to them. Innovation: what's the smartest trigger logic? Time-based? Score-threshold-based? Event-based (organizer claims a listing → move to different sequence)? What does the MailerLite group/segment architecture look like for a 7,897-person list with 3 tiers?

**Output format:** For each problem, provide: current state, 3 creative options (including at least one non-obvious approach), recommended option with rationale, estimated token/dev cost to implement.

---

### Step 3 — Architect Dispatch (after Innovation returns)

Read Innovation output. Dispatch `findasale-architect` with:
- Innovation's recommended throughput solution
- Constraint: no new paid services, must work within GitHub Actions free tier OR Railway cron (already paid)
- Deliverable: technical spec for (a) cursor/queue system design, (b) source tracking backfill approach, (c) HOT score recalibration with revised signal weights, (d) emailDiscoveryService.ts architecture

---

### Step 4 — Dev Dispatch (after Architect returns)

Batch 1 (safe to run immediately, no architecture dependency):
- Strip Hunter.io/Clearbit/Apollo from `email-discovery-spec.md`
- Populate `directoryMostRecentSource` in Foursquare and HERE scraper output (forward-fix, 1–2 files)
- 50-state licensing scraper: 18 URL corrections (confirmed URLs from S691 research)

Batch 2 (after Architect spec):
- Implement cursor/queue system per Architect spec
- Implement `emailDiscoveryService.ts` free-only pipeline
- Wire MailerLite sequences into `outreachEmailsCron.ts`
- HOT score threshold recalibration

**Priority 7 — QA holdover**
- #174 Auction — push + QA (Priority 3 above)
- #251 priceBeforeMarkdown — needs TEAMS-tier test scenario
- #223 Organizer Guidance Layer rank badges — needs an active hold in prod

**Priority 1 — Push S694 changes**

```powershell
git add packages/backend/src/services/discoveryService.ts
git add packages/backend/src/routes/users.ts
git add packages/frontend/pages/shopper/settings.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S694: Geo bounding box feed fix + display name editing + admin role sync"
.\push.ps1
```

**Priority 2 — Push the #174 bid fix (still pending from S693)**

```powershell
git add packages/frontend/pages/items/[id].tsx
git commit -m "fix: bid API field name bidAmount → maxBidAmount (ADR-013 contract)"
.\push.ps1
```

Wait 2–3 min for Vercel, then re-run QA on #174: login as user12@example.com / Seedy2025!, go to finda.sale/sales/c5hykxxecanngwcrkvq92n1va, verify all 5 items visible, place a bid, verify reverse auction item shows ~$75.

**Priority 3 — Push S691 block (still pending)**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git rm ".github/workflows/scrape-nc-licensing.yml"
git rm "packages/backend/src/services/scraper/sources/westVirginia LicensingScraper.ts"
git add .github/workflows/scrape-north-carolina-licensing.yml
git add packages/backend/src/services/scraper/sources/texasLicensingScraper.ts
git add claude_docs/strategy/roadmap.md
git commit -m "S691: TX Socrata rewrite, NC yml rename, WV duplicate removal"
.\push.ps1
```

**Priority 4 — Push S689 Chrome QA fixes (still unpushed)**

Block 1 — Chrome QA fixes:
```powershell
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/components/CheckoutModal.tsx
git add packages/frontend/components/BoostPurchaseModal.tsx
git add packages/frontend/components/CSVImportModal.tsx
git add packages/frontend/components/DisputeForm.tsx
git commit -m "S689: Dashboard lapse fix, WCAG ARIA (4 components)"
.\push.ps1
```

**Priority 5 — Dispatch URL-correction agents for the 50-state scraper batch**

18 states with confirmed auctioneer licensing need their scraper files rewritten to verified real URLs. 24 no-auctioneer states need Phase 2 replacement scrapers (secondhand dealer, pawnbroker, SoS keyword search). See S691 research findings in Current Status for the full URL list.

**Priority 6 — QA holdover**
- #174 Auction — push + QA (Priority 1/2 above)
- #251 priceBeforeMarkdown — needs TEAMS-tier test scenario
- #223 Organizer Guidance Layer rank badges — needs an active hold in prod

```powershell
git add packages/frontend/pages/items/[id].tsx
git commit -m "fix: bid API field name bidAmount → maxBidAmount (ADR-013 contract)"
.\push.ps1
```

Wait 2–3 min for Vercel, then re-run QA on #174: login as user12@example.com / Seedy2025!, go to finda.sale/sales/c5hykxxecanngwcrkvq92n1va, verify all 5 items visible, place a bid, verify reverse auction item shows ~$75.

**Priority 2 — Patrick push the S691 block first**

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

# Delete the two files that need manual removal
git rm ".github/workflows/scrape-nc-licensing.yml"
git rm "packages/backend/src/services/scraper/sources/westVirginia LicensingScraper.ts"

# Stage new/modified files
git add .github/workflows/scrape-north-carolina-licensing.yml
git add packages/backend/src/services/scraper/sources/texasLicensingScraper.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md

git commit -m "S691: TX Socrata rewrite, NC yml rename, WV duplicate removal, scraper audit docs"
.\push.ps1
```

**Priority 2 — Push S689 Chrome QA fixes (still unpushed)**

Block 1 — Chrome QA fixes:
```powershell
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/components/CheckoutModal.tsx
git add packages/frontend/components/BoostPurchaseModal.tsx
git add packages/frontend/components/CSVImportModal.tsx
git add packages/frontend/components/DisputeForm.tsx
git commit -m "S689: Dashboard lapse fix, WCAG ARIA (4 components)"
.\push.ps1
```

Block 2 — S689 scraper infrastructure:
```powershell
git add packages/backend/src/services/scraper/sources/saleSeeker.ts
git add packages/backend/src/services/scraper/sources/indianaLicensingScraper.ts
git add packages/backend/src/services/scraper/osmScraper.ts
git add packages/backend/src/services/leadScoringService.ts
git add packages/backend/src/jobs/leadScoringJob.ts
git add .github/workflows/scrape-indiana-licensing.yml
git add .github/workflows/scrape-osm.yml
git add .github/workflows/scrape-sale-seeker.yml
git commit -m "S689: Lead scoring service + crash loop fixes + scraper workflow YMLs"
.\push.ps1
```

**Priority 3 — Dispatch URL-correction agents for the 50-state scraper batch**

18 states with confirmed auctioneer licensing need their scraper files rewritten to verified real URLs. 24 no-auctioneer states need Phase 2 replacement scrapers (secondhand dealer, pawnbroker, SoS keyword search). Dispatch in parallel batches by state, then push all files + workflow YMLs together. See S691 research findings in Current Status above for the full URL list.

**Priority 4 — QA holdover**
- #251 priceBeforeMarkdown — needs TEAMS-tier test scenario
- #223 Organizer Guidance Layer rank badges — needs an active hold in prod
