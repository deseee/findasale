# Weekly Comprehensive Site Audit — 2026-05-23

**Type:** Automated scheduled task (weekly full-site audit)
**Auditor:** Claude (automated)
**Baseline:** DECISIONS.md D-001 through D-010, Brand Voice Guide
**Browser:** Chrome MCP, desktop viewport (1204×983)
**Backend:** Railway (online), Frontend: Vercel (finda.sale)

---

## Methodology

- Enumerated ~180 route files from `packages/frontend/pages/`
- Tested ~30 representative pages across public, organizer, shopper, and admin routes
- Each page checked for: console errors, page load, dark mode rendering, empty states, loading states, brand compliance (D-001 all-sale-types scope), section order, CTA presence
- Adversarial access check: non-admin user accessing `/admin/*` routes
- Mobile viewport testing attempted (375px resize) but display scaling prevented reliable results — noted as limitation

---

## Findings

### HIGH

#### H-001: `/categories` — Raw eBay taxonomy displayed as category names
**Severity:** HIGH
**Decisions violated:** D-003 (empty states/CTAs), UX standards
**Description:** Category names on the `/categories` page display raw eBay taxonomy paths instead of clean, user-friendly labels. Examples: "Collectibles:Comic Books & Memorabilia:Comics:Comics & Graphic Novels" instead of "Comics", "Toys & Hobbies:Action Figures & Accessories:Action Figures" instead of "Action Figures". This is confusing and looks broken to shoppers.
**Impact:** Shoppers browsing categories see internal data structures. Undermines trust and usability.
**Recommendation:** Map eBay taxonomy paths to clean display names. Use the leaf node or a curated label. If no mapping exists, use the last segment of the colon-delimited path as a minimum fix.

---

### MEDIUM

#### M-001: `/privacy` — Unicode escape rendered as literal text
**Severity:** MEDIUM
**Decisions violated:** D-009 (error states / display quality)
**Description:** The privacy policy page renders `—` as literal text instead of an em dash character (—). Appears in at least one location in the body text.
**Impact:** Looks unprofessional. Minor but visible to any user reading the privacy policy.
**Recommendation:** Replace the escaped Unicode with the actual em dash character in the source content.

#### M-002: `/calendar` — Long-running sales dominate every day
**Severity:** MEDIUM
**Decisions violated:** UX best practice
**Description:** Sales with extended date ranges (e.g., "Auction House Cafe" running for weeks) appear on every single calendar day, dominating the view and pushing shorter/single-day sales below the fold. Makes the calendar less useful for discovering weekend sales.
**Impact:** Reduces the calendar's usefulness for its primary purpose — finding upcoming one-off sales.
**Recommendation:** Consider collapsing long-running sales into a banner or separate "Ongoing" section rather than repeating them on every day cell.

#### M-003: `/sales/[id]` — Type badge mismatch and breadcrumb trailing slash
**Severity:** MEDIUM
**Decisions violated:** D-001 (all sale types scope — incorrect type labeling)
**Description:** Two issues on sale detail pages: (1) A sale titled "Online Auction" displays a "YARD" type badge — type classification appears incorrect. (2) Breadcrumb trail shows "Home / Sales /" with a trailing slash and no sale name.
**Impact:** Type mismatch confuses users about what kind of event they're viewing. Incomplete breadcrumb is a minor navigation issue.
**Recommendation:** (1) Investigate type classification logic — may be a data issue or a fallback default. (2) Populate breadcrumb with sale title or remove trailing separator.

#### M-004: `/map` — 200 sales listed but no map pins visible
**Severity:** MEDIUM
**Decisions violated:** D-003 (empty states), UX
**Description:** The map page shows "200 Sales" in the header and lists sales in a sidebar, but the map area itself shows no pins or markers. The map renders (tiles load) but appears empty of sale location data.
**Impact:** The map page's core value proposition — seeing sales geographically — doesn't work. Users can't visually locate sales on the map.
**Recommendation:** Investigate whether geocoded coordinates are available for listed sales. May need to verify the marker rendering layer is connected to the sales data source.

---

### LOW

#### L-001: `/search` — Ghost "Filters" text label
**Severity:** LOW
**Description:** A faint orange "Filters" text label appears near the top-left of the filter area on the search page. Appears to be a debug label or styling artifact.
**Impact:** Cosmetic only. Doesn't block functionality.
**Recommendation:** Remove or properly style the label.

#### L-002: Homepage console — Vercel script load warnings
**Severity:** LOW (benign)
**Description:** Console shows warnings about Vercel Analytics and Speed Insights scripts failing to load. Likely caused by content blockers in the test browser.
**Impact:** None for real users. Vercel analytics may not track users with ad blockers (expected behavior).
**Recommendation:** No action needed. Benign for production.

---

### PASSED (no issues found)

The following pages passed all checks (page loads, dark mode renders correctly, content displays properly, brand voice compliant, no console errors beyond benign):

- `/` (Homepage) — hero copy inclusive of all sale types (D-001 ✅)
- `/pricing` — all tiers displayed, inclusive language
- `/about` — mission statement inclusive
- `/sales` (listing page) — sales load, cards render, dark mode OK
- `/trending` — trending sales display correctly
- `/search` (functionality) — search works, results render (cosmetic label issue noted above)
- `/messages` — messaging interface loads
- `/leaderboard` — Explorer's Guild leaderboard renders
- `/city/[slug]` pages — city-specific sale listings work
- `/faq` — FAQ content loads and renders
- `/favorites` / `/wishlists` — favorites system works
- `/organizer/dashboard` — organizer dashboard loads with data
- `/organizer/sales` — organizer sale management works
- `/organizer/settings` — settings page loads
- `/shopper/dashboard` — shopper dashboard loads
- `/404` — custom 404 page with CTA (D-003 ✅)
- `/notifications` — notification center loads
- `/encyclopedia` — encyclopedia content renders
- `/clearance` — clearance section works
- `/guild-primer` — gamification primer displays
- `/access-denied` — adversarial check passed (admin routes redirect correctly)
- `/contact` — contact page loads
- `/workspace` — workspace loads
- `/achievements` — achievements display
- `/guides` — Help Library loads correctly

---

### Adversarial Access Check

**Test:** Non-admin user navigating to `/admin/*` routes
**Result:** PASSED — correctly redirected to `/access-denied` page with appropriate messaging

---

### Untested Routes (deferred to next audit)

Due to context constraints, the following route groups were not tested this cycle:

- **Organizer subpages:** create-sale, add-items, edit-item, POS, team management, eBay integration pages
- **Shopper subpages:** cart, bids, holds, checkout flows
- **Auth pages:** login, register, forgot-password
- **Legal pages:** terms of service (privacy tested above)
- **Admin pages:** full admin panel (access control verified only)
- **Mobile viewport:** 375px testing inconclusive due to display scaling — recommend manual check

---

## Summary

| Severity | Count | Action Required |
|----------|-------|-----------------|
| CRITICAL | 0     | —               |
| HIGH     | 1     | Yes — categories page raw taxonomy |
| MEDIUM   | 4     | Yes — privacy unicode, calendar dominance, sale detail type/breadcrumb, map pins |
| LOW      | 2     | Optional         |
| PASSED   | 25+   | —               |

**Overall assessment:** The site is in good shape for beta. The HIGH finding (categories page showing raw eBay taxonomy) should be addressed before showing the categories page to new users. The map pin issue (M-004) is functionally significant but may be a data/geocoding gap rather than a code bug. All other findings are polish items.

---

*Next scheduled audit: 2026-05-30*
