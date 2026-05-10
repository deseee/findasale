# Patrick's Dashboard — S706-meta

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| OUTREACH_ENABLED | ⚠️ FALSE — ready to flip (Option A confirmed) |
| S706 scrapers | ✅ BUILT — FL/OH/NC/GA Phase 2 (push block below) |
| internal.ts truncation | ✅ FIXED — WA+WY Phase 2 routes restored + export default |
| Scoring backfill | ✅ COMPLETE — 37,531 orgs scored |
| Canadian directory research | ✅ DONE — Canada411.ca = BUILD next; YP.ca/Kijiji = SKIP |
| Email discovery quality gates | ✅ LIVE (22-domain blocklist, 0.60 floor) |
| Canada outreach exclusion | ✅ ACTIVE |

---

## Patrick Actions Needed

**1. Install two updated skills** — click Save Skill on both cards Claude presented (findasale-dev + conversation-defaults).

**2. Flip OUTREACH_ENABLED** — Option A confirmed (197 high-confidence orgs). Railway → backend → Variables → `OUTREACH_ENABLED=true`.

**3. Push combined S706 + S706-meta files** — see pushblock below.

---

## Combined Push Block (S706 + S706-meta)

```powershell
git add packages/backend/src/services/scraper/sources/floridaPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/ohioPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/northCarolinaPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/georgiaPhase2Scraper.ts
git add packages/backend/src/routes/internal.ts
git add .github/workflows/scrape-fl-phase2.yml
git add .github/workflows/scrape-oh-phase2.yml
git add .github/workflows/scrape-nc-phase2.yml
git add .github/workflows/scrape-ga-phase2.yml
git add claude_docs/strategy/roadmap.md
git add CONTEXT.md
git add CLAUDE.md
git add claude_docs/STACK.md
git add claude_docs/decisions-log.md
git add claude_docs/operations/canonical-sources.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S706+meta: Phase 2 scrapers + ICM workflow infrastructure (CONTEXT.md routing, Handoff Contract, section anchors, canonical sources)"
.\push.ps1
```

---

## S707 Plan

**Step 1 — Scraper smoke tests** (Claude runs these via admin API, checks Railway logs for each):
- FL / OH / NC / GA Phase 2 scrapers — manual trigger, confirm records ingest without errors

**Step 2 — Chrome QA sprint** (before outreach goes live):
- #174 Auction bid flow (user12/Seedy2025!, /sales/c5hykxxecanngwcrkvq92n1va)
- NSFW detection (upload image, check Cloudinary moderation in logs)
- #251 priceBeforeMarkdown (seed item, verify strikethrough renders)

**Step 3 — Flip OUTREACH_ENABLED** after smoke test + #174 QA pass

**Step 4 — Parallel dispatch** while QA runs:
- Canada411.ca scraper (ON/BC/AB)
- COLD noise remediation (keyword blocklist in leadScoringService)
- #418 Phase 2 batch — 4–6 more states (AL, AR, IA, KY, LA, ME)
