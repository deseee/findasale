# Weekly Full-Site Audit — 2026-04-16

**Audit type:** Automated scheduled task (weekly-full-site-audit)
**Site tested:** https://finda.sale
**Session:** Automated (no human present)
**Accounts used:**
- Logged-out visitor (public routes)
- Shopper: user11@example.com — Karen Anderson (Hunt Pass active)
- Organizer: artifactmi@gmail.com — Artifact MI (TEAMS tier)
**Decisions checklist:** DECISIONS.md D-001 through D-010

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 4 |
| LOW | 1 |
| PASS | 14 |

**3 HIGH findings require dispatch before next organizer-facing demo.** Two are DECISIONS.md violations (D-002 dark mode, D-007 team cap copy). One is a D-006 section order regression.

---

## HIGH Findings

### H-001 — Search page: Filter labels invisible in dark mode (D-002 violation)

**Route:** `/search`
**Decision violated:** D-002 (Full Dark Mode Support)
**Evidence:** Navigated to `/search` as logged-out visitor. Opened browser in dark mode. Filter sidebar section labels (Price Range, Condition, Category, Sale Status, Sort By) and all radio button option text are completely invisible — white-on-white or near-transparent text against dark background. The sidebar structure is present but unreadable. Zoomed screenshot confirmed no visible text on filter labels.
**Screenshot:** ss_9842ztwdk (captured during audit session)
**Fix:** Add `dark:text-gray-200` (or equivalent) to all filter label and option text elements in the search sidebar component. Likely `SearchFilters.tsx` or similar. Dark variants for section headings, radio labels, and checkbox labels.
**Dispatch to:** findasale-dev

---

### H-002 — Sale detail page: Section order violates D-006

**Route:** `/sales/[id]`
**Decision violated:** D-006 (Sale Detail Page Section Order)
**Evidence:** Navigated to a live sale detail page as logged-out visitor. Ran `document.querySelectorAll('h2, h3')` DOM query. Actual section order observed: Header → Organizer Info Card → About Description → Live Activity → Share/QR/Contact/Sidebar → **Reviews** → **Location/Map** → **Items for Sale** (at very bottom). D-006 requires Items for Sale to be the FIRST full-width section (position 5), appearing BEFORE Community Photos, Map/Location, and Reviews.
**D-006 required order:**
1. Sale Header
2. Organizer Info Card
3. Flash Deal Banner (conditional)
4. Two-column grid: Photo gallery + About | Sidebar (share, QR, contact, etc.)
5. **Sale Items ← first full-width section**
6. Community Photos / UGC
7. Map / Location
8. Reviews
9. Modals

**Current order (wrong):** Items is at position ~7, after Reviews and Map.
**Fix:** Reorder JSX sections in `packages/frontend/pages/sales/[id].tsx` so the Items grid appears immediately after the two-column grid block, before Reviews and Map. No logic change — pure section reorder.
**Dispatch to:** findasale-dev

---

### H-003 — Pricing page: Teams tier shows wrong member cap (D-007 violation)

**Route:** `/organizer/pricing`
**Decision violated:** D-007 (Teams Tier — Member Cap, LOCKED S240)
**Evidence:** Navigated to `/organizer/pricing` as logged-out visitor. Teams tier card reads: "Multi-user workspace — Includes 5 team members." D-007 is LOCKED at 12 members. This is not a product decision — it is a copy error against a locked decision.
**Screenshot:** ss_7369zyuxf (captured during audit session)
**Fix:** Update the Teams tier description copy on `pricing.tsx` (or equivalent pricing page component) from "Includes 5 team members" to "Up to 12 team members." Also check for any other hardcoded "5 team members" references sitewide.
**Dispatch to:** findasale-dev (single-line copy fix, <5 lines)

---

## MEDIUM Findings

### M-001 — Purchase history: Price column and status clipped at desktop

**Route:** `/shopper/history`
**Evidence:** Navigated to `/shopper/history` as Karen Anderson (user11). At 1280px desktop viewport, the Price column values and "PENDING" status badges are clipped/truncated — overflowing or hiding behind column boundaries. The table layout does not have enough column width at standard desktop widths.
**Screenshot:** ss_9438x4th3 (captured during audit session)
**Fix:** Review table column widths in purchase history component. Apply `min-w-[...]` or `whitespace-nowrap` to price and status columns. Consider responsive table behavior (horizontal scroll wrapper at mobile).
**Dispatch to:** findasale-dev

---

### M-002 — Map page: Tiles blank on load

