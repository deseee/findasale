# Patrick's Dashboard — Week of May 3, 2026 (S635 Complete)

## Next Session — S636

**Primary goal: Email creative session.** Finalize all 4 outreach email templates — deferred 4 sessions now (S632→S633→S634→S635).

**Patrick must do before S636 starts:**
1. Push S635 block (organizer referral XP mechanic)
2. Run `prisma migrate deploy` for `20260628000000_add_shopper_organizer_introduction`
3. Push S634 block if not yet done (RETAIL scraper + founding shoppers + behavioral overhaul)
4. Push S633 block if not yet done (8 workflows + googlePlaceId @unique)
5. `git rm .github/workflows/test-esn-api-access.yml` in S633 push
6. Run `prisma migrate deploy` + `prisma generate` for googlePlaceId @unique constraint

---

## Action Items for Patrick (Do Now)

### Step 1 — Push S635 Changes
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/services/xpService.ts
git add packages/backend/src/services/referralService.ts
git add packages/backend/src/routes/organizers.ts
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260628000000_add_shopper_organizer_introduction/migration.sql"
git add packages/backend/src/services/achievementService.ts
git add packages/frontend/pages/organizers/[id].tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(guild): S635 — organizer referral XP mechanic, schema, badges, founding shopper"
.\push.ps1
```

### Step 2 — Run S635 Migration on Railway
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## Outstanding Actions from Previous Sessions

### From S634 — Push RETAIL Scraper Changes (if not done)
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/scripts/backfillFoursquareDetails.ts
git add packages/frontend/pages/organizers/[id].tsx
git add packages/frontend/pages/sales/[id].tsx
git add CLAUDE.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(retail): S634 — RETAIL scraper pipeline, founding shoppers UI, behavioral overhaul"
.\push.ps1
```

### From S634 — Run RETAIL Backfill (after S634 deploys to Railway)
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\backend
$env:DATABASE_URL="postgresql://postgres:Qlzi9PdY34gG6H7zIVOBbJScz1V1sI2sicifzXhDM8@maglev.proxy.rlwy.net:13949/railway"
$env:FOURSQUARE_API_KEY="E303HBSVAIMR2O1UNO3YCBB3P4H4X53FYT4IMVAGZFB0ZDQ2"
npx ts-node scripts/backfillFoursquareDetails.ts
```

### From S633 — Push Workflow Fleet Overhaul (if not done)
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
git commit -m "fix(scraper): S633 — workflow fleet overhaul (concurrency, timeouts, stagger) + googlePlaceId @unique"
.\push.ps1
```

### From S633 — Run Migration on Railway
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## This Week's Work Summary

**S635 — Organizer Referral XP Mechanic (COMPLETE)**

Full implementation of the organizer referral XP economy. Schema: New `ShopperOrganizerIntroduction` model (shopperId, organizerId, introducedAt, claimedAt, upgradedAt, qualityAt). xpService.ts: 7 new XP constants (200–300 XP per action). referralService.ts: 3 award functions (claimed storefront, PRO upgrade, quality tier) with Hunt Pass 1.5× multiplier and monthly caps. organizers.ts: claim approval fires awardOrganizerClaimedXp. achievementService.ts: 4 Acquisition Specialist cosmetic badges. organizers/[id].tsx: "Discovered by" amber section with founding shopper avatars. Migration applied. TypeScript: zero errors. Memory: subagent write verification gate added.

---

## Latest Status from Recent Sessions

**S634 — RETAIL Scraper + Founding Shoppers + Behavioral Overhaul (COMPLETE)**
- RETAIL listings chain Foursquare Details API (hours, website, phone)
- New backfillFoursquareDetails.ts script for enrichment
- Organizer profile shows "Discovered by" founding shoppers
- CLAUDE.md §0: mandatory session start ritual
- Fixed Vercel build: scrapedMetadata added to Sale interface

**S633 — GitHub Actions Workflow Fleet Overhaul + googlePlaceId @Unique (COMPLETE)**
- 8 workflows rewritten with concurrency blocks
- scrape-estatesalesnet.yml: timeout 10→25 min
- scrape-newspaper-rss.yml: cron stagger 02:00→02:30 UTC
- Deprecated *_ORGANIZER_ID secrets removed
- P1 schema fix: googlePlaceId @unique + dedup migration
- test-esn-api-access.yml flagged for removal

**S632 — Scraper Fleet Audit + P0/P1 Fixes (COMPLETE)**
- P0 dedup: cross-source ID chain (Google → Foursquare → HERE → name)
- P1 retry: 502/503 exponential backoff on all 9 runners
- htmlParser.ts extended with venue IDs

**S631 — Foursquare Places API Migration (COMPLETE)**
- Foursquare endpoint/auth modernized (api.foursquare.com → places-api.foursquare.com)
- 1,322 businesses scraped in production test
- Cold-start 502 issue identified (backend sleep under concurrent load)

---

## Open Blockers & Known Issues

**P1 (pre-existing, not blocking):**
- All `/items/[id]` return 500 SSR (pre-S599 regression)

**P2 (known, not urgent):**
- Sale social previews missing og:image/title/description
- Tier-lapse plan card stays teal instead of amber when lapsed
- Hunt Pass "Inactive" vs "Active" copy inconsistency

**Carryover Actions:**
- [ ] Push S635 block (see Step 1 above)
- [ ] Run S635 migration (see Step 2 above)
- [ ] Push S634 block (if outstanding)
- [ ] Run RETAIL backfill (after S634 deploys)
- [ ] Push S633 block (if outstanding)
- [ ] `git rm test-esn-api-access.yml` (in S633 push)
- [ ] Run S633 migration for googlePlaceId @unique
- [ ] **Sign up HERE API** at developer.here.com → add `HERE_API_KEY` GitHub Secret (since S625)
- [ ] Send 19 Gmail outreach drafts (Nick Loper, Codie Sanchez, trade associations)

---

## S636 Preview

**Goal:** Email creative session. No code. Pure copywriting for 4 outreach email templates.

**Resources:**
- Strategy doc: `claude_docs/strategy/organizer-acquisition-strategy.md`
- Business guru brief: value-first positioning, Ogilvy one-person rule, curiosity gap, specificity=credibility
- Constraints: 4–6 sentences, one CTA, no "AI" language, CAN-SPAM compliant

**Expected outcome:** 4 final email templates ready for outreach launch.

