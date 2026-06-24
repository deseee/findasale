# Weekly Comprehensive Site Audit — 2026-06-06 (S895)

**Audit type:** Automated scheduled weekly audit  
**Session:** S895  
**Auditor:** Main session (no subagent QA used — all findings from direct Chrome interaction + bash)  
**Audit start:** ~4:00 AM Saturday 2026-06-06  
**Production URL:** https://finda.sale  
**Test accounts used:** user2@example.com (PRO organizer, Bob) — only production accounts user1–user7 exist

---

## Executive Summary

- **Routes tested:** 15 key routes via direct Chrome navigation  
- **New HIGH findings:** 1 (text-warm-900 dark mode violations — systematic)  
- **New MEDIUM findings:** 1 (React hydration errors on homepage)  
- **New UNVERIFIED:** 3 (shopper flows, mobile viewport, organizer add-items with sale)  
- **Confirmed working:** 14 routes/features  
- **Blocked Queue additions this audit:** 2 new entries (HIGH + MEDIUM)  
- **D-001 status:** CLEAN — no "estate sale" solo strings in rendered TSX  
- **D-006 status:** CLEAN — "AI" appears only in code comments and meta tags, not user-visible UI copy  

---

## Route Coverage

| Route | Tested | Result | Screenshot |
|-------|--------|--------|-----------|
| `/` (homepage) | ✅ | PASS | ss_78871wxvy, ss_0470hoh79, ss_80968u1nr |
| `/sales` | ✅ | PASS | ss_2255kmmnm |
| `/sales/[id]` (detail) | ✅ | PASS (SSR title ✅, GUEST1 ✅, CTA1 ✅) | ss_6814j1sfc, ss_6616dgx5k |
| `/pricing` | ✅ | PASS | ss_7973p36qn |
| `/login` | ✅ | PASS | ss_5985kb7b9 |
| `/organizer/dashboard` | ✅ | PASS | ss_2155o59sr |
| `/organizer/sales` (Manage Sales) | ✅ | PASS (empty state D-003 ✅) | ss_3386mxdjw |
| `/organizer/add-items` | ⚠️ | Redirects to dashboard (no sale) — expected | — |
| `/search?q=furniture` | ✅ | PASS | ss_18405woqr |
| `/map` | ✅ | PASS (Leaflet + 98 pins, all types D-001 ✅) | ss_8518kcwjq |
| `/categories` | ✅ | PASS | ss_083369cc2 |
| `/admin` (non-admin access) | ✅ | PASS (→ /access-denied, no 500) | ss_67125o5sv |
| 404 (random URL) | ✅ | PASS | ss_5827ct3yp |
| `/shopper/dashboard` | ❌ | UNVERIFIED — no shopper accounts in production | — |
| Mobile 375px homepage | ❌ | UNVERIFIED — resize_window did not change viewport | — |

---

## CONFIRMED WORKING ✅

