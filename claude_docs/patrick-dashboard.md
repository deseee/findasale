# Patrick's Dashboard — Week of May 3, 2026 (updated S633)

## Next Session — S634

**Patrick must do before S634 starts:**
1. Push the S633 block (below)
2. `git rm .github/workflows/test-esn-api-access.yml` then commit it in the same push
3. Run the migration block (below) against Railway

**S634 goal options:** Email creative session (finalize 4 outreach email templates) OR dispatch remaining open bugs (OG meta fix, Hunt Pass status, sales/[id] 500).

---

## Patrick Actions — Do Now (S633 Wrap)

### Step 1 — Push S633 changes
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add .github/workflows/scrape-estatesalesnet.yml
git add .github/workflows/scrape-craigslist.yml
git add .github/workflows/scrape-newspaper-rss.yml
git add .github/workflows/scrape-facebook-events.yml
git add .github/workflows/scrape-foursquare.yml
git add .github/workflows/scrape-google-places.yml
git add .github/workflows/scrape-here-places.yml
git add .github/workflows/scrape-osm-overpass.yml
git rm .github/workflows/test-esn-api-access.yml
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260503100000_organizer_unique_source_ids/migration.sql
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(scraper): S633 — workflow fleet overhaul (concurrency, timeouts, cron stagger) + googlePlaceId @unique P1 fix"
.\push.ps1
```

### Step 2 — Run migration on Railway
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## What Happened This Week

**S633 — GitHub Actions workflow fleet overhaul + googlePlaceId @unique.** Full audit and repair of all 11 GH Actions scraper workflows. 8 workflows rewritten: all now have `concurrency` blocks to queue overlapping runs without cancelling them. `scrape-estatesalesnet.yml` timeout extended 10→25 min (production ESN run confirmed ~19 min). `scrape-newspaper-rss.yml` cron staggered to 02:30 UTC (was clashing with Google Places on 1st of month). `scrape-foursquare.yml` broken `METRO_BATCH` env var removed — completely unused by the runner. All deprecated `*_ORGANIZER_ID` secrets removed. `test-esn-api-access.yml` flagged for deletion (needs `git rm`). P1 schema fix: `googlePlaceId String? @unique` + migration with dedup cleanup step. Bug fixes for /items/[id] 500, OG meta, Hunt Pass, and tier-lapse banner were dispatched but agent did not write code — all remain pending.

**S632 — Scraper fleet audit + P0/P1 fixes.** Audited all 9 scraper workflows across three dimensions: API health, deduplication logic, and GitHub Actions batching. Found and fixed two critical issues. **P0 dedup fix:** The `getOrCreateScrapedOrganizer()` function was only checking `googlePlaceId` then falling back to exact string match — meaning the same business appearing in Google Places, HERE, and Foursquare would create 3 separate Organizer rows. Fixed with proper ID-priority lookup (googlePlaceId → foursquareVenueId → hereBusinessId → normalized name match) plus cross-source backfill (when a match is found, missing source IDs are written onto the existing record). Also added name normalization so typos like "Antque Mall" vs "Antique Mall" don't create duplicates. **P1 retry fix:** All 9 runner scripts were missing 502/503 retry logic — Railway cold starts were silently dropping ingest batches. All runners now retry 3 times with exponential backoff (2s, 4s, 8s). **Still pending P1:** `googlePlaceId` needs a `@unique` DB constraint in schema.prisma (race-condition duplicate prevention) — needs a migration, coming next session.

**S631 — Foursquare Places API migration fix.** The scraper was getting 401 "Invalid request token" on every API call. Root cause: Foursquare migrated their entire Places API to a new domain (`places-api.foursquare.com`) and new auth format (`Authorization: Bearer <key>` + `X-Places-Api-Version` header). Old endpoint is deprecated. Also fixed: city doubling bug ("Chicago, Chicago, IL" → "Chicago, IL"), 11× API waste (was running all 11 query types per queue item instead of 1), and unreadable error response bodies. Confirmed working: Patrick ran it live and got 1,322 businesses scraped from 50 queue items with 0 failures. The scraper is fully operational. **New issue found:** Railway cold start caused first 5 ingest batches to 502 (backend sleeping when 5 concurrent workers hit it); 125 businesses scraped but not ingested this run. Retry logic fix coming in S632.

**S630 — Schema drift repair, storefront 500 fixed.** Diagnosed storefront 500 via Railway logs — `PrismaClientValidationError: Unknown field 'attendanceCount'`. Root cause: S624/S625 multi-schema syncs wiped model definitions from `schema.prisma` while DB tables remained intact. Full audit found 3 entire missing models (ClaimRequest, SaleShareLink, SaleShareLinkClick) + missing ClaimEmail definition + missing Consignor stripe fields + missing inverse relations on User/Sale/Organizer. All restored — no migrations needed. Cache-busted Railway rebuild. Local `prisma generate` validated clean. Wait for Railway rebuild to confirm storefront is live.

**S629 — CI/Railway fixes + crawl queue + P2 polish + email creative iteration.** Fixed 4 CI TypeScript errors (schema drift — ScrapedSalesJob and scraper fields dropped from schema.prisma again). Fixed Railway `endDate` non-nullable Prisma filter crash. Built DirectoryCrawlQueueManager with 20-metro subAreaConfig and exponential backoff logic. Shipped P2 polish: `/sales` public page, disclosure label on scraped sale cards, overflow-x fix. Ran multi-round email creative session — S626 subject line unlocked, business guru psychology brief generated, current best draft is warmer and leads with organizer pain but Patrick wants a dedicated creative session to push it further.

**S628 — MetroTopFinds crash fixed + 3,635 scraped sales unblocked nationally.** Two P0 fixes. (1) Railway backend was crashing on every city page request (`prisma.metroTopFinds` was `undefined`) because the `MetroTopFinds` model was lost from `schema.prisma` during S625's schema sync. Fixed by restoring the model and forcing a Railway rebuild — Prisma client now regenerates with the model. (2) Discovered that ALL 3,635 scraped sales were invisible on the homepage, Trending, search, and category pages — a filter added in S614 (`isUnmanagedListing: false OR isClaimed: true`) was silently blocking every scraped organizer from every public query. Advisory board voted 6+0 to show scraped listings publicly. Removed the filter from 14 query locations across trendingController, saleController, and itemSearchService. Added a stale-sale date guard so expired scraped sales don't show. Chrome-verified: Trending page now shows sales from Kalamazoo, Holland, Branford CT, Pasadena MD, Worcester MA, Hagerstown MD. No Patrick actions needed — all deployed.

**S627 — All 4 weekly audit P0/P1 bugs fixed and Chrome-verified.** C-001 (scraped sale pages "Sale not found") — root cause was schema drift: `verificationSource` was never pushed to GitHub, so Railway's Prisma client didn't know about it. Patrick pushed the complete schema.prisma mid-session. A second crash then surfaced: the rank gate was calling `.getTime()` on `null` `publishedAt` (scraped sales have no publishedAt). Fixed with null guards in `saleController.ts` and `rankService.ts`. H-001 (items buried below map on sale detail) — fixed, items now above map. H-002 (images blank platform-wide) — fixed, Cloudinary added to Next.js image domains. H-003 (city hub pages all 404 for scraped cities) — fixed by adding slug-parsing fallback to `pages/city/[slug].tsx`: when a slug like `nashville-tn` isn't in the 2,723-city JSON, it now constructs the city name+state from the slug instead of 404ing. Verified live at finda.sale/city/nashville-tn. No pending Patrick actions — all code is on GitHub and deployed.

**S626 — Organizer acquisition strategy v3 + records sync.** Strategy session, no code shipped. Multi-lens research (Innovation, Marketing, Customer Champion, Advisory Board with Risk+GTM+Growth subcommittees, Tech Stack, Cadence) on the cold-outreach pipeline that turns scraped organizer records into claimed listings. Synthesized into `claude_docs/strategy/organizer-acquisition-strategy.md`. **All seven open decisions resolved** — email-only Phase 1, no founder voice / institutional sender (`outreach@finda.sale` from "The FindA.Sale Team"), fully automated reply handling per S268 Zero-Human stack, **tooling: Workspace seat $6/mo + custom Postgres cron Phase 1, migrate to Instantly.ai at 500/day** (Resend stays transactional only — confirmed banned for cold outreach in their AUP, along with SendGrid/Postmark/Mailgun/Brevo/Zoho/SES). Plus full records sync — STATE.md, qa-backlog.md, decisions-log.md all brought current.

**S625 — Multi-source directory scraper + crawl management schema.** Four new scrapers live: HERE Places (250k free/mo), Foursquare (1k/day free), OSM Overpass (free/open), plus Google Places switched to monthly — all $0/year total. Canada coverage added (15 metros); Quebec scrape-only with outreach suppressed per Bill 96 ruling. Crawl management schema deployed: `DirectoryCrawlQueue` + `DirectoryCrawlLog` + `DirectoryClaimEmail` + 22 new Organizer lifecycle fields. Sub-area strategy designed for ~20 dense metros. Legal cleared Google ToS.

**S624 — ADR-077 Google Places Business Directory Scraper.** 11 business categories ingested monthly across 100 US metros. All pushed and deployed.

**S623 — Scraper audit.** 6 of 7 pipeline fixes shipped. googleRating + googleRatingCount added to Organizer model.

**Previously —** A massive scraper and outreach pipeline week. The agents shipped the entire sale-scraping infrastructure (EstateSalesNet, Craigslist, Eventbrite, and newspaper RSS feeds), found and fixed a root-cause bug that had been dumping all scraped organizer listings onto a single fake account instead of creating one record per real company, and cleaned up 5,833 misattributed sale records. The Claim-This-Listing flow went live (organizers can now claim their auto-scraped listing via a magic-link email), and the organizer contact pipeline was extended to scrape company websites for real email addresses.

## Open Audit Findings

### ✅ Weekly Site Audit — 2026-05-02 — ALL P0/P1 RESOLVED (S627)

Full report: `claude_docs/audits/weekly-audit-2026-05-02.md`. All four P0/P1 findings fixed and Chrome-verified in S627.

- ✅ **C-001**: Scraped sale pages "Sale not found" — fixed (schema drift + null publishedAt guard)
- ✅ **H-001**: Items buried below map on sale detail — fixed (reordered)
- ✅ **H-002**: Images blank platform-wide — fixed (Cloudinary domain in next.config.js)
- ✅ **H-003**: City hub pages 404 for scraped cities — fixed (slug-parsing fallback in [slug].tsx)

**Still open (P2)**: Systemic horizontal overflow on pricing/sale detail/guide/home. Workspace empty state near-invisible in dark mode. Org messages copy organizer-only. These are safe to batch into a single dev dispatch.

### ⚠️ Brand Drift Alert — 2026-05-02

**No P0/P1 violations.** 8 P2 + 5 P3 issues. Full report: `claude_docs/audits/brand-drift-2026-05-02.md`.

P2 D-001 (All Sale Types): OnboardingModal welcome copy, Twitter card, schema.org, FAQ, EfficiencyCoachingWidget tooltip, referral share messages all omit one or more sale types.
P2 D-006 (No AI in copy): PriceResearchPanel shows 🤖 robot emoji.
P2 skill drift: findasale-marketing SKILL.md describes brand voice as "neighbor who runs estate sales" — seeds estate-sale-default. Will be addressed in next records pass.

All P2 items are safe to batch into a single dev dispatch.

### Known open bugs (not from an audit)

- Every item detail page (`/items/[id]`) returns a 500 error — pre-existing, in qa-backlog
- Sale page social previews are blank — likely missing `INTERNAL_API_URL` env var in Vercel
- Hunt Pass shows "Inactive" in one part of the app while showing "Active" in another
- Tier-lapse warning banner is red and dismissible instead of sticky amber

All four are in qa-backlog under "Pre-existing Open Bugs."

## QA Backlog Status

`claude_docs/operations/qa-backlog.md` was brought current in S626. **Header now reads "S626 records sync — 2026-05-02."** The new "ACTIVE QA QUEUE" section at the top covers S625 audit findings, pre-existing open bugs, the full S601 storefront v2 batch (#354–#363), and 8 missing carryover items (treasure hunt progress, ConfirmDialog smoke, hydration #418 remaining instances, DonationModal SettlementWizard, Holds /shopper, PDF watermark visual, iCal footer, Craigslist selector validation). **The file is now complete and current.** It has not yet had its older verified items archived to a separate "Shipped + Verified" section — that's a future records pass.

## This Week's Priority

1. **Push S631+S632 block below** — 11 scraper files + wrap docs.
2. **S633: Email creative session** — finalize 4 outreach templates, then the pipeline build can start.
3. **Sign up HERE API** — `developer.here.com`, add `HERE_API_KEY` GitHub Secret (overdue since S625).
4. **Send the 19 outreach drafts in Gmail** — Nick Loper, Codie Sanchez, trade associations. Long overdue since S596.

## Action Items for Patrick

- [ ] **Push S631+S632 block** — see push block below
- [ ] **Sign up HERE API** at developer.here.com → add `HERE_API_KEY` GitHub Secret
- [ ] **Review and send 19 outreach drafts in Gmail**

## S631+S632 Push Block

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/backend/src/services/scraper/sources/foursquarePlaces.ts
git add packages/backend/src/scripts/run-foursquare-places.ts
git add packages/backend/src/services/scraper/index.ts
git add packages/backend/src/services/scraper/htmlParser.ts
git add packages/backend/src/scripts/run-google-places.ts
git add packages/backend/src/scripts/run-here-places.ts
git add packages/backend/src/scripts/run-osm-overpass.ts
git add packages/backend/src/scripts/run-craigslist.ts
git add packages/backend/src/scripts/run-estatesalesnet.ts
git add packages/backend/src/scripts/run-newspaper-rss.ts
git add packages/backend/src/scripts/run-eventbrite.ts
git add packages/backend/src/scripts/run-search-facebook-events.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(scraper): S631+S632 — Foursquare API migration, cross-source dedup, 502 retry on all runners"
.\push.ps1
```
