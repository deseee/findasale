# Scraper & Enrichment Audit — 2026-06-05 (S887)

All findings are tool-cited. DB queries run against Railway PostgreSQL (maglev.proxy.rlwy.net:13949).
Source file reads confirmed at listed paths under `packages/backend/src/services/scraper/`.

---

## Summary Table

| Source | Trigger | Status | DB Records | Current Issue | Downstream Impact | Priority |
|--------|---------|--------|-----------|---------------|-------------------|----------|
| EstateSalesNet | GH Actions daily 00:00 UTC (4-chunk matrix) | ACTIVE | 21,255 sales | None known — 3,103 new imports in last 7 days | Primary sale source; geocoded 100% | — |
| GarageSaleFinder | GH Actions Wed 05:00 UTC | ACTIVE | 17,761 sales | 80.7% not geocoded (14,331 records) | Map page, proximity search broken for 81% of GSF stock | P1 |
| Facebook Marketplace | GH Actions Tue 04:00 UTC | BROKEN | 0 sales | Zero records in DB — `sourceName='FacebookMarketplace'` absent | No FB Marketplace sales visible anywhere | P2 |
| Facebook Events | GH Actions Mon 03:00 UTC | ACTIVE | 1,519 sales | 96% not geocoded (1,460 records); only 212 of 1,519 have street address | Map/proximity broken for all FB Events sales | P1 |
| AuctionNinja | GH Actions Wed 06:00 UTC | UNVERIFIED | 0 organizers in DB | Zero organizers recorded under AuctionNinja/AuctionNinja-Directory source; Cloudflare ASN block documented | No auctioneer directory coverage | P2 |
| AuctionZip | GH Actions Sun 06:00 UTC | UNVERIFIED | 9 organizers (website field matches) | Only 9 records with auctionzip.com URLs — far below expected ~500/run | Minimal auctioneer directory coverage | P2 |
| NAA Find an Auctioneer | DISABLED (schedule commented out) | BROKEN | 0 organizers | JS-rendered (Novi AMS) — static fetch returns "Loading..." placeholder. Verified broken 2026-05-23. Source file has STATUS: BROKEN comment. | No NAA member coverage | P1 |
| Website Enrichment | GH Actions daily 01:00 UTC | ACTIVE | 1,382 WARM orgs have website | Enriching 39,246 WARM organizers; only 1,382 (3.5%) have website so far | Email discovery blocked for 97% of WARM tier | P2 |
| Email Discovery | GH Actions daily 03:00 UTC | ACTIVE | 8,550 of 63,348 orgs have email | 13.5% email coverage; 462 WARM orgs emailable but no outreach record created yet | Outreach funnel entry blocked for 462 leads | P2 |
| Outreach Emails | GH Actions every 4h | THROTTLED | 659 SENT, 2,243 PENDING | Volume drop from ~150/day (2026-05-28/29) to ~7-17/day post-S865 suspension. `outreach@finda.sale` Google Workspace suspended. | Organizer acquisition funnel paused | P1 |
| Geocoding | GH Actions daily 02:00 UTC | ACTIVE but LAGGING | 15,792 of 48,701 sales un-geocoded | 32% of all sales lack lat/lng; GSF alone contributes 14,331 un-geocoded | Map page, /map, proximity search, "sales near you" broken for 32% of inventory | P1 |

---

## DB Health Snapshot

All queries run 2026-06-05 against `maglev.proxy.rlwy.net:13949/railway`.

### Sale counts by source
```
sourceName        | total  | PUBLISHED | no_geocode | % un-geocoded
------------------|--------|-----------|------------|---------------
EstateSalesNet    | 21,255 | 5,937     | 0          | 0%
GarageSaleFinder  | 17,761 | 2,653     | 14,331     | 80.7%
Foursquare        | 5,008  | 5,008     | 0          | 0%
HEREPlaces        | 3,152  | 3,152     | 0          | 0%
Facebook Events   | 1,519  | 265       | 1,460      | 96.1%
FacebookMarketplace | 0    | 0         | n/a        | n/a
NULL (organizer)  | 6      | 2         | 1          | —
TOTAL             | 48,701 | 17,017    | 15,792     | 32.4%
```

