# Brand Drift Audit — 2026-04-14

**Auditor:** Weekly brand drift detector (automated scheduled task)
**Scope:** All `.tsx` files in `packages/frontend/pages/` and `packages/frontend/components/`, active skill SKILL.md files, DECISIONS.md compliance
**Reference docs:** `claude_docs/brand/DECISIONS.md`, `claude_docs/brand/brand-voice-guide-2026-03-16.md`
**Prior audit:** `claude_docs/audits/brand-drift-2026-04-07.md`
**Run date:** 2026-04-14

---

## Executive Summary

**1 item fixed since the 2026-04-07 audit.** The `typology.tsx` violations (2 lines) were resolved. However, all other violations from the prior audit remain open, and 3 new violations were detected in `subscription.tsx` and `condition-guide.tsx` that were missed previously.

**Current violation count: ~22 active** (was ~20 in prior audit, +3 new, -1 fixed, net +2).

**P0 SharePromoteModal has now been flagged in 3 consecutive audit cycles without resolution.** This is the highest-priority fix and should be dispatched before any new features ship that involve organizer social sharing.

---

## What Was Fixed Since 2026-04-07 ✅

| File | Fix Applied |
|------|-------------|
| `pages/organizer/typology.tsx` (lines 264, 268) | ✅ FIXED — estate-sale-specific copy removed |

---

## Drift Findings

### P0 — Organizer Social Share Templates (NOT FIXED — 3rd consecutive audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `components/SharePromoteModal.tsx` | 176 | "if you're into estate sales or looking for good deals" — applies to all sale types | D-001 |
| `components/SharePromoteModal.tsx` | 213 | Threads template: "Running an estate sale this weekend" — hardcoded for ALL sale types | D-001 |
| `components/SharePromoteModal.tsx` | 226 | Nextdoor template: "Estate sale open to the public" — hardcoded regardless of event type | D-001 |
| `pages/sales/[id].tsx` | 867 | Nextdoor share text: "Check out this estate sale on FindA.Sale!" — used for all sale types | D-001 |

**Note:** `SharePromoteModal.tsx` already has a `saleTypeLabel()` function at line 48 that correctly maps ESTATE→'estate sale', GARAGE→'garage sale', AUCTION→'auction', etc. The templates at lines 176, 213, and 226 are simply not calling it. This is a simple fix — substitute the dynamic label for the hardcoded "estate sale" strings.

**Why P0 still:** Garage sale, auction, and flea market organizers sharing via Nextdoor/Threads get "estate sale" copy. This is factually wrong and brand-damaging. Organizers see this copy before they click — this creates immediate confusion and erodes trust for non-estate-sale organizers.

---

### P1 — Homepage SEO Meta / OG Tags (NOT FIXED from prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/index.tsx` | 266 | `<meta name="description">`: "Find estate sales, garage sales, yard sales, and auctions near you" — omits flea markets | D-001 |
| `pages/index.tsx` | 268 | `<meta property="og:description">`: "Browse estate sales, garage sales, yard sales, and auctions near you" — omits flea markets | D-001 |
| `pages/index.tsx` | 274 | `<meta name="twitter:description">`: "Browse estate sales, garage sales, and auctions near you" — even narrower; omits yard sales and flea markets | D-001 |
| `pages/index.tsx` | 285 | Schema.org `description`: "browse, buy, and sell items from estate sales, garage sales, and auctions online" — omits flea markets | D-001 |

**Note:** The homepage hero body text (line 320) IS compliant. The meta tags were not updated to match.

---

### P1 — SEO Meta / Profile Pages (NOT FIXED from prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizers/[id].tsx` | 84 | `<meta name="description">`: "Estate sales by ${organizer.businessName}" — applies to auctioneers, flea market ops | D-001 |
| `pages/sales/zip/[zip].tsx` | 31 | `<meta name="description">`: "Find estate sales in ZIP code ${zip}" — applies to all sale types | D-001 |
| `components/ItemSearchResults.tsx` | 149 | Empty state: "Start browsing estate sales to discover unique finds." — shown to all shoppers | D-001 |

---

### P2 — Subscription / Upgrade Copy (NEW — not in prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizer/subscription.tsx` | 205 | "Everything you need for a large estate sale or auction." — SIMPLE→PRO upgrade card; ignores garage sales and flea markets | D-001 |
| `pages/organizer/subscription.tsx` | 517 | Same copy repeated in the second PRO upgrade card (subscription annual toggle) | D-001 |

**Note:** `subscription.tsx:164` reads "Run estate sales, yard sales, and auctions at the same time" — this at least names multiple types, though it omits flea markets and consignment. Lower severity than lines 205/517.

