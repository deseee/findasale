# Brand Drift Audit — 2026-04-21

**Auditor:** Weekly brand drift detector (automated scheduled task)
**Scope:** All `.tsx` files in `packages/frontend/pages/` and `packages/frontend/components/`, active skill SKILL.md files, DECISIONS.md compliance
**Reference docs:** `claude_docs/brand/DECISIONS.md`, `claude_docs/brand/brand-voice-guide-2026-03-16.md`
**Prior audit:** `claude_docs/audits/brand-drift-2026-04-14.md`
**Run date:** 2026-04-21

---

## Executive Summary

**2 significant items fixed since the 2026-04-14 audit.** The P0 SharePromoteModal social share templates are now fully dynamic (4-cycle fix finally landed), and the subscription.tsx "large estate sale" copy has been corrected to "large sale."

**Remaining violation count: ~17 active** (was ~22 in prior audit, -4 fixed in SharePromoteModal templates, -2 fixed in subscription, net -4 with 1 new finding).

Progress is real but slow — core SEO meta tags, organizer profile meta, and the Nextdoor share text in `sales/[id].tsx` have been flagged every cycle without resolution.

---

## What Was Fixed Since 2026-04-14 ✅

| File | Fix Applied |
|------|-------------|
| `components/SharePromoteModal.tsx` (lines 176, 196, 206) | ✅ FIXED — Nextdoor, neighborhood, and Threads templates now use dynamic `saleTypeLabel` — no longer hardcoded to "estate sale" |
| `pages/organizer/subscription.tsx` (lines 177, 490) | ✅ FIXED — "Everything you need for a large estate sale or auction" → "Everything you need for a large sale." |

---

## Drift Findings

### P1 — Nextdoor Share Text in Sale Detail (NOT FIXED — 4th consecutive audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/sales/[id].tsx` | 881 | "Check out this estate sale on FindA.Sale!" — hardcoded for all sale types in the Nextdoor share button | D-001 |

**Note:** The SharePromoteModal templates were fixed this cycle using the dynamic `saleTypeLabel()` helper. The identical pattern in `pages/sales/[id].tsx` was NOT updated in the same pass. This is the sole remaining P1 in social sharing. The sale object is available in scope — fix is a single line: `"Check out this ${getSaleTypeLabel(sale.saleType)} on FindA.Sale!"`. The `getSaleTypeLabel` function is already imported from `SharePromoteModal`.

**Note on SharePromoteModal line 68:** The function `getSaleTypeLabel` defaults to `'estate sale'` when `saleType` is undefined. Now that templates use it correctly, this fallback is less dangerous — but it should be changed to `'sale'` to match the brand guide. Low-effort fix.

---

### P1 — Homepage SEO Meta / OG Tags (NOT FIXED — 4th consecutive audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/index.tsx` | 266 | `<meta name="description">`: "Find estate sales, garage sales, yard sales, and auctions near you" — omits flea markets | D-001 |
| `pages/index.tsx` | 268 | `<meta property="og:description">`: "Browse estate sales, garage sales, yard sales, and auctions near you" — omits flea markets | D-001 |
| `pages/index.tsx` | 274 | `<meta name="twitter:description">`: "Browse estate sales, garage sales, and auctions near you" — omits yard sales and flea markets | D-001 |
| `pages/index.tsx` | 285 | Schema.org `description`: "browse, buy, and sell items from estate sales, garage sales, and auctions online" — omits flea markets | D-001 |

**Note:** Hero body text at line 320 IS correct — lists all sale types including flea markets. The meta tags simply weren't updated to match.

---

### P1 — SEO Meta on Profile and Search Pages (NOT FIXED — 3rd consecutive audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizers/[id].tsx` | 84 | `<meta name="description">`: "Estate sales by ${organizer.businessName}" — applies to all organizer types including auctioneers, flea market operators | D-001 |
| `pages/sales/zip/[zip].tsx` | 31 | `<meta name="description">`: "Find estate sales in ZIP code ${zip}" — page shows all sale types | D-001 |
| `components/ItemSearchResults.tsx` | 149 | Empty state body copy: "Start browsing estate sales to discover unique finds." — shown to all shoppers | D-001 |

