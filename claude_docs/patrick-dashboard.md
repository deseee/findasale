# Patrick's Dashboard — S620 WRAP

## Status: 🟢 3 scrapers ready to push — EstateSalesNet + Eventbrite + Newspaper RSS | Craigslist suspended (datacenter IP block) | 2 Facebook paths on roadmap (#364, #365)

**Headline:** S620 closed the Craigslist dead-end (datacenter IPs blocked at network level — RSS and HTML both 403) and researched Facebook data sources. Two legitimate Facebook paths added to roadmap: #364 Bing Search API event discovery (free, no Facebook interaction) and #365 Organizer Facebook Page Sync (OAuth onboarding, Graph API pull). S619 push block still outstanding — Eventbrite and Newspaper RSS are built and waiting.

---

## 🎯 Your Pending Actions (in priority order)

| Priority | Action | Deadline | Notes |
|----------|--------|----------|-------|
| **P1** | Push S619+S620 files | Now | Block below |
| **P1** | Add `EVENTBRITE_API_KEY` GitHub Secret | After push | Register free app at developer.eventbrite.com → private token → GitHub repo Settings → Secrets → New |
| **P2** | Optional: add `EVENTBRITE_ORGANIZER_ID` + `RSS_ORGANIZER_ID` secrets | When ready | Both optional — backend falls back to system organizer if absent |
| **P2** | Press release — fill `[Last Name]` ×3 + real cell | OVERDUE | `claude_docs/strategy/s603-pr-wire-blast-package.md` Version B |
| **P3** | Review + send 19 outreach drafts in Gmail | When ready | Nick Loper, Codie Sanchez, NAA ×2, etc |

---

## 📊 What's Now in Production (after S619 push)

- **EstateSalesNet** — 5,499 sales nightly, 00:00 UTC, 40 national coordinate centers ✅
- **Craigslist** — ❌ SUSPENDED — datacenter IPs blocked at network level (403 on RSS + HTML). Workflow exists but skip triggering.
- **Eventbrite** — national grid, 5 search queries, 01:00 UTC — needs EVENTBRITE_API_KEY secret ⏳
- **Newspaper/Oodle RSS** — 62 classified feeds across 27 metros, 02:00 UTC ⏳

All scrapers POST to `/api/internal/scraper/ingest` with INTERNAL_SCRAPER_KEY auth. All dedup by sourceItemId.

---

## 📦 Push Block — S619 + S620

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
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md

git commit -m "feat: Eventbrite + Newspaper RSS scrapers; suspend Craigslist; add Facebook roadmap items #364-365

- Eventbrite scraper: national grid API search, 5 query terms, page 3 cap
- Newspaper/Oodle RSS scraper: 62 feeds across 27 metros
- GitHub Actions workflows: scrape-eventbrite (01:00 UTC), scrape-newspaper-rss (02:00 UTC)
- Craigslist RSS rewrite (bypasses WAF) — workflow exists but suspended (datacenter 403)
- Roadmap #364: Bing Search API Facebook event discovery (queued S620)
- Roadmap #365: Organizer Facebook Page Sync via Graph API OAuth (queued S621+)"

.\push.ps1
```

---

## 🚧 What's Queued for Next Session (S621)

1. **Build #364 — Bing Facebook Event Discovery**: Get Bing Search API key (Azure → Cognitive Services → Bing Search v7, free tier). Build `sources/bing-facebook-events.ts` + `scripts/run-bing-facebook.ts` + `.github/workflows/scrape-bing-facebook.yml`. Query: `site:facebook.com/events "estate sale" [city]`. Parse Bing structured results → ingest. Cron: 03:00 UTC.
2. **TypeScript check** — `cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules`.
3. **S614 migrations** if not yet deployed: `20260501030000_metro_top_finds` + `20260501060000_organizer_claim_email`.
4. **Storefront Chrome QA**: #356 Broadcast card, #363 Buyer's Premium badge (shipped S601, pending Chrome verification).
