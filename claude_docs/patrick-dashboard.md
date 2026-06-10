# Patrick Dashboard — FindA.Sale

**Last updated:** S943 — 2026-06-10

---

## ⚠️ URGENT: Railway Backend is Crashed

The backend has been DOWN since the S941/S942 push (last successful deploy: 2026-06-10 ~19:05 UTC).

**Root cause:** 2 stray commas in `sourceRegistry.ts` created `undefined` holes in the scraper array → startup crash.

**Fix:** Run the push block below — it fixes the crash AND adds all S943 scraper work.

---

## Session S943 Summary

**Type:** DEV — Competitor research sweep (35+ sites) + Railway crash fix
**BQ at close:** 0 (ceiling=8 — DEV/QA mode available)

### What got built (S941+S942+S943 combined)
sourceRegistry now has **34 registered sources** (was 7 at S942 wrap). Backend TS: 0 errors.

**BUILT (active scrapers added this sprint):**
| Source | Category | Records | Schedule |
|--------|----------|---------|----------|
| FleaMarketZone.com | FLEA_MARKET | ~1,050 venues | Mon 6am GH Actions |
| PropertyRoom.com | AUCTION_HOUSE | ~46 agencies | Wed 7am GH Actions |
| StorageAuctions.com | AUCTION_HOUSE | ~3,103 records | Tue 7am GH Actions |
| PublicSurplus.com | AUCTION_HOUSE | ~6,330 auctions | Tue 8am GH Actions |
| BidSpotter.com | AUCTION_HOUSE | ~35 auction houses | Wed 10am GH Actions |
| Invaluable.com | AUCTION_HOUSE | 8,158 auction houses | Sun 7am GH Actions |
| AuctionZip.com | AUCTION_HOUSE | ~25,000 auctioneers | Existing GH Actions |

**PARKED (technical blockers — not legal):**
| Source | Reason |
|--------|--------|
| StorageTreasures | Next.js SPA + API hard-capped at 50/36,943 records |
| StorageAuctions.net | AngularJS SPA — unpark path: update.storageauctions.net REST API |
| Bid13 | Drupal AJAX + Socket.io + evercookie bot fingerprinting |
| StorageBattles | StorageTreasures white-label alias (same constraints) |
| StorageUnitAuctionList | Paid paywall + Cloudflare |
| Handbid | Wrong category (nonprofits/charities, not secondary sale organizers) |
| NFMAMembers | Wix JS-rendered |
| SellMyAntiques | Next.js SPA |
| AmericanFleaMarkets / FleaMarket.com / FleaMarketRover / VendorsByState | Dead domains |
| FleaMarketDirectory | Redirects to unrelated classifieds site |
| FleaMarketsNet / IBidNow | GoDaddy Afternic parked/for-sale |

**PROHIBITED (legal blocks — do not attempt):**
| Source | Prohibition |
|--------|-------------|
| LockerFox | ToS §1.4.2 + §1.4.6: explicit robot/spider ban + commercial data harvesting ban |
| GovPlanet (IronPlanet/Ritchie Bros.) | ToS §1.3(c): explicit scraper/data-collection ban |
| GovernmentLiquidation (Liquidity Services) | Same explicit ban as GovDeals + Cloudflare blocks |
| Proxibid (ATG) | UUA §10(h)/§11.1(v)/§12: explicit scraping prohibited |
| Municibid | ToS §(c): explicit ban on automated access + scraping |
| YardSaleSearch | Explicit anti-scraping clause |

---

## Patrick Actions Needed

### 1. ⚠️ P0 Push Block — fixes Railway crash (run NOW in PowerShell from FindaSale root)

```
git add packages/backend/src/services/scraper/sourceRegistry.ts
git add packages/backend/src/services/scraper/sources/americanFleaMarketsScraper.ts
git add packages/backend/src/services/scraper/sources/bid13Scraper.ts
git add packages/backend/src/services/scraper/sources/bidSpotterScraper.ts
git add packages/backend/src/services/scraper/sources/fleaMarketComScraper.ts
git add packages/backend/src/services/scraper/sources/fleaMarketDirectoryScraper.ts
git add packages/backend/src/services/scraper/sources/fleaMarketRoverScraper.ts
git add packages/backend/src/services/scraper/sources/fleaMarketsNetScraper.ts
git add packages/backend/src/services/scraper/sources/govPlanetScraper.ts
git add packages/backend/src/services/scraper/sources/governmentLiquidationScraper.ts
git add packages/backend/src/services/scraper/sources/handbidScraper.ts
git add packages/backend/src/services/scraper/sources/ibidNowScraper.ts
git add packages/backend/src/services/scraper/sources/invaluableAuctionHouseScraper.ts
git add packages/backend/src/services/scraper/sources/lockerFoxScraper.ts
git add packages/backend/src/services/scraper/sources/nfmaMembersScraper.ts
git add packages/backend/src/services/scraper/sources/proxibidScraper.ts
git add packages/backend/src/services/scraper/sources/sellMyAntiquesScraper.ts
git add packages/backend/src/services/scraper/sources/storageBattlesScraper.ts
git add packages/backend/src/services/scraper/sources/storageUnitAuctionListScraper.ts
git add packages/backend/src/services/scraper/sources/vendorsByStateScraper.ts
git add .github/workflows/scrape-bidspotter.yml
git add .github/workflows/scrape-invaluable.yml
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(scraper): remove 2 stray commas in SOURCE_REGISTRY (Railway crash); feat: BidSpotter+Invaluable+AuctionZip BUILT; 16 PARKED + 5 PROHIBITED scrapers registered; docs: S943 wrap"
.\push.ps1
```

### 2. Searlo credit upgrade (optional)
FB Events running at 17% 429 fallback on free tier (10/min cap). Buy a $3.99+ pack at searlo.co → lifts cap → bump `SEARLO_RPM` GitHub repo Variable to 25+.

---

## Project Status

**Scraper fleet:** 7 active sources building the directory (FleaMarketZone, PropertyRoom, StorageAuctions.com, PublicSurplus, BidSpotter, Invaluable, AuctionZip). 16 parked (technical blockers). 5 prohibited (ToS).

**Backend:** CRASHED — awaiting push block above to restore.

**Chrome QA backlog:** #422 OAuth 409 bridge (UNVERIFIED), #470 GA4 other 3 events (CODE-ONLY), #75 tier lapse P2 (UNVERIFIED), SEO3 Denver Human QA.

**BQ:** 0 items. DEV/QA mode available.
