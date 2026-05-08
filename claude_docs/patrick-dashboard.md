# Patrick's Dashboard — S687 Wrap

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| Google OAuth | ⚠️ Still broken (root cause unclear) |
| Login (email/password) | ✅ Working |
| MCP Server (mcp.finda.sale) | ✅ LIVE — 7 tools |
| Organizer DB | ✅ 7,897 records + corroboration schema live |
| New scrapers | ✅ OSM, Indiana Licensing, Sale Seeker — deployed, not yet triggered |
| #393 Chrome QA Sprint | 🟡 Auction #174 still blocked (needs items listed) |
| Cold Outreach Pipeline (#374) | 🟡 Schema ready — lead scoring service next |

---

## What Happened This Session (S687)

Big directory rebuild session. Six agents. Everything green.

**Organizer schema expanded** — 14 new fields deployed to production: corroboration tracking (sourceCount, sourcesJson, corroborationScore, dedupeKey) + lead scoring (leadScore, leadTier, lastScoredAt, annualSalesEstimate, hasPhysicalOffice, isStateLicensed, licenseState, licenseNumber, staffSizeEstimate, reviewCount, reviewVelocity). Migration `20260508000001` deployed.

**Merge algorithm upgraded** — `getOrCreateScrapedOrganizer()` now runs 5-path dedup and tracks corroboration score across sources. Every new organizer ingested from any source will now automatically merge with existing records and increment confidence scoring.

**Three new scrapers shipped:**
- **OSM/Overpass** — 20 US metros, 5 venue tag types, weekly Monday 3am UTC
- **Indiana licensing** — mylicense.in.gov, active auctioneer licenses only, weekly Monday 4am UTC
- **Sale Seeker** — thesaleseeker.com (no ToS = legal), weekly Monday 5am UTC

**Source research completed:**
- EstateSales.org: PROHIBITED — explicit anti-scraping clause, will not pursue
- DataForSEO: SKIP — 20-100x more expensive than existing sources
- OSM cron: was never active (S686 assessment was wrong) — now built

---

## Patrick Actions Needed

**Trigger scrapers manually to validate:**
- Hit `POST /api/internal/scraper/run-indiana-licensing` in Railway console or via curl with internal secret
- Watch logs — if the ASP.NET form parses correctly you'll see organizer records being created
- Then trigger `run-osm`

**Auction #174 still blocked:**
- List at least one item in a production auction sale so Chrome QA can run the bid → close → purchase flow

---

## Next Session (S688)

1. Validate Indiana + OSM first runs from Railway logs
2. Build lead scoring service (score all 7,897 organizers → unlocks #374 outreach pipeline)
3. Louisiana + Illinois licensing scrapers (same pattern as Indiana, 1 agent each)
4. #174 Auction QA if Patrick lists items