**Route:** `/map`
**Evidence:** Navigated to `/map` as logged-out visitor. Screenshot shows a blank grey/white area where the map should be. DOM inspection confirmed Leaflet framework is loading (`© OpenStreetMap contributors` visible in body), but tiles are not rendering visibly in the testing environment. This may be a known screenshot tool limitation (Leaflet renders via canvas/WebGL which doesn't always capture in headless screenshots), but cannot be ruled out as a real user-facing issue.
**Status:** UNVERIFIED — cannot confirm whether this is a real user bug or a screenshot tool artifact. Leaflet attribution is present in DOM, suggesting partial load. Recommend Patrick to manually open `/map` in a real browser and confirm tile rendering.
**No dispatch until Patrick confirms bug is real.**

---

### M-003 — Trending page: Missing-photo placeholders harsh in dark mode

**Route:** `/trending`
**Evidence:** Navigated to `/trending` as logged-out visitor in dark mode. Sales without photos show bright white rectangle image placeholders that appear harshly against the dark background — high contrast jarring effect. Not a full D-002 violation (the page itself has dark mode support) but the placeholder treatment for missing sale images needs a dark-aware fallback.
**Screenshot:** ss_2441j5y5x (captured during audit session)
**Fix:** Add `dark:bg-gray-700 dark:border-gray-600` (or similar) to the image placeholder container in the trending sale card component. Replace or darken the placeholder background in dark mode.
**Dispatch to:** findasale-dev (low effort, cosmetic)

---

### M-004 — Favorites/Wishlist/Collections: Three names for one feature

**Route:** `/shopper/favorites` → redirects to `/shopper/wishlist` → page title "My Collections"
**Evidence:** The feature has three different names depending on where you encounter it: "Favorites" (nav link label), "Wishlist" (URL slug), "Collections" (page title/heading). A first-time user clicking "Favorites" in the nav would land on a page called "My Collections" — potentially confusing.
**Decision flag:** Not a DECISIONS.md violation, but conflicts with D-003 spirit (clear, guided UX) and general brand voice coherence.
**DECISION NEEDED — Patrick:** Pick one name for this feature and enforce it everywhere. Options: (1) "Favorites" — simplest, most universal; (2) "Wishlist" — descriptive; (3) "Collections" — most brandable, matches shopper progression framing. Once decided, update nav label, URL slug (add redirect from old), and page title. Flag for findasale-records to lock in DECISIONS.md.

---

## LOW Findings

### L-001 — Sale detail header: Missing sale type badge

**Route:** `/sales/[id]`
**Decision reference:** D-006 specifies "Sale Header (title, type badge, dates, status)" as element 1.
**Evidence:** Sale detail header shows title, dates, and status pill, but no sale type badge (e.g., "Estate Sale", "Garage Sale", "Auction"). This is minor compared to H-002 (section order), but the type badge is specified in D-006 as a header element.
**Fix:** Add a sale type badge/pill to the sale header section. Can reuse existing `SaleTypeBadge` component if it exists, or create a small inline pill using the sale's `saleType` field.
**Dispatch to:** findasale-dev (low effort)

---

## PASS — Routes Verified

| Route | Role | Status | Notes |
|-------|------|--------|-------|
| `/` | Visitor | ✅ PASS | D-001 compliant — all sale types in hero copy |
| `/about` | Visitor | ✅ PASS | D-001 compliant |
| Footer | Visitor | ✅ PASS | D-001 compliant — "estate sales, garage sales, yard sales, flea markets, auctions" all present |
| `/organizer/dashboard` | Organizer | ✅ PASS | Loads correctly |
| `/organizer/workspace` | Organizer | ✅ PASS | Loads correctly |
| `/organizer/sales` | Organizer | ✅ PASS | Loads correctly |
| `/organizer/settings` | Organizer | ✅ PASS | Loads correctly |
| `/organizer/messages` | Organizer | ✅ PASS | Loads correctly |
| `/shopper/dashboard` | Shopper | ✅ PASS | Rank card, QR code, action buttons all present |
| `/hubs` | Visitor | ✅ PASS | D-003 compliant — empty state with CTA |
| `/messages` | Shopper | ✅ PASS | D-003 compliant — empty state with CTA |
| `/leaderboard` | Shopper | ✅ PASS | Two tabs (Weekly / All Time) load correctly |
| Shopper → `/organizer/dashboard` | Shopper | ✅ PASS | Access denied correctly — redirects to `/access-denied` with CTA |
| Shopper → `/admin` | Shopper | ✅ PASS | Access denied correctly |

---

## Carry-Forward / Deferred

- **M-002 (Map tiles):** Patrick should manually verify in a real browser before dispatch.
- **M-004 (Feature naming):** Decision needed from Patrick before any code change.
- **Brand audit violations (~22 active):** Tracked separately in `claude_docs/audits/brand-drift-2026-04-14.md`. No new violations found this audit beyond what's already logged.

---

## Dispatch Queue (ready to send)

| ID | Fix | Effort | File hint |
|----|-----|--------|-----------|
| H-001 | Search dark mode labels | Low (~15 lines) | SearchFilters.tsx or similar |
| H-002 | Sale detail section reorder | Low (JSX reorder only) | pages/sales/[id].tsx |
| H-003 | Teams tier copy: 5→12 members | Trivial (<5 lines) | pricing.tsx |
| M-001 | Purchase history column clip | Low | shopper/history component |
| M-003 | Trending placeholder dark mode | Trivial | Trending sale card component |
| L-001 | Sale detail type badge | Low | pages/sales/[id].tsx |