---

### P2 — Organizer Copy (ONGOING from prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/faq.tsx` | 299 | "Shoppers browse estate sales on the homepage" — should say "browse sales" | D-001 |
| `pages/condition-guide.tsx` | 91 | OG description: "item condition ratings and price ranges at FindA.Sale estate sales and auctions" — omits garage sales/flea markets | D-001 |
| `pages/organizer/email-digest-preview.tsx` | 41 | Default businessName fallback: `'Your Estate Sales'` — applies to all organizer types | D-001 |
| `pages/organizer/email-digest-preview.tsx` | 53 | Example sale title: `'Estate Sale - Downtown'` — only estate sale shown as sample | D-001 |
| `pages/guide.tsx` | 101 | "Estate sale pricing is typically 20–50% of retail value" — misleads auction/garage sale organizers | D-001 |
| `pages/guide.tsx` | 241 | "Share it with other estate sale operators" — referrals are for all organizer types | D-001 |

---

### P2 — Condition Guide Body Copy (NEW — not in prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/condition-guide.tsx` | 56 | Condition FAQ: "The estate sale organizer or item seller sets the condition rating" — the condition system applies to all organizer types, not just estate sale organizers | D-001 |

---

### P3 — Content Page Framing (NOT FIXED from prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/encyclopedia/[slug].tsx` | 207 | Page `<title>`: "{entry.title} \| Estate Sale Encyclopedia" — should match index: "Resale Encyclopedia" | D-001 |

---

### D-002 Dark Mode — New Findings

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizers/[id].tsx` | 96 | `bg-white rounded-lg shadow-md p-6 mb-8` — no `dark:bg-gray-800` variant on organizer header card | D-002 |
| `pages/organizers/[id].tsx` | 100 | `text-warm-900` — no `dark:text-warm-100` on organizer name | D-002 |
| `pages/organizers/[id].tsx` | 119 | `text-warm-600` — no `dark:text-warm-400` on rating display | D-002 |
| `pages/organizers/[id].tsx` | 181 | `bg-white rounded-lg shadow-md p-8 text-center text-warm-500` — no dark variants on the "no sales" empty state container | D-002 |

---

### D-003 Empty State Without CTA — New Finding

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizers/[id].tsx` | 180–183 | "No sales listed yet." — empty state with no CTA. Should link to "Browse Sales" or provide a helpful next step for the visitor | D-003 |

---

## Compliant Surfaces ✅

| Surface | Status |
|---------|--------|
| `pages/index.tsx` (homepage hero text) | ✅ — all types named |
| `pages/about.tsx` (mission section) | ✅ — all types named |
| `pages/organizer/pricing.tsx` | ✅ — no sale-type bias in tier descriptions |
| `pages/_document.tsx` global meta | ✅ — inclusive |
| `pages/encyclopedia/index.tsx` (rendered title) | ✅ — "Resale Encyclopedia" |
| `pages/city/[city].tsx` (meta description) | ✅ — sale-type agnostic |
| `pages/faq.tsx` (return policy) | ✅ — fixed in prior cycle |
| `pages/shopper/haul-posts.tsx` | ✅ — clean |
| `pages/organizer/create-sale.tsx` (dropdown) | ✅ — all sale types listed |
| `pages/organizer/typology.tsx` | ✅ — FIXED this cycle |
| All `findasale-*` skill files | ✅ — all properly reference multiple sale types |

---

## Skill File Check

No violations found. All SKILL.md files properly reference multiple sale types.

| Skill File | Status |
|------------|--------|
| All `findasale-*` skills | ✅ COMPLIANT |
| `findasale-marketing/SKILL.md` | ✅ — multi-type coverage throughout |
| `findasale-polish/SKILL.md` | ✅ — explicitly tracks D-001 enforcement |
| `findasale-qa/SKILL.md` | ✅ — all 5 sale types in checklist |

---

## Compliance Score

| Decision | Status | Change Since 2026-04-07 |
|----------|--------|--------------------------|
| D-001 (All Sale Types Scope) | ❌ DRIFT — ~22 active violations | ⬇️ Worsened (+3 new, -1 fixed) |
| D-002 (Full Dark Mode) | ⚠️ DRIFT — 4 violations in `organizers/[id].tsx` | ⬇️ Newly detected |
| D-003 (Empty States CTAs) | ⚠️ DRIFT — 1 violation in `organizers/[id].tsx` | ⬇️ Newly detected |
| D-004 (Mobile-First) | ⚠️ UNVERIFIED | Requires Chrome MCP |
| D-005 (Multi-Endpoint) | ⚠️ UNVERIFIED | Requires live user-journey testing |

