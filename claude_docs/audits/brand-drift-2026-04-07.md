# Brand Drift Audit — 2026-04-07

**Auditor:** Weekly brand drift detector (automated scheduled task)
**Scope:** All `.tsx` files in `packages/frontend/`, active skill SKILL.md files, DECISIONS.md compliance
**Reference docs:** `claude_docs/brand/DECISIONS.md`, `claude_docs/brand/brand-voice-guide-2026-03-16.md`
**Prior audit:** `claude_docs/audits/brand-drift-2026-03-31.md` (baseline for comparison)
**Run date:** 2026-04-07

---

## Executive Summary

**Progress: 2 items fixed since the 2026-03-31 audit.** The FAQ return policy is now inclusive and haul-posts is clean. However, 18+ violations remain open and the homepage meta tags appear to have been missed by the prior audit — those are now flagged for the first time.

**Current violation count:** ~20 active (up from ~15 in prior audit due to newly-detected homepage meta drift). The P0 SharePromoteModal issues remain the most user-damaging and have not been fixed.

**Highlight: Index.tsx meta tags newly flagged.** The homepage hero text is compliant but the `<meta>`, OG, Twitter, and Schema.org tags all omit flea markets and consignment. These affect SEO and social sharing previews — the prior audit appears to have checked only the hero copy.

---

## What Was Fixed Since 2026-03-31 ✅

| File | Fix Applied |
|------|-------------|
| `pages/faq.tsx` (return policy) | ✅ FIXED — now says "Secondhand sale items are generally sold as-is" |
| `pages/shopper/haul-posts.tsx` | ✅ FIXED — no estate-sale-only references found |

---

## Drift Findings

### P0 — User-Facing / Organizer Social Share (NOT FIXED from prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `components/SharePromoteModal.tsx` | 176 | Neighbor/local copy: "if you're into estate sales or looking for good deals" — applies regardless of actual sale type | D-001 |
| `components/SharePromoteModal.tsx` | 213 | Threads template: "Running an estate sale this weekend" — hardcoded for ALL sale types | D-001 |
| `components/SharePromoteModal.tsx` | 226 | Nextdoor template: "Estate sale open to the public" — hardcoded regardless of event type | D-001 |
| `pages/sales/[id].tsx` | 737 | Share text: "Check out this estate sale on FindA.Sale!" — used for all sale types | D-001 |

**Why P0 still:** These are the most publicly visible violations. Garage sale and auction organizers sharing their events generate "estate sale" copy on TikTok, Threads, and Nextdoor. This is brand-damaging and factually inaccurate. Fix remains overdue.

---

### P1 — Homepage SEO Meta / OG Tags (NEWLY DETECTED)

The prior audit marked `pages/index.tsx` as compliant based on hero copy. The meta tags were not checked. All four are missing flea markets and/or consignment:

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/index.tsx` | 261 | `<meta name="description">`: "Find estate sales, garage sales, yard sales, and auctions near you" — flea markets and consignment omitted | D-001 |
| `pages/index.tsx` | 262 | `<meta property="og:description">`: Same — "Browse estate sales, garage sales, yard sales, and auctions near you" | D-001 |
| `pages/index.tsx` | 268 | `<meta name="twitter:description">`: "Browse estate sales, garage sales, and auctions near you" — even narrower; omits yard sales too | D-001 |
| `pages/index.tsx` | 279 | Schema.org `description`: "browse, buy, and sell items from estate sales, garage sales, and auctions online" | D-001 |

**Note:** The homepage hero body text (line 314) IS compliant: "Find estate sales, garage sales, yard sales, auctions, flea markets, and more near you." The meta tags were not updated to match.

---

### P1 — SEO Meta / Organizer-Facing (NOT FIXED from prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizers/[id].tsx` | 84 | `<meta name="description">`: "Estate sales by {organizer.businessName}" — inaccurate for auctioneers, flea market ops | D-001 |
| `pages/sales/zip/[zip].tsx` | 31 | `<meta name="description">`: "Find estate sales in ZIP code {zip}" — should include all types | D-001 |
| `components/ItemSearchResults.tsx` | 149 | Empty state: "Start browsing estate sales to discover unique finds." — shown to all shoppers | D-001 |

