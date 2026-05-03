# Patrick's Dashboard — Week of May 3, 2026 (updated S635)

## Next Session — S636

**Patrick must do before S636 starts:**
1. Push S635 block (below)
2. Run `prisma migrate deploy` for `20260628000000_add_shopper_organizer_introduction` (S635 migration)
3. Push S634 block (below) if not yet done
4. Push S633 block (below) if not yet done + `git rm .github/workflows/test-esn-api-access.yml`
5. Run `prisma migrate deploy` for `20260503100000_organizer_unique_source_ids` (googlePlaceId @unique)

**S636 goal: Email creative session.** Finalize all 4 outreach email templates — deferred 4 sessions now.

---

## Patrick Actions — Do Now (S635 Wrap)

### Step 1 — Push S635 changes
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/services/xpService.ts
git add packages/backend/src/services/referralService.ts
git add packages/backend/src/routes/organizers.ts
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260628000000_add_shopper_organizer_introduction/migration.sql"
git add packages/backend/src/services/achievementService.ts
git add "packages/frontend/pages/organizers/[id].tsx"
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(guild): S635 — organizer referral XP mechanic, schema, badges, founding shopper"
.\push.ps1
```

### Step 2 — Run S635 migration on Railway
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Patrick Actions — Still Outstanding (S634 Wrap)

### Step 1 — Push S634 changes
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/scripts/backfillFoursquareDetails.ts
git add packages/frontend/pages/organizers/[id].tsx
git add packages/frontend/pages/sales/[id].tsx
git add CLAUDE.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(retail): S634 — RETAIL scraper pipeline, founding shoppers UI, behavioral system overhaul, scrapedMetadata TS fix"
.\push.ps1
```

### Step 2 — Push S633 changes (if not done yet)
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add .github/workflows/scrape-estatesalesnet.yml
git add .github/workflows/scrape-craigslist.yml
git add .github/workflows/scrape-newspaper-rss.yml
git add .github/workflows/scrape-facebook-events.yml
git add .github/workflows/scrape-foursquare.yml
git add .github/workflows/scrape-google-places.yml
git add .github/workflows/scrape-here-places.yml
git add .github/workflows/scrape-osm-overpass.yml
git rm .github/workflows/test-esn-api-access.yml
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260503100000_organizer_unique_source_ids/migration.sql
git commit -m "fix(scraper): S633 — workflow fleet overhaul (concurrency, timeouts, cron stagger) + googlePlaceId @unique P1 fix"
.\push.ps1
```

### Step 3 — Run migration on Railway (googlePlaceId @unique)
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

### Step 4 — Run RETAIL backfill (after S634 deploys to Railway)
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\backend
$env:DATABASE_URL="postgresql://postgres:Qlzi9PdY34gG6H7zIVOBbJScz1V1sI2sicifzXhDM8@maglev.proxy.rlwy.net:13949/railway"
$env:FOURSQUARE_API_KEY="E303HBSVAIMR2O1UNO3YCBB3P4H4X53FYT4IMVAGZFB0ZDQ2"
npx ts-node scripts/backfillFoursquareDetails.ts
```

---

## What Happened This Week

**S635 — Organizer referral XP mechanic.** Full implementation: ShopperOrganizerIntroduction schema + migration, 7 new XP constants in xpService.ts, 3 XP award functions in referralService.ts (claimed storefront 200 XP / PRO upgrade 300 XP / quality tier 100 XP, all with Hunt Pass multiplier and monthly caps), claim approval wired to fire awardOrganizerClaimedXp, 4 Acquisition Specialist cosmetic badges, "Discovered by" amber section on organizer profiles. Railway SyntaxError crash (duplicate function declarations from two write passes) diagnosed and fixed. guild-primer.tsx already had the 3 new rows from the first agent dispatch. Memory rule added: all subagent dispatches must include git diff --stat verification.

**S634 — RETAIL scraper pipeline + founding shoppers + behavioral overhaul.** RETAIL listings now chain Foursquare Details API to pull hours, website, phone — stored in `scrapedMetadata.hours_display`. New `backfillFoursquareDetails.ts` script will enrich existing RETAIL listings once run against Railway. Organizer profile page now shows "Discovered by" amber section with founding shopper avatar stack. Behavioral system: CLAUDE.md §0 added (mandatory roadmap-first session start), conversation-defaults updated (friction gate — find info yourself before asking Patrick; push verification loop; evidence-based session gate), findasale-dev skill updated (mandatory acceptance criteria block). Also fixed Vercel build error: `scrapedMetadata` was missing from the Sale TypeScript interface.

**S633 — GitHub Actions workflow fleet overhaul + googlePlaceId @unique.** Full audit and repair of all 11 GH Actions scraper workflows. 8 workflows rewritten: all now have `concurrency` blocks. `scrape-estatesalesnet.yml` timeout extended 10→25 min. `scrape-newspaper-rss.yml` cron staggered to 02:30 UTC. `scrape-foursquare.yml` broken `METRO_BATCH` env var removed. All deprecated `*_ORGANIZER_ID` secrets removed. `test-esn-api-access.yml` flagged for `git rm`. P1 schema fix: `googlePlaceId String? @unique` + migration with dedup cleanup.

**S632 — Scraper fleet audit + P0/P1 fixes.** P0: cross-source dedup fix (`getOrCreateScrapedOrganizer` now checks googlePlaceId → foursquareVenueId → hereBusinessId → normalized name). P1: 502/503 retry on all 9 runner scripts (3× exponential backoff).

**S631 — Foursquare Places API migration fix.** New endpoint, new auth format, city doubling bug, 11× API waste, error body reads — all fixed. 1,322 businesses scraped in production test.

**S630 — Schema drift repair, storefront 500 fixed.** Restored 3 missing models (ClaimRequest, SaleShareLink, SaleShareLinkClick) + multiple missing fields stripped during S624/S625 syncs.

---

## Open Audit Findings

### ✅ Weekly Site Audit — 2026-05-02 — ALL P0/P1 RESOLVED (S627)

- ✅ C-001: Scraped sale pages "Sale not found" — fixed
- ✅ H-001: Items buried below map — fixed
- ✅ H-002: Images blank platform-wide — fixed
- ✅ H-003: City hub pages 404 for scraped cities — fixed

**Still open (P2):** Horizontal overflow on pricing/sale detail/guide/home. Workspace empty state near-invisible in dark mode. Org messages copy organizer-only.

### Known open bugs

- Every `/items/[id]` returns 500 — pre-existing
- Sale page social previews blank — likely missing `INTERNAL_API_URL` in Vercel
- Hunt Pass shows "Inactive" in one place while "Active" in another
- Tier-lapse warning banner is red and dismissible instead of sticky amber

---

## This Week's Priority

1. **Email creative session (S635)** — 4 outreach templates, pure creative
2. **Sign up HERE API** — developer.here.com → add `HERE_API_KEY` GitHub Secret (overdue since S625)
3. **Send 19 Gmail outreach drafts** — Nick Loper, Codie Sanchez, trade associations

## Action Items for Patrick

- [ ] **Push S634 block** — see Step 1 above
- [ ] **Push S633 block** — see Step 2 above (still outstanding)
- [ ] **Run migration** for googlePlaceId @unique — see Step 3 above
- [ ] **Run RETAIL backfill** after S634 deploys — see Step 4 above
- [ ] **Sign up HERE API** at developer.here.com → add `HERE_API_KEY` GitHub Secret
- [ ] **Review and send 19 outreach drafts** in Gmail
