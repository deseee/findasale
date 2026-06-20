# ADR — HiBid Auction Scraper + Flea-Query Expansion — 2026-06-09

## Context

DB audit (S934, Railway, psycopg2) confirmed:
- **97 AUCTION Sale records exist nationwide.** 155 high-activity cities (NYC 621 total/0 auctions, Houston 508/0, Chicago 279/0, LA 237/0, Miami 228/0, Dallas 224/0) have zero auction coverage → 155 empty `/city/{slug}/auctions` SEO pages.
- AuctionNinja cannot fill this: its dated auction events are JavaScript-rendered; our `fetch`+`cheerio` stack only sees the static company-directory nav. Confirmed by reading static HTML of `/auctions` and a company profile. AuctionZip + AuctionNinja both produce Organizer records only, never Sale records.
- FLEA_MARKET: 477 records, 2,445 cities with zero. Genuine API scarcity, not a metro-coverage gap (Foursquare/HERE already query `flea market` + `swap meet`).
- `GOOGLE_PLACES_METROS` (300) is comprehensive — no genuinely-missing independent US metros. Apparent gaps are suburbs within a covered metro's radius, NYC boroughs, Canadian cities (separate `CANADIAN_METROS`), or data mislabels.

HiBid coverage probe (8 metros, all regions, 50-mi radius, current open auctions only): Allentown 77, Knoxville 57, Des Moines 31, Boise 14, Tucson 8, Spokane 7, Grand Rapids 4, Jackson 3. Every metro returned live, dated, geolocated auctions. **HiBid is the source.**

---

## Decision 1 — Add HiBid as a new scraper source (national-once)

**Approved.** HiBid (`hibid.com`) becomes a new `directory` source producing Sale records with `saleType='AUCTION'`.

### Why HiBid works where AuctionNinja doesn't
HiBid auction listing pages are **fully server-rendered**. A no-JS fetch returns, per auction, in plain HTML: title, **city/state/zip** (e.g. "Round Rock, TX 78655"), **start+end dates** ("Date(s) 1/11/2026 - 5/23/2026"), description, and a catalog URL (`hibid.com/catalog/{id}/{slug}`). That is a complete `ScrapedItem`. robots.txt allows `/auctions` (disallows only `/auctions/current/map/` and `/auctions/past/*?q=*`).

### Run mode — national-once, NOT metro-loop (key design call)
Each HiBid listing **carries its own city/state/zip**, so we do not need to query per-metro. Querying by metro would also require a metro→zip map we don't have (`us-cities-3000.json` has lat/lng, no zip). Instead:
- Iterate the **per-state auction browse** (50 states; "Auctions by State" → dev confirms exact URL, likely `/auctions?...` or a state landing route under `/home/stateauctions`). State-scoped browse is bounded and complete.
- Fallback if no clean state URL exists: paginate the national `/auctions` list (`Show: 100 Auctions` + page param).
- Ingest each listing with its **embedded** city/state/zip. The listing's own location places it on the correct city SEO page — no zip mapping, no metro loop. This mirrors `runMode: 'national-once'` (like `NAAFindAnAuctioneer`, `YellowPagesCA`).

### Parser approach
Field patterns are highly stable, matching the existing `auctionZipScraper` regex-on-HTML precedent:
- Auction unit / catalog link: `href="...hibid.com/catalog/{id}/{slug}"` → `sourceItemId = {id}`, `sourceUrl = full catalog URL`.
- Location: `City, ST ZIP` block per card.
- Dates: `Date(s) M/D/YYYY - M/D/YYYY` (single-date variant: `Date(s) M/D/YYYY` → set endDate = startDate).
- **Dev must read the RAW HTML of one live `/auctions` page first** to confirm card container + field selectors before writing the parser (do not derive selectors from the markdownified WebFetch output). Cheerio preferred; regex fallback per AuctionZip precedent.

### Ingestion contract
Reuse `ingestScrapedListing(listing, organizerId?)` unchanged. Per listing:
```
{
  title, city, state, zip,
  startDate, endDate,                 // both required by ingestScrapedListing
  description,
  saleType: 'AUCTION',                // sets isAuctionSale=true, tags=['auction']
  sourceName: 'HiBid',
  sourceUrl: 'https://hibid.com/catalog/{id}/{slug}',
  sourceItemId: '{id}',               // dedup key
  organizerName: '{auction company}', // from the company link; getOrCreateScrapedOrganizer handles it
  businessCategory: 'AUCTION_HOUSE',
}
```
Dedup is automatic via `checkDuplicate` on `sourceName`/`sourceUrl`/`sourceItemId`. No schema change — `Sale.saleType` already accepts `'AUCTION'`; `ingestScrapedListing` already special-cases it (L813 `isAuctionSale`, L644 tags).