### Homepage (ss_78871wxvy, ss_0470hoh79, ss_80968u1nr)
Dark mode correct. Hero copy: "Discover Amazing Deals" — inclusive, mentions yard sales, garage sales, estate sales, flea markets, auctions (D-001 ✅). Footer SEO column ("Discover") with city/category links present (#464 feature ✅). "Running a sale? List it free" CTA visible.

### Sales Index (ss_2255kmmnm)
15,793 total sales. Listing renders. Dark mode correct.

### Sale Detail — SEO-1 + GUEST1 + CTA1 (ss_6814j1sfc, ss_6616dgx5k)
- **SEO-1 ✅**: Browser tab title shows sale name ("Estate Treasures 84: Antiques, Art, Silver, Decor, & More – FindA.Sale") — `getStaticProps`/ISR fix confirmed working.
- **GUEST1 ✅**: `GuestSaleAlert` component visible for logged-out user on sale detail page.
- **CTA1 ✅**: "Remind Me by Email" button absent for logged-out user (was dead-end before fix; now only GuestSaleAlert shown).

### Pricing Page (ss_7973p36qn)
SIMPLE (free), PRO ($29/mo), TEAMS ($79/mo) tiers render correctly. D-001 compliant copy. No "AI" language in visible copy (D-006 ✅). Pricing matches S388 confirmed decisions.

### Login Page (ss_5985kb7b9)
Form renders. Google, Facebook OAuth buttons present. Passkey sign-in present. "Don't have an account? Register now" link. Dark mode correct. Error toast renders correctly (shown when invalid credentials tried — ss_9843kw7az).

### Organizer Dashboard (ss_2155o59sr) — user2 PRO
"Welcome, Bob" personalized. Plan status (PRO) with TEAMS upgrade CTA. Quick actions: New Sale, Items, POS, Holds, My Storefront, Ripples. Storefront URL visible. Onboarding guide present. À la carte callout ("publish a single sale for $9.99"). Dark mode correct.

### Manage Sales Empty State (ss_3386mxdjw)
"No sales yet. Create your first sale to get started." — D-003 compliant with dual CTAs. Dark mode correct.

### Search (ss_18405woqr)
Query "furniture" returns Sales (10), Items (0). Filter panel renders (Price Range, Condition, Category, Sale Type, Sale Status, Sort By). Sale cards show with organizer names, dates, locations. "Plan Route for All Sales" CTA present.

### Map (ss_8518kcwjq)
Leaflet renders with 98 colored pins. Date filters (All Dates, Today, This Weekend, This Week) and sale-type filters (All Types, Estate, Yard, Auction, Flea Market, Consignment, Retail Store, Vendor Booth) present — **D-001 ✅**. Plan Your Route + Heatmap CTAs visible.

### Categories (ss_083369cc2)
Grid with emoji icons and item counts renders. Breadcrumb: Home › Categories. Dark mode correct.

### 404 Page (ss_5827ct3yp)
"404 — Page not found" with "Back to Home" CTA and support email link. Dark mode correct.

### Admin Access Control (ss_67125o5sv) — ADVERSARIAL ✅
Non-admin organizer (user2) accessing `/admin` → redirected to `/access-denied` with "Access Denied / You don't have permission to view this page." No 500, no data leak. "Go to Home" + "Contact Support" links present. Dark mode correct.

---

## FINDINGS

### F-001 — HIGH — `text-warm-900` Dark Mode Violations (D-002) — 83 instances, 25 files

**Severity:** HIGH  
**Evidence:** `grep -rn "text-warm-900" packages/frontend --include="*.tsx" | grep -v "dark:"` returned **83 matches across 25 files**  
**Top offenders by instance count:**

| Count | File |
|-------|------|
| 19 | `components/PerformanceDashboard/MetricsGrid.tsx` |
| 10 | `components/CheckoutModal.tsx` |
| 9 | `components/PerformanceDashboard/TopItemsTable.tsx` |
| 5 | `components/PostPerformanceCard.tsx` |
| 4 | `components/PerformanceDashboard/RecommendationsPanel.tsx` |
| 4 | `components/HuntPassModal.tsx` |
| 4 | `components/DateRangeSelector.tsx` |
| 3 | `components/SalesNearYou.tsx` |
| 3 | `components/PerformanceDashboard/HoldMetricsCard.tsx` |
| 2 | `components/SocialPostGenerator.tsx` |
| 2 | `components/SaleSelector.tsx` |
| 2 | `components/RecentlyViewed.tsx` |
| 2 | `components/RSVPAttendeesModal.tsx` |
| 2 | `components/QuickReplyPicker.tsx` |
| 2 | `components/FeedbackMenu.tsx` |
| 1 | `pages/organizer/print-kit/[saleId].tsx` |
| 1 | `pages/organizer/print-inventory.tsx` |
| 1 | `pages/organizer/edit-item/[id].tsx` |
| 1 | `pages/index.tsx` |
| 1 | `components/VisualSearchButton.tsx` |
| + 5 more | (other components) |

**Impact:** Text with `text-warm-900` (dark brown) is effectively invisible against dark backgrounds in dark mode. This affects critical organizer workflows: CheckoutModal, PerformanceDashboard, HuntPassModal, DateRangeSelector, SaleSelector. High-visibility issue for organizers who use dark mode.

**Violates:** D-002 (full dark mode — every `.tsx` must have `dark:` variants)

**Recommended action:** Dispatch `Skill('findasale-dev')` for a targeted pass replacing `text-warm-900` with `text-warm-900 dark:text-warm-100` (or equivalent) across all 25 files. This is a bulk text-replacement task — not architecture-critical.

---

### F-002 — MEDIUM — React Hydration Errors #418 and #425 on Homepage

**Severity:** MEDIUM  
**Evidence:** `read_console_messages` at 4:03:07 AM captured 28+ EXCEPTION entries from `framework-fb0e2df9cfa23940.js` — all React minified errors #418 (hydration mismatch) and #425 (content mismatch between server and client renders).

**Impact:** Page renders visually despite errors. However, SSR/client mismatches can cause:
- Intermittent hydration failures that flash correct → incorrect content
- Potential SEO impact if server-rendered content differs from client-rendered
- React state corruption in edge cases

**Recommended action:** Identify which component(s) read browser-only APIs (e.g. `window`, `localStorage`, `navigator`) during SSR. Common culprits: date formatting with locale, random/Math.random(), `typeof window`, device-detection hooks. Requires dev investigation.

---

### F-003 — LOW — Search Filter Label Confusion

**Severity:** LOW  
**Evidence:** Screenshot ss_18405woqr shows "0 items found with these filters" in the left sidebar while "Sales (10)" displays in the results area. 

**Impact:** First-time user might think search returned zero results. The label refers to item-level results (Items tab = 0) but placement in the filter sidebar implies it describes the overall search.

**Recommended action:** Either hide this label when on the Sales tab, or change to "0 items match these filters" and position it within the Items tab results area only.

---

## UNVERIFIED (requires follow-up)

| Feature | Reason | What's Needed |
|---------|--------|---------------|
| Shopper dashboard, favorites, notifications | No shopper accounts in production (user1–user7 only, all organizers) | Seed shopper accounts to production or create one manually |
| Mobile viewport (D-004) | Chrome MCP `resize_window` did not change viewport (stayed 1589x1074 per `window.innerWidth`) | Manual test at 375px or use Chrome DevTools device emulation |
| Organizer add-items with existing sale | user2 has no sales in production to test add-items flow | Test with a user who has an existing production sale |

---

## DESIGN DECISIONS VERIFIED

| Decision | Status |
|----------|--------|
| D-001: All sale types scope (not estate-only) | ✅ PASS — map filters, homepage copy, footer all inclusive |
| D-002: Full dark mode | ⚠️ FAIL — 83 `text-warm-900` violations (F-001) |
| D-003: Empty states with CTAs | ✅ PASS — Manage Sales empty state, 404 page both have CTAs |
| D-004: Mobile-first 375px | ❌ UNVERIFIED — viewport resize failed |
| D-005: Multi-endpoint testing | ⚠️ PARTIAL — shopper-side flows unverified |
| D-006: No "AI" in copy | ✅ PASS — "AI" only in code comments and meta content, not rendered UI |

---

## ROADMAP ITEMS VERIFIED

| Feature | ID | Status |
|---------|-----|--------|
| SEO-1 (getStaticProps ISR on sale detail) | SEO-1 | ✅ CONFIRMED WORKING |
| GUEST1 (GuestSaleAlert for logged-out) | GUEST1 | ✅ CONFIRMED WORKING |
| CTA1 (hide dead-end CTA for logged-out) | CTA1 | ✅ CONFIRMED WORKING |
| SEO footer discovery links | #464 | ✅ CONFIRMED WORKING |

---

## BLOCKED QUEUE ADDITIONS (this audit)

Two new entries to add to STATE.md Blocked Queue:

```
| text-warm-900 dark mode violations (25 files, 83 instances) | D-002 violation — text invisible in dark mode | Dispatch findasale-dev for bulk dark: variant pass | S895 |
| React hydration errors #418/#425 on homepage | SSR/client mismatch — 28+ console exceptions | Dev investigation: find component reading browser-only APIs during SSR | S895 |
```

---

## PRODUCTION USER NOTE

Production database only contains user1–user7 (all organizer accounts). The full 23-user seed (user1–user23) was never run in production. Shopper accounts (user12+) do not exist in production. This limits QA coverage of shopper-role features. Recommend: add at least 2 shopper accounts to production seed or create them manually via registration.
