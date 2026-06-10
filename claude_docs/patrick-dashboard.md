# Patrick's Dashboard — June 10, 2026 (Updated: S941 final wrap)

**Generated:** Wednesday, June 10, 2026 (S941 — scraper source investigation + 4 scrapers built/parked + session wrap)

---

## S941 Quick Summary

**Four new scraper sources investigated. Two built, two parked. All decisions resolved.**

**1. FleaMarketZone built (~1,050 venues).** WordPress business directory — clean static HTML, ToS clear, robots.txt open. Weekly Monday schedule. All 51 US regions (50 states + DC). `FLEA_MARKET` category.

**2. PropertyRoom built (~46 agencies).** Government/law enforcement surplus auction source. ToS clear. The `/l/auctions` page returns a server error when fetched headlessly but `/about-us/partners` is a static page listing 46 named showcase agencies (the full public universe). Weekly Wednesday schedule. `AUCTION_HOUSE` category.

**3. StorageAuctions.net PARKED — AngularJS SPA.** Listing interface is fully JavaScript-rendered. Unpark path: Playwright/Puppeteer or their REST API at `update.storageauctions.net` (requires auth).

**4. StorageTreasures PARKED — Next.js SPA + hard-capped API.** Every page is client-rendered. The site does expose a public API key in the page source, but it's server-side capped at 50 truncated records regardless of pagination parameters — out of 36,943 facilities. Not worth ingesting. Unpark path: authenticated Cognito JWT session.

**5. MaxSold and GovDeals remain PROHIBITED.** Explicit no-scraping clauses — logged in decisions-log.md.

**Other S941 work done:**
- Records pass: Applied S939+S940 Chrome QA results to roadmap (watermark gating, TEAMS label, OAuth buttons all ✅)
- FB Events burst fix: 6.5s inter-sub-query delay for Searlo; 429s expected to drop from 17% to under 5%
- 7 broken licensing scrapers cleaned up (IN/KY/MA/ME/NH/RI) — all PARKED, workflows silenced

---

## What You Need to Do

**Push block (copy-paste into PowerShell from your FindaSale folder):**
```
git add packages/backend/src/services/scraper/sources/fleaMarketZoneScraper.ts
git add packages/backend/src/services/scraper/sources/storageAuctionsNetScraper.ts
git add packages/backend/src/services/scraper/sources/propertyRoomScraper.ts
git add packages/backend/src/services/scraper/sources/storageTreasuresScraper.ts
git add .github/workflows/scrape-fleamarketzone.yml
git add .github/workflows/scrape-storageauctionsnet.yml
git add .github/workflows/scrape-propertyroom.yml
git add .github/workflows/scrape-storagetreasures.yml
git add packages/backend/src/services/scraper/sourceRegistry.ts
git add claude_docs/decisions-log.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(scraper): PropertyRoom (~46 agencies, AUCTION_HOUSE), StorageTreasures PARKED (SPA/hard-capped API), FleaMarketZone (~1,050 venues), StorageAuctions.net PARKED (AngularJS); docs: ToS decisions log S941, wrap"
.\push.ps1
```

**Optional: Searlo credit upgrade.** FB Events running at 17% 429s on the free tier (10/min cap). A $3.99+ pack lifts the cap — then bump `SEARLO_RPM` repo Variable.

---

## Project Status

| Area | Status |
|------|--------|
| BQ (Blocked Queue) | **0 items** — clean |
| Scraper fleet | ✅ FleaMarketZone BUILT (S941) — ~1,050 FLEA_MARKET venues, Mon weekly |
| Scraper fleet | ✅ PropertyRoom BUILT (S941) — ~46 AUCTION_HOUSE agencies, Wed weekly |
| Scraper fleet | ⏸ StorageAuctions.net PARKED — AngularJS SPA |
| Scraper fleet | ⏸ StorageTreasures PARKED — SPA + hard-capped API (50 of 36,943) |
| Scraper fleet | 🔴 7 licensing scrapers PARKED (IN/KY/MA/ME/NH/RI) — cloud IP blocks + RI repealed |
| FB Events scraper | ✅ Searlo burst fix S941 — 6.5s inter-sub-query delay |
| GA4 Analytics | ✅ LIVE (CSP fixed S926, conversion events S928) |
| Email (transactional) | ✅ Resend rail live, bounce/complaint ingestion E2E-verified |
| Email (outreach) | ✅ Re-enabled S939, suppression guards on all senders |
| Pipeline monitoring | ✅ 123 workflows covered, silent-failure detection live |
| Backend / Railway | ✅ Healthy |
| Frontend / Vercel | ✅ Deployed |

---

## S942 Priority Queue
1. **Chrome QA** — #422 OAuth 409 bridge (UNVERIFIED), #470 GA4 other 3 events (CODE-ONLY), #75 tier lapse P2 (UNVERIFIED), SEO3 Denver Human QA
2. **StorageAuctions.net unpark** — REST API investigation at `update.storageauctions.net`