---

### P2 — Organizer Copy (ONGOING from prior audits)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/faq.tsx` | 355 | "Shoppers browse estate sales on the [homepage]" — should be "browse sales" | D-001 |
| `pages/organizer/email-digest-preview.tsx` | 41 | Default businessName fallback: `'Your Estate Sales'` — applies to all organizer types | D-001 |
| `pages/organizer/email-digest-preview.tsx` | 53 | Example sale in preview: `'Estate Sale - Downtown'` — only estate sale shown as sample | D-001 |
| `pages/guide.tsx` | 101 | "Estate sale pricing is typically 20–50% of retail value" — misleads auction and garage sale organizers reading the guide | D-001 |
| `pages/guide.tsx` | 241 | "Share it with other estate sale operators." — referral program is for all organizer types | D-001 |
| `components/SharePromoteModal.tsx` | 68 | `if (!saleType) return 'estate sale'` — fallback label defaults to "estate sale" instead of "sale" | D-001 |

---

### P2 — Promote Page Export Label (NEW — not in prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizer/promote/[saleId].tsx` | 611 | "CSV spreadsheet for dedicated estate sale hunters" — visible user-facing card label describing the EstateSales.NET export; framing treats "estate sale hunters" as the universal shopper audience | D-001 |

**Note:** The label appears on a card specifically for EstateSales.NET export, so some estate sale context is expected. However, the wording implies EstateSales.NET is the primary audience for all organizers, which it isn't. Suggested fix: "CSV for EstateSales.NET — reaches dedicated estate sale shoppers" to clarify scope without overgeneralizing.

---

### P2 — Condition Guide Copy (NOT FIXED from 2026-04-14)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/condition-guide.tsx` | ~91 | OG description: "item condition ratings and price ranges at FindA.Sale estate sales and auctions" — omits garage sales and flea markets | D-001 |
| `pages/condition-guide.tsx` | ~56 | "The estate sale organizer or item seller sets the condition rating" — the condition system applies to all organizer types | D-001 |

---

### P3 — Encyclopedia Title (NOT FIXED from prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/encyclopedia/[slug].tsx` | 207 | Page `<title>`: "{entry.title} \| Estate Sale Encyclopedia" — `pages/encyclopedia/index.tsx` already renders "Resale Encyclopedia"; the slug page doesn't match | D-001 |

---

### D-002 — Dark Mode: Modal Components (NEW — systemic finding)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `components/ActivityFeed.tsx` | 93, 104 | `bg-white rounded-lg shadow-md` — no `dark:bg-gray-800` variant | D-002 |
| `components/BidModal.tsx` | 58 | `bg-white rounded-xl shadow-xl` — no `dark:bg-gray-800` variant on modal container | D-002 |
| `components/BulkCategoryModal.tsx` | 53 | `bg-white rounded-lg` — no dark variant | D-002 |
| `components/BulkOperationErrorModal.tsx` | 31 | `bg-white rounded-lg` — no dark variant | D-002 |
| `components/BulkPhotoModal.tsx` | 90 | `bg-white rounded-lg` — no dark variant | D-002 |
| `components/BulkPriceModal.tsx` | 51 | `bg-white rounded-lg` — no dark variant | D-002 |
| `components/BulkStatusModal.tsx` | 60 | `bg-white rounded-lg` — no dark variant | D-002 |
| `components/BulkTagModal.tsx` | 91 | `bg-white rounded-lg` — no dark variant | D-002 |
| `components/CheckoutModal.tsx` | 364 | `bg-white rounded-lg shadow-xl` — no dark variant | D-002 |
| `components/HoldButton.tsx` | 164 | `bg-white rounded-xl shadow-xl` — no dark variant on hold confirmation modal | D-002 |
| `components/HuntPassModal.tsx` | 43 | `bg-white rounded-lg shadow-xl` — no dark variant | D-002 |
| `components/ItemSearchResults.tsx` | 17, 66 | `bg-white rounded-xl` — search result card and skeleton both missing dark variant | D-002 |

