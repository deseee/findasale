# Multi-Source Pricing Engine — Architecture Spec
**Status:** Ready for Dev Dispatch  
**Session:** S574  
**Date:** 2026-04-25

---

## ADR — Multi-Source Pricing Engine — 2026-04-25

### Decision
Replace the single-path pricing lookup (PriceCharting → eBay fallback) with a tiered, weighted, fully-configurable multi-source pricing engine. Every data source is individually toggleable. The engine handles appreciation, brand premium, sleeper detection, and real-time trend signals — not just depreciation.

### Rationale
Current coverage: ~15-20% of inventory (collectibles + eBay asking prices). Everything else — furniture, tools, clothing, appliances, art, vinyl, sneakers — is off by 50-300% because a flat depreciation model doesn't account for brand value retention, collectible patterns, or trending demand. Organizer trust erodes when a savvy shopper picks up a $200 Griswold skillet for $8.

### Consequences
- New service: `packages/backend/src/services/pricingEngine.ts` + adapter registry
- 6 new Prisma models (see schema section)
- Existing `cloudAIService.ts` pricing calls route through the new engine
- All sources start with a feature flag; paid sources default to disabled

### Constraints Added
- Never apply category depreciation curves to brands in the BrandException table
- Weighted median, not mean (outliers destroy furniture comps)
- Asking-price sources always get 0.6x multiplier before weighting
- Organizer's manually-set price is NEVER modified (D-005 rule preserved)

---

## Schema Design — 6 New Models

```prisma
// ─── 1. Source configuration (feature flags + quota tracking) ───────────────
model PricingSourceConfig {
  id            String   @id @default(cuid())
  sourceId      String   @unique  // "ebth" | "keepa" | "discogs" | etc.
  enabled       Boolean  @default(false)
  tier          Int                          // 1 | 2 | 3
  apiKey        String?                      // encrypted at rest
  apiQuotaDaily Int?                         // null = unlimited
  apiUsedToday  Int      @default(0)
  lastResetAt   DateTime @default(now())
  costPerCall          Decimal? @db.Decimal(10, 6)  // for cost tracking
  consecutiveFailures  Int      @default(0)          // circuit breaker counter
  disabledAt           DateTime?                     // set by circuit breaker; null = not tripped
  lastFailureAt        DateTime?                     // for alerting + auto-reset checks
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@index([sourceId])
  @@index([tier, enabled])
}

// ─── 2. Cached comps (avoid redundant API calls) ────────────────────────────
model PricingComp {
  id            String   @id @default(cuid())
  sourceId      String                       // which adapter produced this
  itemKey       String                       // normalized search key (category:brand:model)
  category      String
  brand         String?
  model         String?
  condition     String?
  soldPrice     Decimal  @db.Decimal(10, 2)
  currency      String   @default("USD")
  soldAt        DateTime                     // when this comp sold
  isAskingPrice Boolean  @default(false)     // true = needs 0.6x adjustment
  sourceUrl     String?
  rawTitle      String?                      // original listing title
  fetchedAt     DateTime @default(now())

  @@index([itemKey, sourceId])
  @@index([category, soldAt])
  @@index([fetchedAt])
}

// ─── 3. Brand exception table ────────────────────────────────────────────────
model BrandException {
  id                String   @id @default(cuid())
  brand             String                        // "Le Creuset"
  category          String                        // "cookware"
  appreciationMode  String                        // "APPRECIATION" | "HOLD" | "SLOW_DEPRECIATION"
  yearlyChangeRate  Decimal  @db.Decimal(5, 4)    // e.g. 0.05 = +5%/yr, -0.05 = -5%/yr
  notes             String?
  sleeperPatterns   String?                       // JSON array of photo AI detection strings
  multiplierOverride Decimal? @db.Decimal(5, 3)  // override if set; else use yearlyChangeRate
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([brand, category])
  @@index([brand])
  @@index([category])
}

// ─── 4. Sleeper pattern registry (for AI photo detection) ────────────────────
model SleeperPattern {
  id             String   @id @default(cuid())
  patternName    String   @unique    // "griswold_cast_iron"
  displayLabel   String              // "Griswold Cast Iron"
  category       String
  detectionHints String              // what to look for in photo/title
  minValueEstimate Decimal @db.Decimal(10, 2)
  maxValueEstimate Decimal @db.Decimal(10, 2)
  specialistSource String             // which adapter to call: "worthpoint" | "ebay" | "pricecharting"
  confidenceBoost Decimal @db.Decimal(3, 2)  // how much to boost confidence when detected
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())

  @@index([category])
  @@index([active])
}

// ─── 5. Category depreciation curves ─────────────────────────────────────────
model CategoryDepreciation {
  id               String   @id @default(cuid())
  categoryKey      String   @unique   // "electronics" | "furniture_generic" | "tools_brand" | etc.
  displayName      String
  yearlyDecayRate  Decimal  @db.Decimal(5, 4)   // 0.50 = 50%/yr
  lambdaDaily      Decimal  @db.Decimal(8, 6)   // for recency decay e^(-λt)
  conditionFactors String                        // JSON: { "like_new": 1.0, "good": 0.7, "fair": 0.45, "poor": 0.2 }
  notes            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([categoryKey])
}

// ─── 6. Trend signal cache ────────────────────────────────────────────────────
model TrendSignal {
  id              String   @id @default(cuid())
  signalKey       String                         // "category:furniture" | "brand:pyrex" | etc.
  sourceType      String                         // "google_trends" | "ebay_momentum"
  trendValue      Decimal  @db.Decimal(8, 4)     // normalized 0-100 or % change
  trendDirection  String                         // "UP" | "DOWN" | "FLAT"
  multiplier      Decimal  @db.Decimal(5, 3)     // 1.0 = no change, 1.2 = 20% boost
  fetchedAt       DateTime @default(now())
  expiresAt       DateTime                       // TTL: 24h for Google, 1h for eBay momentum

  @@index([signalKey])
  @@index([expiresAt])
}
```

