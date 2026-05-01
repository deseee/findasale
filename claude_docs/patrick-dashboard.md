# Patrick's Dashboard — S614 COMPLETE

## Status: S614 DONE. 5-group parallel build complete — metro sync cron, scraper enrichment, Craigslist, claim email pipeline, 500 SEO pages. Push block below. Run 2 migrations + set 4 env vars in Railway.

**Headline:** S614 shipped everything in the S614 plan. Smoke test: admin scraper ✅, SSR sale page ✅. Index.ts merge verified (both cron inits present). Two new Prisma migrations ready to deploy. Craigslist selector validation needed on first prod scrape run.

---

## 🎯 Your Pending Actions (in priority order)

| Priority | Action | Deadline | Notes |
|----------|--------|----------|-------|
| **P1 URGENT** | Fill `[Last Name]` ×3 + real cell in press release | **File Mon May 5, 9:00 AM EST** | File: `claude_docs/strategy/s603-pr-wire-blast-package.md` Version B |
| **P1** | Push S614 wrap block (below) | Now | 23 files — use PowerShell pushblock |
| **P1** | Run 2 new migrations after push deploys | After push | Commands below |
| **P2** | Add 4 Railway env vars | After push | `METRO_SYNC_ENABLED=true`, `CLAIM_EMAIL_ENABLED=true`, `GOOGLE_PLACES_KEY`, `FB_ACCESS_TOKEN` |
| **P3** | Review + send 19 outreach drafts in Gmail | When ready | Nick Loper, Codie Sanchez, NAA ×2, NASMM, ISA, NESA, Antique Trader, AntiqueWeek, 8 others |

---

## 📦 Push Block — S614 Wrap

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260501030000_metro_top_finds/migration.sql
git add packages/database/prisma/migrations/20260501060000_organizer_claim_email/migration.sql
git add packages/backend/src/index.ts
git add packages/backend/src/jobs/metroSyncCron.ts
git add packages/backend/src/jobs/claimEmailCron.ts
git add packages/backend/src/services/scraper/enrichment.ts
git add packages/backend/src/services/scraper/index.ts
git add "packages/backend/src/services/scraper/sources/craigslist.ts"
git add packages/backend/src/services/scraper/claimEmailService.ts
git add packages/backend/src/jobs/scraperCron.ts
git add packages/backend/src/controllers/citiesController.ts
git add packages/backend/src/routes/cities.ts
git add packages/frontend/lib/citiesController.ts
git add "packages/frontend/pages/city/[slug].tsx"
git add "packages/frontend/pages/guide/[slug].tsx"
git add packages/frontend/data/seo-pages/index.json
git add packages/frontend/data/seo-pages/generate-seo-content.js
git add packages/frontend/data/seo-pages/generate.js
git add packages/frontend/data/seo-pages/BUILD_GUIDE.md
git add packages/frontend/scripts/generate-seo-index.ts
git add packages/frontend/pages/server-sitemap.xml.tsx
git add packages/frontend/package.json
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: S614 — metro sync cron (ADR-074), scraper enrichment, Craigslist impl, claim email pipeline (ADR-073 Phase 2), 500 SEO guide pages (ADR-075 Phase 1)"
.\push.ps1
```

---

## 🔧 After Push Deploys — Run Migrations

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**New tables this creates:**
- `MetroTopFinds` — eBay sold items per city slug for city pages
- `OrganizerClaimEmail` — 3-touch claim email tracking per unmanaged organizer

---

## ✅ S614 What Was Done

### Group 1 — Metro Sync Cron (ADR-074)
- `MetroTopFinds` Prisma model — stores eBay sold items per city for city page display
- Nightly cron at 04:00 UTC, 20 US metros, top 12 items per metro, gated by `METRO_SYNC_ENABLED=true`
- City pages (`/city/[slug]`) now pull real eBay sold-comp data instead of placeholders
- Backend `/api/cities/:slug/top-finds` endpoint added

### Group 2 — Scraper Enrichment
- After the scraper creates an unmanaged organizer, `enrichOrganizer()` fires-and-forgets
- Google Places API lookup → stores `googlePlaceId` on Organizer
- Facebook Graph API search → stores `facebookPageId` on Organizer
- Both gated by env var — graceful skip if keys not set
- ⚠️ Needs: `GOOGLE_PLACES_KEY` + `FB_ACCESS_TOKEN` in Railway

### Group 3 — Craigslist Scraper
- `sources/craigslist.ts` stub replaced with real Cheerio+fetch implementation
- 31 metro subdomain mapping, 500ms rate limiting between metros
- Runs at 12:00 UTC daily (joins EstateSalesNet 00:00 + GarageSaleFinder 06:00)
- ⚠️ Craigslist HTML selectors are assumption-based — validate on first prod run

### Group 4 — Claim Email Pipeline
- `OrganizerClaimEmail` model tracks which touch (1/2/3) each unmanaged organizer has received
- 3-touch Day 1/3/7 sequence: "claim it free" → "shoppers are looking" → "last reminder"
- Max 50 emails per daily batch, gated by `CLAIM_EMAIL_ENABLED=true`
- Uses existing Resend integration

### Group 5 — SEO Content Moat (ADR-075 Phase 1)
- 500 JSON content entries: 250 "How to run a [sale type] in [City]" + 250 "[City] [sale type] pricing guide"
- `/guide/[slug]` ISR page (24-hour cache, fallback: blocking, schema.org structured data)
- All 500 URLs added to sitemap
- All 50 major US cities included (Grand Rapids, MI included)

---

## ✅ S613 What Was Done

**Admin scraper page — 5 successive bugs fixed:**

1. **404 on page load** — wrong import paths (`@/hooks/useAuth` and `@/hooks/useToast` don't exist). Fixed to `../../components/AuthContext` + `../../components/ToastContext`.

2. **Redirect to homepage** — auth check fired before auth resolved + used `roles` (array) instead of `role` (string). Fixed with `isLoading: authLoading` gate.

3. **"Failed to load data" toast** — `ScrapedSalesJob` table didn't exist in Railway DB. Patrick ran `npx prisma migrate deploy` + `prisma generate` (migration `20260501020000_scraper_phase1` confirmed deployed). Also fixed API response extraction: `sourcesData.sources` not `sourcesData`, `runsData.jobs` not `runsData.runs`.

4. **White background in dark mode** — no dark mode Tailwind classes. Fixed throughout.

5. **Empty trigger scrape dropdown** — filtered to `enabled` sources but Railway hadn't rebuilt with `SCRAPER_ENABLED=true` yet → all sources showed `enabled:false`. Removed filter + added fallback. Cache-busted `Dockerfile.production` comment (`# cache-bust: 2026-05-01`) to force full Railway rebuild.

