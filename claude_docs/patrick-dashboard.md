# Patrick's Dashboard — S703 Wrap

---

## Current State

| Area | Status |
|------|--------|
| Vercel build | ✅ GREEN (pending this push) |
| Railway backend | ✅ GREEN |
| Sale detail page `/sales/[id]` | ✅ REDESIGNED — new design tokens, hero, sticky CTAs |
| Sale creation wizard | ✅ REDESIGNED — 5-step, Online Only toggle wired (schema TODO) |
| Email design system | ✅ REBUILT — 5 modules, 4 new email types, backward compat |
| Smart review queue | ✅ REDESIGNED — amber stripes, price enforcement, View live sale link |
| Sale type badge system | ✅ NEW component — SaleTypeBadge, all 5 types |
| Broadcast composer | ✅ NEW component — 2-panel, templates, tier gates |
| Organizer storefront v0.2 | ✅ REDESIGNED — parchment default, hero, stats strip, right rail |
| Schema gap: isOnlineOnly | ⚠️ UI wired (TODO comment), needs future migration |
| Schema gap: saleSubtype | ⚠️ UI wired (TODO comment), needs future migration |
| Geocoding coverage | ❌ 0% geocoded — carry-forward from S702, investigate |
| MailerLite tier group wiring | ⚠️ Built — needs 3 Railway env vars |
| S698 migration | ⚠️ May still need running if not done |

---

## What Happened This Session (S702)

**Critical gap fixed — Phase 2 scrapers were completely unreachable.** All 28 Phase 2 scraper files existed on disk but had ZERO Express routes registered in `internal.ts`. None could be triggered via API or GitHub Actions workflow. Agent registered all 28 in one pass.

**CT fix (0 matches → should match).** Two bugs: column names were being probed in verbose form (`"Credential Type"`) but Socrata returns compact keys (`"credentialtype"`). And credential type values like `"AUCTIONEER - RESIDENT INDIVIDUAL"` failed exact Set lookup — fixed with `.some(t => credentialType.includes(t))` substring matching.

**PA fix (OOM crash → paginated).** Was downloading the full bulk CSV (potentially millions of rows) into memory — Node.js ERR_STRING_TOO_LONG. Rewrote to Socrata paginated JSON: 5,000 rows per page, while loop until empty page.

**VA DPOR fix (404 → 117 records).** Was requesting named files that don't exist. Correct URLs are numbered: `2905__crnt.txt`, `2906__crnt.txt`, `2907__crnt.txt`, `2908__crnt.txt`. Also had a `break` in the loop that stopped after the first file — removed, now processes all 4.

**VA General Phase 2 added (new).** Virginia has no statewide Socrata API. Used Norfolk's `data.norfolk.gov/resource/dpi6-sct5.json` (~9,800 business license records) as the accessible VA general dataset. Covers auctioneers, pawnbrokers, secondhand dealers, consignment, precious metals.

**Dashboard audit from screenshot.** 32,110 total orgs, only 7,884 scored, geocoding at 0% (map discovery broken), NY Phase 2 pulling construction/renovation companies that technically hold NYC secondhand dealer licenses but are low-quality leads. 0 outreach sends — warming period not started.

---

## Patrick Actions Needed

### Push Block — Run This Now

```powershell
git add packages/backend/src/routes/internal.ts
git add packages/backend/src/services/scraper/sources/connecticutPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/pennsylvaniaPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/virginiaPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/newjerseyPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/washingtonPhase2Scraper.ts
git add packages/backend/src/services/scraper/sources/virginiaGeneralPhase2Scraper.ts
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat(scraper): wire all 28 Phase 2 scrapers into internal.ts, fix CT/PA/VA/NJ, add VA general (Norfolk) — S702"
.\push.ps1
```

### Carry-Forward (still pending from S701)

- **Railway env vars**: `MAILERLITE_COLD_GROUP_ID`, `MAILERLITE_WARM_GROUP_ID`, `MAILERLITE_HOT_GROUP_ID`
- **S698 migration**: Run `prisma migrate deploy` + `prisma generate` if not done
- **Delete GOOGLE_PLACES_API_KEY** from Railway vars + GitHub Secrets (S695 lockdown)
- **Wire emailDiscoveryJob** into cron + set `EMAIL_DISCOVERY_ENABLED=true`
- **Junk cleanup** (from S701 pushblock): `git rm ".github/workflows/scrape-nc-licensing.yml"` and `git rm "packages/backend/src/services/scraper/sources/westVirginia LicensingScraper.ts"`

---

## Next Session (S703) — Top Priorities

1. **Geocoding=0% root cause** — Why is nothing geocoding? Check the geocoding service, env vars, cron job registration. This is breaking map-based discovery entirely.
2. **GitHub Actions audit** — Use Chrome + GitHub MCP to inspect all scraper workflows: are they enabled? firing on schedule? returning success? Last run timestamps.
3. **Scoring backfill** — 24k orgs unscored. Investigate why and dispatch scoring job or manual trigger.
4. **Outreach warming strategy** — Draft the first warming email wave. Identify HOT tier orgs (highest score). Target 20–50 sends/day starting week 1. MailerLite group IDs needed first (Railway env vars above).
5. **NJ/WA Phase 2 escalation** — Both return 0. NJ: request bulk file from NJ Consumer Affairs. WA: request DOL dataset or find alternative source.