### Migration Plan
**File:** `20260425_add_pricing_engine`  
**SQL summary:** CREATE TABLE for all 6 models above + indexes  
**Down migration:** DROP TABLE all 6 (no user data at launch)  
**Rollback playbook:** "If deploy fails after migration, run `prisma migrate down 1` — tables are empty, safe to drop"

---

## Service Architecture

```
packages/backend/src/services/
  pricingEngine/
    index.ts                  ← public API: estimatePrice(item)
    orchestrator.ts           ← cascade through tiers, collect comps, compute result
    weighting.ts              ← all math: recency decay, sample size boost, weighted median
    signals.ts                ← trend multiplier, brand premium lookup, sleeper detection
    adapters/
      registry.ts             ← maps sourceId → adapter class, checks enabled flag
      base.ts                 ← abstract PricingAdapter interface
      pricecharting.ts        ← existing (refactor into adapter pattern)
      ebay.ts                 ← existing (enhance: sold listings, recency decay)
      ebth.ts                 ← NEW: Apify actor → EBTH hammer prices
      keepa.ts                ← NEW: Amazon price history
      discogs.ts              ← NEW: vinyl sold prices
      gsa.ts                  ← NEW: government surplus API
      salvationArmy.ts        ← NEW: static lookup table (Tier 3 floor)
      maxsold.ts              ← STUBBED (disabled at launch)
      hibid.ts                ← STUBBED (disabled at launch)
      bstock.ts               ← STUBBED (disabled at launch)
      worthpoint.ts           ← STUBBED (disabled at launch)
      storageTreasures.ts     ← STUBBED (disabled at launch)
      offerup.ts              ← STUBBED (disabled at launch)
      stockx.ts               ← STUBBED (disabled at launch)
    cache.ts                  ← comp cache read/write (PricingComp table, 7-day TTL)
    depreciation.ts           ← category curve lookup + condition factor application
```

