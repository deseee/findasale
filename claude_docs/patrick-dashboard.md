# Patrick Dashboard — FindA.Sale

**Last updated:** S951 — 2026-06-11

---

## Session S951 Summary — Scheduled-Task Fix Audit

**Type:** RECORDS/AUDIT — audited today's automated scheduled-task runs for fixes missing from the docs
**BQ:** 1 (unchanged)

Today's automated tasks made 3 real backend fixes that were already committed + pushed to `main` but not written down. All are live (Railway/Vercel auto-deploy):

| Fix | Source task | Commit | What it does |
|-----|-------------|--------|--------------|
| Google Maps billing lockdown hard-coded | ops-cost-guard (9:10am) | 529f4ee7 | `GOOGLE_MAPS_ENABLED` can no longer turn billing back on — 4 call sites return early. Guards the May 2026 $201 incident. |
| Scraper + email-discovery hardening | ci-sentry-health (6:10am) | ed5c020e | null guard in scraperCron; removed dead port-25 SMTP; **DB pre-flight added to 65 workflow files** so a stale secret fails loudly. |
| Outreach pipeline bug fix | email-delivery-health (10:08am) | bd6e6967 | Null-source organizers were being silently skipped from all outreach — **22 organizers stuck up to 31 days**. Now fixed. |

Friction-audit ran clean (0 P0/P1). Competitor-monitor + NFT runs touched no code. STATE.md §S913 noted-findings cleanup flagged (P3, no urgency).

### Scraper fleet — diagnosed, fixes deferred to next session

You said fix the failing scrapers, not park them — so I diagnosed all 16 failures (out of 132 workflows; 81 of the 96 phase2/licensing ones actually pass). Root causes proven from live logs + source checks:

- **4 genuinely fixable** (sources confirmed live this session): Kentucky, Indiana, Maine, Alabama phase2 — these restore real organizer data (1,000s of records).
- **~5 genuinely dead** (no statewide source exists — proven, not an excuse): NY/NJ/MA auctioneer, NE/RI pawnbroker licensing.
- **~5 need infrastructure** (headless browser + residential proxy): NH, Maine-licensing, Wisconsin, Wyoming, MA phase2 — blocked by WAF / JS SPA / CAPTCHA / API key.

**The code couldn't ship:** a VM filesystem fault corrupted the agents' file writes this session (truncated files + null bytes). Nothing scraper-related is pushable. **Action 1 in Next Session restores your working tree** — please run it. The fixes get re-done cleanly next session with a working toolchain.

**Next session is teed up** to: dispatch the 4 real fixes, verify the dead areas are already covered by other scrapers before retiring them, evaluate the alternatives, and size how many of the full 120+ scrapers a single shared headless-browser harness would unblock.

---

## Session S950 Summary

**Type:** DEV/RECORDS — Vercel cost fixes + sitemap SEO fix + this-weekend ISR scheduling + records pass
**BQ at close:** 1 (ceiling=8 — DEV/QA mode available)

### What got done this session

**Records pass ✅** — Applied the 3 pending S949 PCVs to roadmap.md:

| Feature | Status | Evidence |
|---------|--------|----------|
| #422 OAuth 409 bridge | ✅ S949 | ss_3450u6tgu ss_8074zis8d |
| #75 Tier lapse UI (P2 resolved) | ✅ S949 | SIMPLE shows correctly. ss_83752jesk |
| #470 item_viewed GTM | ✅ S949 | ss_8841oxiro ss_7047o7yzv |

**Vercel cost fixes (pre-compaction):**
- `vercel.json`: sitemap CDN cache `s-maxage=3600` (was `max-age=0` — Googlebot was hitting the server on every crawl)
- `sales/[id].tsx`: ISR revalidate 3600 → 86400 (sale pages now regenerate once/day, not every hour)

**Sitemap SEO fix (silent bug — unknown duration):**
- Root cause: status filter used `ACTIVE||UPCOMING` — neither exists in DB (DB uses `PUBLISHED`). Result: sitemap had been generating **0 sale URLs** for an unknown number of sessions. Googlebot couldn't discover any of the 15k+ published sales via sitemap.
- Fix: `PUBLISHED` filter, new `GET /sales/sitemap` backend endpoint (top 5,000 most recently updated), `changefreq` hourly→daily. Total URL count verified under 50k sitemap limit.

**This-weekend ISR scheduling:**
- `this-weekend/[city].tsx` now uses day-of-week logic: Thu/Fri/Sat = 4hr revalidate, Sun/Mon/Tue/Wed = 12hr (twice/day). Was a flat 4 hours all week.

---

## Patrick Actions Needed

### 1. Update the stale GitHub Actions `DATABASE_URL` secret

Surfaced by today's ci-sentry-health run. HERE Places + every DB-using scraper workflow fails until you refresh it:

GitHub → repo **Settings → Secrets and variables → Actions → `DATABASE_URL`** → set to the Railway public-proxy connection string. After saving, run HERE Places via **workflow_dispatch** to confirm a clean run.

_(The S950 push and today's 3 scheduled-task fixes are already on `main` — nothing to push.)_

### 2. Searlo credit upgrade (optional)
FB Events running at 17% 429 fallback on free tier (10/min cap). Buy a $3.99+ pack at searlo.co → lifts cap → bump `SEARLO_RPM` GitHub repo Variable.

---

## Project Status

**Email pipeline security:** F1–F5 complete (S947). All send paths block `*.finda.sale`. Null MX live for system.finda.sale.

**Sitemap:** PUBLISHED filter now live (pending push). 0 sale URLs → up to 5,000 most-recent published sales in sitemap. Google can now index sale pages.

**Vercel cost:** sitemap CDN caching + ISR 86400 applied. Primary remaining cost driver is build frequency (252 builds since June 1 — batch pushes will reduce this).

**#472 send-test-email:** ✅ Chrome QA S948. Roadmap fully updated.

**#470 GA4 events:** item_viewed ✅ S949 (roadmap updated S950), organizer_signup UNVERIFIED (BQ — invite QA-LAPSE-25 exists), purchase_completed CODE-ONLY (needs real Stripe).

**#422 OAuth 409:** ✅ S949. Roadmap Chr column updated S950.

**#75 Tier lapse UI:** ✅ S949 (P2 resolved). Roadmap Chr column updated S950.

**SEO3 Denver:** Chrome QA ✅ S939, Human QA ✅ S944, roadmap fully updated.

**Scraper fleet:** 8 active sources. 16 parked. 5 prohibited (ToS).

**BQ:** 1 item (#470 organizer_signup — needs new organizer account to trigger GTM event). DEV/QA mode available.

**Next session (S950):** Records pass (#422/#75/#470 item_viewed → roadmap Chrome columns). Verify #470 organizer_signup via disposable account. Or continue DEV.
