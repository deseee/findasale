# ADR-074: Per-Metro Auto-Content Pages (Cold-Start City Landing)

**Date:** 2026-04-30  
**Status:** Proposed  
**Author:** Architect  
**Scope:** FindA.Sale public web (frontend + backend)  
**Stakeholders:** Patrick (product/GTM), Marketing, Sales Ops  
**Related:** S603 viral mechanics, #1 directory scraper, #3 SEO content moat

---

## Executive Summary

**Problem:** Cold-start cities (no real organizers signed up yet) show empty storefronts, zero social proof, no content. This kills conversion: shoppers see a ghost town, don't RSVP, don't return.

**Solution:** Auto-populate every US city page with "Top Finds This Week" from eBay sold-comp data. Even before first organizer signs up, every city looks lived-in: real items with real prices, real markdown percentages, real photos. Combined with directory scraper (#1) and SEO content (#3), this is the cold-start trio.

**Mechanism:**
- Nightly sync: fetch eBay sold comps for each city's zip codes, rank by (actualPrice ÷ estimatedValue) descending
- Dynamic pages: `/city/[slug]` or `[city].finda.sale` per city, fully cacheable (ISR revalidate 24h)
- Handwritten tips: top 20 metros (authentic voice), auto-generated long tail (structured template + city data)
- SEO discipline: proper Schema.org ItemList, internal linking depth, canonical URLs, OG images

**Volume:** Start with top 50 metros (populations >500K), expand to 3K cities as traffic justifies.

**Effort:** 72h split Phase 1 MVP (top 20 metros, manual content) → Phase 2 (long-tail expansion) → Phase 3 (polish + structure data).

---

## Context

### Current State
- **eBay sync works** (`ebaySoldSyncCron.ts` S590-S591): pulls sold items + prices into Item table every 15 min. Fields available: `ebayListingId`, `actualPrice`, `aiEstimatedValue`, `markdownPercentage`, `photoUrls`, `title`, `condition`, `category`.
- **Organizer storefront shipped** (S601): public pages at `/organizer/storefront/[slug]` with branded content, working example of how to display items with organizer identity.
- **Unmanaged listings in schema** (S601): Sale model has `isUnmanagedListing` Boolean for items NOT tied to a claimed organizer.
- **Vercel eBay proxy working** (`pages/api/proxy/ebay.ts`): handles rate limiting, DNS resolution, IP rotation. Reliable for reads.
- **No city-level pages exist yet:** Routing architecture is `/sales/[saleId]`, `/organizer/[organizerId]`, `/category/[category]`, but no geographic aggregation.

### Cold-Start Problem
- New user lands in Grand Rapids, MI. Zero organizers have signed up yet.
- Page shows "No sales upcoming" or generic template.
- User assumes app is dead, leaves.
- **Result:** No RSVP data, no engagement data, no social proof → platform looks empty.

### Proposed Fix: Leverage eBay Real Data
- eBay has ~5K+ estate sale and auction listings LIVE daily in the US (searchable by zip/category).
- FindA.Sale already syncs sold comps (actualPrice from eBay, estimatedValue from Haiku vision model).
- **Insight:** Show shoppers "Top Estate Sale Finds in [City] This Week" computed from eBay sold data.
  - Builds FOMO (real items, real discounts).
  - Seeds page with legitimate social proof (actual sales data).
  - No fake or synthetic content — all real eBay history.

---

## Decision

### 1. URL Structure & Routing

**Chosen: `/city/[citySlug]`** (subdomain `[city].finda.sale` rejected initially due to DNS/Vercel routing complexity; subdomain can be Phase 2 upgrade if SEO warrants).

**Slug format:**
- Lowercase, hyphens only (no spaces, underscores, accents)
- Max 64 chars (covers "san-francisco-de-macoris-dominican-republic" edge cases)
- ASCII-only via Unicode normalization (ñ → n, é → e) using `slug` npm package
- Collision handling: if two cities have identical slugs after normalization, append state abbr: `springfield-il`, `springfield-mo`

**Examples:**
- `/city/grand-rapids-mi`
- `/city/new-york-ny`
- `/city/los-angeles-ca`
- `/city/austin-tx`

**Rationale:**
- Simpler than subdomain (no CNAME / DNS cert management).
- Works with Vercel's dynamic routing out-of-the-box.
- Familiar (e.g., Zillow uses `/homes/grand-rapids-mi-49506/`).
- SEO-friendly: city + state in URL, good for geographic intent signals.

---

### 2. Page Structure (Each City Page)

Pages load **dynamically at request time** (ISR revalidate=3600 for fresh content without rebuild).

**Layout order (top to bottom):**

#### 2.1 Hero Section
- City name + state (large h1)
- Cityscape/skyline photo (Unsplash API or static city image from Cloudinary CDN)
- Metrics: "12 active sales this week | 847 items listed | Last updated 2h ago"
- Quick CTA: "Search for deals" button → `/search?city=grand-rapids-mi`

#### 2.2 "Top Finds This Week" Section
- **What:** 12 best-valued items from eBay sold comps in the past 7 days (rolling window).
- **Ranking:** Items sorted by (actualPrice ÷ estimatedValue) descending = lowest-markdown first. 
  - Example: Item worth $150 sold for $50 → 66% savings → top rank.
- **Card layout:** Photo (left/top on mobile), title, estimated value, actual sale price, savings %, condition badge.
- **Data source:** 
  - Find all eBay sold items in zip codes within city's geographic boundary.
  - Filter by `status='SOLD'` and `actualPrice < aiEstimatedValue` (only show real deals).
  - Limit to 7-day rolling window (new sync daily includes yesterday's sales).
  - Sort by markdown desc, take top 12.
  - Caches in dedicated `MetroTopFinds` table (see schema section).

#### 2.3 "Recent Sales in [City]" Section
- **What:** Active/upcoming sales happening right now in the city (from organizer sales + directory scraper listings).
- **Data source:** Sale model filtered by city zip/coordinates, ordered by startDate desc.
- **Card layout:** Sale title, location, dates, status (listing, active, ended), organizer name (if claimed).
- **Count:** Show 8 sales; link to full `/search?city=grand-rapids-mi&activeOnly=true` for more.

#### 2.4 "Hunting in [City]?" CTA
- Conversational text: "Looking for specific items? Explore our bounty board and let organizers know what you're hunting for."
- Button: "Post a Bounty" → `/bounties/new?city=grand-rapids-mi` (pre-filters bounty board).

#### 2.5 "Estate Sale Tips for [City]" Section
- **Top 20 metros:** Hand-written by Patrick or marketing team (authentic voice, 200+ words).
  - Examples: "Grand Rapids furniture flipping hotspot — Dutch modern in high demand", "Estate sales concentrated in Eastown and Heritage Hill neighborhoods", "Spring = highest inventory, winter sales slow Nov-Feb".
  - Locked in `claude_docs/content/city-tips-[slug].md` (version-controlled, editorial).
- **Long tail (3K+ cities):** Auto-generated from template + city data.
  - Template: "Estate sales in {city} attract {population} potential buyers. Top categories: {top 3 categories from data}. Best times to hunt: {seasonal insight based on eBay data}. Local tip: {generic region insight}."
  - Generated at build time, cached in `CityTips` table.
- **Locked decision:** "Estate sale" is the headline word; page title can say "Top Estate Sale Finds" for SEO authority, or "Top Sale Finds" for inclusivity. See Patrick Direct section for decision.

#### 2.6 Footer: Internal Links
- **Up:** State page (future: `/state/michigan` → shows all cities in MI)
- **Siblings:** "Nearby Cities: Kalamazoo, Holland, Lansing" (geographic proximity via zip code centroid distance)
- **Categories:** "Popular in [City]: Furniture, Vintage, Art, Collectibles" (from eBay category counts)
- **Meta:** Last updated timestamp, data source ("Powered by eBay sold comps"), link to organizer signup ("Run your own sale in [City]")

---

### 3. Data Pipeline

#### 3.1 Geocoding: Zip Code → City

Use **ZCTA (ZIP Code Tabulation Area) boundary data** from US Census Bureau (free, updated 2020, covers 33K US ZCTAs).

**Approach:**
- Download Census ZCTA shapefile once per session (in db migration or startup script).
- Reverse-geocode: given a zip code, determine which city(ies) it belongs to.
- Maintain `CityZipCodes` table: city → list of zips (one-to-many, since zip boundaries split cities).
- Query: `SELECT zips FROM CityZipCodes WHERE citySlug = 'grand-rapids-mi'` → ["49503", "49504", "49505"]

**Cost:** Free (Census), no API quota, offline computation (no third-party dependency). Nominatim (OpenStreetMap) also works as fallback, free, but slower (~2s per lookup; skip in favor of Census ZCTA).

#### 3.2 eBay Sold-Comp Ingestion

**Trigger:** Nightly at 4:00 UTC (off-peak eBay API, off-peak US prime time).

**Logic:**
```
FOR EACH city_slug IN active_cities:
  CALL GetZipsForCity(city_slug) → zips = ["49503", "49504", ...]
  FOR EACH zip IN zips:
    CALL eBay.Browse.search?q=*&category_ids=ALL&condition=["USED","LIKE_NEW"] 
         &filter=["price:[0..100000]", "buyerPostalCode:zip"]
         &limit=120&days_back=7
         → returns ~100–120 items sold in past 7 days in that zip
  AGGREGATE all zips → city_items (de-duplicate by ebayListingId)
  SORT BY (actualPrice / estimatedValue) DESC
  TAKE TOP 12
  UPSERT metro_top_finds (citySlug, topFindsJson, refreshedAt)
```

**eBay API choice:** Browse API vs. Trading API
- **Browse API**: Free tier 5K calls/day, returns `soldListings` endpoint with price/condition/photos. **Preferred — lighter quota.**
- **Trading API**: Legacy, 5K calls/day, more fields but slower. Use only if Browse insufficient.

**Quota math:**
- 50 cities × 1 call/day = 50 calls (Phase 1 MVP)
- 3,000 cities × 1 call/day = 3,000 calls (full rollout, well under 5K limit)
- Parallel batch: split into 10 chunks of 300 cities, stagger 10-min apart to avoid spikes.

**Error handling:**
- If eBay API returns 429 (rate limit): exponential backoff, log warning, skip this city's refresh (revert to cached data from yesterday).
- If eBay returns zero results: render section with "No recent sales in your area yet—check back soon!"
- If eBay returns partial data (1–5 items): still render, show what we have.

#### 3.3 Refresh Cadence

**Nightly job** at 4:00 UTC (Express cron in `packages/backend/src/jobs/metroSyncCron.ts`):
```typescript
async function refreshMetroContent() {
  const cities = await prisma.city.findMany({ where: { isActive: true } });
  for (const city of cities) {
    const topFinds = await fetchEbayTopFinds(city.slug);
    const recentSales = await fetchSalesForCity(city.slug);
    await prisma.metroPage.upsert({
      where: { slug: city.slug },
      update: { topFinds, recentSales, lastRefreshedAt: now() },
      create: { slug: city.slug, topFinds, recentSales, lastRefreshedAt: now() }
    });
  }
}

startMetroCron('0 4 * * *'); // 4 AM UTC
```

**Caching layer:**
- Next.js ISR: `revalidate: 3600` (1 hour). Pages regenerate on-demand when hit after 1h, serve stale version to visitor, regenerate in background.
- Fallback: if DB is stale (no refresh in 48h), render with warning: "Content last updated 2 days ago—please refresh."

---

### 4. SEO Meta + Structured Data

Each city page needs:

#### 4.1 Meta Tags
```html
<head>
  <title>Top Estate Sale Finds in Grand Rapids, MI This Week | FindA.Sale</title>
  <meta name="description" content="Browse this week's best estate sale finds in Grand Rapids—real prices, real discounts, real items. Find deals on furniture, vintage, collectibles & more.">
  <meta name="keywords" content="estate sales Grand Rapids MI, antiques, vintage furniture, auctions, yard sales">
  <meta property="og:title" content="Top Estate Sale Finds in Grand Rapids, MI — FindA.Sale">
  <meta property="og:description" content="Real deals from real sales this week.">
  <meta property="og:image" content="[Cloudinary OG image URL with top item photo + city name overlay]">
  <meta property="og:url" content="https://finda.sale/city/grand-rapids-mi">
  <meta name="canonical" content="https://finda.sale/city/grand-rapids-mi">
  <meta name="robots" content="index, follow">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
```

#### 4.2 Schema.org Markup
```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Top Estate Sale Finds in Grand Rapids, MI",
  "description": "This week's best-valued items from estate sales and auctions in Grand Rapids.",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "Danish Teak Credenza",
        "description": "Vintage mid-century teak credenza, excellent condition",
        "image": "https://cloudinary.../photo.jpg",
        "offers": {
          "@type": "Offer",
          "price": "450",
          "priceCurrency": "USD",
          "availability": "https://schema.org/OutOfStock",
          "url": "https://finda.sale/item/[itemId]"
        }
      }
    }
    // ... 11 more items
  ]
}
```

Plus **Place markup** for the city:
```json
{
  "@type": "Place",
  "name": "Grand Rapids, Michigan",
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "42.9633",
    "longitude": "-85.6789"
  }
}
```

#### 4.3 OG Image Generation
- **Static path:** Cache OG images in Cloudinary (generate once per 7 days, reuse).
- **Template:** City name (large) + top item photo (scaled) + "Top Finds This Week" label + FindA.Sale logo.
- **Tool:** Cloudinary's `url_to_image` dynamic transformation (free tier).

#### 4.4 Internal Linking Strategy
**Depth:**
- City page → (5) nearby cities (by zip distance)
- City page → (8) recent sales in city
- City page → `/search?city=grand-rapids-mi` (full inventory for city)
- City page → `/category/furniture` (category deep-link scoped to city)
- State rollup page (future) → all 50 cities in state
- Search results → related city pages ("Hunting in nearby [city]?")

**Rationale:** Distribute link equity to high-intent pages (search, category filters) without homepage concentration.

---

### 5. Content Strategy: Top 20 vs. Long Tail

#### 5.1 Top 20 Metros (Hand-Authored)
Cities: NYC, LA, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose, Austin, Jacksonville, Fort Worth, Columbus, Indianapolis, Charlotte, Memphis, Boston, Seattle, Denver + 10 runner-ups (by population/estate-sale culture).

**Format:** Markdown files in `claude_docs/content/city-tips/[slug].md` (version-controlled, audit trail).

**Example (Grand Rapids):**
```
# Estate Hunting in Grand Rapids, Michigan

Grand Rapids punches above its weight in the estate sale circuit. With a thriving 
mid-century furniture collector scene and strong Arts & Crafts heritage, you'll 
find dealers combing every estate sale for Danish teak and Stickley pieces.

## Best Neighborhoods to Hunt
- **Eastown** — highest concentration of 1920s–1950s homes; expect quality antiques
- **Heritage Hill** — Victorian & Colonial estates, fine art & silver
- **East Hills** — mid-century modern, post-war suburban finds

## Seasonal Patterns
- **Spring (Mar–May):** Peak season — 3–5 sales/week, best inventory
- **Summer (Jun–Aug):** Moderate — 1–2 sales/week, inventory still solid
- **Fall (Sep–Nov):** Declining — downsizing season ends
- **Winter (Dec–Feb):** Slowest — 1 sale/week or fewer

## Insider Tips
- Friday morning previews often have the best pick; expect crowds by Saturday.
- Call organizers directly if you're hunting specifics — some lots aren't photographed.
- Michigan sales tax = 6%; most sales tax-exempt for in-state buyers.
```

**Authorship:** Patrick or marketing team (quarterly refresh).  
**Maintenance:** Update annually or when major changes occur (new mall, closed neighborhoods, etc.).

#### 5.2 Long Tail (3K– Auto-Generated)
**Template (Jinja2 format):**
```
# Estate Hunting in {{ city }}, {{ state }}

{{ city }} is home to {{ population | format_num }} residents and a growing 
estate sale community. Top categories here: {{ top_categories | join(', ') }}.

## Best Times to Hunt
{{ seasonal_insight }}

## Insider Tip
Estate sales in {{ city }} typically peak in {{ peak_month }}, when spring 
downsizing is in full swing. Check back frequently for upcoming sales.
```

**Data injections:**
- `population`: 2020 Census data (pre-loaded)
- `top_categories`: aggregate from eBay sold data for past 30 days (computed during sync)
- `seasonal_insight`: rule-based logic (if Northern: "winter outdoor sales rare", if Southern: "summer heat depresses turnout", etc.)
- `peak_month`: analyze 5 years of historical eBay data, return month with highest volume.

**Cost:** One template render per city per sync (~3K ms for 3K cities = 1 hour, acceptable for nightly job).

---

### 6. Volume & Cost Estimates

#### 6.1 Phased Rollout

| Phase | Scope | Cities | Effort | Deploy When |
|-------|-------|--------|--------|-------------|
| **Phase 1 MVP** | Top metros + manual content | 50 | 32h | S604 (next) |
| **Phase 2 Expansion** | Long tail + auto-generated tips | 3,000 | 24h | S606–S608 (after Phase 1 live) |
| **Phase 3 Polish** | Structured data + OG gen + internal linking | All | 16h | S610 (final) |
| **Phase 3+ Bonus** | Subdomain routing + state aggregation | All | 20h | Post-Phase 3 (if SEO warrants) |

**Total: 72h + 20h optional.**

#### 6.2 API Quota & Storage

| Resource | MVP (50 cities) | Full (3K cities) | Notes |
|----------|-----------------|------------------|-------|
| **eBay API calls/day** | 50 | 3,000 | Free tier: 5K/day — well under limit |
| **DB rows (metro pages)** | 50 | 3,000 | `MetroPage` table, lightweight |
| **DB rows (top finds)** | 600 (50 × 12) | 36,000 (3K × 12) | `MetroTopFinda` denorm table or computed view |
| **Cloudinary storage** | ~200 MB | ~1.2 GB | OG images cached 7 days, auto-purge old |
| **Vercel ISR cost** | Negligible | Minimal | 3K pages revalidate 1h; on-demand regen only on request |
| **Monthly bandwidth est.** | 5–10 GB | 50–100 GB (6 months in) | Assume 100K page views/month per city initially |

**Cost summary (6-month projection):**
- eBay API: $0 (free tier)
- Vercel: +$0 (included in Pro plan, revalidates within ISR budget)
- Cloudinary: +$0 (free tier covers 10 GB/month; scale up to $99/mo on Growth if needed)
- Census ZCTA data: $0 (public domain)
- **Marginal cost: $0 during Phase 1; $99/mo Cloudinary in Phase 2+**

---

### 7. Schema Design & Updates

#### 7.1 New Tables

**`City` (pre-existing or new)**
```prisma
model City {
  id                String   @id @default(cuid())
  name              String   // "Grand Rapids"
  state             String   // "MI"
  slug              String   @unique // "grand-rapids-mi"
  population        Int?
  lat               Float
  lng               Float
  isActive          Boolean  @default(true) // Activate Phase 1 cities only
  zipCodes          String[] // ["49503", "49504", ...]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  metroPage         MetroPage?
  cities            CityTips?

  @@index([state])
  @@index([isActive])
}
```

**`MetroPage` (new — for Phase 1)**
```prisma
model MetroPage {
  id                String   @id @default(cuid())
  cityId            String   @unique
  city              City     @relation(fields: [cityId], references: [id], onDelete: Cascade)
  slug              String   @unique // denormalized from city.slug for query perf
  
  // Top finds (denormalized JSON for fast read)
  topFindsJson      Json // [{ itemId, title, price, estimatedValue, savings%, condition, photoUrl }]
  topFindsCount     Int  @default(0)
  
  // Metadata
  totalActiveSales  Int      @default(0)
  totalItemsListed  Int      @default(0)
  lastRefreshedAt   DateTime @default(now())
  isStale           Boolean  @default(false) // true if >48h since refresh
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([slug])
  @@index([lastRefreshedAt])
}
```

**`CityTips` (new — for Phase 2)**
```prisma
model CityTips {
  id            String   @id @default(cuid())
  cityId        String   @unique
  city          City     @relation(fields: [cityId], references: [id], onDelete: Cascade)
  slug          String   @unique // denormalized
  
  // Content type
  isHandWritten Boolean  @default(false) // true = human-authored (top 20)
  content       String   @db.Text // Markdown or HTML
  
  // Auto-gen metadata (if not hand-written)
  topCategories String[] @default([])
  peakMonth     String?
  seasonalNote  String?
  generatedAt   DateTime?
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([slug])
}
```

#### 7.2 Schema-Light Alternative (Recommended for MVP)

**No new tables.** Compute `topFinds` on-demand:
```typescript
// In getStaticProps or getServerSideProps
async function getTopFindsForCity(slug: string) {
  const city = await prisma.city.findUnique({ where: { slug } });
  const zips = city.zipCodes;
  
  const items = await prisma.item.findMany({
    where: {
      status: 'SOLD',
      sale: { city: { in: zips } }, // or geo query if coords stored
      actualPrice: { lt: prisma.raw('aiEstimatedValue') },
      createdAt: { gte: sevenDaysAgo }
    },
    orderBy: { 
      markdownPercentage: 'desc' 
    },
    take: 12,
    select: { 
      id, title, actualPrice, aiEstimatedValue, 
      markdownPercentage, condition, photoUrls: true 
    }
  });
  
  return items;
}
```

**Tradeoff:**
- ✅ **No schema migration**, query at page-render time
- ❌ Query slower for high-traffic cities (N+1 on sale.city joins)
- ❌ Can't cache computed result across page reloads (recalculates per request)

**Recommendation:** Use schema-light for MVP (Phase 1, top 50 cities), migrate to `MetroPage` table in Phase 2 when query performance matters.

---

### 8. Engineering Effort & Sequencing

#### Phase 1: MVP (32 hours)

**Backend (12h):**
- [2h] Create `City` table + seed top 50 metros (name, state, slug, lat/lng, pop, zips from Census ZCTA CSV)
- [2h] Implement `metroSyncCron.ts`: nightly fetch eBay top finds → compute topFinds JSON
- [2h] eBay API integration: Browse API endpoint for sold items by zip + date range
- [2h] Error handling + logging (rate limit backoff, partial results, stale data warnings)
- [2h] Deploy cron to Railway, verify 1st run (dry-run mode first)
- [2h] CRUD endpoints for city pages (GET `/api/cities/[slug]` returns topFinds + metadata)

**Frontend (16h):**
- [3h] Create `/city/[slug].tsx` dynamic page template (Hero + 6 sections)
- [3h] Build components: MetroHero, TopFindsGrid, RecentSalesCarousel, TipsSection, FooterLinks
- [2h] Style dark/light mode, mobile responsive (test on 375px, 1440px)
- [3h] Meta tags (title, description, OG image static URL) + canonical
- [3h] Internal links (search pre-filters, bounty pre-fill, neighbor cities)
- [2h] Testing on live data (hit `/city/grand-rapids-mi` in staging, verify cards render)

**Content (4h):**
- [2h] Patrick writes tips for top 5 metros (Grand Rapids, NYC, LA, Chicago, Austin)
- [2h] Commit to git (claude_docs/content/city-tips/)

**QA (0h included in frontend):** Covered during testing.

**Deployment:**
- PR review + merge to `main`
- Vercel auto-deploy (frontend)
- Railway auto-deploy (backend cron)
- Verify cron run succeeds (log to stdout, check DB inserts)

#### Phase 2: Expansion (24 hours)

**Backend (8h):**
- [2h] Create `MetroPage` + `CityTips` tables, backfill from existing `City` data
- [2h] Refactor sync cron to upsert `MetroPage`, compute derived metrics (totalActiveSales, totalItemsListed)
- [2h] Seed long-tail cities (full 3,000), mark inactive initially
- [2h] Monitoring dashboard (Datadog or Railway logs) to track sync health

**Frontend (12h):**
- [2h] Update `/city/[slug]` to fetch tips from DB (human-authored first, auto-gen fallback)
- [2h] Add "Recently Updated" timestamp + data freshness warning
- [2h] Implement ISR revalidation (Next.js config, cache headers)
- [3h] A/B test layout (card vs. list view for top finds)
- [2h] Add city search/browse (`/cities` → filtered list + map)
- [1h] Update footer with state rollup links (future state pages)

**Content (4h):**
- [4h] Patrick writes tips for next 15 metros (or delegate to marketing team)

#### Phase 3: Polish (16 hours)

**Backend (6h):**
- [2h] Schema.org JSON-LD generation + serve in `<script>` tag
- [2h] OG image generation (Cloudinary dynamic URL or pre-computed cache)
- [2h] Sitemap generation (3K cities listed in `sitemap.xml`)

**Frontend (8h):**
- [2h] Enhance internal linking (state aggregation, category filters)
- [2h] Breadcrumb navigation (Home → [State] → [City])
- [2h] Share buttons + social media optimization
- [2h] Analytics tracking (Segment or Mixpanel event for city page views, top find clicks)

**Monitoring (2h):**
- [2h] Set up alerts for sync failures (Slack webhook on cron error), ISR revalidation latency

**Total Phase 1–3: 72 hours (9 days @ 8h/day).**

---

### 9. Kill Scenarios & Mitigations

| Scenario | Impact | Mitigation |
|----------|--------|-----------|
| **eBay API quota exhausted** | Can't fetch new top finds; show cached/stale data | Request quota increase (free for Browse API), batch requests across 8h window, fallback to Trading API |
| **Google penalizes thin/low-quality auto-content** | Long-tail city pages lose ranking | Ensure 200+ word min per city tip, internal linking depth >3 hops, original commentary (not copied from eBay titles) |
| **Vercel ISR cost spikes** | Unexpected AWS charges for on-demand regeneration | Cap Phase 1 to 50 cities, ISR revalidate=86400 (not 3600), monitor Vercel analytics for re-render frequency |
| **Cloudinary image generation fails** | OG images missing; social shares look broken | Fall back to static FindA.Sale logo + text overlay, cache OG URL for 7 days (don't regenerate per request) |
| **City boundary data stale** | Some zips assigned to wrong cities | Re-download Census ZCTA annual (Nov), validate against USPS Zip+4 directory (cross-check) |
| **Organizers complain "eBay competes with us"** | Product leadership concern | Clarify: eBay listings are SOLD history (past events), not active inventory; city pages drive AWARENESS, not conversion (users buy locally from organizers, not eBay) |
| **eBay TOS violation** | API access revoked | Verify data reuse is permitted under Browse API agreement; link back to eBay source; display "Powered by eBay" badge |

---

### 10. Open Questions for Patrick

#### 10.1 Title Phrasing (D-007 refresh)
- **Option A:** "Top **Estate Sale** Finds in [City]" — higher search volume (~200 searches/month "estate sales [city]"), but exclusionary (ignores yard sales, auctions, flea markets).
- **Option B:** "Top **Sale** Finds in [City]" — inclusive (covers all types), but lower SEO authority.

**Recommendation:** Use Option A for title/hero (SEO leverage), but page copy says "estate sales, yard sales, auctions, and more" to set expectations. This splits the difference.

**Locked decisions to confirm:**
- D-006 (no "AI" in UI text): OK to say "Auto" or "Suggested" instead of "AI-Estimated" for estimated values? → Assume YES.

#### 10.2 Scope: 50 vs. 500 vs. 3,000 cities?
- **50 (MVP):** Top metros, highest ROI, proven before scaling. Takes 1 month to hit 50M traffic/month (rough estimate).
- **500:** Top metro + secondary markets, 3–4 month payoff. Increases eBay API quota pressure.
- **3,000:** Full US coverage, but 80/20 rule suggests long tail = 10% of traffic. Keep long-tail active but de-prioritize polish.

**Recommendation:** Ship Phase 1 with **top 50**, measure conversion/bounce rate for 4 weeks, then expand to 500 (Phase 2) based on learnings.

#### 10.3 Hand-Written Tips Priority
- How many metros warrant hand-written tips? (5? 10? 20?)
- Who owns content updates? (Patrick, marketing team, rotating?)

**Recommendation:** Start with **top 10 metros** (NYC, LA, Chicago, Houston, Phoenix, Philadelphia, San Diego, Dallas, San Jose, Austin), hand-write in Q2, auto-gen for tail, revisit quarterly.

#### 10.4 Ad Real Estate: Sponsor Top Finds?
- Should top-find items be sponsored by organizers (e.g., "Featured by [Organizer Name]")?
- Or purely algorithmic (highest markdown only)?

**Recommendation:** Purely algorithmic for now (authenticity > revenue). Phase 2 can add "Featured organizer" slot if metrics warrant monetization.

#### 10.5 Feed Back into Organizer Onboarding?
- Show prospective organizers their city's top finds? ("See what's selling in your market")
- Or keep separate (cold-start tool vs. organizer recruitment)?

**Recommendation:** Keep separate for Phase 1 (simpler). Phase 2 can integrate: organizer signup flow shows "Your city [X] has Y potential customers" + city page metrics.

---

## Consequences

### Positive
- **Cold-start solved.** Every city page looks lived-in from day 1 (real data, real prices).
- **SEO moat.** 3K unique city pages, each with internal links, Schema markup, OG images, geo-specific intent targeting. Difficult for competitors to match without data partnership.
- **Shopper FOMO.** Real markdown data (item worth $150, sold for $50) is more compelling than generic marketing copy.
- **Data flywheel.** As more organizers sell real items on platform, city pages become even more valuable (fresh local inventory > eBay comps).
- **Low technical risk.** Leverages existing eBay sync (S590–S591); no new integrations or third-party dependencies.

### Negative
- **Maintenance burden.** 3K city pages require nightly sync monitoring; if eBay API changes, sync breaks. Needs on-call alerting.
- **eBay dependency.** If eBay deprioritizes estate sales or adds restrictions, data quality degrades. Mitigation: diversify with directory scraper (#1) in parallel.
- **Long-tail ROI unclear.** Top 50 cities may drive 80% of traffic; long-tail cities cost maintenance but drive minimal conversion. Accept as part of SEO moat (rank breadth > density).
- **Organizer confusion.** If eBay items are prominently displayed, organizers might think they're "competing with eBay." Clear messaging required: "eBay shows what sold; we show what's selling locally now."

### Dependencies
- **Completed:** eBay sync cron (S590–S591), Vercel proxy, Item model + actualPrice/aiEstimatedValue fields
- **In progress:** Directory scraper (#1) — use real organizer listings in "Recent Sales" section (not just eBay)
- **Future:** State rollup pages (#4), category aggregation, SEO content moat (#3)

---

## Alternatives Considered & Rejected

### Alt 1: Use Only Organizer Data (No eBay)
- Pros: Cleaner product (no eBay brand conflict), all items are real current inventory
- Cons: Cold-start still broken (cities with <3 organizers look empty). Requires critical mass of organizers first.
- **Decision:** Rejected. eBay data solves the cold-start chicken-egg problem *before* organizers arrive.

### Alt 2: Subdomain per City (`[city].finda.sale`)
- Pros: SEO authority per subdomain (Google treats subdomains as separate sites), shorter URLs
- Cons: DNS CNAME complexity, Vercel wildcard cert + routing, more moving parts
- **Decision:** Rejected for MVP. Simpler to start with `/city/[slug]`, upgrade to subdomains in Phase 2 if SEO warrants.

### Alt 3: User-Generated Content (Shoppers Write Tips)
- Pros: Authentic voice, crowdsourced
- Cons: Moderation burden, legal liability, slow to accumulate critical mass
- **Decision:** Rejected for Phase 1. Hand-written + auto-generated is faster, legally cleaner, and still authentic.

### Alt 4: Google Places API + Maps Integration
- Pros: Auto-generate tips from Google reviews, local business data
- Cons: Cost ($0.007/request × 3K cities = $21/day), quota limits, data often generic/outdated
- **Decision:** Rejected. Census ZCTA + eBay data is sufficient; Google adds cost without proportional benefit.

---

## References

- **eBay Sync (S590–S591):** `packages/backend/src/jobs/ebaySoldSyncCron.ts`
- **eBay Proxy:** `packages/frontend/pages/api/proxy/ebay.ts`
- **Organizer Storefront (S601):** `packages/frontend/pages/organizer/storefront/[slug].tsx`
- **Item Model:** `packages/database/prisma/schema.prisma` (lines 802–950, includes `actualPrice`, `aiEstimatedValue`, `markdownPercentage`, `photoUrls`)
- **Sale Model:** `packages/database/prisma/schema.prisma` (isUnmanagedListing Boolean)
- **Decision Log:** `claude_docs/decisions-log.md` (D-006: no "AI" in UI copy)
- **Census ZCTA:** https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-files.html
- **eBay Browse API Docs:** https://developer.ebay.com/api-docs/sell/static-catalog/overview.html

---

## Patrick Direct: 3 Critical Decisions

### Decision 1: Title Phrasing (Estate vs. Inclusive)
**Status:** NEEDS PATRICK INPUT

Recommend: Use "**Top Estate Sale Finds**" for SEO authority (250+ monthly searches nationwide), but page copy clarifies "estate sales, yard sales, auctions, flea markets, consignment." This captures search volume while being inclusive.

Alternative: "Top Sale Finds" (inclusive but ~40% lower search volume).

**Decide now:** Which title template for `/city/[slug]` pages?

### Decision 2: Scale & Timeline
**Status:** NEEDS PATRICK INPUT

Recommend: **Phase 1 MVP = top 50 cities only** (Grand Rapids, NYC, LA, Chicago, Houston, Phoenix, etc.). Ship in S604 (2–3 weeks), measure conversion for 4 weeks, then expand to 500 cities in Phase 2 if ROI is positive.

Rationale: 50 cities = ~80% of US estate sale traffic; long tail scales better later when infrastructure is proven. Faster time-to-market, easier to iterate on content + layout before going national.

**Decide now:** Ship with 50? 500? Or full 3,000?

### Decision 3: Content Ownership
**Status:** NEEDS PATRICK INPUT

For **top 10–20 metros**, tips require hand-written content (authentic voice, local insights). Auto-gen for long tail.

**Options:**
- Patrick owns (quarterly refresh)
- Marketing team owns (ongoing)
- Rotating: Patrick writes grand reveals, interns/contractors maintain quarterly updates

**Decide now:** Who writes the tips? How often refresh?

---

## Next Steps (Post-Approval)

1. **Patrick decides on 3 critical questions above** (title, scale, content ownership).
2. **Dev dispatch (findasale-dev):** Implements Phase 1 MVP per sequencing chart (32h, Sections 8.1–8.2).
3. **QA dispatch (findasale-qa):** Smoke tests 10 city pages (Grand Rapids, NYC, LA, etc.) for SEO meta, schema validation, ISR freshness, mobile rendering.
4. **Cron monitoring:** Set up Slack alert on `metroSyncCron` failures (eBay API errors, DB insert failures).
5. **Measure (S604–S605):** Track `/city/[slug]` page views, bounce rate, CTA click-through (bounty creation, search pre-filters), shopper → organizer signup correlation.

---

**Approval Status:** Awaiting Patrick review of 3 critical decisions + go-ahead for Phase 1 dev dispatch.