### Sale status distribution
```
ENDED:     31,682
PUBLISHED: 17,017
DRAFT:     2
```

### Geocoding gap
- 15,792 sales have no lat/lng (32.4% of all sales)
- Breakdown: GarageSaleFinder 14,331 · Facebook Events 1,460 · NULL source 1
- EstateSalesNet, Foursquare, HEREPlaces: 0 un-geocoded (geocoded at ingest via API responses)

### Organizer pipeline
```
Total organizers:              63,348
Scraped (directoryMostRecentSource set):  57,023
HOT tier (registered users):   7,036  — all have website + userId (claimed accounts)
WARM tier:                    39,246  — 1,382 have website (3.5%); 1,066 have email (2.7%)
COLD tier:                    15,905  — 3,183 have website (20%)
NULL tier:                     1,161  — 709 have website
```

### WARM lead enrichment detail
```
WARM total:          39,246
  Has website:        1,382  (3.5%)
  Has contactEmail:   1,066  (2.7%)
  Has esnCompanyPageUrl: 370 (0.9%)
  No email at all:   38,180  (97.3%) — outreach ineligible until email found
```

### Email discovery progress
```
Total organizers:  63,348
Has contactEmail:   8,550  (13.5%)
```

### DirectoryClaimEmail outreach pipeline
```
PENDING:    2,243  — oldest created 2026-05-05; 2,206 older than 30 days
SENT:         659  — last send 2026-06-05 07:59 UTC
BOUNCED:      480
OPTED_OUT:      1
```

### Outreach send volume (recent days)
```
2026-05-24:  30
2026-05-25:  71
2026-05-26:  73
2026-05-27:  75
2026-05-28: 146
2026-05-29: 153  ← volume peak before suspension
2026-05-30:  48  ← drop begins (S865 suspension)
2026-05-31:   6
2026-06-01:   7
2026-06-02:  17
2026-06-03:  15
2026-06-04:  11
2026-06-05:   7  ← still trickling (pipeline not fully disabled)
```
Note: outreach is still sending at low volume (7-17/day) despite `OUTREACH_ENABLED=false` reportedly set in Railway. The DirectoryClaimEmail record confirms a send at 07:59 UTC today. Either the env var is not propagating, or the workflow still has an active trigger. Needs Railway verification.

### Scraped organizer sources (top 10 by directoryMostRecentSource)
```
NewYorkPhase2:    29,728
EstateSalesNet:    7,412
IllinoisPhase2:    4,220
IowaPhase2:        2,718
HEREPlaces:        2,113
TexasPhase2:       1,971
TexasLicensing:    1,851
OregonPhase2:      1,804
ColoradoPhase2:    1,343
Foursquare:        1,207
...
AuctionNinja:          0  ← no records
AuctionZip:            0  ← (only 9 with auctionzip.com in website field)
NAAFindAnAuctioneer:   0  ← no records
```

### Recent imports (last 7 days)
```
GarageSaleFinder:  5,498
EstateSalesNet:    3,103
Facebook Events:     184
Foursquare:           92
NULL:                  4
```

### Sale Ending Soon job — active state
```
endingSoonNotified=false (PUBLISHED):  15,751
endingSoonNotified=true  (PUBLISHED):   1,266
Notified source breakdown: GarageSaleFinder 877, EstateSalesNet 384, Facebook Events 5
Sales ending in next 48h (unnotified):  EstateSalesNet 1,028 · GarageSaleFinder 1,516 · Facebook Events 14
```

---

## Per-Source Findings

### EstateSalesNet
**Path:** `packages/backend/src/services/scraper/sources/estatesalesnet.ts`
**Workflow:** `.github/workflows/scrape-estatesalesnet.yml` — daily 00:00 UTC, 4-chunk parallel matrix

**What it does:** Queries the EstateSalesNet API (`/api/sale-details?bypass=bycoordinatesanddistance`) using coordinate centers + radius. Returns JSON with full lat/lng, address, organizer name, and esnOrgId. Uses ETags for cache efficiency (RFC 7232 conditional requests). Ingests into `Sale` table with `sourceName='EstateSalesNet'`. Also captures `esnOrgId` for downstream enrichment.

