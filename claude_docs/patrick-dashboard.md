# Patrick's Dashboard — June 9, 2026 (Updated: S929)

**Generated:** Monday, June 9, 2026 (S929 — BUG/OPS: Sentry triage, outreach placeholder fix, DB indexes deployed)

---

## S929 Quick Summary

Ops/bug session prompted by a flood of Gmail bounce notifications.

**Root cause of bounce flood:** The outreach cron was missing `system.finda.sale` from its placeholder domain filter. The scraper creates synthetic organizer accounts using `scraper+...@system.finda.sale` emails. The cron was treating those as real contact emails and queuing outreach to them — every send bounced, and those DSN notifications were hitting finda.sale addresses ImprovMX forwards, burning through your 500/day forwarding limit.

**Fix:** Added `system.finda.sale` to the PLACEHOLDER_DOMAINS set in all 3 outreach seeder files. Deployed. 0 bad rows were in the queue when we fixed it. Volume through ImprovMX should drop significantly starting tomorrow.

**DB performance:** VACUUM ANALYZE ran on Sale and Organizer tables (clearing bloat from frequent scraper updates). Two missing DB indexes added and migration deployed — these fix slow queries Sentry had flagged.

**Sentry result:** 10 unresolved issues → 5. The module crash, DirectoryClaimEmail slow query, Sale status update slow query, and Organizer outreach SELECT all cleared. Remaining 5 are slow queries, 4 of which are now addressed by the indexes + VACUUM.

**Outreach account:** Confirmed NOT suspended (memory corrected).

**ImprovMX:** If you're still hitting 500/day tomorrow, check for other inbound bounce sources. If it drops below 500, the fix worked.

---

## Project Status

| Area | Status |
|------|--------|
| BQ (Blocked Queue) | 5 items — below QA ceiling (8), DEV available |
| GA4 Analytics | ✅ LIVE (CSP fixed S926, conversion events added S928) |
| Search Console | ✅ Connected, data flowing |
| Email (transactional) | ✅ On Resend rail (payouts, auth, receipts) |
| Outreach | ⏸ Paused (intentional, domain warming) |
| Backend / Railway | ✅ Healthy |
| Frontend / Vercel | ✅ Deployed |

---

## What You Need to Do

**One push needed** — covers everything from S924 through S928 (docs + code):

```powershell
git add packages/frontend/utils/textUtils.ts packages/frontend/pages/organizer/insights.tsx packages/backend/src/controllers/itemController.ts packages/frontend/pages/register.tsx packages/frontend/pages/organizer/create-sale.tsx packages/frontend/pages/organizer/add-items/[saleId].tsx packages/frontend/components/FavoriteButton.tsx packages/frontend/components/CheckoutModal.tsx claude_docs/strategy/roadmap.md claude_docs/STATE.md claude_docs/patrick-dashboard.md claude_docs/scripts/analytics-weekly.py .gitignore
git commit -m "S92