# Weekly Full-Site Audit — 2026-04-23

**Audit type:** Automated scheduled task (weekly-full-site-audit)
**Site tested:** https://finda.sale
**Session:** Automated (no human present)
**Accounts used:**
- Browser session persisted as Alice Johnson (user1@example.com, ADMIN + ORGANIZER, Scout rank)
- Public (logged-out equivalent) checks via SSR HTML fetches
**Decisions checklist:** DECISIONS.md D-001 through D-010
**Prior audit:** weekly-audit-2026-04-16.md

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 5 |
| LOW | 4 |
| PASS (verified resolved or clean) | ~25 |

Prior-week findings status: H-001 (search filter dark mode) RESOLVED. H-002 (sale detail section order) RESOLVED. L-001 (sale type badge) RESOLVED. H-003 (Teams tier cap copy) **STILL BROKEN** — regression. M-001 (shopper history clipping) **STILL BROKEN** on mobile. M-004 (Favorites/Wishlist/Collections three-name) **STILL UNRESOLVED** — awaiting Patrick decision.

**3 HIGH findings** — one is a week-over-week DECISIONS.md regression, two are mobile overflow issues on user-facing pages.

---

## HIGH Findings

### H-001 — Pricing page: Teams tier shows "5 team members" (D-007 violation, WEEK 2)

**Route:** `/pricing` (also `/organizer/pricing` which redirects to `/pricing`)
**Decision violated:** D-007 (Teams Tier — Member Cap LOCKED at 12, S240 2026-03-22)
**Evidence:** Navigated to `/pricing`. Ran `document.body.innerText.match(/(\d+|[Uu]p to \d+|[Uu]nlimited)\s+team members/g)` → returned `["5 team members"]`. Confirmed visually in screenshot ss_2890bs6ta: Teams tier card includes bullet "workspace — Includes 5 team members".
**Regression note:** Identical finding to 2026-04-16 H-003. One week later, still not fixed.
**Fix:** Single-line copy change. In `packages/frontend/pages/pricing.tsx`, find "Includes 5 team members" and change to "Up to 12 team members". Grep sitewide for any other "5 team members" or "includes 5" references.
**Dispatch to:** findasale-dev (<5 line copy fix)

---

### H-002 — /admin/items document-level horizontal overflow (D-004 violation)

**Route:** `/admin/items`
**Decision violated:** D-004 (Mobile-First Layout — no horizontal scroll)
**Evidence (two tests, confirming real issue):**
1. At 800px Chrome window: `document.documentElement.scrollWidth` = 1071 vs `clientWidth` = 786 → **285px of document-level horizontal overflow.**
2. At 375px iframe viewport: scrollWidth 857 vs clientWidth 357 → **500px overflow.**

**Root cause analysis:** The table itself IS correctly wrapped — parent is `<div overflowX:auto>` with width 736px, so the 1285px-wide table scrolls internally. NOT a table bug. The actual offender is the mobile nav drawer (`className="lg:hidden fixed top-0 right-0 bottom-0 z-50 w-[85vw] sm:w-72 translate-x-full..."`). When closed, the drawer translates off-screen to the right via `translate-x-full`, which in Chrome extends `documentElement.scrollWidth` by the drawer's width (~288px). This site-wide mobile drawer is fine on most pages because another wrapper clips the overflow — but on `/admin/items` there is no such clipping ancestor, so the translated-off drawer becomes part of the scrollable document.

**Confirming the "only this page" narrowing:** Other admin pages (`/admin`, `/admin/users`, `/admin/sales`, `/admin/feedback`) all report 0 overflow at 375px iframe. So the drawer + site layout is fine globally; something specific to `/admin/items` page structure is permitting the translated-off drawer to be measurable.

**STATE.md context:** Last week's S549 claimed a fix on this page (filter row responsive flex). That fix helped the filter row but the page's document-level overflow persists. Still pending Chrome QA per STATE.md Blocked/Unverified Queue.

**Fix options:**
- Add `overflow-x: hidden` to the main content wrapper on `/admin/items` (matches other admin pages).
- Or globally: add `overflow-x: hidden` to `<body>` or the top-level layout div — prevents translated-off drawer from ever extending document width anywhere.
- Do NOT touch the table — it's already properly wrapped.
**Dispatch to:** findasale-dev

---

### H-003 — /shopper/history has 25px mobile horizontal overflow (D-004 violation, WEEK 2)

**Route:** `/shopper/history`
**Decision violated:** D-004 (Mobile-First Layout)
**Evidence:** Tested at 375px iframe viewport. scrollWidth=382, clientWidth=357, overflow=25px. Last week's M-001 reported desktop column clipping; mobile overflow persists.
**Fix:** Review purchase history table layout. Apply `overflow-x-auto` wrapper OR convert to stacked card list on small viewports. Ensure price and status columns don't force oversize. Tested in this audit at 2026-04-23.
**Dispatch to:** findasale-dev

---

## MEDIUM Findings

### M-001 — Favorites / Wishlist / Collections — three names for one feature (D-003 spirit, WEEK 2 unresolved)

