# PROJECT STATE

FindA.Sale is a two-sided marketplace PWA for secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) connecting them with shoppers. Backend: Node.js/Prisma/PostgreSQL on Railway. Frontend: Next.js on Vercel. Mobile: React Native (future).

## Current Status

**Latest: S635 — Organizer Referral XP Mechanic (COMPLETE)**

Full implementation shipped: ShopperOrganizerIntroduction schema model + migration, 7 new XP constants (200–300 XP per action), 3 award functions in referralService with Hunt Pass 1.5× multiplier and monthly caps (1000 XP cap on claimed storefront), claim approval endpoint wired to fire awardOrganizerClaimedXp, 4 Acquisition Specialist cosmetic badges, "Discovered by" amber section on organizer profiles with founding shopper avatar stack. Migration applied. Railway SyntaxError crash (duplicate functions from two write passes) diagnosed and fixed. guild-primer.tsx already had 3 new rows. TypeScript: zero errors.

---

## Recent Sessions (S631–S635)

### S635 — Organizer Referral XP Mechanic
**COMPLETE — Integration: schema, services, UI, achievements**

Implemented full organizer referral economy. New `ShopperOrganizerIntroduction` model tracks which shopper introduced which organizer (unique compound key). xpService.ts gained 7 constants (SHOPPER_INTRODUCED, ORGANIZER_REFERRAL_PRO_UPGRADE, ORGANIZER_REFERRAL_QUALITY_TIER, DISCOVERY_MANUAL, SCOUT_LEADERBOARD tiers, monthly ORGANIZER_CLAIMED cap). referralService.ts added 3 award functions checking monthly caps and applying Hunt Pass multiplier. organizers.ts claim approval endpoint now fires XP awards. achievementService.ts gained 4 cosmetic badges. organizers/[id].tsx now displays founding shoppers. Memory: subagent write verification gate documented.

**Files changed (7):** xpService, referralService, organizers.ts, schema.prisma, migration 20260628, achievementService, organizers/[id].tsx

**Patrick actions:** (1) Push S635 block. (2) Run `prisma migrate deploy` for 20260628 migration.

---

### S634 — RETAIL Scraper Pipeline + Founding Shoppers + Behavioral Overhaul
**COMPLETE — Data pipeline: Foursquare enrichment + UI + docs**

(1) RETAIL scraper chain: added `fetchFoursquareDetails()` in foursquarePlaces.ts to pull hours, website, phone for RETAIL listings, stored in `scrapedMetadata`. sales/[id].tsx now shows "Permanent Storefront · Always Open" + hours block for RETAIL. New backfillFoursquareDetails.ts script enriches existing RETAIL listings (requires Railway DATABASE_URL override + FOURSQUARE_API_KEY). (2) Organizer profile "Discovered by" amber section displays founding shopper avatars. (3) Behavioral system improvements: CLAUDE.md §0 added (mandatory session start: read STATE.md → roadmap → present top 3 items), conversation-defaults updated (friction gate, push verification, evidence-based gates), findasale-dev skill updated (mandatory acceptance criteria block). (4) Vercel build fix: added `scrapedMetadata?: Record<string, unknown> | null` to Sale interface.

**Files changed (7):** foursquarePlaces.ts, osmOverpass.ts, scraper/index.ts, sales/[id].tsx (×2), backfillFoursquareDetails.ts (NEW), organizers/[id].tsx, CLAUDE.md

**Patrick actions:** (1) Push S634 block. (2) After deploy, run backfill script with Railway DATABASE_URL + FOURSQUARE_API_KEY.

---

### S633 — GitHub Actions Workflow Fleet Overhaul + googlePlaceId @Unique P1 Fix
**COMPLETE — Operational: concurrency, timeouts, dedup schema constraint**

Full audit and repair of 11 GitHub Actions workflows. (1) **8 workflows rewritten:** All now have `concurrency` blocks (cancel-in-progress: false, keyed by workflow name). scrape-estatesalesnet.yml timeout extended 10→25 min (confirmed ~19 min in prod). scrape-newspaper-rss.yml cron staggered 02:00→02:30 UTC (avoids clash with Google Places on 1st at 02:00). scrape-foursquare.yml broken METRO_BATCH env var removed. All deprecated *_ORGANIZER_ID secrets removed. (2) **P1 schema fix:** `googlePlaceId String? @unique` on Organizer (was String? without constraint). Migration 20260503100000 created: dedup DELETE (keeps lowest id), DROP old non-unique index, CREATE UNIQUE INDEX IF NOT EXISTS. (3) test-esn-api-access.yml flagged for `git rm` (stale/redundant). TypeScript: zero errors. Bug fix agent dispatched for /items/[id] 500, OG meta missing, Hunt Pass status, tier-lapse banner — fixes still pending.

