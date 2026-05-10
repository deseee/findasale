# Patrick's Dashboard — S709

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| OUTREACH_ENABLED | ✅ TRUE — 197 high-confidence cohort live |
| Pool (post-backfill) | COLD=32,530 / WARM=5,663 / HOT=215 / SUPPRESSED=3,498 |
| Connection pool fix | ✅ SHIPPED — all 41 Phase 2 ymls capped at 3 connections |
| WI Phase 2 | ✅ 11 DSPS auctioneers upserted (NMLS removed — blocked from GH Actions) |
| IA Phase 2 | ✅ Running clean |
| LA Phase 2 | ⚠️ Running (793+ NOLA rows in flight at wrap — connection fix held, expect clean finish) |
| AR Phase 2 | ❌ Dead source — AR SOS blocks GH Actions IPs (exits 0, no records) |
| MS Phase 2 | ❌ Dead source — MS SOS API returns 404 (exits 0, no records) |
| Canada411 | ❌ Dead source — URL format returns 404 everywhere |
| MT licensing (Phase 1) | ❌ 401 — INTERNAL_API_TOKEN secret mismatch (Patrick fix needed) |
| #251 SaleCard Sale badge | ✅ SHIPPED S708 |
| #174 auctionIsOver | ✅ SHIPPED S708 |

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
git commit -m "docs: S709 wrap — outreach live, connection pool fix, Phase 2 smoke tests"
.\push.ps1
```
