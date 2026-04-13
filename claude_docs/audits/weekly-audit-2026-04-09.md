# Weekly Full-Site Audit — 2026-04-09

**Auditor:** Automated scheduled task (`weekly-full-site-audit`)
**Date:** Thursday, April 9, 2026
**Session:** S423 (automated)
**Scope:** All live routes at finda.sale — logged-out, shopper (Maya Jackson / user13), organizer (Bob Smith / user2)
**Decisions checked:** D-001 through D-010 (DECISIONS.md)
**Previous audit:** 2026-04-02

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 3 |
| LOW | 1 |
| PASS | 18 |

No CRITICAL blockers. Three HIGH items require dispatch before next beta onboarding session. The D-006 section-order violation (items buried below map on sale detail pages) is the most visible user-facing regression and should be prioritized first.

---

## HIGH Findings

---

### H-001 — D-006 VIOLATION: Items section appears BELOW Map and Reviews on sale detail pages

**Decision violated:** D-006 (Sale Detail Page Section Order)
**Page:** `/sales/[id]` — confirmed on `cmn9opmhr004fij7twtde74i9` (Family Collection Sale 16)
**Evidence:** JavaScript `querySelectorAll('h2')` audit revealed section Y-positions:
- Reviews: y=1415
- Location/Map: y=2147
- Items for Sale: y=2667

**Expected order per D-006:**
1. Sale Header
2. Organizer Info Card
3. Flash Deal Banner (conditional)
4. Two-column grid (photos + sidebar)
5. **Sale Items ← must be here**
6. Community Photos / UGC (conditional)
7. Map / Location
8. Reviews

**Impact:** Shoppers visiting a sale page must scroll past reviews and an interactive map before seeing what's for sale. Items are the primary reason a shopper opens a sale detail page. This is a conversion blocker.
**Dispatch:** findasale-dev — reorder sections in `packages/frontend/pages/sales/[id].tsx`

---

### H-002 — D-004 VIOLATION: Mobile navigation broken at 375px viewport

**Decision violated:** D-004 (Mobile-First Layout)
**Evidence:** At 375px (iPhone SE), the full desktop navigation bar is visible:
- Map, Calendar, Feed, Inspiration, Trending, Pricing + search icon all crammed into one row
- "Host a Sale" button text wraps to 3 lines
- No hamburger menu, no collapsed mobile nav
- Icons and text overlap / overflow

**Impact:** The site's mobile navigation is completely broken for phone users. Shoppers at actual sales browse on phones. This is the primary use case.
**Dispatch:** findasale-dev — implement mobile hamburger/drawer nav; hide desktop nav items at breakpoints below md/lg

---

### H-003 — Lucky Roll API returns 404 (backend endpoint not deployed)

**Page:** `/shopper/lucky-roll`
**Evidence:** Console error on page load:
```
Failed to fetch eligibility: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```
The `/api/lucky-roll/eligibility` endpoint returns an HTML 404 page, not JSON. The Lucky Roll migration (`20260408_add_lucky_roll_schema`) is noted in STATE.md as part of S420 Batch 2 — **NOT YET PUSHED**.

**Impact:** The Lucky Roll page renders but the feature is completely non-functional. Any shopper clicking it sees a broken experience with no error explanation.
**Action needed:** Run Lucky Roll migration on Railway (Patrick action), then push S420 Batch 2 code. The page should also show a graceful error state while the feature initializes.

---

## MEDIUM Findings

---

### M-001 — Animation blank zones on homepage, pricing page, and sale detail page

**Pages:** `/` (homepage), `/pricing`, `/sales/[id]`
**Evidence:** Fast-scrolling past animated sections reveals large (500–1100px) completely black zones where content should be visible. JavaScript inspection confirms content IS in the DOM with correct color values — sections use Framer Motion / IntersectionObserver lazy-reveal animations that only trigger when the user naturally scrolls through them at normal speed.

**Impact:** Users who fast-scroll (very common on mobile) see what looks like broken/empty sections before content fades in. Creates a "broken app" first impression. Particularly bad on the pricing page where full pricing tier cards disappear.
**Recommendation:** Add `initial={{ opacity: 1 }}` fallback or use `once: true` with lower threshold so content reveals sooner; or disable animation for users who prefer reduced motion (`prefers-reduced-motion`).
**Dispatch:** findasale-dev (low urgency — cosmetic, but bad first impression)

---

### M-002 — `/organizer/analytics` returns 404

**Page:** `/organizer/analytics`
**Evidence:** Navigating directly returns "Page not found" (404). This URL is not currently linked from nav, but it is a predictable URL that organizers might try.
**Impact:** Low — not currently linked. However, if it's referenced anywhere or if SEO crawlers index old references, it will 404.
**Action:** Confirm if analytics page is planned (if yes, build it or add a redirect to dashboard). If it's been removed, ensure no links point to it.
**Dispatch:** Decision needed — build or redirect?

---

### M-003 — POS header quick-action button does not navigate (silent no-op)

**Page:** `/organizer/dashboard`
**Evidence:** The "POS" button in the top quick-action row (pill buttons) has no href and no onClick navigation. Clicking it does nothing. The POS button within the individual sale card correctly links to `/organizer/pos?saleId=[id]`.

