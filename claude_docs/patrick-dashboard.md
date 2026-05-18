# Patrick's Dashboard — Week of May 19, 2026

---

## What Happened This Week

**S759:** GEO/AI Discoverability build — 15 features shipped across Phases 1-11. 12 parallel agents, 21 files, 3 batches. City landing pages, claim banner, AI score tool, crawler tracking, Smart Search Views dashboard card, first-crawl email, stale data protection, ChatGPT plugin manifest, sitemap enrichment, llms.txt update. Plus two pre-existing Vercel build crashers fixed (city/[slug].tsx, cities/index.tsx). **Migration required** before Railway will use CrawlerVisit tracking — see action items.

**S758:** Complete GEO & Discoverability plan — 12 phases, 29 roadmap entries (#432–#460). Research queue + GTM plays. No code changes — planning session.

**S757:** Production DB cleanup. Removed 5 test/QA sales and 13 items. Nintendo Power mag moved into live Artifact Downtown sale (now 100 items). No code changes.

**S756:** Pipeline DB verification. Outreach healthy at ~48/day. WARM email gap root cause fixed (website enrichment now daily).

---

## Pipeline Status (Live as of S756)

- **Outreach:** 29 emails sent since May 17 deploy. ~48/day. On warmup pace. ✅
- **Queue:** 3,319 PENDING, 29 SENT. 31 junk rows cleaned out.
- **Source attribution:** 87.7% of organizers tagged with data source. ✅
- **WARM email gap:** Root cause found and fixed. Website enrichment now runs daily.

---

## What's New — Pending Chrome QA (S759)

- City landing pages: /city/grand-rapids-mi and /city/grand-rapids-mi/estate-sales
- Cities browse index: /cities
- This Weekend pages: /this-weekend/grand-rapids-mi
- Claim This Listing banner: on unclaimed scraped sale pages
- AI Score tool: /ai-score (enter any finda.sale URL)
- Smart Search Views card: on organizer dashboard
- Crawler tracking + first-crawl email: live once migration runs

## What's Fixed (Needs Chrome QA — from S755)

- #275 Hunt Pass ring + badge
- #265 Share & Earn card (7-day dismissal)
- #292 ENDED sale counts (accurate breakdown)
- #305 Social Posts button (opens modal)
- #306 Store Hours (persists after reload)
- #307 Retail Mode — needs TEAMS account test

**⚠️ QA CEILING: 11 items in Blocked Queue. Next session = QA before new features.**

---

## Pending Decisions

No PENDING items in DECISIONS.md this week. All standing decisions are active.

---

## Action Items for Patrick

- [ ] **Run the S759 push block** (21 files — largest push block in recent sessions)
- [ ] **Run CrawlerVisit migration** (enables bot tracking + Smart Search Views card):
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
  $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
  npx prisma migrate deploy
  npx prisma generate
  ```
- [ ] **Run S755 push block** (10 code files) — if not yet done
- [ ] **Run S756 push block** (2 code files + 2 doc files) — if not yet done
- [ ] **Run S758 push block** (4 doc files) — if not yet done
- [ ] **Deploy email verification migration** (20260515180000) — pending since S726
- [ ] **Delete fix-attendance.sql** from project root — has production IDs (pending since S750)
- [ ] **Log back into Chrome as yourself** (artifactmi@gmail.com) after any QA session

---

## S759 Push Block

```powershell
git add packages/frontend/pages/sales/[id].tsx
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260519000000_add_crawler_visit/migration.sql
git add packages/backend/src/middleware/crawlerAnalytics.ts
git add packages/backend/src/routes/crawlerStats.ts
git add packages/backend/src/index.ts
git add packages/backend/src/routes/sales.ts
git add packages/frontend/pages/city/[slug]/[category].tsx
git add packages/frontend/public/llms.txt
git add packages/frontend/public/.well-known/ai-plugin.json
git add packages/frontend/next-sitemap.config.js
git add packages/frontend/pages/server-sitemap.xml.tsx
git add packages/frontend/pages/city/[slug].tsx
git add packages/frontend/components/ClaimListingBanner.tsx
git add packages/backend/src/routes/aiScore.ts
git add packages/frontend/pages/ai-score.tsx
git add packages/frontend/pages/cities/index.tsx
git add packages/frontend/pages/this-weekend/[city].tsx
git add packages/frontend/components/SmartSearchViewsCard.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/backend/src/controllers/saleController.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "S759: GEO/AI Discoverability Phases 1-11 — 21 files, 15 features

- City×category ISR pages (/city/[slug]/[category])
- Cities browse index (/cities)
- This Weekend pages (/this-weekend/[city])
- Sale page JSON-LD enrichment (Speakable, PaymentMethod, SoldOut, AggregateOffer, sr-only block)
- ClaimListingBanner on unclaimed sale pages
- AI Score tool at /ai-score
- CrawlerVisit schema + middleware + stats endpoints
- Smart Search Views card on organizer dashboard
- First-crawl email notification
- ChatGPT plugin manifest (/.well-known/ai-plugin.json)
- Sitemap enrichment (city + city×category entries)
- llms.txt updated (MCP live, national scope)
- Stale scraped ENDED sales: noindex + search exclusion
- Fixed pre-existing build crashers: city/[slug].tsx, cities/index.tsx
- Wrap docs: STATE.md, patrick-dashboard.md, roadmap.md"
.\push.ps1
```
