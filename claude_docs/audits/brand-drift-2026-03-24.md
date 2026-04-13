# Brand Drift Audit — 2026-03-24

**Auditor:** Weekly brand drift detector (automated scheduled task)
**Scope:** All `.tsx` files in `packages/frontend/`, active skill SKILL.md files
**Reference docs:** `claude_docs/brand/DECISIONS.md`, `claude_docs/brand/brand-voice-guide-2026-03-16.md`
**Run date:** 2026-03-24

---

## Executive Summary

**D-001 (All Sale Types Scope) has significant active drift.** 27 files contain "estate sale" language used as the sole or default sale type, treating estate sales as the platform default in violation of the brand voice guide. The homepage, about page, and pricing page are COMPLIANT. The drift is concentrated in SEO meta tags, page titles, organizer-facing copy, and shopper-facing copy across many secondary pages.

Skills are largely compliant. No new D-001 violations were introduced in skill files beyond one minor instance.

---

## Drift Findings

### P0 — Brand-Critical / SEO-Visible

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/_document.tsx` | 33 | Global site meta: "discover estate sales and auctions near you" — omits garage/yard/flea | D-001 |
| `pages/_document.tsx` | 35 | Keywords: "estate sales, auctions, antiques, thrift, local sales" — no garage/yard/flea | D-001 |
| `pages/city/[city].tsx` | 83 | Page title: "Estate Sales in [City], [State]" — estate-sale-only branding | D-001 |
| `pages/city/[city].tsx` | 84 | Meta description: "Find upcoming estate sales in [City]" | D-001 |
| `pages/city/[city].tsx` | 91 | Keywords: "estate sales [city]" | D-001 |
| `pages/city/[city].tsx` | 167 | H1: "Estate Sales in [City], [State]" | D-001 |
| `pages/city/[city].tsx` | 269 | CTA: "Run estate sales in [City]?" | D-001 |
| `pages/neighborhoods/[slug].tsx` | 49 | Page title: "Estate Sales in [Neighborhood]" | D-001 |
| `pages/neighborhoods/[slug].tsx` | 70, 90, 100 | schema.org name, H1, breadcrumb all say "Estate Sales in [Neighborhood]" | D-001 |
| `pages/encyclopedia/index.tsx` | 71, 74, 83, 86, 245 | Entire section titled "Estate Sale Encyclopedia" — no other sale types mentioned | D-001 |
| `pages/map.tsx` | 188–190 | Meta title "Estate Sales Map", OG title/desc estate-sale-only | D-001 |
| `pages/calendar.tsx` | 118, 157–158, 167 | Meta + empty states: "Browse upcoming estate sales" / "No estate sales scheduled" | D-001 |
| `pages/faq.tsx` | 301 | Meta description: "the estate sale marketplace" | D-001 |

### P1 — Organizer-Facing Copy

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/organizer/sales.tsx` | 94 | Meta: "View and manage your estate sales" | D-001 |
| `pages/organizer/sales.tsx` | 105 | H2 paragraph: "View all your estate sales and manage listings." | D-001 |
| `pages/organizer/sales.tsx` | 181 | Empty state: "No sales yet. Create your first estate sale to get started." | D-001 |
| `pages/organizer/dashboard.tsx` | 818 | EmptyState subtext: "Start by creating your first estate sale." | D-001 |
| `pages/organizer/create-sale.tsx` | 157 | Hero copy: "Get your estate sale online in minutes." | D-001 |
| `pages/guide.tsx` | 297 | Meta: "Complete guide for estate sale organizers on FindA.Sale" | D-001 |
| `pages/guide.tsx` | 305 | H1 sub: "Everything you need to run a successful estate sale on FindA.Sale." | D-001 |
| `pages/organizer/pro-features.tsx` | 84 | Social proof: "Join estate sale organizers who trust FindA.Sale." | D-001 |
| `pages/organizer/typology.tsx` | 264, 268 | TierGate description + meta: "estate sale items" only | D-001 |
| `components/TeamsOnboardingWizard.tsx` | 153, 158 | Workspace name description and placeholder: estate-sales-specific | D-001 |
| `pages/organizer/storefront/[slug].tsx` | 172 | Default bio fallback: "A professional estate sale organizer serving..." | D-001 |
| `pages/organizer/email-digest-preview.tsx` | 41, 53 | Default businessName and sample sale title: estate-sale-only | D-001 |