**Impact:** Organizers clicking the top "POS" quick-action button get no response — no navigation, no modal, no feedback. Confusing for new organizers.
**Note:** The fix may require the button to prompt sale selection or navigate to the most recent active sale's POS.
**Dispatch:** findasale-dev

---

## LOW Findings

---

### L-001 — POS page console error: `Failed to fetch suppressions` (404)

**Page:** `/organizer/pos?saleId=[id]`
**Evidence:** Console error: `Failed to fetch suppressions: AxiosError: Request failed with status code 404`
**Impact:** Background fetch failure — does not affect visible UI or any user action. Notification suppression list fails silently.
**Dispatch:** findasale-dev (clean up missing route or guard the fetch)

---

## PASS Results

| Area | Route | Status | Notes |
|------|-------|--------|-------|
| Homepage (logged out) | `/` | ✅ PASS | Hero mentions all sale types (D-001). Map shows 14 active sales. |
| Sale listings | `/` scrolled | ✅ PASS | Cards load with images, dates, organizer names, favorites. Dark mode readable. |
| Login page | `/login` | ✅ PASS | Form renders, error state shows correctly on bad credentials. |
| Shopper dashboard | `/shopper/dashboard` | ✅ PASS | Metrics, recent activity, hunt pass progress all render. |
| Favorites | `/shopper/favorites` | ✅ PASS | Empty state with CTA (D-003 compliant). |
| Messages | `/shopper/messages` | ✅ PASS | Empty state with CTA (D-003 compliant). |
| Hunt Pass | `/shopper/hunt-pass` | ✅ PASS | XP bar, rank, challenges render correctly. |
| Leaderboard | `/shopper/leaderboard` | ✅ PASS | Ranks and scores display. Dark mode readable. |
| Shopper history | `/shopper/history` | ✅ PASS | Transaction list renders (S422 changes working). |
| Sale type filters | Homepage sidebar | ✅ PASS | All Types, Estate, Yard, Auction, Flea Market, Consignment shown (D-001). |
| Auth access control | `/organizer/dashboard` as shopper | ✅ PASS | Correctly redirected. |
| Organizer dashboard | `/organizer/dashboard` | ✅ PASS | Welcome, plan tier, sale card, metrics, rank badge all render. |
| POS page | `/organizer/pos?saleId=[id]` | ✅ PASS | Sale selector, quick-add items, 4 payment methods, value tiers. |
| Workspace gate | `/organizer/workspace` | ✅ PASS | Correct TEAMS upsell modal for PRO user. |
| Create Sale | `/organizer/create-sale` | ✅ PASS | All fields present, AI generate button visible, CTA works. |
| Command Center | `/organizer/command-center` | ✅ PASS | Metrics, tabs, empty state with CTA (D-003 compliant). |
| 404 error page | Invalid route | ✅ PASS | Custom 404 with "Back to Home" CTA and support contact. |
| D-002 dark mode | Organizer dashboard, POS, create-sale | ✅ PASS | All tested organizer pages have readable dark mode text. |

---

## Decisions Compliance Summary

| Decision | Status | Notes |
|----------|--------|-------|
| D-001 All Sale Types | ✅ | Homepage hero, sale type filters, calendar all include full range |
| D-002 Full Dark Mode | ✅ | All tested pages pass dark mode readability |
| D-003 Empty States with CTAs | ✅ | Favorites, messages, command center all compliant |
| D-004 Mobile-First 375px | ❌ **VIOLATION** | See H-002 — desktop nav not responsive |
| D-005 Multi-Endpoint Testing | UNVERIFIED | Not tested this session |
| D-006 Sale Detail Section Order | ❌ **VIOLATION** | See H-001 — items below map |
| D-007 Teams 12-Member Cap | UNVERIFIED | Not tested this session |
| D-008 Loading States Mandatory | ✅ | No blank screens observed on tested pages |
| D-009 Error States with Recovery | ✅ | 404 page has recovery CTA; login error is human-readable |
| D-010 No Autonomous Removal | N/A | Enforcement decision, not a UI check |

---

## Routes Not Tested This Session

The following routes exist in `packages/frontend/pages/` but were not reached in this audit session. Flag for next weekly audit:

- `/organizer/sales/[id]/items` — item management
- `/organizer/sales/[id]/edit` — sale editing
- `/organizer/profile` — organizer public profile
- `/shopper/pay-request/[requestId]` — S422 POS payment flow (shopper side)
- `/shopper/profile` — shopper profile
- `/admin/*` — admin routes
- `/hubs/*` — hub pages
- `/inspiration`, `/trending` — discovery pages
- `/appraisals/*` — appraisal flow

---

## Recommended Dispatch Order

1. **findasale-dev** → H-001: Fix sale detail page section order (items before map) in `pages/sales/[id].tsx`
2. **findasale-dev** → H-002: Implement mobile hamburger nav for ≤768px viewports
3. **Patrick action** → H-003: Run Lucky Roll migration on Railway, then push S420 Batch 2
4. **findasale-dev** → M-003: Fix POS quick-action button navigation on dashboard
5. **Decision needed (Patrick)** → M-002: Build or redirect `/organizer/analytics`
6. **findasale-dev (low urgency)** → M-001: Reduce animation blank zones; add reduced-motion support
7. **findasale-dev (low urgency)** → L-001: Fix suppressions 404 on POS page

---

*Audit complete. Report written by automated scheduled task. Next audit: 2026-04-16.*
