# Patrick's Dashboard — Week of May 19, 2026

---

## What Happened This Week

**S760 (today):** GEO Phase 2 complete. 17 features, 44 files. Everything in the GEO roadmap is now shipped. Key additions: clearance discovery page (/clearance), 1-click OAuth claim on ghost listings, organizer demand dashboard card, 3 new admin pages, monthly trend report cron, MCP tool wrappers for AI agents, EventSeries schema for recurring organizers, platform syndication endpoint, shopper notify-me waitlist, directory confidence scoring, auto-liquidation trigger on sale end. Also confirmed closed: Help Library (#377/#378 done S742), SEO Content Moat (ISR pages = the 500-page generator).

**S759:** GEO Phases 1-11 — 15 features, 21 files. City landing pages, claim banner, AI Score tool, crawler tracking, Smart Search Views card, first-crawl email, ChatGPT plugin manifest, sitemap enrichment, llms.txt update.

**S758:** GEO strategy planning session. 29 roadmap entries added. No code.

**S756/S757:** Production DB cleanup + pipeline verification. Outreach healthy at ~48/day.

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** 3,319 PENDING organizers. Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

- [ ] **Spot-check before pushing:**
  - Open `packages/backend/src/index.ts` — verify these 4 route mounts are present: `syndication`, `shopperWaitlist`, `demandSignals`, `clearance`
  - Open `packages/frontend/pages/sales/[id].tsx` — verify Product schema JSON-LD, EventSeries JSON-LD, and OAuth claim buttons all coexist
- [ ] **Run S760 push block** (44 files — see below)
- [ ] **Run migrations** (covers S759 CrawlerVisit + S760 schema in one pass):
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
  $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
  npx prisma migrate deploy
  npx prisma generate
  ```
- [ ] **Chrome QA tonight** — 18 items in blocked queue (ceiling rule active)
- [ ] **Deploy email verification migration** (20260515180000) — pending since S726
- [ ] **Delete fix-attendance.sql** from project root — pending since S750
- [ ] **Log back into Chrome as yourself** (artifactmi@gmail.com) after any QA

---

## QA Queue (18 items — ceiling active)

**S755 fixes:** Hunt Pass ring/badge · Share & Earn card · ENDED-sale counts · Social Posts modal · Store Hours · Retail Mode (TEAMS)

**S759 GEO pages:** /city/grand-rapids-mi · /city/grand-rapids-mi/estate-sales · /this-weekend/grand-rapids-mi · unclaimed sale claim banner · /ai-score · organizer Smart Search Views card

**S760 new surfaces:** OAuth claim buttons on ghost sale · organizer Demand Dashboard card · /clearance page · /admin/demand-signals · /admin/waitlist · /admin/organizer-confidence

---

## S760 Push Block

```powershell
git add packages/frontend/pages/index.tsx
git add packages/frontend/components/SearchFilterPanel.tsx
git add "packages/frontend/pages/organizer/edit-sale/[id].tsx"
git add packages/frontend/pages/sales/[id].tsx
git add packages/frontend/components/DemandSignalsCard.tsx
git add packages/frontend/components/ClaimListingBanner.tsx
git add packages/frontend/components/Layout.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/pages/clearance/index.tsx
git add packages/frontend/pages/admin/demand-signals.tsx
git add packages/frontend/pages/admin/waitlist.tsx
git add packages/frontend/pages/admin/organizer-confidence.tsx
git add packages/frontend/pages/admin/index.tsx
git add packages/frontend/pages/_app.tsx
git add packages/mcp-server/src/handlers.ts
git add packages/mcp-server/src/types.ts
git add packages/mcp-server/src/index.ts
git add packages/mcp-server/src/tools/getTrendingSales.ts
git add packages/mcp-server/src/tools/getSalesStartingSoon.ts
git add packages/mcp-server/src/tools/findItemForSale.ts
git add packages/backend/src/index.ts
git add packages/backend/src/routes/organizers.ts
git add packages/backend/src/routes/syndication.ts
git add packages/backend/src/routes/shopperWaitlist.ts
git add packages/backend/src/routes/demandSignals.ts
git add packages/backend/src/routes/clearance.ts
git add packages/backend/src/routes/sales.ts
git add packages/backend/src/routes/search.ts
git add packages/backend/src/routes/admin.ts
git add packages/backend/src/controllers/internalJobRunnerController.ts
git add packages/backend/src/controllers/saleController.ts
git add packages/backend/src/controllers/demandSignalsController.ts
git add packages/backend/src/controllers/clearanceController.ts
git add packages/backend/src/services/syndicationFormatterService.ts
git add packages/backend/src/services/unmetDemandService.ts
git add packages/backend/src/services/directoryConfidenceService.ts
git add packages/backend/src/jobs/monthlyTrendReportJob.ts
git add packages/backend/src/jobs/saleAutoCloseCron.ts
git add packages/backend/src/jobs/websiteEnrichmentJob.ts
git add packages/backend/src/templates/monthlyTrendReport.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260519100000_geo_demand_waitlist_confidence/migration.sql
git add .github/workflows/pipeline-monthly-trend-report.yml
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: GEO Phase 2 complete — OAuth claim, clearance, admin dashboards, MCP tools, demand signals, waitlist, confidence, EventSeries, syndication, auto-liquidation, trend reports (#382 #439 #442 #443 #448 #450 #453 #454 #455 #458 #459 #460)"
.\push.ps1
```