### Adapter Interface (base.ts)
```typescript
export interface PricingAdapter {
  sourceId: string;
  tier: 1 | 2 | 3;
  isAskingPriceSource: boolean;   // if true, weighting.ts applies 0.6x adjustment

  // Returns raw comps — engine handles weighting
  fetchComps(query: PricingQuery): Promise<RawComp[]>;

  // Health check for monitoring
  isAvailable(): Promise<boolean>;
}

export interface PricingQuery {
  category: string;
  brand?: string;
  model?: string;
  condition?: 'like_new' | 'good' | 'fair' | 'poor';
  asin?: string;               // Keepa uses this
  upc?: string;
  itemTitle?: string;          // fallback for text search
  maxAgeDays?: number;         // filter comps older than this
}

export interface RawComp {
  price: number;
  currency: string;
  soldAt: Date;
  isAskingPrice: boolean;
  condition?: string;
  title?: string;
  url?: string;
}
```

---

## Weighting Model (weighting.ts)

```typescript
// 1. Per-source base weights
const SOURCE_BASE_WEIGHTS: Record<string, number> = {
  pricecharting:    1.0,  // gold standard for collectibles
  ebth:             1.0,  // real hammer prices
  maxsold:          1.0,
  discogs:          1.0,  // real sold prices for vinyl
  keepa:            0.85, // new/warehouse prices (needs depreciation applied)
  gsa:              0.75, // govt surplus = slightly low bias
  ebay:             0.70, // enhanced but still asking-price heavy
  hibid:            0.70,
  bstock:           0.60, // liquidation context = underpriced
  worthpoint:       0.80, // historical, antiques-focused
  storageTreasures: 0.45, // distressed floor
  offerup:          0.50, // local asking prices
  stockx:           0.90, // real market for sneakers
  salvationArmy:    0.30, // IRS estimate, not transaction
};

// 2. Asking price penalty (applied before all other adjustments)
const ASKING_PRICE_MULTIPLIER = 0.60; // 15-20% historical spread → use 0.6 to be conservative

// 3. Recency decay: weight × e^(-λ × daysOld)
// λ varies by category — electronics decay fast, tools hold value
const LAMBDA_BY_CATEGORY: Record<string, number> = {
  electronics:        0.10,  // 7-day half-life
  appliances:         0.05,
  furniture_branded:  0.02,
  furniture_generic:  0.03,
  tools_brand:        0.015, // DeWalt, Milwaukee hold value well
  tools_generic:      0.03,
  clothing:           0.06,
  collectibles:       0.02,
  vinyl:              0.02,
  sneakers:           0.08,  // hype cycles are fast
  art:                0.01,
  default:            0.03,
};

// 4. Sample size boost: log(n+1) / log(maxN+1), capped at 1.0
// More comps = more confidence, but logarithmic (10 comps isn't 10x better than 1)
function sampleSizeBoost(n: number, maxN = 10): number {
  return Math.log(n + 1) / Math.log(maxN + 1);
}

// 5. Final per-source weight
function computeWeight(source: string, comp: RawComp, category: string): number {
  let w = SOURCE_BASE_WEIGHTS[source] ?? 0.5;
  if (comp.isAskingPrice) w *= ASKING_PRICE_MULTIPLIER;
  const λ = LAMBDA_BY_CATEGORY[category] ?? LAMBDA_BY_CATEGORY.default;
  const daysOld = (Date.now() - comp.soldAt.getTime()) / 86400000;
  w *= Math.exp(-λ * daysOld);
  return w;
}

// 6. Weighted median (not mean — outliers kill furniture)
function weightedMedian(prices: number[], weights: number[]): number {
  const sorted = prices
    .map((p, i) => ({ p, w: weights[i] }))
    .sort((a, b) => a.p - b.p);
  const totalWeight = sorted.reduce((s, x) => s + x.w, 0);
  let cumulative = 0;
  for (const { p, w } of sorted) {
    cumulative += w;
    if (cumulative >= totalWeight / 2) return p;
  }
  return sorted[sorted.length - 1].p;
}
```

---

## Signal Layer (signals.ts)

### Brand Exception Check
```typescript
async function applyBrandException(
  query: PricingQuery,
  baseEstimate: number
): Promise<{ price: number; flag: BrandPremiumFlag | null }> {
  const exception = await prisma.brandException.findFirst({
    where: { brand: { contains: query.brand ?? '', mode: 'insensitive' }, category: query.category }
  });
  if (!exception) return { price: baseEstimate, flag: null };

  if (exception.multiplierOverride) {
    return { price: baseEstimate * Number(exception.multiplierOverride), flag: { brand: exception.brand, mode: exception.appreciationMode } };
  }
  // Apply yearly change rate compounded — default to 1 year if age unknown
  const multiplier = 1 + Number(exception.yearlyChangeRate);
  return { price: baseEstimate * multiplier, flag: { brand: exception.brand, mode: exception.appreciationMode } };
}
```

