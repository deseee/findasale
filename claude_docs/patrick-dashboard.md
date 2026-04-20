# Patrick's Dashboard — Week of April 20, 2026

## What Happened This Session (S527)

Extended QA session. Worked through the UNTESTED backlog from STATE.md. S526 dev fixes are still LOCAL only — they need to be pushed before Chrome can verify them.

## S527 — QA Results (UNTESTED Backlog)

| Page | Result | Notes |
|------|--------|-------|
| /neighborhoods/[slug] | ✅ | Pages load. S525 QA had wrong URL (singular vs plural) |
| /cities + /city/[slug] | ✅ | P3: "Grand rapids" capitalization in heading/breadcrumb |
| Organizer Profile | ✅ | /organizers/[slug] loads with sales list |
| Calendar | ✅ | /calendar renders correctly |
| Item Detail | ✅ | Photo, price, Buy It Now modal, all CTAs work |
| Message Templates | ✅ | Create/Edit/Delete all work. P3: Delete has no confirmation |
| Loyalty Passport | ✅ | Save persists on reload. P3: no success toast |
| Virtual Line Queue | ✅ | Sale picker + queue manager render |
| Admin Verification | ✅ | Approve/Reject queue loads with pending requests |
| Sale Progress Checklist | ✅ | 6-stage timeline, real task data (9/39 tasks) |
| Encyclopedia | ✅ | Search/filter/sort UI present, empty state proper |
| QR Scan Analytics | ✅ | Stats + sales table + Print Labels CTAs |
| Hunt Pass | ✅ | $4.99/mo, 1.5x XP, Upgrade CTA present |
| Categories | ⚠️ P2 | &amp; HTML entities not decoded in names, broken first image |
| Coupons (/organizer/coupons) | ❌ P2 | 404 — page not built yet |
| Insights (/organizer/insights) | ✅ | Full analytics dashboard — 4 sales, $1,926 revenue, 8.7% conversion, items by category |
| Sale Analytics (/organizer/sales/[id]/analytics) | ❌ P2 | Sale-specific drill-down — backend GET /api/insights/organizer/sale/:saleId returns 404 |

## S526 Fixes — Still LOCAL, Not Pushed

These are ready on your machine but need `.\push.ps1` before they go live:

| Fix | Status |
|-----|--------|
| #224 rapid-capture 404 | LOCAL — needs push |
| W-5 Create Sale link | LOCAL — needs push |
| #235 DonationModal | LOCAL — needs push |
| #228 receipt labels | LOCAL — needs push |
| #266 Collector Passport rename | LOCAL — needs push |
| #200 collectorTitle on profile | LOCAL — needs push |
| #270 INITIATE onboarding card | LOCAL — needs push |
| S518-D Downgrade to Free button | LOCAL — needs push |

## Push Block (Run This)

```powershell
git add packages/frontend/pages/organizer/rapid-capture.tsx
git add packages/frontend/pages/workspace/[slug].tsx
git add packages/frontend/components/DonationModal.tsx
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/Layout.tsx
git add packages/frontend/pages/shopper/explorer-passport.tsx
git add packages/frontend/pages/shopper/profile/[userId].tsx
git add packages/backend/src/services/collectorPassportService.ts
git add packages/frontend/components/ExplorerGuildOnboardingCard.tsx
git add packages/frontend/pages/shopper/dashboard.tsx
git add packages/frontend/pages/organizer/subscription.tsx
git add packages/frontend/components/SettlementWizard.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/strategy/roadmap.md
git commit -m "S526+S527: Fix #224 #235 #228 #266 #200 #270 W-5 S518-D — bug batch + Collector Passport rename + doc updates"
.\push.ps1
```

## What Needs to Happen Next (S528)

1. **Push** — run the block above
2. **Chrome QA** — after deploy, verify all 8 S526 fixes are live
3. **Dev dispatch** — fix new P2 bugs:
   - Build organizer coupons page
   - Fix categories HTML entity decode + broken image
   - Fix TEAMS platform fee (shows 8%, should be 10%)
   - Investigate sale-specific analytics (/organizer/sales/[id]/analytics vs /organizer/insights)
4. **Backend Prisma** — run `prisma generate` in packages/database (pre-existing stale client, not blocking)
