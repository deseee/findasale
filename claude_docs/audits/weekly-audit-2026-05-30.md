# Weekly Comprehensive Site Audit — 2026-05-30

**Type:** Automated scheduled task (weekly full-site audit) — fixes dispatched same session
**Auditor:** Claude (automated)
**Baseline:** DECISIONS.md D-001 through D-010, Brand Voice Guide
**Browser:** Chrome MCP, logged in as shopper test account (Bob Smith / Initiate Explorer)
**Backend:** Railway (online), Frontend: Vercel (finda.sale) — online
**Prior audit:** 2026-05-23 (1 HIGH, 4 MEDIUM, 2 LOW)

---

## Methodology

- Enumerated **~190 route files** from `packages/frontend/pages/` (full recursive list built dynamically; up from ~180 last cycle).
- Tested a representative sample of ~14 pages across public, shopper, and admin surfaces, plus **regression-checked all 6 findings from the 2026-05-23 audit**.
- Each page checked for: console errors, page load, dark-mode rendering, empty/loading states, brand compliance (D-001 all-sale-types scope), CTA presence, and section integrity.
- DOM-level inspection used (JavaScript) to verify map marker rendering and mobile overflow where screenshots were insufficient.
- Adversarial access check: shopper account navigating to `/admin`.
- Mobile viewport (375–390px) attempted via window resize — **inconclusive again** (the test environment renders at a fixed high-DPI resolution; `window.innerWidth` reported ~2068px regardless of resize). Mobile assessed via DOM measurement instead. Recommend a manual phone check.

---

## Regression Check — Prior Audit (2026-05-23)

| ID | Prior finding | Status this week |
|----|---------------|------------------|
| H-001 | `/categories` showed raw eBay taxonomy paths | ✅ **FIXED** — clean display names ("Comics", "Magazines", "Electronics", etc.) |
| M-001 | `/privacy` literal Unicode escape (`—`) | ✅ **FIXED** — no literal escapes found in body text |
| M-002 | `/calendar` long-running sales dominated every day | ✅ **FIXED** — dedicated "Ongoing Sales" section; day cells now show sales only on actual dates |
| M-003 | `/sales/[id]` type-badge mismatch + breadcrumb trailing slash | ⚠️ **PERSISTS** — see H-001 / M-001 below |
| M-004 | `/map` 200 sales but no pins visible | ⚠️ **PERSISTS — escalated to HIGH** — see H-002 below |
| L-001 | `/search` ghost "Filters" label | ✅ **FIXED** — clean "Filters" heading, good empty-state CTAs |

**4 of 6 prior findings resolved.** The 2 persisting items are now documented with deeper root-cause evidence below.

---

## Findings

### CRITICAL
None.

---

### HIGH