### Sleeper Detection
Runs on item title + AI vision tags already generated by `cloudAIService.ts`. Queries `SleeperPattern` table for matches. If matched, triggers specialist adapter lookup and returns flag.

```typescript
async function detectSleeper(title: string, visionTags: string[]): Promise<SleeperFlag | null> {
  const patterns = await prisma.sleeperPattern.findMany({ where: { active: true } });
  for (const pattern of patterns) {
    const hints = pattern.detectionHints.toLowerCase().split(',');
    const searchText = (title + ' ' + visionTags.join(' ')).toLowerCase();
    if (hints.some(hint => searchText.includes(hint.trim()))) {
      return {
        patternName: pattern.patternName,
        displayLabel: pattern.displayLabel,
        estimatedRange: { low: Number(pattern.minValueEstimate), high: Number(pattern.maxValueEstimate) },
        specialistSource: pattern.specialistSource,
        confidenceBoost: Number(pattern.confidenceBoost),
      };
    }
  }
  return null;
}
```

### Trend Multiplier
Checks `TrendSignal` cache (expires 24h). If stale, fetches from Google Trends or computes eBay momentum. Returns multiplier (1.0 = no change, 1.3 = 30% boost).

```typescript
async function getTrendMultiplier(category: string, brand?: string): Promise<number> {
  const key = brand ? `brand:${brand.toLowerCase()}` : `category:${category}`;
  const cached = await prisma.trendSignal.findFirst({
    where: { signalKey: key, expiresAt: { gt: new Date() } }
  });
  if (cached) return Number(cached.multiplier);
  // If expired, queue refresh job (don't block pricing call)
  void refreshTrendSignal(key);
  return 1.0; // neutral until refresh completes
}
```

---

## Orchestrator Flow (orchestrator.ts)

```
estimatePrice(item):
  1. Normalize query (category, brand, condition, ASIN if present)
  2. Check comp cache (PricingComp table, 7-day TTL) → skip API calls if fresh
  3. PRE-CHECKS (run before any tier):
     a. Brand exception check → if match, note flag, skip depreciation
     b. Sleeper detection → if match, add specialist source to Tier 1 queue
     c. Fetch trend multiplier (non-blocking, from cache)
  4. Tier 1 sources (enabled only):
     → Query all in parallel (Promise.all)
     → Collect RawComp[] from each
  5. If Tier 1 comps >= 3: compute weighted median, skip Tier 2
  6. Else Tier 2 sources:
     → Query enabled Tier 2 adapters
     → Merge comps with Tier 1
  7. If still < 3 comps: Tier 3 floor (Salvation Army table)
  8. Apply depreciation curve to Keepa/new-price sources
  9. Apply brand exception multiplier if flagged
  10. Apply trend multiplier
  11. Compute weighted median → estimate
  12. Compute priceRange: ±20% for HIGH confidence, ±35% for MEDIUM, ±50% for LOW
  13. Determine confidence:
      HIGH   = Tier 1 comps >= 5
      MEDIUM = Tier 1 comps 2-4 or Tier 2 comps >= 3
      LOW    = < 3 comps total, using Tier 1/2 sources
      FLOOR  = Tier 3 only (Salvation Army fallback)
  14. Write comps to cache
  15. Return PricingResult
```

---

## API Contract

### POST /api/pricing/estimate
**Auth:** organizer JWT (or unauthenticated for public estimate — see open questions)

**Request:**
```json
{
  "itemId": "optional — if provided, reads item from DB",
  "category": "furniture",
  "brand": "Herman Miller",
  "model": "Aeron Chair Size B",
  "condition": "good",
  "asin": "optional",
  "itemTitle": "Herman Miller Aeron Chair",
  "visionTags": ["office chair", "mesh back", "ergonomic"]
}
```

