# Patrick's Dashboard — S621 WRAP

## Status: 🟢 Canada scraper expansion shipped — 92 metros + 9 CA grid centers | Advisory board CONDITIONAL GO | Roadmap #366–#371 added | Push block below

**Headline:** S621 expanded all scrapers to Canada (Facebook Events now covers 92 metros including ON, BC, AB, MB, SK; national grid covers 9 Canadian coordinate centers for Eventbrite). Advisory board returned CONDITIONAL GO on Canada platform expansion. Quebec Bill 96 identified as Phase 1 blocker — block QC at signup. MaxSold ($50k+ estates, 25–35% commission) is the wedge. 18-month window before Kijiji can react.

---

## 🎯 Your Pending Actions (in priority order)

| Priority | Action | Deadline | Notes |
|----------|--------|----------|-------|
| **P1** | Push S619 + S620 + S621 files | Now | Combined block below |
| **P1** | Add `EVENTBRITE_API_KEY` GitHub Secret | After push | Register free app at developer.eventbrite.com → private token → GitHub repo Settings → Secrets → New |
| **P2** | Engage Canadian privacy lawyer | Before CA launch | CAD $3–5k estimated. Needed for PIPEDA privacy policy update + CCPSA ToS clause (#368) |
| **P2** | Monitor GST/HST threshold monthly | Ongoing | Threshold: CA$30,000 annual Canadian revenue. No action until near threshold |
| **P2** | Press release — fill `[Last Name]` ×3 + real cell | OVERDUE | `claude_docs/strategy/s603-pr-wire-blast-package.md` Version B |
| **P3** | Review + send 19 outreach drafts in Gmail | When ready | Nick Loper, Codie Sanchez, NAA ×2, etc |

---

## 📊 What's Now In Production (after S621 push)

- **EstateSalesNet** — 5,499 sales nightly, 00:00 UTC, 40 US coordinate centers ✅
- **Craigslist** — ❌ SUSPENDED — datacenter IPs blocked at network level. Workflow exists but don't trigger.
- **Eventbrite** — national grid (now includes 9 CA centers), 5 search queries, 01:00 UTC — needs EVENTBRITE_API_KEY ⏳
- **Newspaper/Oodle RSS** — 62 classified feeds across 27 metros, 02:00 UTC ⏳
- **Facebook Events search** — 92 metros (75 US + 17 Canada Phase 1), weekly Monday 03:00 UTC ✅ (after S619 push)

---

## 📦 Push Block — S619 + S620 + S621

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/backend/src/services/scraper/htmlParser.ts
git add packages/backend/src/services/scraper/index.ts
git add packages/backend/src/services/scraper/craigslist-sites.ts
git add packages/backend/src/services/scraper/sources/craigslist.ts
git add packages/backend/src/services/scraper/sources/eventbrite.ts
git add packages/backend/src/scripts/run-eventbrite.ts
git add .github/workflows/scrape-eventbrite.yml
git add packages/backend/src/services/scraper/newspaper-feeds.ts
git add packages/backend/src/services/scraper/sources/newspaper-rss.ts
git add packages/backend/src/scripts/run-newspaper-rss.ts
git add .github/workflows/scrape-newspaper-rss.yml
git add packages/backend/src/services/scraper/sources/search-facebook-events.ts
git add packages/backend/src/services/scraper/national-grid.ts
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "feat(canada): S621 wrap — scraper expansion to 92 metros, 9 CA grid centers, roadmap #366-371, Canada CONDITIONAL GO

- FB events scraper: 30 → 92 metros (75 US + 17 Canada Phase 1: ON, BC, AB, MB, SK)
- National grid: 40 → 51 centers (9 Canadian added for Eventbrite + API scrapers)
- Craigslist: suspended (datacenter IP block confirmed)
- Eventbrite: national grid scraper with EVENTBRITE_API_KEY (needs GitHub secret)
- Newspaper/Oodle RSS: 62 feeds across 27 metros
- Roadmap #366-371: Canada scraper (shipped), infra, legal, Quebec flag, analytics, launch
- Advisory board: CONDITIONAL GO — Quebec Bill 96 blocks QC in Phase 1
- MaxSold wedge identified: 25-35% commission, $50k+ only, 18mo reaction window"

.\push.ps1
```

---

## 🚧 What's Queued for Next Session (S622)

1. **Chrome QA** — #356 Broadcast card + #363 Buyer's Premium badge (shipped S601, pending browser verification)
2. **Canada Platform Core Infrastructure (#367)** — ~7–9 weeks engineering when ready: CAD currency display, postal code validation (A1A 1A1 regex), province selector, Stripe Connect CA, Newfoundland timezone (UTC+03:30)
3. **Canada Legal Compliance (#368)** — required before any Canadian organizer onboards: PIPEDA privacy policy update, CCPSA ToS clause, data export endpoint (right of access), consent checkboxes
4. **Quebec Bill 96 Feature Flag (#369)** — block QC province at signup, show waitlist modal. Required before any Canada launch
5. **TypeScript check** — `cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules`
6. **S614 migrations** if not yet deployed: `20260501030000_metro_top_finds` + `20260501060000_organizer_claim_email`
