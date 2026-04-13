# Brand Drift Audit — 2026-03-31

**Auditor:** Weekly brand drift detector (automated scheduled task)
**Scope:** All `.tsx` files in `packages/frontend/`, active skill SKILL.md files, DECISIONS.md compliance
**Reference docs:** `claude_docs/brand/DECISIONS.md`, `claude_docs/brand/brand-voice-guide-2026-03-16.md`
**Prior audit:** `claude_docs/audits/brand-drift-2026-03-24.md` (baseline for comparison)
**Run date:** 2026-03-31

---

## Executive Summary

**Good news: ~12–15 items fixed since the 2026-03-24 audit.** The highest-SEO-impact pages (map, calendar, organizer dashboard, organizer sales page, city CTA, neighborhood meta) are now compliant. Skills remain clean.

**Concern: ~15 active violations remain, and new drift has appeared in `SharePromoteModal.tsx`.** The social share templates hardcode "estate sale" for all sale types — meaning a garage sale or auction organizer sees copy calling their event an estate sale. This is the most user-visible active violation.

**Current violation count:** ~15 active (down from 27+ on 2026-03-24). Progress is real but more remediation needed.

---

## What Was Fixed Since 2026-03-24 ✅

| File | Fix Applied |
|------|-------------|
| `pages/organizer/sales.tsx` | ✅ FIXED — "estate sale" copy removed |
| `components/SaleShareButton.tsx` | ✅ FIXED — share text updated |
| `pages/organizer/dashboard.tsx` | ✅ FIXED — empty state updated |
| `pages/map.tsx` | ✅ FIXED — meta/OG now inclusive |
| `pages/calendar.tsx` | ✅ FIXED — copy updated |
| `pages/trending.tsx` | ✅ FIXED — meta/OG updated |
| `components/ReferralWidget.tsx` | ✅ FIXED — share text updated |
| `pages/organizer/storefront/[slug].tsx` | ✅ FIXED — default bio updated |
| `pages/api/og.tsx` | ✅ FIXED — OG defaults updated |
| `pages/neighborhoods/[slug].tsx` | ✅ FIXED — meta now lists all types |
| `pages/city/[city].tsx` CTA | ✅ FIXED — now "Run sales in {city}?" |
| `pages/_document.tsx` | ✅ FIXED — global meta now includes all types |

---

## Drift Findings

### P0 — New Drift / Organizer-Facing User Impact

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `components/SharePromoteModal.tsx` | 156 | Neighbor/local copy: "if you're into estate sales or looking for good deals" — applies to all sale types including garage sales and auctions | D-001 |
| `components/SharePromoteModal.tsx` | 168 | TikTok template: "Estate sale haul alert 🏷️" — hardcoded for ALL sale types | D-001 |
| `components/SharePromoteModal.tsx` | 180, 182, 187 | Pinterest template: "Estate Sale in {city}", "this {city} estate sale", "Find more estate sales near you" — three instances | D-001 |
| `components/SharePromoteModal.tsx` | 193, 206 | Threads and Nextdoor templates: "Running an estate sale this weekend", "Estate sale open to the public" — both hardcoded regardless of sale type | D-001 |
| `pages/sales/[id].tsx` | 577 | Share button text: "Check out this estate sale on FindA.Sale!" — applied to all sale types | D-001 |

**Why this is P0:** These templates are actively used by organizers to promote their sales. A garage sale organizer sharing via TikTok will generate "Estate sale haul alert" — embarrassing and inaccurate. An auctioneer sharing via Pinterest will get "Estate Sale in {city}." This is the most damaging active violation.