**Note:** This is a systemic modal styling gap. These modals would appear bright white when dark mode is active. Organizers using dark mode at night would see blinding white modals when bidding, bulk-editing items, or checking out. The fix is mechanical: add `dark:bg-gray-800` (or `dark:bg-gray-900` for deeper contrast) to each modal container. A single focused `findasale-dev` dispatch can batch-fix all 12 occurrences.

---

### D-002/D-003 — Organizer Profile Page (NOT FIXED from 2026-04-14)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizers/[id].tsx` | 96 | Organizer header card `bg-white` — missing `dark:bg-gray-800` | D-002 |
| `pages/organizers/[id].tsx` | 100 | Organizer name `text-warm-900` — missing `dark:text-warm-100` | D-002 |
| `pages/organizers/[id].tsx` | 119 | Rating display `text-warm-600` — missing `dark:text-warm-400` | D-002 |
| `pages/organizers/[id].tsx` | 181 | "No sales listed yet." — empty state with no CTA and no dark variants on container | D-002, D-003 |

---

## Compliant Surfaces ✅

| Surface | Status |
|---------|--------|
| `pages/index.tsx` (homepage hero text, line 320) | ✅ — all types named |
| `pages/about.tsx` (mission section) | ✅ — all types named |
| `pages/_document.tsx` global meta | ✅ — inclusive |
| `pages/organizer/subscription.tsx` (tier descriptions) | ✅ FIXED this cycle |
| `components/SharePromoteModal.tsx` (templates) | ✅ FIXED this cycle — dynamic labels now |
| `pages/encyclopedia/index.tsx` (rendered title) | ✅ — "Resale Encyclopedia" |
| `pages/city/[city].tsx` (rendered CTA text) | ✅ — "Run sales in {cityDisplay}?" is correct |
| `pages/city/[city].tsx` (comment on line 10) | ⚠️ — still says "Run estate sales" but non-user-facing |
| All `findasale-*` skill files | ✅ — all properly reference multiple sale types |

---

## Skill File Check

No violations found. All SKILL.md files properly reference multiple sale types.

| Skill File | Status |
|------------|--------|
| All `findasale-*` skills | ✅ COMPLIANT |

---

## Compliance Score

| Decision | Status | Change Since 2026-04-14 |
|----------|--------|--------------------------|
| D-001 (All Sale Types Scope) | ❌ DRIFT — ~17 active violations | ⬆️ Improved (-4 SharePromoteModal, -2 subscription) |
| D-002 (Full Dark Mode) | ❌ DRIFT — 12 modal components + 4 violations in `organizers/[id].tsx` | ⬇️ Worsened (systemic modal gap newly identified) |
| D-003 (Empty States CTAs) | ⚠️ DRIFT — 1 violation in `organizers/[id].tsx` | Unchanged |
| D-004 (Mobile-First) | ⚠️ UNVERIFIED | Requires Chrome MCP |
| D-005 (Multi-Endpoint) | ⚠️ UNVERIFIED | Requires live user-journey testing |

---

## Recommended Fixes

### Batch 1 — P1: sale/[id].tsx Nextdoor Share (→ `findasale-dev`, single-line fix)

1. **`pages/sales/[id].tsx:881`** — Replace `"Check out this estate sale on FindA.Sale!"` with a dynamic equivalent. The `getSaleTypeLabel(sale.saleType)` pattern is already used in `SharePromoteModal`. Either import it or inline a simple ternary. Estimated: 5 lines of change.

Also fix while in the file:
2. **`components/SharePromoteModal.tsx:68`** — Change `return 'estate sale'` → `return 'sale'` (1 line).

### Batch 2 — P1: Homepage Meta + Profile SEO (→ `findasale-dev`)