**Response:**
```json
{
  "estimatedPrice": 425.00,
  "priceRange": { "low": 340.00, "high": 510.00 },
  "confidence": "HIGH",
  "tier": 1,
  "sourcesConsulted": [
    { "sourceId": "ebth", "compsFound": 4, "avgPrice": 412.50, "weight": 0.38 },
    { "sourceId": "ebay", "compsFound": 7, "avgPrice": 445.00, "weight": 0.31 }
  ],
  "flags": {
    "isBrandPremium": true,
    "brandPremiumBrand": "Herman Miller",
    "appreciationMode": "HOLD",
    "isSleeperDetected": false,
    "isTrending": false,
    "trendMultiplierApplied": 1.0
  },
  "deprecationCurveApplied": null,
  "compsFound": 11,
  "dataFreshness": "2026-04-25T14:00:00Z"
}
```

**Error responses:**
- `404` if itemId provided but item not found
- `422` if category missing and cannot be inferred
- `503` if all sources fail (rare — Salvation Army table is always available)

---

## Dev Implementation Phases

### Phase 1: Core Engine + Tier 1 Sources (S574–S575)
**Goal:** 80%+ coverage with HIGH/MEDIUM confidence

**Task 1.1 — Schema migration**
- Create migration `20260425_add_pricing_engine`
- All 6 models above
- Seed CategoryDepreciation with 12 curves (see seed data below)
- Seed SleeperPattern with 20 initial patterns (see seed data below)
- Seed PricingSourceConfig for all sources (enabled/disabled per spec)

**Task 1.2 — Adapter base + registry**
- `base.ts`: PricingAdapter interface, PricingQuery, RawComp types
- `registry.ts`: reads PricingSourceConfig from DB, returns enabled adapters by tier
- Unit test: registry returns correct adapters based on DB config

**Task 1.3 — Weighting module**
- `weighting.ts`: all functions above (computeWeight, sampleSizeBoost, weightedMedian)
- Unit tests for each function with known inputs

**Task 1.4 — PriceCharting adapter (refactor existing)**
- Wrap existing PriceCharting calls into PricingAdapter interface
- isAskingPrice = false (sold prices)

**Task 1.5 — eBay adapter (enhance existing)**
- Filter to completed/sold listings only (use `filter=soldItemsOnly:true` in Browse API or switch to findCompletedItems via Marketplace Insights when approved)
- Apply recency decay in weighting (pass soldAt from listing end date)
- isAskingPrice = true (listing prices, not confirmed sold amounts)

**Task 1.6 — EBTH adapter (new)**
- Apify actor: `apify/ebth-scraper` (search Apify store; if none exists, use generic scraper targeting ebth.com/search)
- Query: category + optional brand keywords
- Parse: lot title, hammer price, sale date
- Cache results in PricingComp table (7-day TTL)
- isAskingPrice = false

**Task 1.7 — Keepa adapter (new)**
- API: `https://api.keepa.com/product?key=KEY&domain=1&asin=ASIN`
- Extract: new price, used price, warehouse deal price (last 90 days)
- Apply category depreciation curve to new price if no used price available
- Only triggers when query.asin is provided
- isAskingPrice = true (marketplace prices)

**Task 1.8 — Discogs adapter (new)**
- API: `https://api.discogs.com/marketplace/stats/{release_id}` (official free API)
- For items where category = "vinyl" or visionTags include "record", "vinyl", "album"
- Use title search to find release ID first: `GET /database/search?q=TITLE&type=release`
- Returns: lowest_price, num_for_sale — combine with recent sold history endpoint
- isAskingPrice = false (Discogs provides actual sold prices via /marketplace/stats)

**Task 1.9 — GSA Auctions adapter (new)**
- API: `https://api.sam.gov/opportunities/v2/search` (GSA auctions public API)
- Filter to closed auctions for relevant categories (tools, equipment, office furniture)
- Parse awarded price from auction results
- isAskingPrice = false

**Task 1.10 — Salvation Army adapter (new)**
- Static lookup table (no API call) — built from structured parse of satruck.org guide
- Schema: category → condition → { low, high } price range
- Returns midpoint as comp with isAskingPrice = false (IRS FMV, not asking)
- Always returns a result (Tier 3 safety net)