### P2 — Shopper-Facing Copy

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `pages/trending.tsx` | 52 | Meta: "The hottest estate sale items and upcoming sales" | D-001 |
| `pages/trending.tsx` | 54 | OG: "See what's trending at estate sales right now." | D-001 |
| `pages/inspiration.tsx` | 65, 70, 82 | Meta + OG + H2: "from estate sales near you" (3 instances) | D-001 |
| `pages/tags/[slug].tsx` | 64, 72, 84, 121, 214 | All copy: "items available at estate sales near you" (5 instances) | D-001 |
| `pages/categories/index.tsx` | 49 | Meta: "Browse estate sale items by category" | D-001 |
| `pages/categories/[category].tsx` | 45 | Meta: "Browse [label] items at estate sales near you" | D-001 |
| `pages/search.tsx` | 450 | Empty state: "new estate sales are listed all the time" | D-001 |
| `pages/feed.tsx` | 74 | OG: "Your personalized estate sale feed" | D-001 |
| `pages/shopper/loot-log.tsx` | 43, 93 | Meta + empty state: "from estate sales" (2 instances) | D-001 |
| `pages/shopper/loot-log/public/[userId].tsx` | 46 | Meta: "[name]'s estate sale purchases" | D-001 |
| `pages/shopper/trails.tsx` | 47 | Meta: "Your custom estate sale routes" | D-001 |
| `pages/shopper/trails/create.tsx` | 67 | Meta: "through your favorite estate sales" | D-001 |
| `pages/trail/[shareToken].tsx` | 43, 133 | Meta default + UI copy: "estate sales" only | D-001 |
| `pages/surprise-me.tsx` | 83 | Meta: "from active estate sales near you" | D-001 |
| `pages/shopper/dashboard.tsx` | 205 | Empty state: "Explore nearby estate sales" | D-001 |
| `pages/shoppers/[id].tsx` | 66 | Meta: "[name]'s estate sale shopper profile" | D-001 |
| `pages/hubs/[slug].tsx` | 53 | Meta fallback: "[hub.name] with [n] estate sales" | D-001 |
| `pages/hubs/index.tsx` | 44 | Meta: "group estate sales" | D-001 |

### P3 — Component Defaults & Utility

| File | Line | Issue | Decision Violated |
|------|------|-------|-------------------|
| `components/SaleShareButton.tsx` | 29 | Share text: "Check out this estate sale:" | D-001 |
| `components/ReferralWidget.tsx` | 116 | Share text: "Check out this estate sale on FindA.Sale!" | D-001 |
| `components/SaleOGMeta.tsx` | 105 | OG fallback text: "Estate sale in [location]" | D-001 |
| `components/SalesNearYou.tsx` | 85 | Fallback label: `'Estate Sale'` for sales without a name | D-001 |
| `pages/api/og.tsx` | 11, 133, 267 | OG API: default title "Estate Sale", copy "estate sale treasures" | D-001 |
| `components/AddToCalendarButton.tsx` | 49 | iCal PRODID: `//FindA.Sale//Estate Sales//EN` | D-001 |

---

## Compliant Surfaces ✅

These pages passed the tone consistency checklist — all sale types represented, warm/inclusive tone, no estate-sale-default pattern:

