# Patrick's Dashboard — S710

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| OUTREACH_ENABLED | ✅ TRUE — 197 high-confidence cohort live |
| Pool (post-backfill) | COLD=32,530 / WARM=5,663 / HOT=215 / SUPPRESSED=3,498 |
| Wave 2 features | ✅ 12 features shipped — Pending Chrome QA |
| settings.tsx build fix | ✅ eBay tab JSX + Help tab restored |
| [id].tsx build fix | ✅ Stray brace removed |
| create-sale.tsx fix | ✅ Apostrophe escaped (prior session) |
| AR Phase 2 | ❌ Dead source — AR SOS blocks GH Actions IPs |
| MS Phase 2 | ❌ Dead source — MS SOS API returns 404 |
| Canada411 | ❌ Dead source — URL format 404 everywhere |
| MT licensing | ❌ 401 — INTERNAL_API_TOKEN secret mismatch (Patrick fix needed) |

---

## Wave 2 Features — Pending Chrome QA

| # | Feature | QA Priority |
|---|---------|-------------|
| 412 | Cash-to-Digital Bridge (Venmo/Zelle in settings) | HIGH |
| 402 | Cover the Fee toggle (sale creation) | HIGH |
| 411 | Dorm Dash sale type | HIGH |
| 416 | Sale Floor Map (room navigation) | HIGH |
| 405 | Founding Organizer Badge (profile) | MED |
| 407 | Flip Tracker ROI Dashboard | MED |
| 403 | Family Bundle Pricing | MED |
| 406 | Split-the-Bill POS | MED |
| 413 | Physical Safety & Liability Disclosures | MED |
| 414 | Grief Firewall (estate sensitivity mode) | MED |
| 415 | Junk Drawer Donation Kit | LOW |
| 369 | Quebec Bill 96 block at signup | LOW |

---

## Patrick Actions Needed

**MT secret fix (5 min):**
1. Railway dashboard → backend service → Variables → find `INTERNAL_API_KEY` → copy value
2. GitHub → repo Settings → Secrets and variables → Actions → `INTERNAL_API_TOKEN` → update to match
3. Re-run "Scrape Montana Auctioneer Licenses" workflow → confirm 200

---

## Wrap Push Block

```powershell
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "docs: S710 wrap — Wave 2 Vercel fixes, roadmap updated (12 items shipped)"
.\push.ps1
```
