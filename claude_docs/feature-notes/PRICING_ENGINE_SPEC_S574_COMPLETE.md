# Multi-Source Pricing Engine — Complete Specification Package

**Status:** ✅ ARCHITECTURE COMPLETE — Ready for findasale-dev dispatch  
**Date:** 2026-04-25  
**Session:** S573  
**Target Implementation:** S574–S577  

---

## Package Contents

This specification package contains a complete, production-ready design for FindA.Sale's multi-source pricing engine. The following documents were created during this session:

### 1. Architecture Specification (Full)
**Document:** pricing-engine-architecture.md  
**Size:** ~1,500 lines  
**Contains:**
- Executive summary & problem statement
- Complete architecture overview with diagrams
- Data model: 6 new Prisma models + ItemCompLookup extensions
  - PricingSourceConfig (18 seed entries)
  - BrandExceptionEntry (65 brands)
  - SleeperPattern (AI-detected collectibles)
  - PricingSourceCompsCache (24-hour TTL)
  - TrendSignalCache (7-day TTL)
  - CategoryDepreciation (9 category curves)
- Service architecture: file structure, types, orchestrator
- Weighting model: detailed step-by-step formulas
- Signal layer: trends, brand exception, sleeper detection
- All source adapters (10+ sources, Tier 1-3)
- API contract: POST /api/pricing/estimate, GET /api/pricing/sources
- Complete migration file (ready to deploy)
- Brand exception seed data (65 entries)
- 3 implementation phases with deliverables
- 8 open questions for architect review
- Success metrics (coverage, accuracy, confidence distribution)

### 2. Developer Handoff (Dispatch Document)
**Document:** pricing-engine-architect-handoff.md  
**Size:** ~1,000 lines  
**Contains:**
- Quick summary for findasale-dev
- Acceptance criteria (Phase 1, 2, 3)
- 10 locked design decisions
- Phase 1 tasks (Tasks 1.1–1.12, each with):
  - What to build
  - Files to create/modify
  - Acceptance criteria
  - Implementation blockers
  - Dependencies
- Detailed task breakdown:
  - 1.1: Schema migration
  - 1.2: Core orchestrator (pricingEngine.ts)
  - 1.3: Adapter registry + factory
  - 1.4: PriceCharting adapter (enhance)
  - 1.5: eBay adapter (enhance)
  - 1.6: EBTH adapter (new — priority)
  - 1.7: Keepa adapter (new)
  - 1.8: Discogs adapter (new)
  - 1.9: GSA Auctions adapter (new)
  - 1.10: Salvation Army adapter (tier 3 floor)
  - 1.11: API endpoint
  - 1.12: Tests + TypeScript verification
- Phase 1 completion checklist
- Phase 2 & 3 summaries
- Environment variables required
- Known constraints & decisions
- Questions for dev team
- Success definition (end-of-phase)

### 3. Brand Exception Seed Data
**Document:** pricing-engine-brand-seeds.md  
**Size:** ~400 lines  
**Contains:**
- 65 brand + pattern entries organized by category:
  - Furniture (14 brands): Herman Miller, Eames, Knoll, etc.
  - Cookware & Kitchen (12): Le Creuset, All-Clad, Vitamix, etc.
  - Cast Iron (8): Griswold, Wagner, Lodge, etc.
  - Glassware (10): Pyrex, Fiestaware, Depression Glass, etc.
  - Clothing (8): Levi's, Patagonia, Carhartt, etc.
  - Sneakers (7): Nike Air Jordan, Nike Dunk, Adidas Yeezy, etc.
  - Pottery & China (9): McCoy, Roseville, Wedgwood, etc.
  - Tools (8): DeWalt, Milwaukee, Makita, etc.
  - Vinyl Records (5): Beatles, Pink Floyd, Rolling Stones, etc.
  - Art & Décor (5)
  - Electronics (3): Sony, Bang & Olufsen, etc.
- For each entry: appreciation mode, notes, pattern detection info, multipliers
- Seeding instructions (SQL + TypeScript)
- Usage examples
- Maintenance guidance