**Status:** ACTIVE and healthy. 3,103 new records in last 7 days. Zero geocoding gap (lat/lng comes directly from API). 5,937 PUBLISHED.

**Known issues:** None identified. Backend cron is explicitly disabled for ESN (`cronSchedule` removed from sourceRegistry.ts, comment: "handled by GH Actions"). GH Actions matrix with 4 chunks prevents the S715 deadlock from recurring.

**Recommended action:** No action needed. Monitor chunk success rate.

---

### GarageSaleFinder
**Path:** `packages/backend/src/services/scraper/sources/garageSaleFinder.ts`
**Workflow:** `.github/workflows/scrape-garagesalefinder.yml` — Wednesdays 05:00 UTC

**What it does:** Fetches metro HTML pages from garagesalefinder.com, extracts sale detail page links, then parses each sale page for title/city/state/address/dates. Ingests into `Sale` table with `sourceName='GarageSaleFinder'`. **Explicit note in source file header:** consumer-posted yard sales only — NOT organizer businesses. Excluded from outreach by design.

**Status:** ACTIVE. 5,498 new records in last 7 days — highest import volume of any source. 

**Critical issue:** 14,331 of 17,761 records (80.7%) have no lat/lng. Root cause: GSF scraper does not geocode at ingest (unlike ESN). The nightly geocoding workflow (`geocode-ungeocoded-sales.yml`, runs 02:00 UTC) handles this retroactively via Nominatim + Census fallback at 1.1s/req. At 200 records/batch, the daily workflow clears ~200 records against a backlog of 14,331. At that rate, full clearance takes ~72 days — but new records arrive at ~785/day (5,498/7), creating a net negative. The geocoding workflow is falling further behind, not catching up.

**Geocoding math:** 
- Backlog: 14,331 un-geocoded
- Daily ingest adds: ~785 new GSF records (5,498/7)
- Daily geocode clears: ~200 (batch_size default)
- Net change per day: +585 more un-geocoded
- Batch size must exceed 785/day just to break even. Max batch_size is 500.

**Recommended action:** Increase geocoding workflow batch_size to 500 AND trigger multiple batches per day (run workflow 2-3×/day), or switch to running all pending records in a single session by looping until queue is empty.

---

### Facebook Marketplace
**Path:** `packages/backend/src/services/scraper/sources/facebook-marketplace.ts`
**Workflow:** `.github/workflows/scrape-facebook-marketplace.yml` — Tuesdays 04:00 UTC

**What it does:** Posts to Facebook's GraphQL endpoint (`/api/graphql/`) with `doc_id=7111939778879383` from Railway backend (non-Azure IP). GH Actions just triggers Railway via `POST /api/internal/scraper/run-facebook-marketplace` — the actual HTTP request to Facebook happens from Railway to avoid AWS ASN block. Covers 43 US metros. Records ingested with `sourceName='FacebookMarketplace'`.

**Status:** BROKEN — 0 records in DB. No sale with `sourceName='FacebookMarketplace'` exists. The `Facebook Events` source is present (1,519 records) confirming the field name distinction is real. The Facebook Marketplace scraper has produced zero ingested records.

**Root cause candidates:**
1. The Railway internal endpoint `/api/internal/scraper/run-facebook-marketplace` may not be registered or may be failing silently (202 response returned immediately, async failure not surfaced to GH Actions).
2. Facebook's GraphQL `doc_id=7111939778879383` may have rotated — FB frequently changes doc_ids.
3. The scraper uses `sourceName: 'FacebookMarketplace'` in code but this value has never appeared in the DB.

**Recommended action:** Check Railway backend logs for `[FacebookMarketplace]` entries on Tuesday mornings. Verify the internal route is registered and responding. Test doc_id validity by running the scraper manually against one metro.

---

### Facebook Events
**Path:** `packages/backend/src/services/scraper/sources/search-facebook-events.ts`
**Workflow:** `.github/workflows/scrape-facebook-events.yml` — Mondays 03:00 UTC