### P1 — SEO Meta / Organizer-Facing

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizers/[id].tsx` | 84 | Meta description: "Estate sales by {organizer.businessName}" — incorrect for auctioneers, flea market ops, garage sale organizers | D-001 |
| `pages/sales/zip/[zip].tsx` | 31 | Meta description: "Find estate sales in ZIP code {zip}" — ZIP code browse should include all types | D-001 |
| `components/ItemSearchResults.tsx` | 148 | Empty-search prompt: "Start browsing estate sales to discover unique finds." — shown to all shoppers | D-001 |

### P2 — Shopper-Facing Copy

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/shopper/hauls.tsx` | 84 | Page subtitle: "Share your estate sale finds and see what others are hunting" — hauls come from all sale types | D-001 |
| `pages/faq.tsx` | 111 | Return policy answer: "Estate sale items are generally sold as-is" — should say "Sale items" or "Items purchased through FindA.Sale" | D-001 |
| `pages/faq.tsx` | 146 | Organizer FAQ answer: "Shoppers browse estate sales on the homepage" — should say "Shoppers browse sales" | D-001 |
| `pages/condition-guide.tsx` | 91 | Meta description: "item condition ratings and price ranges at FindA.Sale estate sales and auctions" — omits garage sales and flea markets | D-001 |

