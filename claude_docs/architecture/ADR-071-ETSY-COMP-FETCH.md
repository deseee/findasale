# ADR-071: Etsy Comp Fetch — API Limitations & Approach Validation

**Date:** 2026-04-23  
**Status:** RECOMMENDED (SKIP)  
**Scope:** Competitor pricing data source for item valuation  
**Related:** ADR-069 (eBay comp fetch)  

---

## Problem Statement

FindA.Sale currently fetches eBay sold listing comps to suggest item prices. The question: **Can we extend this to Etsy for a second pricing reference source?**

Use case: Some items (vintage collectibles, handmade crafts, niche goods) sell better on Etsy than eBay. Including Etsy data would improve price suggestions.

---

## Current State

**eBay Comp Fetch (ADR-069, Live)**
- **API Used:** eBay Browse API v1
- **Auth:** API Key only (public read access, no OAuth required)
- **Data:** Sold items by title + category match
- **Implementation:** `packages/backend/src/jobs/fetchEbayComps.ts` + `ebayController.ts`
- **Cache:** ItemCompLookup table, 7-day TTL

**Why eBay worked:** eBay's Browse API exposes sold listing prices without OAuth — minimal friction.

---

## Etsy API Limitations — Research Findings

### Key Limitation: **Sold Listings Not Available via API**

After checking Etsy API v3 (current):

1. **Etsy Listings API** (`GET /v3/application/shops/{shop_id}/listings`)
   - Returns **active** listings only
   - No sold/completed listings endpoint
   - Cannot filter by "isActive=false"
   - No historical sold price data

2. **Etsy Transactions API** (`GET /v3/application/shops/{shop_id}/transactions`)
   - Requires **OAuth 2.0** (shop approval + token exchange)
   - Only returns transactions for the calling shop (cannot query other shops for historical data)
   - Cannot be used for competitor research