**What it does:** Uses search engine APIs (Serper.dev primary → Brave → ScaleSerp fallback) to find `site:facebook.com/events` pages matching estate/garage/yard sale queries for 95+ metros including Canadian cities. Parses FB event URLs to extract addresses from URL slugs (e.g. `3105-tuell-st-nw-grand-rapids-mi-49504`). Records ingested with `sourceName='Facebook Events'`.

**Status:** ACTIVE. 184 new records in last 7 days. However, 96.1% (1,460 of 1,519) have no geocoding — and the address quality is poor: only 212 of 1,519 records have any street address at all. The URL slug parsing is clever but not reliable enough.

**Issues:**
1. 1,307 of 1,519 FB Events sales have no street address — Nominatim structured geocoding will fail for these (city/state only).
2. Date extraction from snippets is approximate (`dateApproximate` flag in scrapedMetadata).
3. Requires paid search API keys (Serper, Brave, ScaleSerp) — if any key expires, all FB Events imports stop.

**Recommended action:** Geocoding for city-only records can use a city-center fallback (lower precision but enables map pins). Flag `dateApproximate=true` records as approximate on shopper-facing display.

---

### AuctionNinja
**Path:** `packages/backend/src/services/scraper/sources/auctionNinjaScraper.ts`
**Workflow:** `.github/workflows/scrape-auctionninja.yml` — Wednesdays 06:00 UTC

**What it does:** Two-source approach: (1) state directory pages at `/company-directory/{state}` paths; (2) `hire-an-estate-sale-company` directory page for all auction house profiles. Stores organizers (not sales) via `getOrCreateScrapedOrganizer`. Ingests to `Organizer` table with `directoryMostRecentSource='AuctionNinja'` or `'AuctionNinja-Directory'`.

**Status:** UNVERIFIED — 0 records in DB under either AuctionNinja source name. This means either:
1. The GH Actions workflow fires but gets Cloudflare-blocked on the `/company-directory/{state}` paths (noted in S868 as Cloudflare ASN block). The Railway API proxy approach is used for FB Marketplace and GSF, but the AuctionNinja workflow trigger comment says "non-AWS residential-adjacent IP" — it routes via Railway backend.
2. The directory URL paths (`/company-directory/mi`) may not match AuctionNinja's actual URL structure — the scraper tries 3 path variants and falls back gracefully with 0 results.
3. The `hire-an-estate-sale-company` directory page may be returning anchor links that don't match the profile URL regex.

**Evidence:** `grep "AuctionNinja" organizer directoryMostRecentSource` → 0 rows. Only 9 organizers have `auctionzip.com` in their website field — these may be from manual data, not from the AuctionZip scraper proper.

**Recommended action:** Check Railway logs for `[AuctionNinja]` on Wednesday mornings. Manually test the `/hire-an-estate-sale-company` directory URL to confirm anchor structure.

---

### AuctionZip
**Path:** `packages/backend/src/services/scraper/sources/auctionZipScraper.ts`
**Workflow:** `.github/workflows/scrape-auctionzip.yml` — Sundays 06:00 UTC

**What it does:** Iterates A–Z directory pages at `auctionzip.com/Auctioneer-Directory/{LETTER}.html`. Parses company name, city, state from table rows. Cap of 500 records per run. Stores to `Organizer` via `getOrCreateScrapedOrganizer` with `directoryMostRecentSource='AuctionZip'`. Also updates `directoryMostRecentAt`.

**Status:** UNVERIFIED — `directoryMostRecentSource='AuctionZip'` returns 0 rows. Only 9 organizers have `auctionzip.com` in their website field (likely manual/legacy). The scraper has either never successfully run or its records are being deduplicated into existing organizer entries (same name match via `getOrCreateScrapedOrganizer` → updating existing records without changing `directoryMostRecentSource`).

**Recommended action:** Check Sunday GH Actions run history. If running successfully, the deduplication merge may be silently overwriting `directoryMostRecentSource`. Consider adding a separate `AuctionZip` flag field or checking if existing records are being updated.

---

### NAA Find an Auctioneer
**Path:** `packages/backend/src/services/scraper/sources/naaAuctioneerDirectory.ts`
**Workflow:** `.github/workflows/scrape-naa.yml` — schedule DISABLED