| Surface | Status |
|---------|--------|
| `pages/index.tsx` (homepage) | ✅ COMPLIANT — hero and meta include all types |
| `pages/about.tsx` | ✅ COMPLIANT — mission statement names all types |
| `pages/organizer/pricing.tsx` | ✅ COMPLIANT — no sale-type bias |
| `pages/terms.tsx` | ✅ COMPLIANT — properly lists all event types |
| `pages/privacy.tsx` | ✅ COMPLIANT — properly lists all types |
| `components/Layout.tsx` footer | ✅ COMPLIANT — lists all sale types |
| `components/OnboardingWizard.tsx` | ✅ COMPLIANT — bias removed in S260 |
| `pages/cities/index.tsx` | ✅ COMPLIANT — lists estate, yard, garage, more |
| `pages/neighborhoods/index.tsx` | ✅ COMPLIANT — lists all types |

---

## Skill File Check

| Skill File | Status | Notes |
|------------|--------|-------|
| `findasale-marketing/SKILL.md` | ✅ COMPLIANT | Lists all sale types throughout. Minor: "a neighbor who runs estate sales" (line 49) — low priority context note. |
| `findasale-ux/SKILL.md` | ✅ COMPLIANT | "estate sales, auctions, flea markets, yard sales, consignment" |
| `findasale-advisory-board/SKILL.md` | ✅ COMPLIANT | "secondary sale organizer (estate sale, yard sale, auction, flea market, consignment)" |
| `findasale-innovation/SKILL.md` | ✅ COMPLIANT | Lists all types in research framework |
| `findasale-competitor/SKILL.md` | ✅ COMPLIANT | "Primary Estate Sale Platforms" is a competitive category label, not brand copy |
| `findasale-deploy/SKILL.md` | NOTE | "Estate sale-specific regulatory requirements" (line 62) — factual legal note, low priority |
| All others | ✅ COMPLIANT | No estate-sale-only bias found |

---

## Compliance Score

| Decision | Status | Notes |
|----------|--------|-------|
| D-001 (All Sale Types Scope) | ❌ DRIFT | 27+ files with estate-sale-only language |
| D-002 (Full Dark Mode) | ✅ COMPLIANT (code review) | No color classes missing dark: variants found in spot-checked files. Live verification recommended. |
| D-003 (Empty States CTAs) | ⚠️ PARTIAL | CTAs present in all checked empty states. However, copy often says "estate sale" — fix copy per D-001 remediation |
| D-004 (Mobile-First) | ⚠️ UNVERIFIED | Requires live Chrome MCP viewport check at 375px — cannot verify via static analysis |
| D-005 (Multi-Endpoint) | ⚠️ UNVERIFIED | Requires live user-journey testing — cannot verify via static analysis |

**Summary: 1/5 decisions confirmed fully compliant via static analysis. D-001 has active drift across 27+ files.**

---

## Recommended Fixes

### Batch 1 — P0 SEO Pages (dispatch to findasale-dev)
These are Google-visible titles and meta descriptions. Fix first.

1. **`pages/_document.tsx` lines 33, 35** — Update global meta to include all sale types: "discover estate sales, garage sales, auctions, flea markets and more near you." Update keywords.
2. **`pages/city/[city].tsx`** — Change page title pattern from "Estate Sales in [City]" to "Sales Near [City]" or "Find Sales in [City], [State]". Update meta, H1, CTA, keywords.
3. **`pages/neighborhoods/[slug].tsx`** — Same pattern fix: "Sales in [Neighborhood]" not "Estate Sales."
4. **`pages/map.tsx`** — "FindA.Sale Map — Sales Near You." Update all three meta tags.
5. **`pages/calendar.tsx`** — "Browse upcoming sales" / "No sales scheduled for these dates." Three instances.
6. **`pages/encyclopedia/index.tsx`** — Rename to "Resale Encyclopedia" or "Secondhand Sales Encyclopedia." Update title, meta, H1, contributor text. Note: This is a significant rebrand of the entire section.
7. **`pages/faq.tsx` line 301** — "the secondhand sales marketplace" or "the community resale marketplace."

### Batch 2 — P1 Organizer Copy (dispatch to findasale-dev)