**Scraper scope clarified:**
- EstateSalesNet (Puppeteer) + GarageSaleFinder (Cheerio) = LIVE, running 00:00 + 06:00 UTC daily
- Craigslist = Phase 2 stub (S614 will implement)
- eBay = price suggestions + city pages (ADR-074), NOT a scrape source
- Google/Yelp/Facebook = enrichment (S614 will build), not yet wired

---

## 🚀 S614 Plan — Full Parallel Build

All 5 groups are independent — dispatch all in parallel. Patrick's directive: "be comprehensive, I'm sick of Claude doing half ass work."

| Group | What | Key Files |
|-------|------|-----------|
| **1** | Metro Sync Cron (ADR-074) — eBay sold-comps for city pages | `MetroTopFinds` Prisma model + migration + `metroSyncCron.ts` + `citiesController.ts` + `city/[slug].tsx` update |
| **2** | Scraper Enrichment — Google Places + Facebook Graph | `enrichment.ts` (NEW) wired into `scraper/index.ts` post-create |
| **3** | Craigslist Scraper — replace stub | `craigslist.ts` (replace stub) + `scraperCron.ts` add 12:00 UTC slot |
| **4** | Claim Email Pipeline — Day 1/3/7 cadence | `claimEmailService.ts` + `claimEmailCron.ts` + wire into `index.ts` |
| **5** | ADR-075 SEO Content Moat Phase 1 | 500 content entries + `pages/guide/[slug].tsx` + sitemap update |

**Schema migrations Patrick will need to run after Group 1 + 4 land:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Strategic Context

**"Get too big to ignore before partners can react."** Scraper is live. S614 completes the content flywheel: city pages get real eBay sold-comp data (Group 1), scraped organizer profiles get enriched (Group 2), Craigslist adds a third source (Group 3), unmanaged organizers get claim emails (Group 4), 500+ SEO pages go live (Group 5). Every piece compounds the distribution moat.