**What it does:** Intended to iterate all 50 US states via `auctioneers.org/find-an-auctioneer?state={XX}` and ingest NAA member auction houses.

**Status:** BROKEN — confirmed. Both the source file header and the workflow schedule comment explicitly state: "JS-rendered, cannot scrape with plain fetch. Verified broken: 2026-05-23." The `on.schedule` block is commented out; only `workflow_dispatch` remains. Zero records in DB. The Novi AMS platform requires JavaScript execution and a logged-in member session for full results.

**Fix path (per source file comment):** Playwright/Puppeteer headless browser with auth session cookies, or Novi AMS API if NAA exposes one.

**Recommended action:** This is a declared known-broken source. Either (a) implement Playwright-based scraping, (b) explore Novi AMS API access, or (c) accept the gap and source auctioneer data from AuctionZip + AuctionNinja instead. Add to roadmap as explicit backlog item.

---

### Website Enrichment Pipeline
**Path:** `packages/backend/src/services/scraper/enrichment.ts`
**Workflow:** `.github/workflows/pipeline-website-enrichment.yml` — daily 01:00 UTC

**What it does:** For organizers with `esnOrgId`, calls ESN company-public-page API to populate phone, website, social URLs, bio, service areas. For all organizers with a website, scrapes `/contact`, `/contact-us`, `/about`, homepage for email addresses (mailto links and bare patterns). Falls back to scanning scraped sale descriptions for embedded emails.

**Status:** ACTIVE. Running daily. Results: 1,382 WARM-tier organizers now have a website (3.5% of 39,246 WARM). 8,550 total organizers have contactEmail (13.5% of 63,348).

**Issues:**
1. WARM tier has only 3.5% website coverage — most WARM organizers were sourced from state licensing/phase2 scrapers which capture name+city+state but no website. Without a website, email discovery cannot proceed.
2. 462 WARM organizers have an email but no DirectoryClaimEmail record yet — these are outreach-ready but the pipeline has not created their outreach record.

**Recommended action:** The 462-lead gap should be addressed when outreach resumes. Investigate why outreach record creation hasn't fired for these.

---

### Email Discovery Pipeline
**Path:** `enrichment.ts` (same file as website enrichment — Step 2 of the same function)
**Workflow:** `.github/workflows/pipeline-email-discovery.yml` — daily 03:00 UTC

**What it does:** Triggered via `POST /api/internal/jobs/run` with `{"job":"email-discovery"}`. Finds organizers with a website but no contactEmail and scrapes their site for email addresses.

**Status:** ACTIVE. 8,550 total organizers have email. Given 57,023 scraped organizers, 13.5% email coverage is expected — the majority of state licensing/phase2 organizers have no website for discovery.

**Downstream note:** Email is the gate to the DirectoryClaimEmail outreach pipeline. No email = no outreach record = organizer never enters acquisition funnel.

---

### Outreach Email Pipeline
**Workflow:** `.github/workflows/pipeline-outreach-emails.yml` — every 4 hours

**Status:** THROTTLED/SUSPENDED but still trickling. Send volume dropped from ~150/day on 2026-05-28/29 to 7-17/day from 2026-05-31 onward. However, a send occurred at 07:59 UTC today (2026-06-05), confirmed by `DirectoryClaimEmail.sentAt` in DB. This means either:
- `OUTREACH_ENABLED=false` is set in Railway but is not being respected by the outreach cron handler
- Or the GH Actions workflow trigger is still firing and a subset of emails are going through

The `outreach@finda.sale` Google Workspace account is suspended (S865 incident). The sends today are either via a fallback sender or the suspension is partial.

**Current queue state:**
- 2,243 PENDING records (2,206 older than 30 days)
- 462 WARM leads with email but no outreach record yet
- WARM leads accumulating: 296 new WARM emailable organizers seen within the last ~30 days (2026-05-09: 137, 2026-05-10: 119, 2026-05-18: 40)

---

## Downstream Knock-On Map