### 4. Quick Reference Guide
**Document:** pricing-engine-README.md  
**Size:** ~400 lines  
**Contains:**
- Problem statement & solution overview
- Links to all 4 documents
- Key locked decisions (table format)
- Data model summary
- Source adapters overview (Tier 1, 2, 3, signals)
- API contract (MVP)
- Weighting model summary
- Implementation timeline
- Success metrics
- Environment variables
- Known gaps & future work
- Testing checklist
- Dispatch instructions (for Patrick & findasale-dev)
- Support & questions reference

---

## Design Highlights

### Architecture
- **Tier Cascade:** Tier 1 (high confidence) → Tier 2 (good proxy) → Tier 3 (floor)
- **Sources:** 10+ enabled at launch (PriceCharting, eBay, EBTH, Keepa, Discogs, GSA, Salvation Army, Goodwill, Google Trends, eBay Momentum, Brand Exception, Sleeper Detection)
- **Weighting:** Base weight → asking adjustment → recency decay → sample size boost → trend multiplier
- **Caching:** 24-hour TTL for comps, 7-day TTL for signals

### Data Model
- **6 new Prisma models** (PricingSourceConfig, BrandExceptionEntry, SleeperPattern, PricingSourceCompsCache, TrendSignalCache, CategoryDepreciation)
- **ItemCompLookup extended** with 13 new fields (estimatedPrice, priceConfidence, tierUsed, sourcesConsulted, flags)
- **Migration file included** (production-ready SQL)
- **Seed data included** (18 sources, 65 brands, 9 depreciation curves)

### Weighting Model
```
Final Price = weightedMedian(prices, weights)
where weight = base × askingAdj × recencyDecay × sampleSizeBoost × trendMultiplier
```
- **Recency decay:** e^(-λt); λ varies by category (0.03/day, 0.1/day, 0.01/day)
- **Asking adjustment:** 0.6x for asking prices (15-20% historical spread)
- **Sample size boost:** log(n+1) / log(10+1)
- **Trend multiplier:** 1.1–1.3x if trending

### Signal Detection
1. **Google Trends:** +1.1–1.3x multiplier if uptrending
2. **eBay Momentum:** 7/30/90-day moving averages; flag acceleration
3. **Brand Exception:** 65 curated brands that appreciate/hold/slow-depreciate
4. **Sleeper Detection:** AI from photos; detect Griswold markings, Pyrex patterns, rare Levi's tags

### API Contract
```
POST /api/pricing/estimate
{
  title, category, condition, brand, photoUrls, saleDate
}
→
{
  estimatedPrice, priceRange, confidence, tier,
  sourcesConsulted, flags, compsFound, dataFreshness
}
```

---

## Implementation Phases

### Phase 1 (S574–S575): Core + Tier 1 Sources
**Effort:** 80–120 hours  
**Deliverables:** Orchestrator, 6 Tier-1 adapters, API endpoint, tests

**Tasks:**
- Schema migration + seed data
- Core orchestrator (pricingEngine.ts)
- Weighting & depreciation modules
- Adapter registry + factory
- 6 adapters: PriceCharting, eBay, EBTH, Keepa, Discogs, GSA
- POST /api/pricing/estimate endpoint
- Unit tests + TypeScript verification

**Success:** New items priced via 3+ Tier-1 sources; 80%+ coverage.

### Phase 2 (S576): Signals
**Effort:** 40–60 hours  
**Deliverables:** Trends, brand exception, sleeper detection, crons

**Tasks:**
- Extend cloudAIService for sleeper pattern detection
- Google Trends integration
- eBay momentum calculation
- Brand Exception DB application
- Signal layer finalization
- Daily trend refresh cron
- Weekly sleeper detection batch

**Success:** Trending items get multiplier; sleepers detected with accuracy.

### Phase 3 (S577+): Tier 2/3 + UI
**Effort:** 60–80 hours  
**Deliverables:** Remaining adapters, admin toggle panel, cost tracking

**Tasks:**
- MaxSold, HiBid, B-Stock, WorthPoint, StorageTreasures, OfferUp adapters
- Organizer dashboard: source toggle
- Admin panel: cost tracking + quota management
- Optional: StockX for sneakers

**Success:** All sources plugged in; full feature-flag control.

---

## Key Decisions (Locked)