**Task 1.11 — Orchestrator + signals stub**
- `orchestrator.ts`: full cascade flow (Steps 1-15 above)
- `signals.ts`: brand exception check, sleeper detection (queries DB — patterns must be seeded)
- Trend multiplier: stub returns 1.0 for Phase 1 (Google Trends integration is Phase 2)

**Task 1.12 — POST /api/pricing/estimate endpoint**
- Route: `packages/backend/src/routes/pricing.ts`
- Register in `index.ts`
- Auth: require organizer JWT
- Call orchestrator, return PricingResult
- TypeScript zero-error check before returning

**Task 1.13 — Wire into cloudAIService.ts**
- When AI pipeline suggests a price, run through pricingEngine.estimatePrice() first
- If engine returns HIGH or MEDIUM confidence, use engine result instead of raw AI suggestion
- If engine returns LOW or FLOOR, keep AI suggestion but log the discrepancy for tuning

---

### Phase 2: Signal Layer (S576)
- Google Trends API integration (free) — query by category/brand, cache 24h in TrendSignal
- eBay momentum: compute 7/30/90-day moving averages from comp cache, detect acceleration
- Expand SleeperPattern seed to 50+ patterns
- Daily cron: refresh trend signals for top 50 categories
- Weekly cron: batch sleeper detection on newly listed items

---

### Phase 3: Remaining Sources + Admin (S577+)
Implement stubs for disabled sources (flip enabled=true in DB to activate):
- MaxSold (scrape like EBTH)
- HiBid (Apify actor)
- B-Stock (partnership API — requires account)
- WorthPoint (subscription — requires account)
- StorageTreasures (scrape)
- OfferUp (Apify actor)
- StockX (scrape or unofficial API)

Admin panel (organizer settings or admin-only):
- View which sources are enabled
- See per-source cost tracking
- Toggle sources on/off without redeploy

---

## Seed Data

### CategoryDepreciation (12 curves)
```
electronics:         λ=0.10,  yearly=0.50, conditions={like_new:1.0, good:0.65, fair:0.40, poor:0.20}
appliances:          λ=0.05,  yearly=0.20, conditions={like_new:1.0, good:0.70, fair:0.45, poor:0.25}
furniture_branded:   λ=0.02,  yearly=0.15, conditions={like_new:1.0, good:0.75, fair:0.50, poor:0.25}
furniture_generic:   λ=0.03,  yearly=0.45, conditions={like_new:1.0, good:0.60, fair:0.35, poor:0.15}
tools_brand:         λ=0.015, yearly=0.08, conditions={like_new:1.0, good:0.80, fair:0.55, poor:0.30}
tools_generic:       λ=0.03,  yearly=0.25, conditions={like_new:1.0, good:0.65, fair:0.40, poor:0.20}
clothing_luxury:     λ=0.02,  yearly=0.10, conditions={like_new:1.0, good:0.70, fair:0.45, poor:0.20}
clothing_standard:   λ=0.06,  yearly=0.60, conditions={like_new:1.0, good:0.50, fair:0.25, poor:0.10}
art_original:        λ=0.01,  yearly=0.00, conditions={like_new:1.0, good:0.90, fair:0.70, poor:0.40}
books:               λ=0.01,  yearly=0.30, conditions={like_new:1.0, good:0.65, fair:0.40, poor:0.15}
china_crystal:       λ=0.005, yearly=0.05, conditions={like_new:1.0, good:0.90, fair:0.65, poor:0.30}
default:             λ=0.03,  yearly=0.30, conditions={like_new:1.0, good:0.65, fair:0.40, poor:0.20}
```

