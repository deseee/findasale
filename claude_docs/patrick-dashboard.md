# Patrick's Dashboard — Week of May 11, 2026

---

## What Happened This Week

S714: SEO content foundation built. 384 guide pages are in `packages/frontend/data/seo-pages/index.json` and ready to push. Includes 34 real Haiku-written pricing guides (antiques, furniture, jewelry, glass, art, tools — e.g. Tiffany lamp price guide, vintage Rolex guide, McCoy pottery guide) plus 350 template pages covering 25 major cities × 10 categories and 10 categories × 10 months of trend reports. All pages served at `/guide/[slug]`. Sitemap auto-populates once pushed. Also built two new scripts (`fix-seo-batch.js` post-processor and `generate-template-pages.mjs` template generator) and an after-reset dispatch doc to generate the remaining 116 pages via agent.

S713: Two Railway crash loops fixed, scraper suite repaired.

---

## Push This Now (S714)

```powershell
git add scripts/fix-seo-batch.js
git add scripts/generate-template-pages.mjs
git add packages/frontend/data/seo-pages/index.json
git add seo-pages-haiku-generator.md
git add claude_docs/strategy/seo-agent-dispatch.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(seo): 384 guide pages — 34 Haiku pricing guides + 350 city/category/trend templates; fix-seo-batch.js + generate-template-pages.mjs"
.\push.ps1
```

---

## After Push — Fresh Session Dispatch

Start a new session and read `claude_docs/strategy/seo-agent-dispatch.md` — it has the complete prompt to generate the remaining 116 pricing guide pages via agent and write them directly into index.json.

---

## Carry-Forward Patrick Actions (from S713)

**P0 — Leaderboard scouts stay empty until you run this:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
```

**Railway env check — confirm both set in Railway → backend → Variables:**
- `OUTREACH_ENABLED` = `true`
- `OUTREACH_WARMUP_START_DATE` = `2026-05-06`

---

## Decisions Needed From You

- **AuctionNinja + NAA scrapers:** Built and ready, switched off. Turn them on?
- **MT scraper fix:** Railway → backend → Variables → copy `INTERNAL_API_KEY` → GitHub Secrets → `INTERNAL_API_TOKEN` → update → re-run Montana workflow

---

## Chrome QA Queue (4 features, pending since S712)

Sequential only — one at a time:
1. Dorm Dash — create sale, pick DORM_DASH, finish wizard, verify no crash
2. Wave 2 edit-sale — open /organizer/edit-sale/[id], check all 6 new fields appear and save
3. Cash Bridge POS — open POS, verify Venmo/Zelle buttons with handle display
4. Leaderboard — navigate to /leaderboard, verify no "Failed to load" error

---

## Infrastructure Status

| | |
|---|---|
| Vercel (frontend) | ✅ Green |
| Railway (backend) | ✅ Green |
| SEO guide pages | 🟡 384 entries ready — push pending |
| Outreach emails | ✅ Live — warmup active |
| Leaderboard scouts | 🔴 Empty until migration deployed |
| Montana scraper | ❌ 401 — secret mismatch (Patrick fix above) |
| MN/MI/TN scrapers | 🟡 Bot-blocked — needs headless proxy infra |
| AuctionZip / Canada411 | ⛔ Disabled — confirmed dead sources |
| MO pawnbroker | ⛔ Disabled — no state registry |
| YellowPages.ca | ✅ New scraper replacing Canada411 |