**3 of 3 checkable decisions have active violations. 2 remain unverifiable without Chrome.**

---

## Recommended Fixes

### Batch 1 — P0: SharePromoteModal (→ `findasale-dev`, dispatch immediately)

Use the existing `saleTypeLabel()` function (already in `SharePromoteModal.tsx:48–55`) for templates:

1. **Line 176** — Replace "if you're into estate sales" → `"if you're into local sales or looking for good deals"`
2. **Line 213** — Replace "Running an estate sale this weekend" → `"Running a ${saleTypeLabel(sale.saleType)} this weekend"`
3. **Line 226** — Replace "Estate sale open to the public" → `"${saleTypeLabel(sale.saleType, true)} open to the public"` (capitalize first letter)
4. **`pages/sales/[id].tsx:867`** — Replace "Check out this estate sale" → `"Check out this ${saleTypeLabel(sale.saleType)} on FindA.Sale!"`

### Batch 2 — P1: Homepage Meta + Profile SEO (→ `findasale-dev`)

5. **`pages/index.tsx:266`** → `"Find estate sales, garage sales, yard sales, auctions, flea markets, and more near you"`
6. **`pages/index.tsx:268`** → `"Browse estate sales, garage sales, yard sales, auctions, and flea markets near you. Discover unique items from local sales."`
7. **`pages/index.tsx:274`** → `"Browse estate sales, garage sales, auctions, flea markets, and yard sales near you."`
8. **`pages/index.tsx:285`** → `"browse, buy, and sell items from estate sales, garage sales, auctions, flea markets, and more"`
9. **`pages/organizers/[id].tsx:84`** → `"Sales by ${organizer.businessName} — browse upcoming estate sales, auctions, garage sales, and more"`
10. **`pages/sales/zip/[zip].tsx:31`** → `"Find estate sales, garage sales, auctions, and flea markets in ZIP code ${zip}"`
11. **`components/ItemSearchResults.tsx:149`** → `"Start browsing sales to discover unique finds."`

### Batch 3 — P2: Subscription + Organizer Copy (→ `findasale-dev`)

12. **`pages/organizer/subscription.tsx:205`** → `"Everything you need for a large sale or auction — estate, garage, flea market, and more."`
13. **`pages/organizer/subscription.tsx:517`** → Same fix as line 205
14. **`pages/faq.tsx:299`** → `"browse sales on the"`
15. **`pages/condition-guide.tsx:91`** → `"item condition ratings and price ranges at FindA.Sale estate sales, garage sales, auctions, and more."`
16. **`pages/condition-guide.tsx:56`** → `"The sale organizer or item seller sets the condition rating"`
17. **`pages/organizer/email-digest-preview.tsx:41`** → `businessName: user?.name || 'Your Sales'`
18. **`pages/organizer/email-digest-preview.tsx:53`** → Change to `{ title: 'Weekend Yard Sale', startDate: 'Mar 8 - Mar 10' }`
19. **`pages/guide.tsx:101`** → `"Pricing varies by event type. Estate sale items typically go for 20–50% of retail. Auction items may exceed retail with competitive bidding; garage sale items often go lower."`
20. **`pages/guide.tsx:241`** → `"Share it with other sale organizers."`

### Batch 4 — D-002/D-003: Dark Mode + Empty State Fix (→ `findasale-dev`)

21. **`pages/organizers/[id].tsx:96`** — Add `dark:bg-gray-800` to organizer header card
22. **`pages/organizers/[id].tsx:100`** — Add `dark:text-warm-100` to organizer name
23. **`pages/organizers/[id].tsx:119`** — Add `dark:text-warm-400` to rating display
24. **`pages/organizers/[id].tsx:181`** — Add dark variants AND add a CTA (e.g., "Browse open sales →" link to `/`) to satisfy D-003

### Batch 5 — P3: Encyclopedia Title (→ `findasale-dev`, safe single-line fix)

25. **`pages/encyclopedia/[slug].tsx:207`** → `"{entry.title} | Resale Encyclopedia"`

---

## Notes

- **P0 SharePromoteModal flagged for 3 consecutive audit cycles.** Token cost to fix: ~500 (simple string substitutions using an existing function). Risk: near zero. This should be the first dispatch.
- **D-002/D-003 issues in `organizers/[id].tsx`** are newly detected. The page profile card and its empty state both miss dark mode and the empty state has no CTA.
- **D-004/D-005 remain UNVERIFIED** — Chrome MCP needed. Queue for `findasale-qa`.
- Batches 2–5 are all copy-level changes (string substitutions). A single focused `findasale-dev` dispatch can resolve all ~21 items in one pass.