### P3 — Content Page Framing / Low Visibility

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/encyclopedia/index.tsx` + `[slug].tsx` | 2, 4 / 207 | Feature titled "Estate Sale Encyclopedia" — covers items found at ALL sale types (furniture, tools, toys, collectibles) | D-001 |
| `pages/guide.tsx` | 3 | Comment: "Full walkthrough for estate sale organizers" — guide applies to all organizer types | D-001 |
| `pages/guide.tsx` | 101 | Body copy: "Estate sale pricing is typically 20–50% of retail value" — accurate for estate sales but misleads other organizer types | D-001 |
| `pages/guide.tsx` | 241 | Body copy: "Share it with other estate sale operators" — should say "sale organizers" | D-001 |
| `pages/organizer/typology.tsx` | 264, 268 | TierGate description and meta: "estate sale items" — typology applies to all item types at all sale types | D-001 |
| `pages/organizer/email-digest-preview.tsx` | 41 | Default businessName fallback: `'Your Estate Sales'` — applies to all organizer types | D-001 |

---

## Compliant Surfaces ✅

All pages below passed the Tone Consistency Checklist:

| Surface | Status |
|---------|--------|
| `pages/index.tsx` (homepage hero + meta) | ✅ — lists all types |
| `pages/about.tsx` (mission section) | ✅ — all types named |
| `pages/organizer/pricing.tsx` | ✅ — no sale-type bias |
| `pages/terms.tsx` | ✅ — comprehensive listing |
| `pages/privacy.tsx` | ✅ — all types listed |
| `pages/_document.tsx` | ✅ — global meta fixed |
| `pages/map.tsx` | ✅ — fixed |
| `pages/calendar.tsx` | ✅ — fixed |
| `pages/organizer/dashboard.tsx` | ✅ — fixed |
| `pages/organizer/sales.tsx` | ✅ — fixed |
| `components/Layout.tsx` footer | ✅ — all sale types |
| `pages/city/[city].tsx` CTA | ✅ — "Run sales in {city}?" |
| `pages/neighborhoods/[slug].tsx` meta | ✅ — all types |
| `components/SaleShareButton.tsx` | ✅ — fixed |
| `components/ReferralWidget.tsx` | ✅ — fixed |

---

## Skill File Check

All skill files remain compliant. No new violations introduced since 2026-03-24 audit.

| Skill File | Status |
|------------|--------|
| All `findasale-*` skills | ✅ COMPLIANT — all properly reference multiple sale types |
| `findasale-polish/SKILL.md` | ✅ — already tracks D-001 enforcement |
| `findasale-marketing/SKILL.md` | ✅ — comprehensive multi-type coverage |

---

## Compliance Score

| Decision | Status | Change Since 2026-03-24 |
|----------|--------|--------------------------|
| D-001 (All Sale Types Scope) | ❌ DRIFT — ~15 active violations | ⬆️ Improved (27+ → ~15) |
| D-002 (Full Dark Mode) | ✅ COMPLIANT (code review) | No change — spot checks clean |
| D-003 (Empty States CTAs) | ✅ COMPLIANT | No new issues found |
| D-004 (Mobile-First) | ⚠️ UNVERIFIED | Requires Chrome MCP — cannot verify statically |
| D-005 (Multi-Endpoint) | ⚠️ UNVERIFIED | Requires live user-journey testing |

**Summary: 2/5 decisions confirmed compliant. D-001 has meaningful drift reduction but ~15 violations remain. SharePromoteModal is a new P0 regression.**

---

## Recommended Fixes

### Batch 1 — P0: SharePromoteModal (→ `findasale-dev`)

Fix all five social share templates to use dynamic sale type language. Each template should reference the actual `sale.saleType` (ESTATE, GARAGE, AUCTION, FLEA_MARKET) to generate appropriate copy — not hardcode "estate sale."

- TikTok: "Sale haul alert 🏷️ {sale.title} in {sale.city}…" or map saleType to label
- Pinterest: "{sale.title} — {saleTypeLabel} Sale in {sale.city}" + "Find more sales near you"
- Threads: "Running a {saleTypeLabel} sale this weekend in {sale.city}"
- Nextdoor: "{saleTypeLabel} sale open to the public. Items include…"
- Neighbor copy: "if you love finding deals at local sales" (remove estate-sale-specific reference)

Also fix `pages/sales/[id].tsx:577`: `"Check out this ${saleTypeLabel} on FindA.Sale!"` using dynamic sale type.

### Batch 2 — P1: SEO Meta (→ `findasale-dev`)

1. **`pages/organizers/[id].tsx:84`** — `"Sales by ${organizer.businessName}"` or dynamically use organizer's sale types
2. **`pages/sales/zip/[zip].tsx:31`** — `"Find estate sales, garage sales, and auctions in ZIP code ${zip}"`
3. **`components/ItemSearchResults.tsx:148`** — `"Start browsing sales to discover unique finds."`

### Batch 3 — P2: Shopper Copy (→ `findasale-dev`)

4. **`pages/shopper/hauls.tsx:84`** — `"Share your finds and see what others are hunting"`
5. **`pages/faq.tsx:111`** — `"Items on FindA.Sale are generally sold as-is."`
6. **`pages/faq.tsx:146`** — `"Shoppers browse sales on the homepage or map"`
7. **`pages/condition-guide.tsx:91`** — Add garage sales and flea markets: `"estate sales, garage sales, auctions, and more"`

### Batch 4 — P3: Content Pages (→ `findasale-dev` for copy, `findasale-marketing` for encyclopedia decision)

8. **`pages/guide.tsx:241`** — `"Share it with other sale organizers."`
9. **`pages/guide.tsx:101`** — Add context: "Estate sale pricing is typically 20–50% of retail. Other sale types vary — garage sales often go lower, auctions may go higher."
10. **`pages/organizer/typology.tsx:264,268`** — Feature description: "estate sale items" → "sale items" or "your inventory"
11. **`pages/organizer/email-digest-preview.tsx:41`** — Default businessName: `'Your Sales'`
12. **`pages/encyclopedia/index.tsx + [slug].tsx`** — Route to **Patrick** first: rename to "Resale Encyclopedia" or "Secondhand Encyclopedia" vs. keeping estate-sale branding for SEO. Don't ship without direction.

---

## Notes

- **SharePromoteModal is the highest-urgency fix.** It is actively used by organizers and publicly visible on social platforms. A garage sale organizer sharing via TikTok gets "Estate sale haul alert" — brand-damaging and inaccurate.
- **Encyclopedia rename requires Patrick input** before dev dispatch. Prior audit noted it may have SEO equity. Flag to Patrick, not dev.
- **D-004/D-005 remain UNVERIFIED** — Chrome MCP viewport testing needed. Queue for `findasale-qa` when browser is available.
- Fix batches 1–3 are all single-line copy changes. A focused dev session can resolve all ~12 in one pass.