### BrandException (65 entries — initial seed)
**Cookware / Kitchen (HOLD or APPRECIATION)**
- Le Creuset — cookware — HOLD — +2%/yr — Dutch ovens, braisers
- All-Clad — cookware — HOLD — +1%/yr
- Vitamix — appliances — HOLD — +1%/yr
- KitchenAid (stand mixer) — appliances — HOLD — +3%/yr (vintage colors appreciate)
- Lodge — cast_iron — SLOW_DEPRECIATION — -3%/yr
- Griswold — cast_iron — APPRECIATION — +8%/yr — sleeper patterns: "griswold", "erie pa", "slant logo"
- Wagner — cast_iron — APPRECIATION — +5%/yr — sleeper patterns: "wagner ware", "sidney o"
- Pyrex (Butterprint) — glassware — APPRECIATION — +10%/yr — pattern: "butterprint", "amish"
- Pyrex (Gooseberry) — glassware — APPRECIATION — +8%/yr — pattern: "gooseberry"
- Pyrex (Lucky in Love) — glassware — APPRECIATION — +15%/yr — rarest pattern
- Pyrex (Balloons) — glassware — APPRECIATION — +12%/yr
- Fiestaware (discontinued colors) — ceramics — APPRECIATION — +6%/yr — lilac, medium green, chartreuse
- Fire-King — glassware — APPRECIATION — +5%/yr — jadeite especially

**Furniture (HOLD)**
- Herman Miller — furniture — HOLD — +2%/yr — Aeron, Eames
- Knoll — furniture — HOLD — +2%/yr
- Steelcase — furniture — SLOW_DEPRECIATION — -5%/yr
- Eames (authentic) — furniture — APPRECIATION — +10%/yr — sleeper: "herman miller label", "eames"
- Stickley — furniture — HOLD — +1%/yr
- Nakashima — furniture — APPRECIATION — +15%/yr — rare
- Baker — furniture — HOLD — +1%/yr

**Pottery / Ceramics (APPRECIATION)**
- Hull Pottery — pottery — APPRECIATION — +6%/yr — sleeper: "hull usa", "hull pottery"
- McCoy Pottery — pottery — APPRECIATION — +5%/yr — sleeper: "mccoy usa"
- Roseville Pottery — pottery — APPRECIATION — +8%/yr — sleeper: "roseville usa"
- Red Wing — pottery — APPRECIATION — +5%/yr
- Rookwood — pottery — APPRECIATION — +10%/yr
- Weller — pottery — APPRECIATION — +7%/yr
- Stangl — pottery — APPRECIATION — +4%/yr

**Clothing (HOLD to APPRECIATION)**
- Patagonia — clothing — HOLD — +1%/yr (fleeces especially)
- Carhartt (vintage) — clothing — APPRECIATION — +5%/yr — pre-2000 especially
- Levi's 501 (vintage) — clothing — APPRECIATION — +8%/yr — orange tab, big E
- Pendleton — clothing — HOLD — 0%/yr
- LL Bean (vintage) — clothing — SLOW_DEPRECIATION — -2%/yr
- Canada Goose — clothing — SLOW_DEPRECIATION — -8%/yr (but still holds vs standard)
- Barbour — clothing — SLOW_DEPRECIATION — -5%/yr

**China / Crystal (HOLD)**
- Waterford — crystal — HOLD — 0%/yr
- Wedgwood — china — SLOW_DEPRECIATION — -3%/yr
- Spode — china — SLOW_DEPRECIATION — -3%/yr
- Limoges — china — SLOW_DEPRECIATION — -2%/yr
- Royal Doulton — china — SLOW_DEPRECIATION — -3%/yr
- Lenox — china — SLOW_DEPRECIATION — -4%/yr
- Baccarat — crystal — HOLD — +1%/yr

**Tools (HOLD)**
- DeWalt — tools — HOLD — -5%/yr (much slower than generic)
- Milwaukee — tools — HOLD — -5%/yr
- Makita — tools — HOLD — -6%/yr
- Snap-on — tools — HOLD — -3%/yr (professional grade)
- Festool — tools — HOLD — -4%/yr

**Art / Collectibles**
- Hummel — figurines — APPRECIATION — +3%/yr — sleeper: "m.j. hummel", "goebel"
- Lladro — figurines — HOLD — 0%/yr
- Swarovski — crystal — SLOW_DEPRECIATION — -5%/yr
- Royal Copenhagen — ceramics — SLOW_DEPRECIATION — -3%/yr

**Vinyl**  
(Discogs handles vinyl — brand exceptions here are pressing-specific, not brand-level)

