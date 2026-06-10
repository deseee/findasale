# Patrick Dashboard — FindA.Sale

**Last updated:** S942 — 2026-06-10

---

## Session S942 Summary

**Type:** DEV — Scraper fleet expansion  
**BQ at close:** 0 (ceiling=8 — DEV mode available)

### What got built
Investigated 7 new scraper candidates across 2 sessions (S941 continuation + S942). Fleet now has 7 registered sources.

**BUILT (3 new active scrapers):**
| Source | Category | Records | Schedule | Notes |
|--------|----------|---------|----------|-------|
| FleaMarketZone.com | FLEA_MARKET | ~1,050 venues | Mon 6am | WordPress WPBDP, static HTML |
| PropertyRoom.com | AUCTION_HOUSE | ~46 agencies | Wed 7am | Law enforcement/gov't partners page |
| StorageAuctions.com | AUCTION_HOUSE | ~3,103 records | Tue 7am | Public JSON API (no headless needed) |
| PublicSurplus.com | AUCTION_HOUSE | ~6,330 auctions | Tue 8am | Gov't surplus, server-rendered + Ajax XML |

**PARKED (2 sources — technical blockers, not legal):**
| Source | Reason | Unpark Path |
|--------|--------|-------------|
| StorageTreasures.com | Next.js SPA + API hard-capped at 50/36,943 records | Cognito JWT auth, Playwright, or API partnership |
| StorageAuctions.net | AngularJS SPA, no static data | Playwright or REST API at update.storageauctions.net |

**PROHIBITED (3 sources — ToS violations):**
| Source | Prohibition |
|--------|-------------|
| Municibid.com | ToS §(c): explicit ban on "automated means" + "scraping/reproducing" (updated 05/04/26) |
| Fleamapket.com | Broad anti-automation ToS clause (page-scrape, spider, robot, crawl, index) |
| FleaMarketInsiders.com | Same clause; site is a brand wrapper for Fleamapket.com |

---

## Patrick Actions Needed

### 1. Push Block (S941+S942 consolidated)
Run from `C:\Users\desee\ClaudeProjects\FindaSale` in PowerShell:

```
git add packages/backend/src/services/scraper/sources/fleaMarketZoneScraper.ts
git add packages/backend/src/services/scraper/sources/storageAuctionsNetScraper.ts
git add packages/backend/src/services/scraper/sources/propertyRoomScraper.ts
git add packages/backend/src/services/scraper/sources/storageTreasuresScraper.ts
git add packages/backend/src/services/scraper/sources/storageAuctionsComScraper.ts
git add packages/backend/src/services/scraper/sources/publicSurplusScraper.ts
git add packages/backend/src/services/scraper/sources/municibidScraper.ts
git add .github/workflows/scrape-fleamarketzone.yml
git add .github/workflows/scrape-storageauctionsnet.yml
git add .github/workflows/scrape-propertyroom.yml
git add .github/workflows/scrape-storagetreasures.yml
git add .github/workflows/scrape-storageauctions-com.yml
git add .github/workflows/scrape-publicsurplus.yml
git add .github/workflows/scrape-municibid.yml
git add packages/backend/src/services/scraper/sourceRegistry.ts
git add claude_docs/decisions-log.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(scraper): FleaMarketZone (~1,050 venues), PropertyRoom (~46 agencies), StorageAuctions.com (3,103 records/API), PublicSurplus (~6,330 gov auctions); PARKED: StorageTreasures (SPA/capped), StorageAuctionsNet (AngularJS); PROHIBITED: Municibid/Fleamapket/FMInsiders (ToS); docs: S941+S942 wrap"
.\push.ps1
```

### 2. Searlo credit upgrade (optional)
FB Events at 17% 429 rate on the free tier (10/min cap). Buying a $3.99+ pack lifts the cap. After: bump `SEARLO_RPM` repo Variable in GitHub → Settings → Secrets and variables → Actions → Variables.

---

## Project Status

| Area | Status | Notes |
|------|--------|-------|
| Scraper fleet | 🟢 Active | 4 active sources, 2 parked, 3 prohibited |
| FB Events | 🟡 Monitoring | 17% Searlo 429 rate — optional Searlo upgrade |
| Outreach pipeline | 🟢 Active | OUTREACH_ENABLED=true, cron re-registered |
| Chrome QA backlog | 🟡 Pending | BQ=0 but 4 UNVERIFIED/CODE-ONLY items pending QA |
| Email delivery | 🟢 Healthy | All 3 rails operational, bounce ingestion live |
| Railway backend | 🟢 Live | backend-production-153c9.up.railway.app |
| Vercel frontend | 🟢 Live | finda.sale |

## S943 Priority Queue

1. **Chrome QA** — #422 OAuth 409 bridge (UNVERIFIED), #470 GA4 other 3 events (CODE-ONLY), #75 tier lapse P2 (UNVERIFIED), SEO3 /estate-sales/denver-co Human QA. Dispatch `Skill('findasale-qa')` sequentially.
2. **Scraper fleet** — StorageAuctions.net unpark (REST API probe). StorageTreasures: Patrick decision on unpark path.