| Decision | Why | What Devs Must Do |
|----------|-----|-------------------|
| Tier cascade (1→2→3) | Prioritize high confidence | Never skip tiers or reorder |
| Weighted median | Outliers kill comps | Implement percentile-based calc |
| Asking = 0.6x | Historical 15-20% spread | Auto-adjust all asking sources |
| Recency decay e^(-λt) | Real-world price changes | Use λ=0.03/0.1/0.01 by category |
| Brand exception = skip depreciation | Premium brands appreciate | Lookup BrandExceptionEntry before curve |
| Never modify organizer price | D-005 rule | Only update aiSuggestedPrice if price null |
| Feature flags for all sources | Pay-later sources | Every source in PricingSourceConfig |
| Prisma = source of truth | Single source | No hard-coded source lists |

---

## Environment Variables Required

```
# Existing (already in Railway)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
GOOGLE_VISION_API_KEY=...
ANTHROPIC_API_KEY=...

# NEW for Phase 1
KEEPA_API_KEY=...             # Keepa.com account
APIFY_API_KEY=...             # Apify.com account
GSA_API_KEY=...               # GSA auctions API key
```

All keys are in Railway dashboard (or to be added before dispatch).

---

## Next Steps

### For Patrick (Now)
1. Review this summary document
2. Approve architecture (async OK; email OK)
3. Provision environment variables in Railway
4. Schedule dev dispatch for S574

### For findasale-dev (At Dispatch)
1. Read pricing-engine-architect-handoff.md (dispatch doc)
2. Read pricing-engine-architecture.md (full spec) for details
3. Start Task 1.1 (schema migration)
4. Follow dependency chain through Task 1.12
5. Use pricing-engine-brand-seeds.md for seed data

### For Architect (Post-Spec)
- ✅ Specification complete
- ✅ All documents created
- ⏳ Awaiting Patrick approval
- ⏳ Awaiting env var provisioning
- ⏳ Ready for dispatch when green-lit

---

## Success Definition

**Phase 1 Complete (End of S575):**
- ✅ 80%+ of items receive HIGH/MEDIUM estimate
- ✅ 3+ sources consulted on average (vs. 1.2 today)
- ✅ POST /api/pricing/estimate returns correctly formatted result
- ✅ EBTH returns 3+ estate furniture comps for test items
- ✅ Zero TypeScript errors
- ✅ No schema migration reverts

**Phase 2 Complete (End of S576):**
- ✅ Trending categories get +1.2x multiplier
- ✅ Sleeper items (Griswold, Pyrex) auto-detected with 1.5x multiplier
- ✅ Brand exception DB applied (50+ brands)

**Phase 3 Complete (End of S577+):**
- ✅ All sources plugged in
- ✅ Organizer can toggle sources on/off
- ✅ Admin cost tracking visible
- ✅ 80%+ coverage maintained; 2.5+ sources/item

---

## Questions for Patrick

1. **Apify EBTH actor:** Use off-the-shelf Apify marketplace actor, or build custom scraper? (Recommend marketplace first)
2. **ASIN resolution:** For Keepa, if no UPC: use Google Custom Search API to find Amazon ASIN? (Yes/No)
3. **Sleeper confidence:** Auto-apply sleeper multiplier if AI confidence > 0.85, or require organizer confirmation? (Recommend auto)
4. **Cost ceiling:** What's the monthly budget for paid sources (eBay, B-Stock, WorthPoint)? (Informs Phase 3 scope)
5. **Depreciation tuning:** After Phase 1, run A/B test to measure override deltas vs. estimates? (Recommend yes, Phase 2)

---

## Open Questions for Architect Review

(See pricing-engine-architecture.md § "Open Questions for Architect Review")

---

## Reference Documents

- **Full Specification:** pricing-engine-architecture.md
- **Developer Handoff:** pricing-engine-architect-handoff.md
- **Brand Seeds:** pricing-engine-brand-seeds.md
- **Quick Reference:** pricing-engine-README.md

---

## Sign-Off

**Architect:** Ready to dispatch to findasale-dev  
**Date:** 2026-04-25  
**Status:** ✅ COMPLETE — Awaiting Patrick approval + env var provisioning

---

*This document summarizes the complete multi-source pricing engine specification. All detailed design is contained in the linked documents above.*