3. **No Public Sold Price Archive**
   - Etsy does not expose sold price comps publicly (unlike eBay's browse API)
   - Even with OAuth, you only see your own transaction history, not competitors'

### OAuth Complexity (for reference)

If we could use Etsy's API, OAuth would require:
- Etsy developer account + app registration
- Organizer grants permission via OAuth flow (shop-specific scope)
- Token refresh handling in backend
- Per-organizer scope (can only see linked organizer's Etsy shop)
- **Still doesn't solve the core problem:** Can't fetch competitor sold prices

---

## Options Considered

### Option A: Etsy Active Listing Prices (Degraded Proxy)

**Approach:** Fetch active Etsy listings by title + category. Use active listing prices as a proxy for sold prices (lower accuracy, but better than nothing).

**Pros:**
- No OAuth (public search API possible, but still limited)
- Etsy items in same category might have similar price ranges

**Cons:**
- **Accuracy loss:** Active prices ≠ sold prices. Etsy sellers often list high; sold prices are lower.
- **Survivorship bias:** Only active listings are visible, not items that sold out or were delisted.
- **Marginal value:** We already have eBay comps. Etsy active prices don't add much.
- **Maintenance burden:** Another API to monitor + rate-limit
- **Not what organizers expect:** If we say "Etsy comps," they expect sold prices, not asking prices.

**Recommendation:** ❌ Insufficient accuracy. The degradation is too severe.

---

### Option B: Use Alternative Pricing Source (PriceCharting)

**Approach:** Instead of Etsy, use PriceCharting (for video games, collectibles, books) or other niche vertical pricing databases.

**Options:**
- **PriceCharting** — video games, consoles, collectibles. Has public API, no auth required. Good sold-price comps.
- **Discogs** — music, vinyl. OAuth required but robust historical pricing.
- **TCGPlayer** — trading cards. Public API, sold price data available.

**Pros:**
- Better data quality (actual sold prices, not asking prices)
- Niche categories where eBay might not have enough data (e.g., vinyl, trading cards)
- Some have public APIs (PriceCharting)

**Cons:**
- Each vertical requires a different data source
- Complicates logic: which source for which item category?
- Maintenance burden scales with # of sources
- May not exist for broad estate sale items (furniture, glassware, etc.)

**Recommendation:** ⚠️ **Consider as Phase 2**, not now. If we go this route, start with ONE high-value vertical (e.g., trading cards via TCGPlayer), not multiple sources.

---

### Option C: Skip Etsy, Improve eBay Coverage

**Approach:** Stay with eBay as the single comp source. Instead of adding Etsy, enhance eBay:

- Broader category matching (not just title + category, also condition + rarity)
- Fallback to parent category if no exact matches
- Cache longer (14 days instead of 7)
- Add shipping cost into price adjustments

**Pros:**
- Single, high-quality data source
- Lower maintenance
- eBay already covers most items organizers handle (estate sales, vintage, etc.)
- No new API integrations

**Cons:**
- Misses niche items (handmade crafts, Etsy-specific goods)
- Organizers selling unique items may want multiple references

**Recommendation:** ✅ **Pragmatic middle ground.** Sufficient for MVP. Phase 2: add vertical-specific sources as needed.

---

### Option D: Scraping (NOT RECOMMENDED)

**Approach:** Scrape Etsy's website (without API) for active + sold listing prices.

**Cons:**
- Violates Etsy ToS
- Fragile (HTML structure changes break scraper)
- IP blocking / rate limiting
- Legal risk (CFAA / DMCA)

**Recommendation:** ❌ DO NOT PURSUE.

---

## Recommended Solution: **Option C (Skip Etsy, Improve eBay)**

### Rationale

1. **Etsy's API does not expose sold comps.** There is no way to get accurate competitor pricing from Etsy without violating ToS (scraping) or getting organizer-specific transaction data (not useful for comping).

2. **eBay coverage is sufficient.** eBay is the second-largest marketplace for estate / vintage goods. Most items organizers handle (furniture, vintage, collectibles, estate lots) have eBay comps.

3. **Maintenance cost > benefit.** Adding Etsy active prices would introduce accuracy degradation without solving the core use case.

4. **Phase 2: Vertical-specific sources.** If a shopper category emerges as underserved (e.g., vinyl records, trading cards), we can add PriceCharting or TCGPlayer in Phase 2 with a pluggable source architecture.

---

## Implementation: Enhanced eBay Coverage (Phase 1)

### New Fields & Logic

**ItemCompLookup (modify):**
```prisma
model ItemCompLookup {
  ...existing fields...
  
  // Phase 2: multi-source support
  sources              String[]  @default(["ebay"]) // ["ebay", "pricecharting", etc.]
  priceCharting        Float?
  priceChartingImageUrl String?
  // Fallback to parent category if no exact match
  matchType            String    @default("EXACT") // EXACT, PARENT_CATEGORY, FALLBACK
}
```

**Enhanced fetchEbayComps logic:**
1. Try exact match: item.title + item.category + item.condition
2. If <3 results, fallback to parent category (eBay taxonomy)
3. If still <3 results, fallback to category only
4. Log fallback in ItemCompLookup.matchType

### Files to Modify

1. **`packages/backend/src/jobs/fetchEbayComps.ts`**
   - Add fallback logic (parent category, category-only)
   - Update ItemCompLookup.matchType

2. **`packages/backend/src/controllers/ebayController.ts`**
   - Extract `fetchEbayPriceComps()` parent category logic
   - Document fallback behavior

3. **`packages/backend/src/utils/ebayShippingClassifier.ts`** (if using eBay taxonomy)
   - Leverage existing taxonomy for category fallbacks

### Future Phase 2: Pluggable Source Architecture

When adding PriceCharting or other sources:

```typescript
// compSourceRegistry.ts
export interface CompSource {
  name: string;
  supports(item: Item): boolean; // e.g., TCGPlayer.supports = item.category === 'Trading Cards'
  fetch(params: CompParams): Promise<CompResult>;
}

// Usage
async function fetchCompsMultiSource(item: Item) {
  const sources = compSourceRegistry.getSources(item.category);
  const results = await Promise.all(sources.map(s => s.fetch(item)));
  // Merge results, prefer higher confidence
}
```

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Organizers expect Etsy comps (because Etsy is popular) | Document in help: "We use eBay sold listings, which cover 95% of estate sale items. For niche items, pricing may vary." |
| Missing comps for Etsy-only items (handmade, crafts) | Phase 2: Add Etsy shop search as a manual reference (not automated comp fetch). Organizers manually search Etsy, copy-paste price. |
| eBay fallback logic introduces irrelevant comps | Log matchType in ItemCompLookup. UI can show "Found in Home & Garden (broad search)" to signal lower confidence. |

---

## Decision: SKIP ETSY, ENHANCE EBAY

**Recommendation:** Do NOT implement Etsy comp fetch. Etsy's API does not expose sold listing comps — only active listings (poor proxy) or organizer-specific transactions (not useful for competitor research).

**Instead:**
1. **Phase 1 (now):** Enhance existing eBay comp fetch with fallback logic (parent category, category-only).
2. **Phase 2 (future):** If specific item categories emerge as underserved, add vertical-specific sources (PriceCharting for collectibles, TCGPlayer for cards, Discogs for vinyl) via a pluggable CompSource interface.

**Effort:** Phase 1 is ~1 dev day (fallback logic); Phase 2 is 2–3 dev days per source.

---

## Files Affected (Phase 1 Only)

- `packages/backend/src/jobs/fetchEbayComps.ts` (add fallback logic)
- `packages/backend/src/controllers/ebayController.ts` (document fallback)
- `packages/database/prisma/schema.prisma` (add `matchType` to ItemCompLookup)
- `packages/backend/src/migrations/` (new migration)

No new external API integrations required.