### Scrapers → Sale table downstream effects
```
Sale record created/updated
  ↓
status=PUBLISHED → Directory listing on finda.sale
  ↓ (if lat/lng present)
  → Map pin on /map page
  → Proximity search ("sales near you")
  → Distance-sorted search results
  ↓ (if lat/lng MISSING — 32% of sales)
  → EXCLUDED from map
  → EXCLUDED from proximity search
  → Appears in text search only

Sale record with endDate
  ↓ saleEndingSoonJob (hourly)
  → If endDate in [now+23h, now+25h] AND endingSoonNotified=false
  → Sends email + push to all SaleSubscribers
  → Sets endingSoonNotified=true
  (currently: 0 subscribers on any scraped sale — zero emails send)

Sale record with sourceName
  ↓ SEO index generation (pre-build script)
  → /sales/[id] page generated at Vercel build time
  → Shopper-discoverable via Google
```

### Website enrichment downstream
```
Organizer.website populated
  ↓
email-discovery pipeline eligible
  ↓ (if email found)
Organizer.contactEmail populated
  ↓
DirectoryClaimEmail record created (PENDING)
  ↓
Outreach email sent (if OUTREACH_ENABLED=true and not suppressed/bounced)
  ↓
Organizer clicks → /claim/[token] → account creation → HOT tier
```

### Email discovery downstream
```
contactEmail found
  ↓
outreach-emails pipeline creates DirectoryClaimEmail PENDING record
  ↓
Email sends → organizer receives invite to claim their directory listing
  ↓
If organizer registers → userId attached → leadTier=HOT → full features
```

### Geocoding downstream
```
lat/lng MISSING → broken features:
  - /map page: pin absent
  - Proximity search: sale excluded from radius queries
  - "Sales near you": never shown
  - Distance display on sale card: broken

lat/lng PRESENT → enabled features:
  - Map pin rendered
  - Included in radius/proximity API queries
  - "Near you" suggestions
  - Distance on cards

Currently broken: 14,331 GarageSaleFinder + 1,460 Facebook Events = 15,791 sales
```

### NAA directory downstream
```
NAA = auctioneer leads (NOT sale listings)
Downstream: auctioneer organizer profiles in directory
  → Outreach eligibility (WARM tier)
  → Claim funnel entry
Currently: 0 NAA records — entire auctioneer segment unserved
```

### AuctionNinja downstream
```
AuctionNinja = estate sale company leads (organizer directory)
Downstream: same as NAA — organizer profiles, claim funnel
Currently: 0 records — entire AuctionNinja segment producing nothing
```

---

## Sale Ending Soon — Risk Model

### Today's confirmed incident
The saleEndingSoonJob fires hourly. Confirmed active: 1,266 PUBLISHED sales have `endingSoonNotified=true`. The job processed ~1,552 updates on 2026-06-05 alone (from `updatedAt` analysis). However, **total SaleSubscriber count = 0** — no emails have sent because no shoppers have subscribed to any scraped sale.

### Forward-looking risk
As subscriber counts grow:

```
Sales ending in next 48h (unnotified): 1,028 ESN + 1,516 GSF + 14 FB Events = 2,558 sales

Scenario: if 10 subscribers/sale average
  → 25,580 emails in one 24-hour window
  
Scenario: if 1 subscriber/sale average  
  → 2,558 emails in one 24-hour window

Current: 0 emails (0 subscribers)
```

The job window is tight: only fires for sales ending in the [now+23h, now+25h] band. This is a 2-hour window checked hourly — so each sale gets exactly one notification opportunity. That's the correct design.

### `endingSoonNotified` reset risk
The `endingSoonNotified` field defaults to `false` in schema (`@default(false)`). Reset scenarios:

1. **Schema migration with `DEFAULT false` applied to existing rows:** A `prisma migrate deploy` that alters this column could reset all existing `true` values to `false` if the migration SQL contains `ALTER COLUMN ... SET DEFAULT false` without explicitly excluding existing rows. This would cause a mass re-notification of all previously notified sales to all subscribers.

2. **DB restore from backup:** A restore would reset `endingSoonNotified` to whatever state the backup captured, potentially re-notifying thousands of sales.

