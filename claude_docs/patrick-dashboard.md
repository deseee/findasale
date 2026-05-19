# Patrick's Dashboard — Week of May 19, 2026

---

## What Happened This Week

**S766 (latest — QA sweep + 3 bug fixes):** Tier 2C/3A QA. Fixed: #363 lot number input in auction form, #58 achievement event hooks (4 event types were never wiring to the achievement service), #221 shopper holds checkout link (was 404) + button overflow. Verified: #356 #271 #29 #289 #402 #285 #406 #288 #350. eBay bugs #424/#425/#426 confirmed by Patrick — queued for next session. Test data seeded in Railway DB.

**S765:** Sentry/CI health audit. Backend Sentry 36 → 0 unresolved. Fixed hooks violations (5 pages), MutationCache onError, enrichment + geocoding fire-and-forget, FB Events address parsing, workspace Prisma error.

**S764:** 18 items verified. Found P1s #363 (lot number) and #439 (SSR query — already fixed, closed).

**S763:** Low-token doc audit cleared 22 stale roadmap entries. Fixed 5 bugs: Flip Report tier gate, login error, Hold-to-Pay wiring, GEO JSON-LD SSR, ENDED noindex.

---

## Pipeline Status

- **Outreach:** Running at warmup pace (~48/day). ✅
- **Queue:** 3,319 PENDING organizers. Pipeline healthy.
- **Source attribution:** 87.7% tagged. ✅
- **WARM enrichment:** Now running daily (was weekly). ✅

---

## Action Items for Patrick

### 1. Push everything (S763–S766):
```powershell
git add packages/frontend/pages/organizer/flip-report/[saleId].tsx
git add packages/frontend/pages/login.tsx
git add packages/frontend/pages/organizer/holds.tsx
git add packages/frontend/pages/sales/[id].tsx
git add packages/frontend/pages/organizer/message-templates.tsx
git add packages/frontend/pages/coupons.tsx
git add packages/frontend/pages/organizer/payouts.tsx
git add packages/frontend/pages/organizer/webhooks.tsx
git add packages/frontend/pages/shopper/rare-finds.tsx
git add packages/frontend/pages/shopper/holds.tsx
git add packages/frontend/pages/_app.tsx
git add packages/frontend/sentry.client.config.ts
git add packages/frontend/pages/organizer/add-items/[saleId].tsx
git add packages/backend/src/controllers/internalListingEnrichmentController.ts
git add packages/backend/src/controllers/internalGeocodingController.ts
git add packages/backend/src/controllers/internalScraperController.ts
git add packages/backend/src/controllers/workspaceController.ts
git add packages/backend/src/controllers/rsvpController.ts
git add packages/backend/src/controllers/itemController.ts
git add packages/backend/src/controllers/posPaymentController.ts
git add packages/backend/src/index.ts
git add packages/backend/src/services/referralService.ts
git add packages/backend/src/services/scraper/sources/search-facebook-events.ts
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260628100000_add_missing_indexes/migration.sql
git add claude_docs/strategy/roadmap.md
git add claude_docs/audits/qa-status-reconciliation-2026-05-18.md
git add claude_docs/audits/qa-plan-2026-05-18.md
git add claude_docs/audits/geo-verification-2026-05-18.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: lot number input auction form (#363); fix: achievement hooks (#58); fix: hold card checkout + overflow (#221); fix: hooks, Sentry, fire-and-forget, FB Events, workspace Prisma"
.\push.ps1
```

### 2. Run migration after push:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

### 3. Pending (when ready):
- [ ] **Run S760 migrations** (CrawlerVisit + geo_demand_waitlist_confidence) — still pending
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

- **eBay #424** — still broken, needs dev dispatch
- **eBay #425** — two bugs: toast intermittent + stale price sent to eBay when price edited but not saved first
- **eBay #426** — not working, needs dev dispatch
- **#413 Safety Disclosures** — test data seeded, needs Patrick present to QA
- **#415 Donation Kit** — test data seeded (ended sale with 3 unsold items), needs Patrick present
- **#428 #427 #429** — remaining eBay Tier 2B items, needs PRO + eBay connected + Patrick present

**Note:** artifactmi@gmail.com can be used for Chrome QA but Patrick must be present at the keyboard for Google OAuth steps.
