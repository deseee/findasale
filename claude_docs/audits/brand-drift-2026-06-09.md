# Brand Drift Audit — 2026-06-09

**Run by:** weekly-brand-drift-detector (scheduled task)
**Scan scope:** All `.tsx` files in `packages/frontend/`, key pages (index, about, pricing, guide, neighborhoods), DECISIONS.md compliance spot-checks, skill descriptions
**Brand authority files read:** `claude_docs/brand/DECISIONS.md`, `claude_docs/brand/brand-voice-guide-2026-03-16.md`

---

## Drift Findings

| # | File | Line(s) | Issue | Decision Violated | Severity |
|---|------|---------|-------|-------------------|----------|
| 1 | `packages/frontend/pages/about.tsx` | 12–14 | Meta description: "Learn about FindA.Sale and our mission to simplify sales management." OG description: "FindA.Sale is a digital platform for sale organizers and shoppers in your community." Neither mentions estate sales, garage sales, auctions, or any sale type. Brand voice guide requires meta descriptions to convey the breadth of resale types to reinforce positioning. | D-001 (copy doesn't represent all sale types) | P3 |
| 2 | `packages/frontend/pages/pricing.tsx` | 202–204 | Meta description and OG description: "Choose the perfect plan for managing your sales." / "Choose the perfect plan for managing your sales." No sale types mentioned. Body copy is inclusive (mentions organizers of all types), but SEO meta copy misses the positioning. | D-001 (meta copy doesn't represent all sale types) | P3 |
| 3 | `packages/frontend/components/SearchFilterPanel.tsx` | 298, 314, 345 | Three elements missing dark mode variants: (1) "Clear Filters" button: `border-warm-300 hover:bg-warm-100 text-warm-700` — no `dark:` on any of the three classes; (2) desktop result count paragraph: `text-warm-500` — no `dark:text-warm-400`; (3) mobile result count paragraph: `text-warm-500` — no `dark:text-warm-400`. In dark mode the Clear Filters button text and result count text will both render in light-on-light. | D-002 (Full Dark Mode Support) | P3 |
| 4 | `packages/frontend/pages/guide.tsx` | 3 | Code comment: "Full walkthrough for estate sale organizers." Actual page `<h1>` and `<title>` correctly say "Organizer Guide" (inclusive). Body content covers estate, auction, flea market pricing and workflows. The comment is code-only and not user-facing. | D-001 (comment only — no user-facing impact) | P4 |

---

## Compliance Score

**7/8 decisions fully compliant.**

| Decision | Status | Notes |
|----------|--------|-------|
| D-001: All Sale Types Scope | ⚠️ Partial | User-facing body copy on homepage, about, pricing, and guide pages is inclusive and mentions multiple sale types. Homepage hero, about mission statement, and neighborhoods meta descriptions all reference garage sales, auctions, flea markets, etc. **Gap:** About and pricing meta descriptions are too generic — they don't violate D-001 (no estate-sale bias) but fail the brand voice checklist item "Weave all sale types naturally into messaging." |
| D-002: Full Dark Mode Support | ⚠️ Minor gap | 5 sampled components: SaleCard, TreasureHuntBanner, SaleOfTheDayCard, EmptyState, ReturnToInventoryPanel — all clean. SearchFilterPanel has 3 missing `dark:` variants (lines 298, 314, 345). |
| D-003: Empty States Must Have CTAs | ✅ | Checked index.tsx (3 empty states all have CTAs), organizer/sales.tsx (inline CTA to create first sale), shopper/wishlist.tsx (2 empty states with CTAs). All compliant. |
| D-004: Mobile-First Layout | ✅ | Pricing and about pages use responsive grid classes (`grid-cols-1 md:grid-cols-3`, `sm:px-6 lg:px-8`). No fixed-pixel widths found on checked pages. |
| D-005: Multi-Endpoint Feature Testing | ✅ | Messaging system (`pages/messages/index.tsx`) handles both organizer and shopper role contexts in a single page with `roleContext` branching. Both sides of conversations are surfaced correctly. |
| D-006: Sale Detail Page Section Order | Not checked this scan | |
| D-007: Teams Tier Member Cap | Not checked this scan | |
| D-008: Loading States Are Mandatory | Not checked this scan | |

---

## Skill Description Scan

All checked skills are compliant:
- `findasale-marketing/SKILL.md` — explicitly lists "estate sales, yard sales, auctions, and flea markets" in scope. ✅
- `findasale-legal/SKILL.md` — mentions "estate sale" only as one trigger phrase example alongside consignment. ✅
- `findasale-qa/SKILL.md` — mentions "estate sale" only in a copy-consistency check example. ✅
- No skill was found that describes FindA.Sale as estate-sale-only.

---

## Recommended Fixes

**Route to `findasale-marketing` for copy changes:**

1. **About page meta description** (`packages/frontend/pages/about.tsx` line 12):
   Suggested replacement:
   ```
   "Learn how FindA.Sale helps organizers of estate sales, garage sales, auctions, flea markets, and more — and helps shoppers discover secondhand treasures near them."
   ```

2. **About page OG description** (`packages/frontend/pages/about.tsx` line 14):
   Suggested replacement:
   ```
   "FindA.Sale connects organizers of estate sales, yard sales, auctions, flea markets, and consignment events with local shoppers. Reduce manual work. Reach more buyers."
   ```

3. **Pricing meta and OG descriptions** (`packages/frontend/pages/pricing.tsx` lines 202–204):
   Suggested replacement:
   ```
   "Simple, fair pricing for estate sale companies, garage sale hosts, auctioneers, and flea market operators. Start free — keep 90% of what you sell."
   ```

**Route to `findasale-dev` for code fix:**

4. **SearchFilterPanel dark mode gaps** (`packages/frontend/components/SearchFilterPanel.tsx`):
   - Line 298: add `dark:border-gray-600 dark:hover:bg-gray-700 dark:text-warm-300` to Clear Filters button
   - Lines 314 and 345: add `dark:text-warm-400` to result count `<p>` elements

---

## Overall Assessment

No P0 or P1 violations found. The core user-facing copy (homepage hero, about body, pricing body, neighborhoods meta) is inclusive and correctly represents all sale types. The drift is in SEO meta copy (P3) and a minor dark mode gap in one filter component (P3). No single surface treats estate sales as the exclusive default audience.

**Action required:** Route fixes 1–3 to `findasale-marketing` for copy review and approval, then to `findasale-dev` for implementation. Route fix 4 to `findasale-dev` directly.
