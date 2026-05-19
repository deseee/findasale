# Patrick's Dashboard — Week of May 19, 2026

---

## What Happened This Week

**S764 (today — Tier 2 Chrome QA):** 18 items verified. Found 2 P1 bugs: #363 lot number has no organizer input (backend + display both exist, UI missing); #439 backend SSR sale query doesn't include items (Product schema can't render for crawlers). Also found P2: add-items page has zero tooltip guidance; Brand Kit logo is URL-only; social links split across two settings pages.

**S763:** Low-token doc audit cleared 22 stale roadmap entries. Fixed 5 bugs: Flip Report tier gate (#41), login silent error, Hold-to-Pay modal wiring (#221), GEO JSON-LD SSR, ENDED sale noindex.

**S762:** Cleared entire blocked QA queue — 16 items verified ✅. Fixed #292 crash on ENDED sale pages.

**S761:** Verified #305 Social Posts ✅ and #307 Retail Mode ✅. Fixed ai-score + POS roles guard.

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** 3,319 PENDING organizers. Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

### 1. Push S763 + S764 docs:
```powershell
git add packages/frontend/pages/organizer/flip-report/[saleId].tsx
git add packages/frontend/pages/login.tsx
git add packages/frontend/pages/organizer/holds.tsx
git add packages/frontend/pages/sales/[id].tsx
git add claude_docs/strategy/roadmap.md
git add claude_docs/audits/qa-status-reconciliation-2026-05-18.md
git add claude_docs/audits/qa-plan-2026-05-18.md
git add claude_docs/audits/geo-verification-2026-05-18.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix: flip report tier gate, login toast, hold-to-pay modal wiring, GEO JSON-LD SSR, noindex prop; S764 QA findings (#41 #221 #363 #449 #457)"
.\push.ps1
```

### 2. Pending (when ready):
- [ ] **Run migrations** (CrawlerVisit + geo_demand_waitlist_confidence — S760, still pending):
  ```powershell
  cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
  $env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
  npx prisma migrate deploy
  npx prisma generate
  ```
- [ ] **Deploy email verification migration** (20260515180000) — pending since S726
- [ ] **Delete fix-attendance.sql** from project root — pending since S750

---

## ⚠️ Brand Drift Alert — 2026-05-19

Weekly scan found **2 P1 violations** — both are user-facing:

1. **City page `<title>` tag** (`pages/city/[slug].tsx` line 60) reads `"Estate Sales & Yard Sales in [City], [State]"` — auctions and flea markets absent from the title of every city SEO page. High SEO impact.
2. **Marketing skill framing** (`findasale-marketing/SKILL.md` line 49) — skill voice instruction anchors to "a neighbor who runs estate sales." Every piece of marketing content generated inherits this estate-sale-first lens.

Also 4 P2 findings (meta description omissions on cities, neighborhoods, map, and city directory subtext) and the map page has no empty state when 0 results.

**Note:** All 4 P3 code comment fixes from the 2026-05-12 audit were not applied and carry forward.

Full report: `claude_docs/audits/brand-drift-2026-05-19.md`

Dispatch `findasale-dev` for the P1 title fix + P2 meta batch + empty state.  
Dispatch `findasale-records` for the marketing skill framing fix.

---

## QA Remaining

From `claude_docs/audits/qa-plan-2026-05-18.md`:
- **#350** Nav Polish — shopper mobile viewport
- **Tier 2B eBay** (#428 #424 #425 #426 #427 #429) — needs PRO + eBay connected
- **Tier 2C Wave 2** (#413 #412 #356 #359 #415 #271)
- **Tier 3A Payments** (#285 #402 #289 #288 #406) — highest business value
- **#221 Hold-to-Pay flow** — after push: select hold → Mark Sold → modal + checkout URL
- **#29 Loyalty Passport, #58 Achievement Badges**