3. **`pages/index.tsx:266`** → `"Find estate sales, garage sales, yard sales, auctions, flea markets, and more near you"`
4. **`pages/index.tsx:268`** → `"Browse estate sales, garage sales, yard sales, auctions, and flea markets near you. Discover unique items from local sales."`
5. **`pages/index.tsx:274`** → `"Browse estate sales, garage sales, auctions, flea markets, and yard sales near you."`
6. **`pages/index.tsx:285`** → `"browse, buy, and sell items from estate sales, garage sales, auctions, flea markets, and more"`
7. **`pages/organizers/[id].tsx:84`** → `"Sales by ${organizer.businessName} — browse upcoming estate sales, auctions, garage sales, and more"`
8. **`pages/sales/zip/[zip].tsx:31`** → `"Find estate sales, garage sales, auctions, and flea markets in ZIP code ${zip}"`
9. **`components/ItemSearchResults.tsx:149`** → `"Start browsing sales to discover unique finds."`

### Batch 3 — P2: Organizer Copy (→ `findasale-dev`, string substitutions)

10. **`pages/faq.tsx:355`** → `"browse sales on the"`
11. **`pages/organizer/email-digest-preview.tsx:41`** → `businessName: user?.name || 'Your Sales'`
12. **`pages/organizer/email-digest-preview.tsx:53`** → Change example to `{ title: 'Weekend Yard Sale - Eastown', startDate: 'Mar 8 - Mar 10' }`
13. **`pages/guide.tsx:101`** → `"Pricing varies by event type. Estate sale items typically go for 20–50% of retail. Auction items may exceed retail with competitive bidding; garage sale and flea market items often go lower."`
14. **`pages/guide.tsx:241`** → `"Share it with other sale organizers."`
15. **`pages/organizer/promote/[saleId].tsx:611`** → `"CSV for EstateSales.NET — reaches dedicated estate sale shoppers"`
16. **`pages/condition-guide.tsx` (~line 91)** → update OG description to include garage sales and flea markets
17. **`pages/condition-guide.tsx` (~line 56)** → `"The sale organizer or item seller sets the condition rating"`

### Batch 4 — D-002: Modal Dark Mode (→ `findasale-dev`, systemic pass)

Add `dark:bg-gray-800` to each modal container `bg-white` class in:
- `components/ActivityFeed.tsx:93,104`
- `components/BidModal.tsx:58`
- `components/BulkCategoryModal.tsx:53`
- `components/BulkOperationErrorModal.tsx:31`
- `components/BulkPhotoModal.tsx:90`
- `components/BulkPriceModal.tsx:51`
- `components/BulkStatusModal.tsx:60`
- `components/BulkTagModal.tsx:91`
- `components/CheckoutModal.tsx:364`
- `components/HoldButton.tsx:164`
- `components/HuntPassModal.tsx:43`
- `components/ItemSearchResults.tsx:17,66` (also needs `dark:border-gray-700` on border class)

Also fix `pages/organizers/[id].tsx:96,100,119,181` (dark mode + empty state CTA — flagged since 2026-04-14).

### Batch 5 — P3: Encyclopedia Title (→ `findasale-dev`, 1 line)

18. **`pages/encyclopedia/[slug].tsx:207`** → `"{entry.title} | Resale Encyclopedia"`

---

## Priority Summary

| Priority | Items | Estimated Fix Effort |
|----------|-------|----------------------|
| P1 (fix immediately) | 9 items across 4 files | ~30–50 lines, 1 dev dispatch |
| P2 (fix this sprint) | 8 items across 5 files | ~20 lines, combinable with P1 dispatch |
| D-002 systemic (fix this sprint) | 12 modal components + 4 lines in organizers/[id].tsx | ~20 class additions, 1 dev dispatch |
| P3 (next available) | 1 item | 1 line |

All P1 and P2 items are **copy-level string substitutions**. No logic changes required. A single `findasale-dev` dispatch covering Batches 1–3 and Batch 5 can close ~17 violations in one pass.

D-002 modal fixes (Batch 4) should be a separate dispatch since they touch 12+ component files.