### Registry + scheduling
- New `sources/hibidScraper.ts`, exporting `scrapeHiBid()` (national-once signature).
- Register in `SOURCE_REGISTRY` (`sourceRegistry.ts`): `id:'HiBid'`, `type:'directory'`, `runMode:'national-once'`, `qualityTier:'high'`, `legalNote:'public auction listings — server-rendered, rate-limit 3s, robots /auctions allowed'`.
- New GH Actions workflow `scrape-hibid.yml` modeled on `scrape-here-places.yml`, monthly cron + `workflow_dispatch`. (Auctions are time-sensitive — recommend **weekly** for HiBid, not monthly, since events open/close fast. Confirm cadence with Patrick.)
- Rate limit: rotating realistic UA (`getRandomUserAgent`), 3s between requests, per-run cap (~500) like AuctionZip.

### Risk / edge cases
- **Date freshness:** auctions close fast. `ingestScrapedListing` updates `lastScrapedAt` on dupes; need a complementary job to mark ended auctions `ENDED` once `endDate` passes (existing sale-lifecycle logic may already handle this — dev to confirm, else flag).
- **Online-only auctions** have a physical pickup city — that city is the correct geo anchor for SEO. Keep them.
- **Volume:** national scrape could ingest thousands. Cap per run; the dedup pass makes repeat runs cheap.
- **ToS:** see Flagged for Patrick.

---

## Decision 2 — Expand flea-market queries in PLACES_QUERIES

**Approved (small, additive).** `PLACES_QUERIES` (in `scraperConfig.ts`, consumed by both Foursquare and HERE scrapers) currently has only `flea market` + `swap meet` for `FLEA_MARKET`. Add flea-synonym query configs so the next monthly Foursquare/HERE runs widen flea capture with zero new infrastructure:
- `flea market`, `swap meet` (existing)
- **add:** `antique flea market`, `outdoor market`, `vendor market`, `trade days`, `farmers and flea market`, `bazaar`, `marketplace` (dev to tune; drop any that return mostly food/grocery noise).

All map to `category:'FLEA_MARKET', saleType:'FLEA_MARKET'`. Cost: a few extra API calls per metro per month, within Foursquare/HERE free/cheap tiers. **State licensing/Phase2 scrapers are NOT a flea source** — they scrape auctioneer license boards → Organizer records, structurally cannot surface flea markets. This expansion is the correct lever.

---

## Consequences
- New `HiBid` source fills the single largest SEO gap (155 empty auction-city pages) using the proven `ingestScrapedListing` pipeline. No schema change, no new infra beyond one GH Actions workflow.
- Flea coverage improves on the next Foursquare/HERE run with a one-line-per-term config change.
- `GOOGLE_PLACES_METROS` left unchanged — confirmed comprehensive.

## Constraints Added
- HiBid listings are ingested with their **embedded** city/state/zip — never overwrite with a query-metro centroid.
- HiBid parser selectors must be validated against **raw live HTML**, not WebFetch markdown.

---

## Flagged for Patrick (non-technical)
1. **HiBid ToS review** before first run. robots.txt permits `/auctions`, but confirm HiBid's Terms of Use don't prohibit listing aggregation. Same public-data posture as our AuctionNinja/AuctionZip sources, but auctions are HiBid's core product — worth a 5-min read of `hibid.com/home/termsofuse`. (Legal-lens task → `findasale-legal`.)
2. **Cron cadence:** weekly vs monthly for HiBid. Auctions churn fast; I recommend weekly. Your call on GH Actions minutes budget.

## Dev Instructions (ordered) → findasale-dev
1. Read raw HTML of one live `https://hibid.com/auctions?zip=49503&miles=50` (or the state-browse URL) — confirm card container + selectors for title, city/state/zip, dates, catalog id/url, company name.
2. Confirm the per-state browse URL (preferred) or implement national pagination.
3. Write `packages/backend/src/services/scraper/sources/hibidScraper.ts` → `scrapeHiBid()`, parsing listings → `ingestScrapedListing(... saleType:'AUCTION', sourceName:'HiBid', sourceItemId:catalogId ...)`. Rate-limit 3s, per-run cap, rotating UA.
4. Register `HiBid` in `SOURCE_REGISTRY`.
5. Add `.github/workflows/scrape-hibid.yml` (model on `scrape-here-places.yml`; cadence per Patrick).
6. Confirm ended-auction lifecycle: do PUBLISHED sales auto-transition to ENDED past `endDate`? If not, flag.
7. Expand `PLACES_QUERIES` flea terms (Decision 2).
8. TS gate: `cd packages/frontend && npx tsc --noEmit --skipLibCheck` AND backend tsc — zero errors. Return changed-files list (no git).

No schema change → no migration → no rollback plan required.