---

### P2 — Shopper/Organizer Copy (NOT FIXED from prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/faq.tsx` | 331 | Organizer FAQ: "Shoppers browse estate sales on the homepage" — should say "browse sales" | D-001 |
| `pages/condition-guide.tsx` | 91 | OG description: "item condition ratings and price ranges at FindA.Sale estate sales and auctions" — omits garage sales and flea markets | D-001 |
| `pages/organizer/email-digest-preview.tsx` | 41 | Default businessName fallback: `'Your Estate Sales'` — applies to all organizer types | D-001 |
| `pages/organizer/email-digest-preview.tsx` | 53 | Example sale title hardcoded as: `'Estate Sale - Downtown'` — should show multi-type examples | D-001 |
| `pages/guide.tsx` | 101 | Body copy: "Estate sale pricing is typically 20–50% of retail value" — true for estate sales but misleads auction/flea market organizers | D-001 |
| `pages/guide.tsx` | 241 | Body copy: "Share it with other estate sale operators" — should say "sale organizers" | D-001 |
| `pages/organizer/typology.tsx` | 264 | TierGate description: "categorize estate sale items into collector types" — typology applies to all item types | D-001 |
| `pages/organizer/typology.tsx` | 268 | Meta: "Smart typology classification for your estate sale items" — applies to all sale types | D-001 |

---