**Routes:** `/shopper/favorites` (nav label "Favorites"), `/shopper/wishlist` (URL slug "wishlist"), page title `<title>My Collections – FindA.Sale</title>` (page title "Collections")
**Evidence:** `fetch('/shopper/wishlist')` returns HTML with `<title>My Collections – FindA.Sale</title>`. Nav and URL slug use different terms.
**DECISION NEEDED — Patrick:** Same finding as 2026-04-16 M-004. No resolution recorded. Recommend picking ONE name and locking it in DECISIONS.md. Options: (1) "Favorites" — universal, least friction; (2) "Wishlist" — descriptive; (3) "Collections" — most brandable, matches Explorer's Guild progression framing. Once decided, update nav label, URL slug (redirect old), page title.
**Not a dispatch** — needs product decision first.

---

### M-002 — Sale detail page shows "PUBLISHED" status for past-dated sales (brand voice)

**Route:** `/sales/[id]` (tested on cmn9opmla004hij7t6yde2su0 — "Downtown Downsizing Sale 17", Feb 26–27, 2026)
**Evidence:** Today is 2026-04-23. Sale dates are Feb 26–27, 2026 (≈2 months ago). Status pill displays "PUBLISHED" (developer-facing enum value). A shopper seeing this wouldn't know the sale has ended.
**Brand voice note:** "PUBLISHED" is system jargon. User-facing labels should be "ENDED" or "PAST" for sales whose end date is in the past.
**Fix:** Frontend derives status from sale dates. When `endDate < now`, render "ENDED" (or similar) regardless of underlying `status` enum. Preserve the backend enum for admin surfaces but translate in shopper view.
**Dispatch to:** findasale-dev (small conditional fix in sale header component)

---

### M-003 — /search at mobile has 13px horizontal overflow (D-004)

**Route:** `/search` (with query, e.g., `/search?q=furniture`)
**Evidence:** 375px iframe test. scrollWidth=370, clientWidth=357, overflow=13px.
**Fix:** Inspect filter sidebar + results grid at mobile. Likely a min-width on filter sidebar or a flex item not wrapping.
**Dispatch to:** findasale-dev

---

### M-004 — Search page "Filters" heading very low contrast in dark mode

**Route:** `/search?q=[query]` — filter sidebar
**Evidence:** Visual confirmation in screenshot ss_23381w14z: the "Filters" heading at top of the filter sidebar renders as extremely dim text — barely visible against dark background. Individual filter labels (Price Range, Condition, etc.) render correctly in dark mode, so this is scoped to the outer heading class.
**Decision reference:** D-002 (Full Dark Mode Support) — dark mode text must be readable.
**Fix:** Add `dark:text-gray-200` (or equivalent) to the `<h2>Filters</h2>` (or similar wrapper) in the search filter sidebar component.
**Dispatch to:** findasale-dev (1-line fix)

---

### M-005 — /organizer/earnings Gross Revenue lacks thousands separator

