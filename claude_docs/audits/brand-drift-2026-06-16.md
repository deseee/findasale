# Brand Drift Audit — 2026-06-16

**Run by:** weekly-brand-drift-detector (scheduled task)
**Scan scope:** All `.tsx` files in `packages/frontend/`, recently-modified files (since 2026-06-09), key pages (index, about, pricing, guide, city/[slug]), DECISIONS.md compliance spot-checks, skill SKILL.md files
**Brand authority files read:** `claude_docs/brand/DECISIONS.md`, `claude_docs/brand/brand-voice-guide-2026-03-16.md`
**Prior audit:** `claude_docs/audits/brand-drift-2026-06-09.md`

---

## Drift Findings

| # | File | Line(s) | Issue | Decision Violated | Severity | First Flagged |
|---|------|---------|-------|-------------------|----------|---------------|
| 1 | `components/SearchFilterPanel.tsx` | 298, 314, 345 | Clear Filters button (`border-warm-300 hover:bg-warm-100 text-warm-700`) has no `dark:` variants. Desktop result count `<p>` (`text-warm-500`) has no `dark:text-warm-400`. Mobile result count `<p>` (`text-warm-500`) has no `dark:text-warm-400`. In dark mode: button text and result counts render light-on-light. **Age: 3+ weekly audits (~20+ sessions). Severity floor escalates to P0.** | D-002 | **P0** (escalated from P3) | 2026-05-26 |
| 2 | `pages/about.tsx` | 12, 14 | Meta description: "Learn about FindA.Sale and our mission to simplify sales management." OG description: "FindA.Sale is a digital platform for sale organizers and shoppers in your community." Neither mentions any sale type. Brand voice guide requires meta copy to convey sale-type breadth. Body copy (line 56) is inclusive. **Age: 2 consecutive weekly audits (~7-10 sessions). Severity floor escalates to P1.** | D-001 | **P1** (escalated from P3) | 2026-06-09 |
| 3 | `pages/pricing.tsx` | 202, 204 | Meta description: "Choose the perfect plan for managing your sales." OG: same. No sale types mentioned. Body copy inclusive. **Age: 2 consecutive weekly audits (~7-10 sessions). Severity floor escalates to P1.** | D-001 | **P1** (escalated from P3) | 2026-06-09 |
| 4 | `components/PriceResearchPanel.tsx` | 407 | `bg-[#4A7C59] hover:bg-[#3d664a] disabled:bg-gray-400` on "Confirm & Submit" button — hardcoded hex green with no `dark:` variant. File modified this week (recent addition). | D-002 | P3 | 2026-06-16 (new) |
| 5 | `pages/organizer/settings/ebay.tsx` | 880 | Radio label: "Use the sale's address (recommended for estate sales)" — contextually accurate for eBay shipping origin, but minor estate-centric phrasing in an organizer-only tool. Not user-facing to shoppers. | D-001 | P4 | 2026-06-16 (new) |
| 6 | `pages/guide.tsx` | 3 | Code comment: "Full walkthrough for estate sale organizers." Page `<title>`, `<h1>`, and body content are all inclusive. Code-only, not user-facing. | D-001 | P4 | 2026-06-09 (carryover) |

---

## Age-Escalation Detail

Per `CLAUDE.md §10a` severity floor rules:

| Finding | First Audit | Weeks Open | Est. Sessions | Rule Applied | New Severity |
|---------|-------------|------------|---------------|--------------|--------------|
| SearchFilterPanel dark mode | 2026-05-26 | 3 | ~20+ | 10+ sessions = P0 minimum | **P0** |
| about.tsx meta description | 2026-06-09 | 1 | ~5-7 | 5-9 sessions = P1 minimum | **P1** |
| pricing.tsx meta description | 2026-06-09 | 1 | ~5-7 | 5-9 sessions = P1 minimum | **P1** |

---

## Compliance Score

**5 decisions checked. 3 fully compliant. 2 with gaps.**

| Decision | Status | Notes |
|----------|--------|-------|
| D-001: All Sale Types Scope | ⚠️ Partial | Homepage hero ✅ (all types listed). About body ✅. Guide body ✅. City/[slug] title ✅ (fixed 06-02). **Gap:** about.tsx and pricing.tsx meta/OG descriptions are too generic — no sale types mentioned (P1, escalated). |
| D-002: Full Dark Mode Support | ⚠️ Gap | SearchFilterPanel: 3 elements missing dark: (P0 — 3 weeks unresolved). PriceResearchPanel: 1 new button missing dark: variant (P3, new this week). PostSaleEbayPanel, ShippingNetPreview, CatalogSuggestionPanel all have robust dark: coverage. |
| D-003: Empty States Must Have CTAs | ✅ | messages/index.tsx uses EmptyState component ✅. organizer/dashboard.tsx has "Create Your First Sale" CTA ✅. shopper/wishlist.tsx has 2 EmptyState instances ✅. |
| D-004: Mobile-First Layout | ✅ | index.tsx and recently-modified components use responsive grid/flex classes. No fixed-pixel blocking widths found in spot-check. |
| D-005: Multi-Endpoint Feature Testing | ✅ | messages/index.tsx handles `roleContext: 'organizer' | 'shopper'` branching — both endpoints surfaced correctly. |

