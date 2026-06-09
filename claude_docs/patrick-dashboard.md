# Patrick's Dashboard — June 9, 2026 (Updated: S931)

**Generated:** Monday, June 9, 2026 (S931 — QA: Records pass, Hunt Pass fix, Chrome QA sweep)

---

## S931 Quick Summary

Records pass + quick fix + Chrome sweep.

**Records pass:** Applied 6 S930 PCVs to roadmap.md — organizer dashboard, HTML entity fix (insights), shopper dashboard, Explorer Profile, #123 rank label, #199 Hunt Pass active state. All Chr ✅.

**Hunt Pass fix (pending push):** 5 components updated: StreakWidget, HuntPassAvatarBadge, HuntPassModal, AvatarDropdown, Layout — all now show "1.5x XP" (not "2x XP"). This was the P3 display inconsistency found in S930.

**Chrome QA sweep (9 features verified):**
- #462 Outreach Attribution E2E ✅ — ORGANIZER_PAGE_VIEWED fires in DB when organizer profile visited with ?ref=outreach param. Full end-to-end confirmed.
- #237 Command Center ✅ — /organizer/command-center renders with real revenue + KPI data
- /admin/outreach-opens ✅ — 173 email open records visible in admin panel
- SEO1 SSR head tags ✅ — sale detail pages serve og:title, og:image, canonical in server-side HTML
- #455 Notify Me Waitlist ✅ — zero-results search form submits, DB record confirmed
- #464 SEO footer Discover column ✅ — all sale-type links present in footer
- Sale detail page ✅ · /trending ✅ · /map ✅ (57 sales, Leaflet map, all filters)

All 9 staged as PCVs for S932 records pass.

---

## Project Status

| Area | Status |
|------|--------|
| BQ (Blocked Queue) | **6 items** — below QA ceiling (8), DEV available |
| GA4 Analytics | ✅ LIVE (CSP fixed S926, conversion events added S928) |
| Email (transactional) | ✅ On Resend rail (payouts, auth, receipts) |
| Outreach | ⏸ Paused (intentional, domain warming) |
| Backend / Railway | ✅ Healthy |
| Frontend / Vercel | ✅ Deployed |

---

## What You Need to Do

Run this one push (combines S924–S930 code + S931 Hunt Pass fix + wrap docs):

```powershell
git add packages/frontend/utils/textUtils.ts packages/frontend/pages/organizer/insights.tsx packages/backend/src/controllers/itemController.ts packages/frontend/pages/register.tsx packages/frontend/pages/organizer/create-sale.tsx "packages/frontend/pages/organizer/add-items/[saleId].tsx" packages/frontend/components/FavoriteButton.tsx packages/frontend/components/CheckoutModal.tsx packages/frontend/components/StreakWidget.tsx packages/frontend/components/HuntPassAvatarBadge.tsx packages/frontend/components/HuntPassModal.tsx packages/frontend/components/AvatarDropdown.tsx packages/frontend/components/Layout.tsx claude_docs/strategy/roadmap.md claude_docs/STATE.md claude_docs/patrick-dashboard.md
git commit -m "S924-S931: HTML entity fix, GA4 events, Hunt Pass 1.5x XP fix (5 components), roadmap + STATE + dashboard updated"
.\push.ps1
```

**After Vercel deploys:** open /shopper/dashboard in Chrome and confirm stats bar shows "1.5x XP". If ✅, let me know and I'll close the Hunt Pass BQ item.

---

## S932 Recommendation

BQ=6 (ceiling=8 — DEV available).

- **Records pass** — apply 9 S931 PCVs to roadmap Chr columns: #462 Attribution, #237 Command Center, /admin/outreach-opens, SEO1 SSR, #455 Notify Me, #464 SEO footer, sale detail, /trending, /map
- **Hunt Pass re-verify** — confirm stats bar shows 1.5x after push; close BQ item
- **NODEJS-1G** — low urgency: add `take: 500` to scraper/index.ts candidates findMany