### P3 — Content Page Framing (NOT FIXED from prior audit)

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/encyclopedia/[slug].tsx` | 207 | Page `<title>`: "{entry.title} \| Estate Sale Encyclopedia" — the encyclopedia covers all resale knowledge, not just estate sales | D-001 |

**Note:** The encyclopedia INDEX page at `pages/encyclopedia/index.tsx` IS compliant — rendered title is "Resale Encyclopedia" and description is inclusive. Only the individual article `<title>` tag still uses "Estate Sale Encyclopedia".

---

## Compliant Surfaces ✅

| Surface | Status |
|---------|--------|
| `pages/index.tsx` (homepage hero text) | ✅ — all types named |
| `pages/about.tsx` (mission section) | ✅ — all types named |
| `pages/organizer/pricing.tsx` | ✅ — no sale-type bias |
| `pages/_document.tsx` global meta | ✅ — inclusive |
| `pages/encyclopedia/index.tsx` (index rendered text) | ✅ — "Resale Encyclopedia" |
| `pages/city/[city].tsx` CTA | ✅ — "Run sales in {city}?" |
| `pages/faq.tsx` (return policy) | ✅ — FIXED this cycle |
| `pages/shopper/haul-posts.tsx` | ✅ — FIXED this cycle |
| `pages/organizer/create-sale.tsx` dropdown | ✅ — All sale types listed as options |
| All `findasale-*` skill files | ✅ — All properly reference multiple sale types |

---

## Skill File Check

No new violations in skill SKILL.md files.

| Skill File | Status |
|------------|--------|
| All `findasale-*` skills | ✅ COMPLIANT — all properly reference multiple sale types |
| `findasale-marketing/SKILL.md` | ✅ — comprehensive multi-type coverage |
| `findasale-polish/SKILL.md` | ✅ — explicitly tracks D-001 enforcement |
| `findasale-qa/SKILL.md` | ✅ — all 5 sale types represented in checklist |

---

## Compliance Score

| Decision | Status | Change Since 2026-03-31 |
|----------|--------|--------------------------|
| D-001 (All Sale Types Scope) | ❌ DRIFT — ~20 active violations | ⬇️ Worsened (new meta drift detected on homepage) |
| D-002 (Full Dark Mode) | ✅ COMPLIANT (code scan clean) | No change |
| D-003 (Empty States CTAs) | ✅ COMPLIANT | No new issues found |
| D-004 (Mobile-First) | ⚠️ UNVERIFIED | Requires Chrome MCP — cannot verify statically |
| D-005 (Multi-Endpoint) | ⚠️ UNVERIFIED | Requires live user-journey testing |

**Summary: 2 items fixed. ~20 active D-001 violations remain. P0 SharePromoteModal still unresolved after 2 audit cycles.**

---

## Recommended Fixes

### Batch 1 — P0: SharePromoteModal + sales share text (→ `findasale-dev`)

Fix all social share templates to use dynamic sale type language based on `sale.saleType`:

1. **`components/SharePromoteModal.tsx:176`** — "if you love finding deals at local sales" (remove estate-specific framing)
2. **`components/SharePromoteModal.tsx:213`** — "Running a {saleTypeLabel} sale this weekend in {sale.city}"
3. **`components/SharePromoteModal.tsx:226`** — "{saleTypeLabel} sale open to the public. Items include…"
4. **`pages/sales/[id].tsx:737`** — "Check out this {saleTypeLabel} sale on FindA.Sale!"

Use the existing `getSaleTypeLabel()` pattern (or add a simple map: ESTATE→"estate sale", GARAGE→"garage sale", AUCTION→"auction", FLEA_MARKET→"flea market", CONSIGNMENT→"consignment sale").

### Batch 2 — P1: Homepage Meta Tags (→ `findasale-dev`)

Small copy changes to the meta/OG/schema block in `pages/index.tsx`:

5. **Line 261** — `"Find estate sales, garage sales, yard sales, auctions, flea markets, and more near you"`
6. **Line 262** — `"Browse estate sales, garage sales, yard sales, auctions, and flea markets near you. Discover unique items from local sales."`
7. **Line 268** — `"Browse estate sales, garage sales, auctions, flea markets, and yard sales near you."`
8. **Line 279** — `"browse, buy, and sell items from estate sales, garage sales, auctions, flea markets, and more"`

### Batch 3 — P1: SEO Meta (→ `findasale-dev`)

9. **`pages/organizers/[id].tsx:84`** — `"Sales by ${organizer.businessName} — browse upcoming estate sales, garage sales, and auctions"`
10. **`pages/sales/zip/[zip].tsx:31`** — `"Find estate sales, garage sales, auctions, and flea markets in ZIP code ${zip}"`
11. **`components/ItemSearchResults.tsx:149`** — `"Start browsing sales to discover unique finds."`

### Batch 4 — P2: Organizer Copy (→ `findasale-dev`)

12. **`pages/faq.tsx:331`** — `"Shoppers browse sales on the homepage or map"`
13. **`pages/condition-guide.tsx:91`** — `"item condition ratings and price ranges at FindA.Sale estate sales, garage sales, auctions, and more"`
14. **`pages/organizer/email-digest-preview.tsx:41`** — `'Your Sales'`
15. **`pages/organizer/email-digest-preview.tsx:53`** — Change example to `'Weekend Yard Sale'` or use a generic title
16. **`pages/guide.tsx:101`** — Add context: "Pricing varies by event type. Estate sale items typically go for 20–50% of retail. Auction items may go higher with competitive bidding; garage sales often go lower."
17. **`pages/guide.tsx:241`** — `"Share it with other sale organizers."`
18. **`pages/organizer/typology.tsx:264`** — `"categorize your sale items into collector types for better targeting"`
19. **`pages/organizer/typology.tsx:268`** — `"Smart typology classification for your sale items"`

### Batch 5 — P3: Encyclopedia Title (→ Patrick decision first)

20. **`pages/encyclopedia/[slug].tsx:207`** — `"{entry.title} | Resale Encyclopedia"` — matches the index page title "Resale Encyclopedia." This change aligns the article `<title>` tags with the already-fixed index title.

**Recommendation:** This is a safe fix with no SEO risk — the article slugs themselves don't change. Route to `findasale-dev`.

---

## Notes

- **P0 SharePromoteModal has been flagged for 2 consecutive audit cycles** and remains unresolved. This is the most user-visible active violation.
- **Homepage meta tags were missed in the prior audit.** The hero text was compliant; the meta tags were not checked. Both need to match.
- **D-004/D-005 remain UNVERIFIED** — Chrome MCP needed. Queue for `findasale-qa` when browser is available.
- Batches 2–5 are all single-line copy changes. A focused `findasale-dev` dispatch can resolve all ~16 in one pass.
- Batches 1 and 2 are the highest-priority fixes — P0 for user impact, P1 for SEO impact on the most-visited page.