**Route:** `/organizer/earnings`
**Evidence:** Rendered value "Gross Revenue $2005.28". US-formatted currency should be "$2,005.28".
**Impact:** At $10k+ revenue this becomes very hard to read ("$10283.47" vs "$10,283.47"). Minor but breaks polish for a key money-display page.
**Fix:** Use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` or `value.toLocaleString('en-US', { minimumFractionDigits: 2 })` in the earnings formatter utility.
**Dispatch to:** findasale-dev

---

## LOW Findings

### L-001 — Sale type badge rendered outside header card (minor D-006 spec drift)

**Route:** `/sales/[id]`
**Evidence:** D-006 specifies "Sale Header (title, type badge, dates, status)" as element 1 — type badge should be IN the header. Currently the "ESTATE" badge renders in its own block BETWEEN the header card and the "Organized by" card. Section order is otherwise correct.
**Fix:** Move the type badge rendering inside the header card (next to title/dates/status pill). Cosmetic, low priority.

---

### L-002 — /shopper/explorer-profile 5px mobile overflow

**Route:** `/shopper/explorer-profile`
**Evidence:** 375px iframe test. scrollWidth=362, clientWidth=357, overflow=5px. STATE.md notes wishlist "Add" buttons on this page were flagged in S549 — still trace overflow.
**Fix:** Minor. Inspect wishlist Add input+button row for residual overflow.

---

### L-003 — /sales/[id] 8px mobile overflow

**Route:** `/sales/[id]`
**Evidence:** 375px iframe test. scrollWidth=365, clientWidth=357, overflow=8px. Very minor, may be a stray margin.
**Fix:** Minor. Scan sale detail page at 375px for a container without `max-w-full` or a horizontal button row.

---

### L-004 — Pricing feature grid overflows right at 980px viewport

**Route:** `/pricing`
**Evidence:** Desktop screenshot at 980px (ss_2890bs6ta and ss_0651y30v8): the 3-column feature cards ("Photo to listing" | "List everywhere" | "Social posts, ready to share") have their third column truncated on the right. The grid appears designed for ≥1024px. Mobile (375px) stacks cleanly — no issue there. Tablet/small-laptop (768–1023px) viewports have a degraded experience.
**Fix:** Adjust the grid breakpoint so the 3-column layout only activates at `lg:` (1024px) and above; use 2-col between `sm:` and `lg:`. Or reduce card min-width.
**Dispatch to:** findasale-dev (cosmetic polish)

---

## PASS / Verified Resolved

- **D-001 (All Sale Types):** Homepage hero correctly lists "estate sales, garage sales, yard sales, auctions, flea markets, and more." Prior-week drift NOT observed.
- **D-002 (Dark Mode):** Homepage, admin dashboard, organizer earnings, search filter labels, sale detail, pricing, trending, favorites — all readable in dark mode. Prior-week H-001 (search filter labels) confirmed RESOLVED.
- **D-006 (Sale Detail Section Order):** Prior-week H-002 RESOLVED. Section order now: Header → Organized by → About → Sidebar → Items for Sale → Reviews → Location. Items correctly precede Reviews and Location. Sale type badge present (prior L-001 RESOLVED).
- **S550 P0 fixes:** `/admin`, `/organizer/earnings`, `/organizer/calendar` all render without ErrorBoundary. Each verified with javascript_tool inspection.
- **No console errors site-wide** except MetaMask extension noise (external, not our code).
- **No ErrorBoundary** on any of 19 tested routes (admin/*, organizer/*, shopper/*, public pages).
- **Mobile viewport clean (0 overflow)** at 375px on: `/`, `/trending`, `/pricing`, `/shopper/dashboard`, `/shopper/wishlist`, `/shopper/favorites`, `/organizer/dashboard`, `/organizer/workspace`, `/organizer/sales`, `/organizer/settings`, `/organizer/insights`, `/organizer/edit-sale/[id]`, `/admin`, `/admin/users`, `/admin/sales`, `/admin/feedback`, `/map`, `/login`, `/register`.

---

## Decisions Drift Check

| Decision | Status | Notes |
|----------|--------|-------|
| D-001 All Sale Types | ✅ No drift | Homepage copy lists all types |
| D-002 Dark Mode | ⚠️ Minor drift | Search "Filters" heading dim (M-004) |
| D-003 Empty States | Not tested in depth | Need logged-out browsing of favorites/messages/dashboards |
| D-004 Mobile-First | ❌ 3 violations | /admin/items (500px), /shopper/history (25px), /search (13px) |
| D-005 Multi-Endpoint | Not tested | Requires two-account messaging flow — deferred |
| D-006 Sale Detail Order | ✅ RESOLVED | Items now before Reviews |
| D-007 Teams Member Cap | ❌ WEEK 2 REGRESSION | Still says 5 instead of 12 |
| D-008 Loading States | Not tested in depth | Page fetches did load content eventually |
| D-009 Error Recovery | Not tested | No errors triggered in audit |
| D-010 No Autonomous Removal | ✅ No evidence of drift | Nav/UI consistent with expectations |

---

## Top 3 Recommendations for Next Session

1. **Ship the Teams tier cap copy fix before anything else.** H-001 is a ~2 minute change to a committed, locked decision (D-007) that has now gone un-shipped for two consecutive weekly audits. This is exactly the kind of rot that STATE.md is supposed to catch.

2. **Clip /admin/items document-level overflow.** 285–500px overflow is by far the worst finding. Root cause isn't the table (already wrapped correctly) — it's the translated-off mobile drawer. Fix: add `overflow-x: hidden` to main content wrapper on this page (or globally on body to prevent future occurrences).

3. **Make a decision on Favorites vs Wishlist vs Collections naming.** This finding has survived at least two weekly audits unresolved. Either lock it in DECISIONS.md or accept that the three-name confusion is intentional (it probably isn't).

---

## Methodology Notes

- **Mobile viewport testing** used the S548 iframe harness technique (`<iframe width=375>` inside a desktop Chrome window) because Chrome on Windows enforces a 454px window-width floor that prevents real mobile testing via `resize_window`.
- **Batched overflow checks** via a single `javascript_tool` call iterating `iframe.src = route` and measuring `documentElement.scrollWidth vs clientWidth`. Fast and reliable.
- **SSR-only routes checked via fetch()** — avoids client-side hydration flicker, catches 5xx / error boundaries that render server-side.
- **Session was pre-authenticated** as Alice Johnson (ADMIN + ORGANIZER + Scout) — did not test full logged-out / unauthenticated paths rigorously; public routes were reachable but nav would show auth UI where auth gates exist.
- **Did NOT test:** messaging flows (D-005 multi-endpoint — requires two real accounts), trail completion, Hunt Pass flows, treasure hunt QR, treasure trails mobile geolocation. These require specific test data states that were not available in this automated run.

---

## Files Modified in This Audit

Only this file: `claude_docs/audits/weekly-audit-2026-04-23.md`

No code changes. No pushes. Findings queued for Patrick review and dev dispatch.
