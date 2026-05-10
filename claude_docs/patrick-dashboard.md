# Patrick's Dashboard — S704 Wrap

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN |
| Railway backend | ✅ GREEN |
| GarageSaleFinder scraper | ✅ FIXED — site redesign had broken URL format + all HTML selectors; 0/0/0/0 every run |
| ESN nightly scraper | ✅ FIXED — timeout raised 25→60 min (was killing every nightly run) |
| Admin scraper metro picker | ✅ NEW — datalist combo box with 351 metros; no more guessing slug format |
| Organizer column in Scraped Sales | ✅ FIXED — businessName vs name field mismatch |
| claimEmails "Not sent" | ✅ FIXED — Prisma include block now includes claimEmails relation |
| `&` vs `and` duplicate orgs | ✅ FIXED — normalize expands & → and before stripping |
| Geocoding coverage | ⚠️ Will recover on next HERE/Foursquare run (fix was in S703) |
| Scoring backfill | ❌ ~24k orgs unscored — needs S705 trigger |
| MailerLite tier group wiring | ⚠️ Built — needs 3 Railway env vars |
| Outreach pool quality | ⚠️ Re-audit before enabling any sends (S705 priority) |
| S698 migration | ⚠️ May still need running if not done |

---

## What Happened This Session (S704)

**GarageSaleFinder scraper completely rebuilt.** After GarageSaleFinder.com redesigned their site, the scraper was producing 0 created / 0 updated / 0 skipped on every run. Root cause: the URL builder was generating `/garage-sales/US/{STATE}/{City}` paths that return 404. New URL format is `/yard-sales/{metro-slug}/`. Also fixed the link regex (detail pages moved from `/garage-sales/123456` numeric to `/s/abc123/` alphanumeric) and all HTML selectors (`.sale-title`, `.address`, `.dates` classes no longer exist — replaced with itemprop microdata: `h2[itemprop="name"]`, `[itemprop="address"]`, `meta[itemprop="startDate"]`, `meta[itemprop="endDate"]`, `img[itemprop="image"]`). Dates now parse from real metadata instead of defaulting to today/today+1.

**ESN GitHub Actions timeout fixed.** The nightly EstateSalesNet scraper was being killed at exactly 25 minutes every single night — the GitHub Actions `timeout-minutes: 25` was set too low for a job that consistently takes 25–30 minutes. Five consecutive runs all cancelled at 25m 18-20s. Raised to 60 minutes.

**Admin scraper trigger UI improved.** Patrick's feedback: "I don't have a list of slugs handy and will forget them over time." Replaced the free-text metro input with a `<datalist>` combo box. Type "chicago" and matching slugs appear. The metro list comes from a new `/api/admin/scraper/metros` endpoint that serves all 351 national metros from `NATIONAL_METROS`.

**Three Scraped Sales Overview bugs fixed.** (1) Organizer column was blank — frontend interface declared `organizer.name` but backend sends `organizer.businessName`. (2) Email Sent column always showed "Not sent" — `getScrapedSales()` never included `claimEmails` in the Prisma query. (3) `&` vs `and` was creating duplicate organizer records — "Amanda & Bobby's Estate Sale Services" and "Amanda and Bobby Estate Sale Services" got different dedupeKeys. Fixed by expanding `&` → `and` before stripping.

---

## What Happened Last Session (S703)

Geocoding dropout root cause fixed (lat/lng args 13/14 were missing from all scraper ingest calls). ERR_HTTP_HEADERS_SENT guard added. Design overhaul shipped (sale detail, creation wizard, email system, smart review queue, broadcast composer, storefront v0.2).

---

## Patrick Actions Needed

### Push Block — Run This Now (S704 wrap)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/backend/src/services/scraper/sources/garagesalefinder.ts
git add packages/backend/src/services/scraper/htmlParser.ts
git add packages/backend/src/jobs/scraperCron.ts
git add packages/backend/src/controllers/adminController.ts
git add packages/backend/src/routes/admin.ts
git add packages/frontend/pages/admin/scraper.tsx
git add packages/backend/src/controllers/scraperController.ts
git add packages/backend/src/services/scraper/index.ts
git add .github/workflows/scrape-estatesalesnet.yml
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S704: GarageSaleFinder rebuilt + ESN timeout fix + admin metro picker + organizer dedup fix

- GarageSaleFinder: new URL format /yard-sales/{metro}/, itemprop selectors, link regex fix
- ESN GitHub Actions timeout 25→60 min (was killing every nightly run)
- Admin scraper: datalist metro picker with 351 national metros
- Scraped Sales: businessName field fix, claimEmails include fix
- Organizer dedup: expand & → and before stripping (prevents duplicate org records)"
.\push.ps1
```

### Carry-Forward (still pending)

- **Railway env vars**: `MAILERLITE_COLD_GROUP_ID`, `MAILERLITE_WARM_GROUP_ID`, `MAILERLITE_HOT_GROUP_ID`
- **S698 migration**: Run `prisma migrate deploy` + `prisma generate` if not done
- **Wire emailDiscoveryJob** into cron + set `EMAIL_DISCOVERY_ENABLED=true`
- **Junk cleanup**: `git rm ".github/workflows/scrape-nc-licensing.yml"` and `git rm "packages/backend/src/services/scraper/sources/westVirginia LicensingScraper.ts"`

---

## Next Session (S705) — Top Priorities

1. **Push S704** — 9 files + STATE.md + patrick-dashboard.md (pushblock above)
2. **Re-audit scraper pool quality** — Before any email sends, sample orgs by source and spot-check businessName, city, website. Especially NY Phase 2 (may have non-resale noise). Decide: send to current pool or clean first.
3. **Scoring backfill** — Trigger `POST /api/internal/scoring/run-backfill`. ~24k orgs unscored. Check HOT/WARM/COLD split after.
4. **Patrick manual actions** — Railway env vars, S698 migration, emailDiscoveryJob, junk git rm.
