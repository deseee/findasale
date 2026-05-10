# Patrick's Dashboard — S711

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| OUTREACH_ENABLED | ✅ TRUE — 197 high-confidence cohort live |
| Pool (post-backfill) | COLD=32,530 / WARM=5,663 / HOT=215 / SUPPRESSED=3,498 |
| Wave 2 Chrome QA | 🔴 IN PROGRESS — see table below |
| Sale wizard (Dorm Dash) | 🔴 P0 CRASH — DORM_DASH type crashes wizard |
| Wave 2 edit-sale fields | 🔴 MISSING — 6 features not in edit-sale |
| Leaderboard | 🟡 P2 — "Failed to load leaderboard data" |
| AR Phase 2 | ❌ Dead source |
| MS Phase 2 | ❌ Dead source |
| Canada411 | ❌ Dead source |
| MT licensing | ❌ 401 — INTERNAL_API_TOKEN secret mismatch (Patrick fix needed) |

---

## Wave 2 QA Results (S711)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 406 | Split-the-Bill POS | ✅ VERIFIED | Both persons paid, counter correct |
| 407 | Flip Tracker ROI | ⚠️ PARTIAL | Cost Basis input works; ROI needs sold items to display |
| 412 | Cash Bridge (Venmo/Zelle) | 🔄 DECISION MADE | Rebuild: POS buttons + Stripe fee. Remove from Settings. |
| 402 | Cover the Fee | 🔄 DECISION MADE | Restrict to Auction sale type only |
| 411 | Dorm Dash | 🔴 BLOCKED | P0 wizard crash on DORM_DASH selection |
| 416 | Sale Floor Map | 🔴 BLOCKED | Not in /organizer/edit-sale |
| 413 | Safety Notes | 🔴 BLOCKED | Not in /organizer/edit-sale |
| 414 | Grief Firewall | 🔴 BLOCKED | Not in /organizer/edit-sale |
| 415 | Donation Kit | 🔴 BLOCKED | Not in /organizer/edit-sale |
| 403 | Bundle Pricing | 🔴 BLOCKED | Not in /organizer/edit-sale |
| 405 | Founding Badge | ⬜ UNVERIFIED | No display surface found (profile/storefront/leaderboard) |
| 369 | Quebec block | ⬜ UNVERIFIED | Needs Quebec test user |

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
git commit -m "docs: S711 wrap — Wave 2 Chrome QA results, P0 Dorm Dash crash, product decisions"
.\push.ps1
```