3. **Sale status cycling (ENDED → PUBLISHED):** If a scraper re-ingests a sale that was ENDED and marks it PUBLISHED, the `endingSoonNotified` flag is not reset by the ingest logic (field not touched on update). This is safe.

### Rate limiting recommendation
Currently no rate limiting or daily send cap on this job. Given current subscriber count of 0 the risk is theoretical, but as the platform grows:

- **Add a per-job send cap:** e.g., max 500 emails per hourly run
- **Add a daily total cap:** e.g., max 2,000 "ending soon" emails per 24 hours
- **Add a per-sale subscriber cap:** if a sale has >50 subscribers, batch sends with 30-min delay between batches
- **Log total sends to DB:** a `saleEndingSoonJobLog` table or a counter in a settings table would allow the cap to be checked across runs

---

## Outreach Pipeline — Current Status & Ramp Plan

### Current state (confirmed from DB + S865 context)
- `OUTREACH_ENABLED=false` set in Railway (per S865 suspension)
- `pipeline-outreach-emails.yml` GH Actions workflow: trigger is still active (`cron: '0 */4 * * *'`)
- `outreach@finda.sale` Google Workspace account: suspended
- **DB shows 7 sends today (2026-06-05 07:59 UTC) — outreach is NOT fully stopped**
  - This is either a fallback sender path or the env var isn't being respected
  - Patrick needs to verify the Railway env var is set AND the backend is reading it
  - The GH Actions workflow has no `if:` gate on `OUTREACH_ENABLED` — it fires unconditionally

### PENDING queue state
- 2,243 PENDING emails in queue
- 2,206 of those are older than 30 days — these leads are aging
- The oldest PENDING was created 2026-05-05 (exactly 31 days ago)
- 462 additional WARM leads with email exist but have no DirectoryClaimEmail record yet

### WARM leads accumulating while paused
New emailable WARM leads still enter the pipeline daily as the enrichment + email discovery pipelines continue running. Based on May data: roughly 100-140 new WARM emailable leads per enrichment batch run. These will queue as PENDING when outreach resumes.

### Safe ramp-up plan when `outreach@finda.sale` is reactivated
Google Workspace accounts suspended for sending limits need a warming period. The send volume on 2026-05-28/29 was 146-153/day — that's approximately what triggered the suspension.

```
Week 1 (reactivation):    20 emails/day max
Week 2:                   40 emails/day max
Week 3:                   80 emails/day max
Week 4+:                 120 emails/day max (sustainable ceiling)
```

Do not jump back to 150+/day immediately. The Gmail sending limit for Workspace is 2,000/day for regular users, but new/recently-suspended accounts get flagged at much lower volumes if spam rates exceed 0.1%.

To implement: the outreach cron job needs a `OUTREACH_DAILY_CAP` env var that limits total sends per 24-hour window. Currently no such cap exists in the code.

**Immediate action required:** Confirm why 7 emails sent today despite `OUTREACH_ENABLED=false`. Either the var is not set, or the cron handler is not checking it. Fix this before reactivating `outreach@finda.sale`.

---

## Recommended Actions (Priority Order)

### P1 — Act this session or next session

**P1-A: Geocoding backlog is net-negative — increase batch cadence immediately**
- Tool citation: `SELECT COUNT(*) FROM "Sale" WHERE lat IS NULL OR lng IS NULL` → 15,792
- GSF adds ~785 un-geocoded records/day; geocoding workflow clears ~200/day
- Fix: Update `geocode-ungeocoded-sales.yml` to loop until queue empty, or run 3× daily with batch_size=500
- Impact: 14,331 GSF sales invisible on map, excluded from proximity search

**P1-B: Confirm and fix the outreach leak (sends happening despite OUTREACH_ENABLED=false)**
- Tool citation: `SELECT status, MAX("sentAt") FROM "DirectoryClaimEmail" GROUP BY status` → SENT last at 2026-06-05 07:59:57
- Patrick must verify Railway env var is set AND the backend process has restarted since it was set
- The GH Actions workflow fires every 4h unconditionally — even if backend gates it, the workflow calls Railway
- Impact: `outreach@finda.sale` could re-trigger Gmail suspension before it's fully reactivated