**Files changed (10):** All 8 GH Actions workflow files, schema.prisma (googlePlaceId @unique), migration 20260503100000 (NEW)

**Patrick actions:** (1) Push S633 block. (2) `git rm .github/workflows/test-esn-api-access.yml` in same commit. (3) Run `prisma migrate deploy` + `prisma generate` on Railway for @unique constraint.

---

### S632 — Scraper Fleet Audit + P0/P1 Fixes (Dedup + Retry)
**COMPLETE — Data integrity: cross-source dedup, network resilience**

Three parallel audits on workflows, dedup logic, API health. **P0 dedup fix:** `getOrCreateScrapedOrganizer()` previously checked only googlePlaceId → name+city, creating 3 Organizer rows for same business across Google/HERE/Foursquare. Fixed: lookup chain: googlePlaceId → foursquareVenueId → hereBusinessId → normalized name. Added `normalizeName()` helper. Backfill: when match found via one ID, missing cross-source IDs written to existing record. htmlParser.ts ParsedListing extended with foursquareVenueId + hereBusinessId. **P1 retry fix:** All 9 runner scripts now have 502/503 exponential backoff retry (3×: 2s/4s/8s delay) + network error retry. **Still pending:** googlePlaceId @unique constraint (addressed in S633).

**Files changed (11):** scraper/index.ts (dedup + normalizeName), htmlParser.ts, all 9 run-*.ts scripts (retry logic)

---

### S631 — Foursquare Places API Migration Fix
**COMPLETE — Data source: API endpoint/auth/parsing modernized**

Foursquare migrated entire Places API (old `api.foursquare.com/v3` → new `places-api.foursquare.com`). Four bugs fixed: (1) 401 Invalid token — new endpoint requires `Authorization: Bearer <key>` + `X-Places-Api-Version: 2025-06-17` header. Fields changed (fsq_id→fsq_place_id, city→location.locality, closed_bucket removed, lat/lng top-level). (2) City doubling "Chicago, Chicago, IL" — extract state code from metro, use `${subArea}, ${state}`. (3) 11× API waste — script called runFoursquareScraper([location]) which ran all 11 queries per location; fixed to single query via QUERY_TYPE_TO_SEARCH lookup. (4) Unreadable error bodies — response.text() threw due to AbortSignal timeout; fixed with Promise.race + 5s fallback. **Confirmed live:** 1,322 businesses scraped, 50/50 succeeded. Cold-start issue found: first 5 of 53 ingest batches returned 502 (backend sleeping under concurrent load). Wakes after 1–2s; batches 6+ succeeded. Fix: add 502 retry to all scraper runners (handled in S632).

**Files changed (2):** foursquarePlaces.ts (complete rewrite), run-foursquare-places.ts (subArea fix + single-query)

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| /items/[id] 500 (pre-existing) | Chrome QA not run | Browser test + stack trace from Vercel logs | S627 |
| Sale social previews blank | Likely missing INTERNAL_API_URL in Vercel | Env var verification | S628 |
| Hunt Pass "Inactive" vs "Active" inconsistency | Not Chrome-tested | Browser verification across views | S627 |
| Tier-lapse banner (red/dismissible vs amber/sticky) | Production state unverified | Chrome test of tier-lapse-test account | S627 |

---

## Next Session — S636

**Primary goal: Email creative session.** Finalize all 4 outreach email templates. Deferred 4 sessions now (S632→S633→S634→S635). No more code blockers — this session is pure creative copywriting.

**Patrick must do before S636 starts:**
1. Push S635 block (referral XP + CLAUDE.md updates + wrap docs)
2. Run `prisma migrate deploy` for 20260628 migration
3. Push S634 block (backfill script + founding shoppers + behavioral updates) — if not yet done
4. Push S633 block (8 workflows + schema @unique) — if not yet done
5. `git rm .github/workflows/test-esn-api-access.yml` in S633 push
6. Run `prisma migrate deploy` + `prisma generate` for googlePlaceId @unique constraint

