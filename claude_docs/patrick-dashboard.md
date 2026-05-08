# Patrick's Dashboard — S693 Wrap

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| Google OAuth | ⚠️ Still broken (root cause unclear) |
| Login (email/password) | ✅ Working |
| MCP Server (mcp.finda.sale) | ✅ LIVE — 7 tools |
| Organizer DB | ✅ 7,897 scored — COLD=3,235 WARM=4,662 HOT=0 ENTERPRISE=0 |
| Lead scoring service | ✅ LIVE — backfill done, weekly cron wired |
| #174 Auction QA | 🟡 Data seeded, bid fix on disk. Push items/[id].tsx → re-run QA |
| Workflow YMLs | ⚠️ Local only — need Patrick git push (S691 block) |

---

## What Happened This Session (S693)

- Seeded 5 auction items on user2's production auction sale (sale ID: `c5hykxxecanngwcrkvq92n1va`): Art Deco Brooch ($150), Signed First Edition Novel ($500), Victorian Silver Pocket Watch ($75), Vintage Brass Compass ($25), Vintage Brass Compass Reverse Auction ($120 drops $15/day, floor $45).
- QA run found two bugs and fixed both:
  1. **Bid field mismatch** — frontend sent `bidAmount`, backend (ADR-013) expects `maxBidAmount`. Every bid → 400. Fixed in `items/[id].tsx` line 259. **On disk, needs push.**
  2. **draftStatus filter** — 2 items were DRAFT/APPROVED instead of PUBLISHED, so `PUBLIC_ITEM_FILTER` hid them. Fixed directly in DB — all 5 items visible immediately.

---

## Patrick Actions Needed

**Step 1 — Push the bid fix:**
```powershell
git add "packages/frontend/pages/items/[id].tsx"
git commit -m "fix: bid API field name bidAmount → maxBidAmount (ADR-013 contract)"
.\push.ps1
```

**Step 2 — After Vercel deploys (~3 min), re-run #174 QA:**
- Login as user12@example.com / Seedy2025! (shopper)
- Go to: https://finda.sale/sales/c5hykxxecanngwcrkvq92n1va
- Verify all 5 items visible
- Bid $30 on "Vintage Brass Compass" ($25 start, $5 increments)
- Check "Vintage Brass Compass (Reverse Auction)" — should show ~$75
- Switch to user2@example.com (organizer) — verify bid shows in dashboard

**Step 3 — Push S691 scraper block + docs:**
```powershell
git rm ".github/workflows/scrape-nc-licensing.yml"
git rm "packages/backend/src/services/scraper/sources/westVirginia LicensingScraper.ts"
git add .github/workflows/scrape-north-carolina-licensing.yml
git add packages/backend/src/services/scraper/sources/texasLicensingScraper.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "S691+S693: TX Socrata rewrite, NC yml rename, WV removal, #174 bid fix docs"
.\push.ps1
```

---

## Next Session (S694)

1. Verify #174 QA passes after Vercel deploy (bid flow + reverse auction)
2. Lead scoring recalibration — HOT/ENTERPRISE thresholds need tuning
3. Trigger Indiana + OSM scrapers manually, watch Railway logs
4. Louisiana + Illinois licensing scrapers
5. Continue 50-state scraper URL-correction batch