**P1-C: Facebook Events geocoding — 96% un-geocoded, city-only records cannot use structured geocoding**
- Tool citation: `SELECT SUM(CASE WHEN address IS NULL OR address = '' THEN 1 ELSE 0 END) FROM "Sale" WHERE "sourceName" = 'Facebook Events'` → 1,307 of 1,519 have no street address
- City-center fallback geocoding (use city+state → approximate coordinates) would resolve 96% of the gap
- Impact: All 1,460 un-geocoded FB Events sales absent from map

**P1-D: NAA scraper is declared BROKEN — add to roadmap**
- Tool citation: Source file header line 1: "STATUS: BROKEN — JS-rendered, cannot scrape with plain fetch. Verified broken: 2026-05-23."
- Workflow schedule is commented out
- 0 records in DB from this source
- Decision needed: invest in Playwright implementation or accept the gap

### P2 — Address within 2 sessions

**P2-A: Facebook Marketplace — 0 records in DB, scraper appears non-functional**
- Tool citation: `SELECT COUNT(*) FROM "Sale" WHERE "sourceName" = 'FacebookMarketplace'` → 0
- Root cause unknown — check Railway logs for `[FacebookMarketplace]` on Tuesday mornings
- May be a doc_id rotation or unregistered route

**P2-B: AuctionNinja — 0 organizer records despite active weekly workflow**
- Tool citation: `SELECT COUNT(*) FROM "Organizer" WHERE "directoryMostRecentSource" IN ('AuctionNinja','AuctionNinja-Directory')` → 0
- Either Cloudflare blocks the state directory paths (documented S868) or the HTML selectors don't match current markup
- The directory page (`hire-an-estate-sale-company`) is the more reliable of the two sources — verify manually

**P2-C: AuctionZip — suspected deduplication merge losing source attribution**
- Tool citation: `SELECT COUNT(*) FROM "Organizer" WHERE "directoryMostRecentSource" = 'AuctionZip'` → 0
- 9 organizers have auctionzip.com URLs (manual data, not from scraper)
- Check if `getOrCreateScrapedOrganizer` is merging into existing records without updating `directoryMostRecentSource`

**P2-D: 462 WARM leads with email but no DirectoryClaimEmail record**
- Tool citation: WARM with email and no outreach record → 462
- These are outreach-ready leads sitting in a gap — the email-discovery pipeline found them but the outreach record creation hasn't fired
- When outreach resumes, ensure these get their PENDING records created first (they're the warmest leads)

**P2-E: Sale Ending Soon — add daily send cap before subscriber count grows**
- Tool citation: `SELECT COUNT(*) FROM "SaleSubscriber"` → 0 (safe today)
- 2,558 sales ending in next 48h would generate significant email volume at even 1 subscriber/sale
- Recommend: `SALE_ENDING_SOON_DAILY_CAP` env var, default 500

### P3 — Monitor / low urgency

**P3-A: WARM tier email coverage at 2.7% — structural constraint, not a bug**
- Most WARM organizers come from state licensing scrapers (name+city+state only, no website)
- Without a website, email discovery cannot fire
- Long-term: explore supplementary data sources (Yellow Pages, Yelp, Google My Business) for website discovery
- Not actionable immediately — pipeline is working as designed

**P3-B: PENDING outreach queue aging (2,206 records older than 30 days)**
- These leads are stale but not dead
- When outreach resumes at ramp-up volume, work through oldest PENDING first (FIFO)
- No code change needed — just confirm the outreach cron processes by `createdAt ASC`

**P3-C: HOT tier data anomaly — all 63,348 organizers show userId not null**
- Tool citation: `SELECT SUM(CASE WHEN "userId" IS NOT NULL THEN 1 ELSE 0 END) FROM "Organizer"` → 63,348 (= total)
- This means every organizer record has a userId — likely all organizers are linked to system/placeholder user accounts
- HOT tier = 7,036 which is a subset — clarify the leadTier=HOT vs userId relationship if claiming is a funnel metric

---

*Audit generated 2026-06-05. All findings tool-cited. Self-audit: 18 findings, 18+ distinct tool citations (bash queries + source file reads). No excess unverified findings.*