**After S635 push deploys, run backfill:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\backend
$env:DATABASE_URL="postgresql://postgres:Qlzi9PdY34gG6H7zIVOBbJScz1V1sI2sicifzXhDM8@maglev.proxy.rlwy.net:13949/railway"
$env:FOURSQUARE_API_KEY="E303HBSVAIMR2O1UNO3YCBB3P4H4X53FYT4IMVAGZFB0ZDQ2"
npx ts-node scripts/backfillFoursquareDetails.ts
```

**Email context (don't re-derive):**
- Strategy doc: `claude_docs/strategy/organizer-acquisition-strategy.md`
- Touch 1 subject line UNLOCKED: write what earns the open
- S629 best draft leads with organizer pain (T1), pricing (T3), QR checkout (T4)
- Business guru brief: Hormozi value-first, Ogilvy one-person rule, curiosity gap, specificity=credibility, high you/I ratio
- Constraints: SHORT (4–6 sentences), one CTA, no "AI" language, inclusive sale types, no fabricated stats, CAN-SPAM compliant

**Other pending work (after emails):**
- Sign up HERE API at developer.here.com → add `HERE_API_KEY` GitHub Secret (outstanding since S625)
- Send 19 Gmail outreach drafts (Nick Loper, Codie Sanchez, NAA ×2, NASMM, ISA, NESA, etc.)
- P2 brand drift batch (8 items — single dev dispatch)
- Pre-existing open bugs: /items/[id] 500, sale social previews blank, Hunt Pass status inconsistency, tier-lapse banner styling

---

## Reference — Passwords & Test Accounts

**All test accounts use password:** `Seedy2025!`

| Account | Role | Tier | Notes |
|---------|------|------|-------|
| user1 (Alice) | Organizer | TEAMS | Full feature access |
| user2 (Bob) | Organizer | PRO | Standard organizer |
| user6 | Organizer | FREE | Charity sale owner |
| tier-lapse-test | Organizer | PRO | Past due (test lapsed state) |
| low-xp-shopper | Shopper | - | 10 XP (test low inventory) |

---

## Reference — Critical Credentials & URLs

**Railway Database (internal):** `postgresql://postgres:Qlzi9PdY34gG6H7zIVOBbJScz1V1sI2sicifzXhDM8@postgres.railway.internal:5432/railway`

**Railway Database (public proxy for local migration commands):** `postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway`

**Railway CLI project token:** `b618831f-2bab-4e5f-b1fb-0f1618b9f0f4` (project: keen-wisdom)

**Binary path:** `mnt/.claude/bin/railway` (persistent across sessions)

**Foursquare API Key:** `E303HBSVAIMR2O1UNO3YCBB3P4H4X53FYT4IMVAGZFB0ZDQ2`

**Live site:** https://finda.sale

**Admin scraper page:** https://finda.sale/admin/scraper

---

## Reference — Known Issues & Carryover

**P1 bugs (pre-existing):**
- All `/items/[id]` URLs return 500 SSR error (pre-S599, not introduced by recent work)

**P2 bugs (known, not blocking):**
- Sale page social previews missing og:image/title/description (SSR not rendering SaleOGMeta)
- Tier-lapse "Your Plan" card stays teal/cyan instead of amber when lapsed
- Hunt Pass shows "Inactive" in one view, "Active" in another (copy/state inconsistency)

**Carryover from S626:**
- Phase 1 outreach: Google Workspace seat ($6/mo) + custom Postgres cron (cold-outreach tooling)
- Reply handling: fully automated per decisions-log S268 (no SLA, no human routing)
- 19 Gmail outreach drafts queued (Nick Loper, Codie Sanchez, trade associations)

**Carryover from S625:**
- Sign up HERE API at developer.here.com → add `HERE_API_KEY` GitHub Secret (overdue)

---

## Session Compression Log

**Compression Pass — 2026-05-03**
- Original file: 934 lines / 28.2k tokens
- Archived sessions: S617–S630 → `monthly-digest-2026-04-archive.md` (14 session summaries)
- Kept: 5 most recent sessions (S631–S635), Next Session block, Blocked/Unverified Queue, reference data
- Final file: ~185 lines / 6.5k tokens
- Reduction: 80% line count, 77% token count

**Kept sections:** Current Status, Recent Sessions (5×), Blocked/Unverified Queue, Next Session, Reference (Passwords, Credentials, Known Issues)

**Deleted sections:** LEGACY S603 plan content (lines 740–934), obsolete multi-page dispatch specs, superseded S603 viral mechanics exploration