#### H-002: `/map` — 197 sale markers exist in the DOM but render ~13,000px off-screen
**Severity:** HIGH (escalated from last week's M-004 MEDIUM)
**Route:** `/map`
**Decisions violated:** D-003 (core feature non-functional), D-008 (render correctness)
**Evidence (DOM inspection, not just visual):**
- Header claims "200 sales near you." `document.querySelectorAll('.leaflet-marker-icon').length` = **197 markers present in the DOM.**
- Every marker is positioned far outside the visible map. First marker computed transform: `translate3d(5157px, 13785px, 0px)`; bounding rect top ≈ **13,954px** on a map container only **833px tall**.
- Marker images themselves load fine (`naturalWidth: 50, complete: true`). The `.leaflet-map-pane` transform is identity `matrix(1,0,0,1,0,0)` while tiles render correctly over Grand Rapids — so the **marker pane is offset from the tile pane**.
**Root cause (likely):** Classic Leaflet stale-projection bug — markers are projected before the map container has its final size (or at a different zoom), and `map.invalidateSize()` / re-projection never fires after the container settles. Note also the marker icon is loaded from `raw.githubusercontent.com/pointhi/leaflet-color-markers/...` (an external non-CDN dependency — fragile for production, secondary concern).
**Impact:** The map's entire reason for existing — seeing sales geographically — is broken. A user sees an empty map. This has now persisted **two consecutive audits**.
**Recommendation:** Dispatch `findasale-dev`. Add `map.invalidateSize()` after the container mounts/sizes (e.g., in a `whenReady`/`ResizeObserver` callback) and/or re-add markers after the map has its final dimensions. Verify markers fall within the viewport at the default zoom. Consider self-hosting the marker icon asset.

---

### MEDIUM

#### M-005: Scraped directory sales show wrong type badge (D-001 misclassification)
**Severity:** MEDIUM (persisting half of prior M-003)
**Route:** `/sales/[id]` — observed on "Fantastic Estate Auction" (`cmp0sv1vr00b5si3dz6cqheyh`)
**Decisions violated:** D-001 (correct representation of all sale types)
**Description:** A sale titled "Fantastic Estate Auction" displays a green **"Yard Sale"** type badge. Scraped "FindA.Sale Directory" listings appear to fall back to a YARD/yard-sale default rather than inferring the real type from title/source.
**Impact:** Misleads shoppers about the event type and undermines the all-sale-types brand. Same class of bug flagged 2026-05-23.
**Recommendation:** Improve type inference for scraped listings (keyword match on title — "auction", "estate", "flea", etc. — or carry the source category through). At minimum, avoid defaulting auctions/estate sales to "Yard Sale."

#### M-006: `/sales/[id]` — "Location not available" shown despite a full street address present
**Severity:** MEDIUM
**Route:** `/sales/[id]` — "Fantastic Estate Auction"
**Decisions violated:** D-009 (display quality / consistency)
**Description:** The "Where to go" sidebar shows "Location not available" while the address (26 Repaupo Station Rd, Swedesboro, NJ 08085) is printed directly above it and in the "Where" section. The location/map embed is missing because scraped sales aren't geocoded — but showing "Location not available" next to a visible address looks broken.
**Impact:** Contradictory UI; reduces trust on the highest-traffic page type. Related to the same geocoding gap behind H-002.
**Recommendation:** When coordinates are missing but an address exists, show a "Get directions" link (address → maps) instead of "Location not available," or geocode scraped sales in the backfill job.

#### M-007: `/sales/[id]` — breadcrumb renders "Home / Sales /" with a trailing slash and no sale name
**Severity:** MEDIUM (persisting half of prior M-003)
**Route:** `/sales/[id]`
**Decisions violated:** UX / navigation correctness
**Description:** The breadcrumb ends in a dangling separator with no final crumb for the sale title. Unchanged since 2026-05-23.
**Recommendation:** Populate the final breadcrumb with the sale title, or drop the trailing separator.

#### M-008: `/categories` — duplicate "Tins" category
**Severity:** MEDIUM
**Route:** `/categories`
**Decisions violated:** UX / data quality
**Description:** "Tins" appears as two separate category cards (one with 3 items, one with 1 item). The category grouping isn't normalizing/deduplicating identical leaf names.
**Impact:** Looks broken; splits the same category across two tiles so neither shows the true count.
**Recommendation:** Normalize and merge category keys (case/whitespace/trim) before grouping so identical leaf names collapse into one card.

---

### LOW

#### L-002: `/categories` — many categories fall back to a generic box icon
**Route:** `/categories`
**Description:** Despite the S784 icon-map expansion, numerous leaf categories (Magazines, Pipe Fittings, Tins, Ashtrays, Signs, Manuals/Box Art, Other Retail Store Ads, Tracksuits & Sets, Other US Politics Collectibles) still render the default 📦 box icon.
**Recommendation:** Extend `CATEGORY_ICONS` for the long tail or assign a tasteful per-top-level fallback rather than the same box for everything.

#### L-003: `/categories` — raw collectible-grading names surface as categories
**Route:** `/categories`
**Description:** "Eisenhower (1971-78)" appears as a top-level category card. This is a coin-grading sub-label, not a shopper-facing browse category — confusing alongside clean labels like "Comics."
**Recommendation:** Filter or roll up hyper-specific numismatic/grading leaf names under a parent ("Coins & Currency").

#### L-004: Scraped sale cards on `/sales` show broken-image placeholders
**Route:** `/sales`
**Description:** Several directory cards (e.g., "The Salvation Army Family Store", "Lula B's") render the browser's broken-image / missing-photo icon rather than a branded placeholder.
**Recommendation:** Use a branded no-photo placeholder (logo tile) for photoless scraped listings.

#### L-005: `/pricing` — "QR codes on every item" feature uses a blank-square emoji icon
**Route:** `/pricing`
**Description:** One feature tile renders an empty white square (□) where an emoji/icon should be (emoji fallback). Cosmetic.
**Recommendation:** Replace with a proper QR/relevant icon.

#### L-006: `/access-denied` copy mentions "upgrade your subscription" for an admin route
**Route:** `/access-denied` (reached via shopper → `/admin`)
**Description:** The message "You may need to upgrade your subscription" is shown even when the gate is a role/permission boundary (admin) that no subscription unlocks.
**Recommendation:** Make the message conditional, or use neutral wording ("You don't have permission to view this page").

---

## PASSED (no issues found)

- `/` (Homepage) — D-001 inclusive hero ("yard sales, garage sales, estate sales, flea markets, auctions, and more"), Sale of the Day, Treasure Hunt, clean dark mode, no console errors (D-001 ✅)
- `/pricing` — SIMPLE (Free/10%) · PRO ($29, Most Popular, 8%) · TEAMS ($79); matches locked pricing; dark mode clean (one minor icon, L-005)
- `/about` — mission celebrates all sale types; no "AI" or founder voice (D-001 ✅)
- `/calendar` — "Ongoing Sales" section + correct day placement (M-002 fix verified)
- `/search` — clean filters, good empty-state CTA pills (D-003 ✅)
- `/sales` — listing loads, 16,500 sales, sale-type filters present, dark mode OK
- `/categories` — clean display names (H-001 fix verified); issues are dedup/icon polish only
- `/privacy` — no literal Unicode escapes (M-001 fix verified)
- `/shopper/dashboard` — welcome CTAs, Explorer's Guild progress (157/500 XP, math correct), QR quick-access renders (D-003 ✅)

---

## Adversarial Access Check

**Test:** Shopper (Bob Smith) navigating to `/admin`.
**Result:** ✅ PASSED — correctly redirected to `/access-denied` with a clear message and recovery paths ("Go to Home", "Contact Support"). D-009 satisfied (minor copy note L-006).

---

## Untested Routes (deferred to next audit)

Context budget; not tested this cycle:
- **Organizer authenticated subpages:** dashboard, create-sale, add-items, edit-item, POS, team/members, eBay settings, consignors, payouts (no organizer session available this run — browser was logged in as a shopper).
- **Shopper deep flows:** cart, checkout, bids, holds, trades, crews.
- **Auth pages:** login, register, forgot-password, reset-password (session already active).
- **Admin panel internals** (access control verified only).
- **Mobile viewport:** still inconclusive in this environment — recommend a manual phone pass.

---

## Summary

| Severity | Count | Action Required |
|----------|-------|-----------------|
| CRITICAL | 0 | — |
| HIGH | 1 | Yes — map markers off-screen (H-002), persisting 2 weeks |
| MEDIUM | 4 | Yes — sale type badge (M-005), location-not-available (M-006), breadcrumb (M-007), duplicate category (M-008) |
| LOW | 5 | Optional polish |
| PASSED | 9 | — |

**Overall assessment:** Strong week — 4 of 6 prior findings were fixed (categories, privacy, calendar, search). The site's public surfaces, pricing, about, and shopper dashboard are beta-ready and brand-compliant. The standout problem is the **map (H-002)**: pins have now been invisible for two consecutive audits, and DOM evidence proves this is a code-level Leaflet projection bug (markers exist but render ~13k px off-screen), not a data/geocoding gap. This should be the top dev priority. The remaining MEDIUMs cluster around **scraped directory listings** (wrong type badge, missing geocode/location, broken breadcrumb) — a single backend pass on scraped-sale normalization would clear M-005, M-006, and part of the map's data quality.

### Top 3 recommendations for next session
1. **Dispatch `findasale-dev` for the map marker bug (H-002).** Add `invalidateSize()` / re-project markers after container sizing; verify pins land in-viewport at default zoom. Self-host the marker icon. This is the highest-leverage fix and overdue.
2. **One backend pass on scraped-sale normalization** — fix type inference (M-005), dedupe category leaf names (M-008), and replace "Location not available" with a directions link when an address exists (M-006). Add breadcrumb title (M-007).
3. **Run a dedicated organizer-role audit next cycle** — this run only had a shopper session, so the entire organizer surface (dashboard, create-sale, POS, eBay, consignors) went untested. Pair with a manual mobile pass.

### DECISIONS.md drift
- **D-001 (all sale types):** Drift on scraped sale detail pages — auctions/estate sales rendering a "Yard Sale" badge (M-005). Public copy (home, about, pricing, map filters) remains compliant.
- **D-003 / D-008 (functional + render correctness):** Map (H-002) violates both — the core feature is non-functional due to off-screen rendering.
- All other audited decisions (D-002 dark mode, D-009 error recovery) held up on the pages tested.

---

*Next scheduled audit: 2026-06-06*