Decisions D-006 through D-010 not checked this scan cycle.

---

## Skill Description Scan

All FindA.Sale skills are compliant with D-001. Findings:

- `findasale-competitor/SKILL.md` line 51: Section header "**Primary Estate Sale Platforms:**" — this is a competitive landscape label for platforms that are themselves estate-sale-focused. Not a self-description of FindA.Sale scope. ✅ Acceptable in context.
- `findasale-deploy/SKILL.md` line 62: "Estate sale-specific regulatory requirements" — in a legal compliance checklist. Minor narrowing but contextually reasonable (estate sale regulation is the most legally complex sale type). P4.
- All other skills (findasale-marketing, findasale-qa, findasale-ux, findasale-innovation, findasale-legal, findasale-gamedesign) correctly represent all sale types. ✅

---

## Recently-Modified Files Scan (since 2026-06-09)

Files changed this week: CatalogSuggestionPanel, CheckoutModal, EbayCategoryPicker, FollowButton, PostSaleEbayPanel, PriceResearchPanel, PriceSuggestion, RapidCapture, ShippingNetPreview, TreasureHuntBanner, checkout, estate-sales/[city-slug], index, items/[id], add-items/[saleId]/review, add-items/[saleId], affiliate, edit-item/[id], print-kit/[saleId], settings/ebay.

- **Brand language drift in new files:** 1 instance (ebay.tsx line 880 — P4, contextual)
- **Dark mode gaps in new files:** 1 instance (PriceResearchPanel.tsx line 407 — P3)
- No new P0/P1 violations introduced this week.

---

## Recommended Fixes

### Route to `findasale-dev` for code fixes (P0 first):

**P0 — SearchFilterPanel.tsx (3 weeks unresolved — fix immediately):**
```
File: packages/frontend/components/SearchFilterPanel.tsx
Line 298: Change
  className="w-full px-4 py-2 border border-warm-300 hover:bg-warm-100 text-warm-700 font-medium rounded-lg transition-colors text-sm"
To:
  className="w-full px-4 py-2 border border-warm-300 dark:border-gray-600 hover:bg-warm-100 dark:hover:bg-gray-700 text-warm-700 dark:text-warm-300 font-medium rounded-lg transition-colors text-sm"

Line 314: Change
  <p className="text-xs text-warm-500 mt-6">
To:
  <p className="text-xs text-warm-500 dark:text-warm-400 mt-6">

Line 345: Change
  <p className="text-xs text-warm-500">
To:
  <p className="text-xs text-warm-500 dark:text-warm-400">
```

**P3 — PriceResearchPanel.tsx (new this week):**
```
File: packages/frontend/components/PriceResearchPanel.tsx
Line 407: Add dark: variant to confirm button:
  className="flex-1 px-4 py-2 bg-[#4A7C59] hover:bg-[#3d654a] dark:bg-[#3d654a] dark:hover:bg-[#325440] disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
```

### Route to `findasale-marketing` for copy updates (P1):

**P1 — about.tsx meta descriptions:**
```
Line 12: Replace "Learn about FindA.Sale and our mission to simplify sales management."
With: "Learn how FindA.Sale helps organizers of estate sales, garage sales, auctions, flea markets, and more reach local buyers — and helps shoppers discover secondhand treasures near them."

Line 14: Replace "FindA.Sale is a digital platform for sale organizers and shoppers in your community."
With: "FindA.Sale connects organizers of estate sales, yard sales, auctions, flea markets, and consignment events with shoppers. Reduce manual work. Reach more buyers."
```

**P1 — pricing.tsx meta descriptions:**
```
Line 202: Replace "Choose the perfect plan for managing your sales."
With: "Simple, fair pricing for estate sale companies, garage sale hosts, auctioneers, and flea market operators. Start free — keep 90% of what you sell."

Line 204 (OG): Same replacement as line 202.
```

---

## Overall Assessment

No new P0/P1 issues introduced this week. However, **the SearchFilterPanel dark mode gap (P0) has been open for 3 consecutive audits (~20+ sessions) without a fix** — age escalation now makes it P0. It is a small, targeted fix (3 lines) that has been in the recommended fixes section since May 26.

The meta description improvements (P1) are also small copy changes that have been recommended since last week. Neither requires schema changes or architecture decisions.

All recently-modified eBay and shipping components (PostSaleEbayPanel, ShippingNetPreview, RapidCapture) have strong dark mode coverage. No estate-sale-only bias was found in any user-facing hero or onboarding copy.

