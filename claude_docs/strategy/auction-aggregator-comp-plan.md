# Auction-House Aggregator Sold-Comp Plan

**Created:** 2026-04-24 (S572)
**Owner:** Patrick + Architect + Dev
**Status:** Phase 1 (Discovery) queued — see roadmap #343–#347

## Why this exists

FindA.Sale's eBay comp source (Browse API) returns **asking prices**, not sold prices — roadmap #337. This is a P0 trust issue: organizers price against asking-price comps that may never have sold. eBay Marketplace Insights API (the sanctioned sold-comp endpoint) requires application/approval and can take weeks-to-months. This plan stands up an alternative sold-comp pipeline using auction-house aggregators while the Marketplace Insights application is pending — and may end up being a permanent secondary source even after Marketplace Insights is approved.

## Why auction aggregators specifically

FindA.Sale's organizers list estate-sale, yard-sale, auction, flea-market, and consignment items. Auction-house aggregators (LiveAuctioneers, Invaluable, HiBid) cover this exact inventory mix far better than eBay alone. LiveAuctioneers in particular has 29M+ sold lots from 1999 to present with daily updates across vintage, antiques, jewelry, furniture, mid-century, costume jewelry, glassware — the FindA.Sale inventory profile.

## Platform evaluation summary

| Platform | Sanctioned access | Inventory match | Scrape risk | Coverage size | Recommendation |
|---|---|---|---|---|---|
| **LiveAuctioneers** (ATG-owned) | Internal API (partnership-gated) | Excellent | Medium | 29M+ lots | **Primary target** |
| **HiBid** (Sandhills Global) | Partner integration via AuctionFlex only | Moderate (regional) | High | Hundreds/week | Secondary pilot if ATG stalls |
| **Invaluable** | Catalog Upload API for partners only | Poor (luxury/fine art) | Medium-High | Undisclosed | Skip — wrong inventory mix |

**Verdict:** LiveAuctioneers via Auction Technology Group partnership is the best target. ATG also owns EstateSales.NET (existing partnership-friendly counterparty in this space). Invaluable skews fine-art and is a poor inventory match. HiBid has explicit anti-scraping TOS and unknown enforcement posture — pilot only if ATG stalls.

## TOS posture (verbatim quotes)

**LiveAuctioneers:** "The use of any robot, spider, scraper, or other automated means to access the sites without express written permission is prohibited."

**HiBid:** "Users are forbidden from conducting web scraping, web harvesting, web data extraction, or any other data scraping of Auction Information or their Sites or Services, or using any robot, spider, scraper, data mining tool, data gathering tools, data extraction tools, or any other automated means to access their Sites and Services."

**Invaluable:** "The use of robots or other automated means to access the Invaluable site without the express permission of Invaluable is strictly prohibited." (robots.txt also disallows search routes; crawl-delay: 10 seconds)

