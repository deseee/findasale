# Brand Drift Audit — 2026-05-12

**Run by:** weekly-brand-drift-detector scheduled task  
**Scope:** All .tsx files in packages/frontend/pages + components, skill SKILL.md files, D-001 through D-005 compliance spot-checks  
**Brand references:** claude_docs/brand/brand-voice-guide-2026-03-16.md, claude_docs/brand/DECISIONS.md

---

## Summary

**No serious brand voice violations found in live user-facing surfaces.** The homepage, pricing, and about pages all correctly enumerate multiple sale types alongside estate sales. The hero copy, meta descriptions, and schema.org markup are all inclusive. Dark mode compliance looks solid across sampled components.

Two low-severity code comment issues found. One page file comment and one encyclopedia page comment treat "estate sale" as the primary audience framing (D-001 violation in developer-facing code, not user-facing copy). One OG meta description on the organizer profile page is too narrow.

---

## Drift Findings

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/guide.tsx` | 3 | File-level comment: `"Full walkthrough for estate sale organizers."` — treats estate sales as the default audience in developer docs. Should read "all sale organizers" or "secondary sale organizers." | D-001 |
| `pages/encyclopedia/index.tsx` | 1–4 | File-level comment: `"Estate Sale Encyclopedia Index Page"` and `"Feature #52: Public encyclopedia of estate sale knowledge"` — the encyclopedia covers all secondhand knowledge, not only estate sales. | D-001 |
| `pages/cities/index.tsx` | 3 | File-level comment: `"Displays all cities with active estate sales."` — cities page covers all sale types. | D-001 |
| `pages/neighborhoods/[slug].tsx` | 3 | File-level comment: `"SEO-optimised page for estate sales in a specific neighborhood."` — same as above. | D-001 |
| `pages/organizers/[id].tsx` | 149 | OG meta description: `"Estate sales, auctions, and more from {businessName}"` — omits garage sales, flea markets, yard sales. A flea market vendor's profile page leads with "Estate sales" — misrepresents their business. | D-001 |
| `public/llms.txt` | 75 | `"Individual estate sale organizers looking to reach more buyers"` is the first use case listed — estate sales are positioned as the primary/default audience for AI agents reading this file. Other sale types follow but estate is top-of-list and standalone. | D-001 |

---

## What Was Clean

**Homepage (index.tsx):** Hero copy says "Browse yard sales, garage sales, estate sales, flea markets, auctions, and more." Meta descriptions enumerate all types. Schema.org descriptions inclusive. Estate Sale is one entry in the sale type dropdown filter alongside 14 other types. ✅

**Pricing page (pricing.tsx):** All tier descriptions are sale-type-agnostic. Enterprise section mentions "auction houses, franchises, or high-volume teams." No estate-only language in any tier descriptions. ✅

**About page (about.tsx):** Mission section opens with "yard sales, garage sales, estate sales, flea markets, auctions, consignment." Inclusive. ✅

**SEO pages (categories, calendar, map, sales, neighborhoods, city/[slug], sales/zip/[zip]):** All meta descriptions and schema.org text correctly enumerate multiple sale types. Estate sale appears in lists, not as the sole/default audience. ✅

**Skill SKILL.md files:** All findasale-* skills that mention estate sales do so in lists alongside other sale types (findasale-marketing, findasale-innovation, findasale-legal, findasale-gamedesign, findasale-ux, findasale-advisor-board). The findasale-competitor skill correctly labels "Primary Estate Sale Platforms" as a competitor category — this is accurate and appropriate. findasale-polish explicitly flags "Estate sale as the default" as a brand voice violation to watch for. ✅

**Components sampled (SocialProofMessage, ClaimCard):** Both have full dark mode coverage with `dark:` variants on all color classes. ✅

**D-003 Empty States:** organizer/sales.tsx has an empty state with CTA ("Create Your First Sale" button). Messages page uses EmptyState component. ✅

**D-005 Multi-Endpoint:** Not chrome-tested in this run (no Chrome MCP available to scheduled task). Flagged for QA queue.

---

## Compliance Score

**D-001 (All Sale Types):** 5 files with minor drift (all code comments or a single meta tag) — no hero copy, tier descriptions, or onboarding flows affected. User-facing copy is clean. 🟡  
**D-002 (Dark Mode):** Spot-check of 2 components — both compliant. No regressions detected in sampled files. ✅  
**D-003 (Empty States):** 2 of 2 sampled pages have CTAs. ✅  
**D-004 (Mobile-First):** Not Chrome-tested this run. Structural review shows responsive classes in use. 🟡  
**D-005 (Multi-Endpoint):** Not Chrome-tested this run. 🟡  

**Overall: 1/5 decisions with confirmed drift (D-001, low severity). 4 code comments + 1 meta description + 1 llms.txt entry.**

---

## Recommended Fixes

**Priority: Low (P3) — all in developer comments or non-primary meta tags, not hero copy or onboarding.**

Route to **findasale-dev** for the code comment and meta fixes (single targeted edits, all <20 lines total):

1. `pages/guide.tsx` line 3 — change comment to: `"Full walkthrough for secondary sale organizers (estate sales, auctions, yard sales, flea markets, and more)."`

2. `pages/encyclopedia/index.tsx` lines 1–4 — change to: `"Secondary Sales Encyclopedia Index Page"` and `"Feature #52: Public encyclopedia of secondary sale knowledge"`

3. `pages/cities/index.tsx` line 3 — change to: `"Displays all cities with active sales of all types."`

4. `pages/neighborhoods/[slug].tsx` line 3 — change to: `"SEO-optimised page for sales in a specific neighborhood."`

5. `pages/organizers/[id].tsx` line 149 — change OG meta description to: `"Sales, auctions, and more from {businessName}{locationSuffix}."` (removes the leading "Estate sales" to make it type-agnostic)

Route to **findasale-marketing** for the llms.txt fix:

6. `public/llms.txt` line 75 — reorder or rewrite use cases so estate sale organizers are not the first/standalone entry. Suggest: `"Secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment) looking to reach more buyers"` as a single inclusive entry.

---

*All fixes above are P3 cosmetic/developer-facing. No urgent dispatch required — batch with next dev session.*
