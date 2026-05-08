# Patrick's Dashboard — S696 Wrap

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| Google OAuth | ⚠️ Still broken (root cause unclear) |
| Login (email/password) | ✅ Working |
| MCP Server (mcp.finda.sale) | ✅ LIVE — 7 tools |
| Google Places API | ✅ STRIPPED — code removed, cron disabled, key needs manual deletion |
| Foursquare scraper | ✅ SAFE — Sandbox plan, 9,450 free calls, cron re-enabled |
| HERE scraper | ✅ FREE — 250K/month free tier |
| Metro coverage | ✅ 301 metros (all 50 states + DC) |
| Scraper throughput | ✅ FIXED — GitHub Actions matrix (6 parallel jobs, ~10-15 min/run) |
| Indiana licensing | ✅ WIRED — isStateLicensed will populate on next scraper run |
| Source tracking | ✅ FIXED — directoryMostRecentSource now populates on all scraper upserts |
| HOT lead count | 🟡 0 now → 200–500 after Indiana scraper runs post-push |
| Email discovery service | ❌ NOT BUILT — spec exists, paid refs need stripping |
| MailerLite sequences | ❌ NOT WIRED — dispatch ready for next session |
| #174 Auction QA | 🟡 Bid fix on disk (S693). Push items/[id].tsx → re-run QA |

---

## What Happened This Session (S696)

- **Innovation + Architect** ran on 5 scraper infrastructure problems. Full analysis saved to `claude_docs/research/innovation-scraper-throughput-2026-05-08.md`.
- **Indiana scraper fixed** — 31 merge conflict markers resolved. `isStateLicensed: true`, `licenseState: 'IN'`, and `licenseNumber` now set on every organizer the Indiana scraper creates/finds. 200–500 organizers will reach HOT tier after next run.
- **Source tracking wired** — `scraper/index.ts` now writes `directoryMostRecentSource` on every Foursquare, HERE, and OSM upsert. Admin scrape pool dashboard will show data source going forward.
- **GitHub Actions matrix** — Both Foursquare and HERE scrapers now run as 6 parallel jobs. 301 metros in ~10–15 minutes instead of dying at ~550 calls/60 min. Script files updated with batch-slicing logic.
- **TS check: ✅ zero errors** on all changes.

---

## Patrick Actions Needed (push in this order)

**Step 1 — S696 (this session — do first):**
```powershell
git add packages/backend/src/services/scraper/sources/indianaLicensingScraper.ts
git add packages/backend/src/services/scraper/index.ts
git add .github/workflows/scrape-foursquare.yml
git add .github/workflows/scrape-here-places.yml
git add packages/backend/src/scripts/run-foursquare-places.ts
git add packages/backend/src/scripts/run-here-places.ts
git add claude_docs/research/innovation-scraper-throughput-2026-05-08.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S696: Indiana licensing fix + source tracking + GitHub Actions matrix throughput"
.\push.ps1
```

**Step 2 — S695 (⚠️ skip scrape-foursquare.yml — already in S696 above):**
```powershell
git add packages/backend/src/services/scraper/enrichment.ts
git add packages/backend/src/services/scraper/sources/googlePlaces.ts
git add packages/backend/src/controllers/adminController.ts
git add packages/backend/src/routes/admin.ts
git add packages/frontend/pages/admin/scrape-pool.tsx
git add .github/workflows/scrape-google-places.yml
git add claude_docs/strategy/outreach-email-strategy.md
git add claude_docs/strategy/email-discovery-spec.md
git commit -m "S695: strip Google Places, expand metros 100→301, fix admin stats, scrape pool dashboard"
.\push.ps1
```

⚠️ **Also delete `GOOGLE_PLACES_API_KEY` manually from:**
- Railway → findasale-backend → Variables tab
- GitHub → repo Settings → Secrets → Actions

**Step 3 — S694:**
```powershell
git add packages/backend/src/services/discoveryService.ts
git add packages/backend/src/routes/users.ts
git add packages/frontend/pages/shopper/settings.tsx
git commit -m "S694: Geo bounding box feed fix + display name editing + admin role sync"
.\push.ps1
```

**Step 4 — S693 bid fix + QA:**
```powershell
git add "packages/frontend/pages/items/[id].tsx"
git commit -m "fix: bid API field name bidAmount → maxBidAmount (ADR-013 contract)"
.\push.ps1
```
Wait 2–3 min for Vercel, then QA #174: login user12@example.com / Seedy2025! → finda.sale/sales/c5hykxxecanngwcrkvq92n1va

**Step 5 — S691 (git rm commands first):**
```powershell
git rm ".github/workflows/scrape-nc-licensing.yml"
git rm "packages/backend/src/services/scraper/sources/westVirginia LicensingScraper.ts"
git add .github/workflows/scrape-north-carolina-licensing.yml
git add packages/backend/src/services/scraper/sources/texasLicensingScraper.ts
git add claude_docs/strategy/roadmap.md
git commit -m "S691: TX Socrata rewrite, NC yml rename, WV duplicate removal"
.\push.ps1
```

**Step 6 — S689 Chrome QA fixes:**
```powershell
git add packages/backend/src/routes/organizers.ts
git add packages/frontend/components/CheckoutModal.tsx
git add packages/frontend/components/BoostPurchaseModal.tsx
git add packages/frontend/components/CSVImportModal.tsx
git add packages/frontend/components/DisputeForm.tsx
git commit -m "S689: Dashboard lapse fix, WCAG ARIA (4 components)"
.\push.ps1
```

---

## Next Session (S697) — Top Priorities

1. **Batch 2 dispatches** — Strip paid refs from email-discovery-spec.md, 50-state licensing URL corrections (18 states), MailerLite group wiring
2. **QA #174 Auction** — after S693 push deploys
3. **emailDiscoveryService.ts** — schema migration + free pipeline implementation