**Watches**
- Rolex — watches — APPRECIATION — +8%/yr — sleeper: "rolex", "oyster"
- Omega — watches — APPRECIATION — +5%/yr
- Longines — watches — HOLD — 0%/yr
- Seiko (vintage) — watches — APPRECIATION — +6%/yr — sleeper: "seiko 5", "seiko king"

### SleeperPattern (20 initial patterns)
```
griswold_cast_iron:     hints="griswold,erie pa,slant logo,block logo", range=$40-$400
wagner_cast_iron:       hints="wagner ware,sidney o,magnalite", range=$25-$200
pyrex_butterprint:      hints="butterprint,pyrex butterprint,amish", range=$50-$300
pyrex_gooseberry:       hints="gooseberry,pyrex gooseberry", range=$30-$200
pyrex_lucky_in_love:    hints="lucky in love,hearts pyrex", range=$100-$500
hull_pottery:           hints="hull usa,hull pottery,hull art", range=$20-$200
mccoy_pottery:          hints="mccoy usa,mccoy pottery,brush mccoy", range=$15-$150
roseville_pottery:      hints="roseville usa,rozane,roseville pottery", range=$30-$500
rookwood_pottery:       hints="rookwood,rp flame mark", range=$50-$1000
fiestaware_rare:        hints="fiesta,harlequin,riviera,fiestaware,original fiesta", range=$20-$300
eames_chair:            hints="eames,herman miller label,dax,rar chair,shell chair", range=$200-$2000
nakashima:              hints="nakashima,george nakashima", range=$500-$10000
vintage_levi:           hints="big e,orange tab,levi's,levis 501,type 1", range=$50-$500
tiffany_lamp:           hints="tiffany,tiffany studios,leaded glass lamp", range=$200-$50000
hummel_figurine:        hints="m.j. hummel,goebel,hummel", range=$20-$500
sterling_silver:        hints="sterling,925,sterling silver,hallmark", range=$30-$500
vintage_rolex:          hints="rolex,oyster,datejust,submariner,perpetual", range=$2000-$30000
depression_glass:       hints="depression glass,carnival glass,fenton,imperial glass", range=$10-$200
stickley_furniture:     hints="stickley,l&jg stickley,onondaga shops", range=$200-$5000
vintage_camera_leica:   hints="leica,leicaflex,elmarit,summicron,leitz wetzlar", range=$200-$5000
```

---

## Open Questions for Patrick

1. **ASIN resolution**: When an organizer uploads a photo and the AI identifies "KitchenAid stand mixer," should the system auto-search Amazon for the ASIN, or require the organizer to confirm the model? (affects Keepa integration depth)

2. **Sleeper confidence threshold**: When a sleeper pattern is detected, should we show the organizer the flag proactively ("this may be worth more — check here") or just quietly use the higher estimate? Recommend: show it.

3. **Cost ceiling for Phase 3**: B-Stock API is $500-2k/month. At what monthly revenue level should we flip that switch? Suggest: $5k MRR.

4. **Discogs for non-vinyl**: Discogs also has pricing for some collectibles. Should the Discogs adapter be limited to vinyl only, or expanded?

5. **Google Trends access**: Google Trends doesn't have an official public API — it requires a scraping approach (via `pytrends` or SerpAPI). Confirm this is acceptable before Phase 2 dispatch.

---

## Environment Variables Required (Railway)

```
KEEPA_API_KEY=         # keepa.com — sign up at keepa.com/api
APIFY_API_KEY=         # apify.com — existing if already using for EBTH
DISCOGS_TOKEN=         # discogs.com/settings/developers — free personal access token
# GSA Auctions API: no key required (public REST API)
# Salvation Army: no API (static table, seeded in DB)
```

---

## Rollback Plan

**Migration:** `20260425_add_pricing_engine`  
**Down migration:** DROP TABLE all 6 new tables (all empty at deploy time — safe)  
**Playbook:** "If deploy fails after migration, existing pricing path in cloudAIService.ts is unmodified until Task 1.13. Rolling back migration drops empty tables with no data loss."

New endpoint (`POST /api/pricing/estimate`) is additive — does not modify existing routes.  
Task 1.13 (wire into cloudAIService) is the only breaking change — if it causes issues, revert that single file.