All three explicitly prohibit scraping. None has known enforcement history specific to their platform, but the auction industry has litigated data theft (Heritage v. Christie's/Collectrium 2019, $150K per copyright violation sought). Patrick is risk-averse — sanctioned access is the right primary path.

## Phased plan

### Phase 1 — Discovery (Weeks 1–2)

**Goal:** Establish sanctioned access path or confirm scraping is the only option. Patrick action + Architect + Dev support.

Deliverables:
1. **ATG partnership inquiry.** Email Auction Technology Group's partnerships team requesting B2B data licensing. Ask: pricing tiers, data freshness, geographic/category filters, rate limits. Cite EstateSales.NET as partnership precedent. Save thread to `claude_docs/partnerships/atg-inquiry.md`.
2. **Legal review memo.** Architect/Hacker collaboration. CFAA risk on managed-scraping path (public data, no auth, residential proxies). TOS compliance assessment. Save to `claude_docs/legal/scraping-risk-opinion.md`.
3. **Apify sample test.** Run Apify LiveAuctioneers Scraper actor on 100 representative items (kitchen glassware, costume jewelry, mid-century furniture, vintage Pyrex, books). Map returned prices to FindA.Sale categories. Save sample CSV. Purely diagnostic — no production use.
4. **HiBid contact** (parallel, lower priority). Sandhills Global partnerships team.

Decision gate at end of Phase 1:
- ATG responds with pricing < $2K/mo → Phase 2a (sanctioned)
- ATG stalls or quotes > $5K/mo → Phase 2b (managed scraping pilot, with legal sign-off)
- Legal nixes scraping → wait for Marketplace Insights or restart with different aggregator

### Phase 2a — Sanctioned ATG Integration (~4 weeks, if Phase 1 succeeds)

**Goal:** Ingest LiveAuctioneers sold-comp data via official partner feed.

Deliverables:
1. API credential provisioning + sandbox testing.
2. Backend ingestion worker — Node.js, hourly/daily polling, parse → `PriceBenchmark` table (existing schema). Idempotency via external ID.
3. Data mapper — rule engine mapping ATG categories/keywords to FindA.Sale item types. Confidence threshold (~0.8) on item-description match before ingestion.
4. Caching layer — Redis 24h TTL on per-item comp lookups.
5. QA — 500-item validation pass. Coverage and price reasonableness checks.

Files affected: `packages/backend/src/services/benchmarkService.ts`, `packages/backend/src/workers/compIngestionWorker.ts` (new), `packages/backend/src/config/datasources.ts`, possibly `packages/database/prisma/schema.prisma` (add ATG-source fields if needed).

Success criteria: 80%+ of tested items have ≥1 valid comp; prices within 15% of organizer estimates.

### Phase 2b — Managed Scraping Pilot (~3 weeks, fallback)

**Goal:** Validate Apify-based ingestion if ATG partnership stalls.

Deliverables:
1. Apify account + LiveAuctioneers Scraper actor configuration. Daily runs. 5+ second crawl delays. Residential proxies (Apify default).
2. Data pipeline — Apify webhook → FindA.Sale ingestion endpoint → `PriceBenchmark`.
3. HiBid pilot in parallel on regional household-goods subset. Compare coverage vs LiveAuctioneers.
4. Compliance log — `claude_docs/legal/scraping-compliance-log.md`. Document non-commercial intent, rate-limit posture, response template for any C&D.
5. Mark all data as "pilot only, not for resale or third-party licensing."

Legal gate: Patrick + Architect sign-off before go-live. If legal opinion is risky, Apify data is "training only" and not exposed to organizers in production UI.

### Phase 3 — Production Integration (~6–8 weeks after Phase 2)

**Goal:** Blend comp sources into `valuationService` and surface to organizers.

Deliverables:
1. Multi-source blending in `valuationService.ts`. Weights (initial): eBay sold (when available) 40%, ATG/HiBid 40%, PriceCharting 20% for collectibles. Graceful handling when sources are missing.
2. Schema additions to `ItemCompLookup`: `sourceName`, `fetchedAt` for transparency/audit.
3. UI — organizer inventory: "estimated value" badge with confidence (HIGH/MEDIUM/LOW). Item detail: top 3 comps with source attribution ("Sold on LiveAuctioneers, March 2025, $45"). This unblocks roadmap #338 (Surface Sold-Price Comps in Edit-Item UI).
4. Performance — Redis cache 24h TTL, daily batch refresh of stale comps, indices on `itemCategory`/`createdAt`.
5. Monitoring — comp hit-rate by item type, organizer override rate (signals low-confidence sources), source-failure alerts.

Files: `packages/backend/src/services/valuationService.ts`, `packages/database/prisma/schema.prisma`, frontend item-detail components, `packages/backend/src/workers/compRefreshWorker.ts`, monitoring/metrics module.

Success criteria: 85%+ of organizer items have ≥1 comp; honest confidence scores; positive organizer feedback (10+ user survey).

### Phase 4 — Scale & Maintenance (Ongoing)

Monitoring dashboard. Fallback logic for source outages. Future expansions (Etsy public API, possibly Facebook Marketplace if scraping legally tolerable). Annual TOS review. Multi-year contract negotiation with ATG once partnership proves out.

## Cost estimates

**Sanctioned ATG path (Phase 2a primary):** $500–2K/mo licensing (estimated), $8–12K one-time integration dev, $1–2K/mo ongoing maintenance. **Year 1: $10–38K.**

**Apify managed scraping (Phase 2b interim or fallback):** $199–500/mo Apify Scale tier, $6–8K one-time integration dev, $500–1K/mo maintenance. **Year 1: $10–24K.** Replaceable when Phase 2a lands.

**Blended recommended scenario:** Year 1 $15–30K; Year 2+ $24–60K depending on tier and scale.

## Risk callouts

1. **Legal escalation.** ATG/Sandhills could escalate from TOS warning to C&D or CFAA if scraping is detected at volume. Mitigation: pursue partnership first, treat scraping as interim, residential proxies + low rate, audit logs current, prepared to stop within 48 hours.
2. **Coverage gaps by item type.** Auction aggregators are auction-biased; low-value yard-sale items ($5–$50 household goods) may have sparse comps. Mitigation: sample analysis in Phase 1; blend Etsy public API in later phase; honest "we're still learning" UI for low-coverage types.
3. **Data freshness.** Auction cycles are 2–8 weeks; estate organizers want recent comps. Mitigation: prioritize fresher results in blend logic; surface `soldAt` timestamp; monitor organizer "outdated" feedback.
4. **Sector consolidation.** ATG acquired LiveAuctioneers 2021. Auctionata bankruptcy. M&A could change terms. Mitigation: diversify sources early; quarterly investor-news monitoring; multi-year contract terms when partnership lands.
5. **Anti-bot evolution.** Aggregators invest in defenses. Apify actors break on site changes. Mitigation: prefer managed services over custom scrapers; weight partnership path higher in legal memo.

## Immediate next steps

1. Patrick drafts ATG partnership email (24–48 hours). Marketing agent can spin a draft if needed.
2. Architect + Hacker schedule legal review session (1 hour) to draft the scraping-risk opinion.
3. Reserve Apify account for Phase 2b contingency.
4. Run 100-item Apify diagnostic test on representative items to anchor coverage analysis.

## Cross-references

- **Roadmap entries:** #343 (Phase 1), #344 (Phase 2a), #345 (Phase 2b), #346 (Phase 3 blend), #347 (Phase 4 ongoing)
- **Related roadmap items:** #337 (eBay asking-price audit, P0), #338 (Surface comps in UI — unblocks at Phase 3), #320 (Async eBay Comp Fetch), #323 (PriceBenchmark Valuation Fallback)
- **Locked rules:** D-005 (organizer-set values win over AI), D-006 (no AI in user-facing copy)