8. **`pages/organizer/sales.tsx` lines 94, 105, 181** — "View and manage your sales." / "View all your sales and manage listings." / "No sales yet. Create your first sale to get started."
9. **`pages/organizer/dashboard.tsx` line 818** — EmptyState: "Start by creating your first sale. Set up details, add inventory, and go live!"
10. **`pages/organizer/create-sale.tsx` line 157** — "Get your sale online in minutes."
11. **`pages/guide.tsx` lines 297, 305** — Meta: "Complete guide for sale organizers on FindA.Sale." H1 sub: "Everything you need to run a successful sale on FindA.Sale."
12. **`pages/organizer/pro-features.tsx` line 84** — "Join organizers who trust FindA.Sale." or "Join estate sale, auction, and garage sale organizers…"
13. **`components/TeamsOnboardingWizard.tsx` lines 153, 158** — "Create a workspace name for your team's sales operations." Placeholder: "e.g., Grand Rapids Sales Team"
14. **`pages/organizer/storefront/[slug].tsx` line 172** — Default bio: "A professional sale organizer serving the Grand Rapids area."

### Batch 3 — P2 Shopper Copy (dispatch to findasale-dev)

15. **`pages/trending.tsx` lines 52, 54** — "The hottest items across all upcoming sales this week." / "See what's trending at sales near you."
16. **`pages/inspiration.tsx` lines 65, 70, 82** — "Beautiful items from upcoming sales near you." (3 instances)
17. **`pages/tags/[slug].tsx`** — "items available near you at upcoming sales" (5 instances)
18. **`pages/categories/index.tsx` line 49** — "Browse items by category on FindA.Sale."
19. **`pages/categories/[category].tsx` line 45** — "Browse [label] items from sales near you."
20. **`pages/search.tsx` line 450** — "new sales are being listed all the time."
21. **`pages/feed.tsx` line 74** — "Your personalized sales feed."
22. **`pages/shopper/loot-log.tsx` lines 43, 93** — "Your purchase history" / "Make your first purchase to start building your collection history."
23. **`pages/shopper/trails.tsx` line 47** — "Your custom sale routes and favorites."
24. **`pages/shopper/trails/create.tsx` line 67** — "Create a new treasure trail through your favorite sales."
25. **`pages/surprise-me.tsx` line 83** — "from active sales near you."

### Batch 4 — P3 Component Defaults (dispatch to findasale-dev)

26. **`components/SaleShareButton.tsx` line 29** — "Check out this sale: [title] on [date]…"
27. **`components/ReferralWidget.tsx` line 116** — "Check out this sale on FindA.Sale!"
28. **`components/SaleOGMeta.tsx` line 105** — "[type] sale in [location] with…" (already has a `sale.saleType` — use it dynamically)
29. **`components/SalesNearYou.tsx` line 85** — Fallback label: `sale.saleType || 'Sale'`
30. **`pages/api/og.tsx` lines 11, 133, 267** — OG default title: "Sale" (use saleType if available), body copy: "Discover amazing items at sales" / "Browse & bid on treasures"

### Routing to Agents

- **All 30 fixes above:** → `findasale-dev` (copy/text changes in .tsx files, <5 lines each)
- **Encyclopedia page rename (item 6):** → `findasale-marketing` first for copy direction, then `findasale-dev` for implementation. Note: "Estate Sale Encyclopedia" may have SEO equity — Patrick should weigh renaming vs. redirecting/expanding scope.
- **D-004/D-005 verification:** → `findasale-qa` (requires live Chrome MCP testing)

---

## Notes

- The **homepage is compliant** — D-001 drift is NOT on the most-visible surface. However, it is pervasive on SEO pages (city, neighborhood, map, calendar) which affect search discovery.
- The **city and neighborhood pages** are the highest-SEO-impact violations. If the platform's goal is TAM expansion, ranking as "estate sales only" in Google directly undermines that.
- Many of these violations are **single-line copy changes** — a focused dev batch can resolve 25+ items in one session.
- The **encyclopedia section** is a larger decision — it is deeply branded as "Estate Sale Encyclopedia" and may have existing SEO value. Route to Patrick before renaming.
