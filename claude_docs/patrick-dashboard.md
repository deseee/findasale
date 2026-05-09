# Patrick's Dashboard — S703 Wrap

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| Geocoding root cause | ✅ FIXED — lat/lng args 13/14 were missing from all scraper ingest calls; all 5 dedup paths now backfill |
| Geocoding coverage | ⚠️ Will recover on next HERE/Foursquare scraper run — 0% until then |
| ERR_HTTP_HEADERS_SENT | ✅ FIXED — res.headersSent guard in internalScraperController.ts |
| Sale detail page `/sales/[id]` | ✅ REDESIGNED (S703 design session) |
| Sale creation wizard | ✅ REDESIGNED (S703 design session) |
| Email design system | ✅ REBUILT (S703 design session) |
| Smart review queue | ✅ REDESIGNED (S703 design session) |
| Sale type badge system | ✅ NEW component (S703 design session) |
| Broadcast composer | ✅ NEW component (S703 design session) |
| Organizer storefront v0.2 | ✅ REDESIGNED (S703 design session) |
| Scoring backfill | ❌ ~24k orgs unscored — needs S704 trigger |
| GitHub Actions audit | ❌ Not yet done — Phase 2 workflows need verification |
| MailerLite tier group wiring | ⚠️ Built — needs 3 Railway env vars |
| S698 migration | ⚠️ May still need running if not done |

---

## What Happened This Session (S703)

**Geocoding dropout root cause found and fixed.** 0% geocoding across 32,110 orgs traced to a single bug: `getOrCreateScrapedOrganizer()` was called with 12 arguments instead of 14 — lat and lng were never passed. HERE and Foursquare store coordinates in `scrapedMetadata`, not top-level fields, so the extraction had to be explicit. All 5 dedup paths (byPlaceId, byFoursquare, byHere, byDedupeKey, existing normalized name) also lacked lat/lng backfill — meaning even when an existing org was found, coordinates were never written. All fixed. Next scraper run will geocode new orgs and backfill existing ones.

**ERR_HTTP_HEADERS_SENT suppressed.** The ingest controller's catch block was firing after a success response had already been sent, causing an unhandled rejection in Railway logs. Added `if (!res.headersSent)` guard.

**5 prior-session files committed** (emailReminderService, emailTemplateService, followerNotificationService, weeklyEmailService, create-sale.tsx).

---

## What Happened Last Session (S702)

**Critical gap fixed — Phase 2 scrapers were completely unreachable.** All 28 Phase 2 scraper files existed on disk but had ZERO Express routes registered in `internal.ts`. None could be triggered via API or GitHub Actions workflow. Agent registered all 28 in one pass.

**CT fix (0 matches → should match).** Two bugs: column names were being probed in verbose form (`"Credential Type"`) but Socrata returns compact keys (`"credentialtype"`). And credential type values like `"AUCTIONEER - RESIDENT INDIVIDUAL"` failed exact Set lookup — fixed with `.some(t => credentialType.includes(t))` substring matching.

**PA fix (OOM crash → paginated).** Was downloading the full bulk CSV (potentially millions of rows) into memory — Node.js ERR_STRING_TOO_LONG. Rewrote to Socrata paginated JSON: 5,000 rows per page, while loop until empty page.

**VA DPOR fix (404 → 117 records).** Was requesting named files that don't exist. Correct URLs are numbered: `2905__crnt.txt`, `2906__crnt.txt`, `2907__crnt.txt`, `2908__crnt.txt`. Also had a `break` in the loop that stopped after the first file — removed, now processes all 4.

**VA General Phase 2 added (new).** Virginia has no statewide Socrata API. Used Norfolk's `data.norfolk.gov/resource/dpi6-sct5.json` (~9,800 business license records) as the accessible VA general dataset. Covers auctioneers, pawnbrokers, secondhand dealers, consignment, precious metals.

**Dashboard audit from screenshot.** 32,110 total orgs, only 7,884 scored, geocoding at 0% (map discovery broken), NY Phase 2 pulling construction/renovation companies that technically hold NYC secondhand dealer licenses but are low-quality leads. 0 outreach sends — warming period not started.

---

## Patrick Actions Needed

### Push Block — Run This Now (S703 wrap)

```powershell
git add packages/backend/src/services/scraper/index.ts
git add packages/backend/src/controllers/internalScraperController.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "fix(scraper): geocoding dropout — pass lat/lng to getOrCreateScrapedOrganizer, backfill all 5 dedup paths; fix ERR_HTTP_HEADERS_SENT guard — S703"
.\push.ps1
```

### Carry-Forward (still pending)

- **Railway env vars**: `MAILERLITE_COLD_GROUP_ID`, `MAILERLITE_WARM_GROUP_ID`, `MAILERLITE_HOT_GROUP_ID`
- **S698 migration**: Run `prisma migrate deploy` + `prisma generate` if not done
- **Delete GOOGLE_PLACES_API_KEY** from Railway vars + GitHub Secrets (S695 lockdown)
- **Wire emailDiscoveryJob** into cron + set `EMAIL_DISCOVERY_ENABLED=true`
- **Junk cleanup**: `git rm ".github/workflows/scrape-nc-licensing.yml"` and `git rm "packages/backend/src/services/scraper/sources/westVirginia LicensingScraper.ts"`

---

## Next Session (S704) — Top Priorities

1. **GitHub Actions audit** — Verify Phase 2 workflow YMLs are present, enabled, firing on schedule, and calling correct routes. Fix any broken/missing.
2. **Scoring backfill** — Trigger `POST /api/internal/scoring/run-backfill`. ~24k orgs unscored. Verify HOT/WARM/COLD distribution after.
3. **Outreach warming strategy** — Plan warming schedule, first email content, MailerLite group IDs. Target HOT tier first, 20–50 sends/day.
4. **Patrick manual actions** — Railway env vars, S698 migration, emailDiscoveryJob wire-up, junk git rm, GOOGLE_PLACES_API_KEY delete.
