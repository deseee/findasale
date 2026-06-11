# Patrick Dashboard — FindA.Sale

**Last updated:** S950 — 2026-06-11

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

### 1. Run the S950 push block (docs + code together)

```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale

git add packages/backend/src/routes/sales.ts
git add packages/frontend/pages/server-sitemap.xml.tsx
git add "packages/frontend/pages/this-weekend/[city].tsx"
git add "packages/frontend/pages/sales/[id].tsx"
git add packages/frontend/vercel.json
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md

git commit -m "fix: sitemap PUBLISHED filter + /sales/sitemap endpoint, ISR 86400, vercel.json CDN cache, this-weekend dynamic revalidate; docs: S950 records pass"
.\push.ps1
```

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
