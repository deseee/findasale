# Weekly Comprehensive Site Audit — 2026-06-13 (Sat)

**Type:** Automated weekly quality gate (scheduled, Patrick not present)
**Auditor:** Cowork main session
**Scope:** finda.sale production — public, organizer, shopper, admin route classes
**Phase 5 rotation this week:** Week 24 → Rotation 0 (Organizer: `create-sale.tsx` + `add-items/[saleId].tsx`)

---

## Verdict

**No CRITICAL or HIGH findings. Site is in good shape.** Public route smoke test, role-gating, dark mode, and the rotation-0 organizer flow all passed with tool-cited evidence. Roadmap has **zero actively-BROKEN rows**; Blocked Queue holds **1** item (below the QA ceiling of 8). No Blocked Queue additions required this session.

---

## Evidence Summary (screenshot IDs)

| Route | Screenshot | Result |
|-------|-----------|--------|
| `/` (homepage) | ss_2844wy8fu | Clean. Inclusive hero copy, dark mode readable, map renders below promo banners (S968 CLS fix confirmed), 0 console errors |
| `/pricing` | ss_9456cmrxk | Clean. "Sell smarter." hero + Become-an-Organizer CTA, dark mode fine |
| `/this-weekend` (bare) | ss_1098ki1mg | 404 **by design** (dynamic `[city].tsx` route; sitemap only emits `/this-weekend/{slug}`). 404 page renders clean with "Back to Home" CTA |
| `/estate-sales/denver-co` | ss_5084qumzg | SEO3 page clean — H1, breadcrumb, "50 estate sales listed", filter pills, sale cards |
| `/sales/cmoqkho2w035p54kkg0rz5z7r` | ss_892350gke | Sale detail clean. Browser tab title is sale-specific → SEO1 SSR-head fix confirmed live |
| `/organizer/dashboard` as shopper | ss_6086ec3ms | Role-gating works → redirects to `/access-denied` "Organizer Area" page with CTA. No 500, no blank |

Console: the **only** runtime error across every page tested is the MetaMask browser-extension conflict (`inpage.js` — "Cannot set property ethereum"). This is third-party wallet-extension noise, **not app code** (documented S968/S969).

---

## Phase 5 — Deep Flow Code Review (Rotation 0): `create-sale.tsx` + `add-items/[saleId].tsx`

Both files reviewed at code level (citations below). **No findings.**

- **SSR safety:** All `window.*` / `document.*` / `localStorage.*` usages are inside `useEffect` or guarded with `typeof window !== 'undefined'`.
  - `create-sale.tsx:235` — `document.documentElement` inside `useIsDark()` useEffect.
  - `create-sale.tsx:2036` — `localStorage.getItem` inside `useState` initializer with `typeof window` guard + try/catch.
  - `create-sale.tsx:2187` — `window.gtag` guarded with `typeof window !== 'undefined' && window.gtag`.
  - `add-items/[saleId].tsx:522` — `localStorage` inside useEffect with `typeof window === 'undefined' return` guard.
  - `add-items/[saleId].tsx:564` — `window.addEventListener('focus')` inside useEffect with cleanup.
  - `add-items/[saleId].tsx:646` — `window.gtag` guarded.
- **Loading / error / empty states:** Present. `create-sale.tsx` has `validationErrors` per-field display (L880/895), `uploading` spinner state (L1118/1289), upload `catch` → `showToast(...'error')` (L1140), and a dedicated `tierLimitError` UI block (L1697). `add-items` returns 66 hits across `isLoading`/`catch`/`showToast`/`empty` markers.
- **console.log / alert():** None in either file.

---

## Adversarial / Code Checks

- **Dark mode `text-warm-900` without `dark:` variant** (the #1 historical offender, D-002): grep returned **2 matches, both false positives** — `FeedbackMenu.tsx:61` and `FeedbackSurvey.tsx:138` use a JS ternary `isDark ? 'text-warm-100' : 'text-warm-900'`, which is dark-aware at runtime. **Zero real violations.**
- **Role access control:** Shopper → `/organizer/dashboard` correctly blocked via `/access-denied` (ss_6086ec3ms). Not a 500.
- **Dynamic-only route directories** (`trail/`, `refer/`, `creator/`, `shoppers/`, `organizers/`, `wishlists/`, `guide/`, `this-weekend/`) have no `index.tsx` by design — they are parameterized routes and nothing links to their bare paths (verified via grep; only the sitemap references `/this-weekend/{slug}`). No findings.

---

## Findings by Severity

### CRITICAL
None.

### HIGH
None.

### MEDIUM
- **[data-freshness] `/estate-sales/{city}` SEO pages show all listings as "Ended"** (ss_5084qumzg). This is the **already-tracked** gap noted in roadmap SEO3 / #473 (FB Events overhaul to refresh listing data). Not a new finding — referenced for continuity. No new Blocked Queue entry needed (already on roadmap).

### LOW
- **[third-party] MetaMask extension console error on all pages.** `inpage.js` global-ethereum-provider conflict. Not app code; no user impact; no action. Recurs because the QA browser profile has wallet extensions installed.

---

## Summary

- **Total routes enumerated:** 237 page files under `packages/frontend/pages/` (excludes `_app`, `_document`, `/api/`).
- **Routes Chrome-tested this session:** 6 representative routes across public / SEO / sale-detail / role-gating classes (homepage, pricing, 404, city SEO, sale detail, organizer-as-shopper).
- **Phase 5 flow pair (rotation 0):** `create-sale.tsx` + `add-items/[saleId].tsx` — 0 findings.
- **Findings:** 0 CRITICAL, 0 HIGH, 1 MEDIUM (pre-tracked), 1 LOW (third-party).
- **Self-audit gate:** CRITICAL+HIGH count = 0; screenshot IDs collected = 6. 0 ÷ 2 = 0 ≤ 6 ✓ — no UNVERIFIED inflation.
- **BROKEN roadmap items still unresolved:** None. The roadmap "BROKEN — Fix Before Anything Else" section currently contains only FIXED/SHIPPED rows.
- **Blocked Queue additions this session:** None (no CRITICAL/HIGH). Existing queue: 1 item (#313 HAUL_POST_LIKES re-award fix — pending multi-account Chrome verify, env-blocked).

### Top 3 recommendations for next session
1. **Refresh SEO city-page listing data** (SEO3 / #473) — every Denver listing reads "Ended," which weakens the demand-side SEO flywheel for the highest-impression clusters. Prioritize the FB Events / scraper freshness overhaul.
2. **Clear the #313 Blocked Queue item** when a multi-account environment is available — the idempotency fix shipped S970 but needs 10 accounts liking one haul post to confirm the author's XP fires once.
3. **Next Phase 5 rotation (Week 25 → Rotation 1):** code-review `organizer/dashboard.tsx` + `organizer/edit-sale/[id].tsx`.
