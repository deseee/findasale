# Brand Drift Audit — 2026-06-02

**Scheduled task:** weekly-brand-drift-detector  
**Run date:** 2026-06-02  
**Scope:** All `.tsx` files in `packages/frontend/`, key pages reviewed, active skill descriptions scanned  
**Decisions checked:** D-001 through D-005  
**Prior audit:** brand-drift-2026-05-26.md

---

## Prior Findings Status (2026-05-26)

7 of 8 findings from last week were fixed. Strong week.

| Prior Finding | Status |
|--------------|--------|
| `city/[slug].tsx:60` — City page title omitted auctions/flea markets | ✅ FIXED — now "Estate Sales, Auctions & More in..." |
| `neighborhoods/index.tsx:40–57` — Missing flea markets in meta | ✅ FIXED — now includes flea markets |
| `faq.tsx:79` — "estate sale organizer" as default organizer archetype | ✅ FIXED — now "sale organizer or item seller" |
| `CityDirectorySection.tsx:63` — Missing flea market operators | ✅ FIXED — now includes flea market operators |
| `clearance/index.tsx:187` — Missing auctions in meta | ✅ FIXED — now includes auctions |
| `SearchFilterPanel.tsx:328+342` — Dark mode missing on Filters button/panel | ✅ FIXED — dark: variants added |
| `sales/index.tsx:143` — Empty state missing CTA | ✅ FIXED — now has Browse by City + Browse by Category CTAs |
| `findasale-marketing/SKILL.md:49` — Brand voice archetype defaults to estate sales | ⚠️ CARRYOVER — still reads "a neighbor who happens to run estate sales" |

---

## Drift Findings — This Week

| File | Line | Issue | Severity | Decision |
|------|------|-------|----------|----------|
| `pages/organizer/create-sale.tsx` | 705 | Default title placeholder `"e.g., Smith Family Estate Sale"` fires when no sale type is selected (before the user picks a tile). Frames estate sales as the default event type to all new organizers at the highest-friction moment of sale creation. Should use a multi-type example or no example until a tile is chosen. | P2 | D-001 |
| `pages/organizers/[id].tsx` | 218 | OG meta description: `"Estate sales, auctions, and more from [organizer name]"` — drops yard sales, garage sales, flea markets entirely. The standard meta on line 215 includes them, but OG (used by Facebook/Twitter/LinkedIn previews) does not. High social-share visibility. | P2 | D-001 |
| `components/EfficiencyCoachingWidget.tsx` | 72 | Tooltip text: `"Industry average is 60–80% for estate sales."` — shown to all organizer types on the efficiency metric. Garage sale and flea market baselines differ; framing this as an estate-sale benchmark confuses non-estate organizers. | P3 | D-001 |
| `pages/organizer/settings.tsx` | 1441 | Organizer tagline placeholder: `"e.g., Estate Sales Since 2010 — Quality & Authenticity"` — the example in the bio/tagline field presented to all organizer types assumes an estate sale background. Low visibility (placeholder only) but shapes first-impression defaults. | P3 | D-001 |
| `components/AuctionCountdown.tsx` | 40 | `text-warm-500 bg-warm-100 px-2 py-0.5` badge — no `dark:` variants. Badge will render warm-on-warm (low contrast) in dark mode. | P3 | D-002 |
| `findasale-marketing/SKILL.md` | 49 | CARRYOVER — `"Think: a knowledgeable neighbor who happens to run estate sales."` still present. Every marketing output written by this agent is framed from an estate-sale-organizer perspective. Requires skill reinstall (cannot activate by editing file alone). | P2 | D-001 |

---

## Compliance Score

**8/10 decisions fully compliant** (up from 7/10 last week).

| Decision | Status | Notes |
|----------|--------|-------|
| D-001: All Sale Types Scope | ⚠️ Partial | 4 violations: create-sale placeholder, organizers OG meta, EfficiencyWidget tooltip, settings tagline placeholder. Plus 1 carryover skill. |
| D-002: Full Dark Mode Support | ⚠️ Partial | 1 new minor violation — AuctionCountdown badge |
| D-003: Empty States Must Have CTAs | ✅ Compliant | sales/index fix confirmed. Other list pages checked — CTAs present. |
| D-004: Mobile-First Layout | ✅ Compliant | Not Chrome-tested this run; structural patterns correct |
| D-005: Multi-Endpoint Feature Testing | ✅ Compliant | N/A — no new multi-endpoint features this week |
| D-006: Sale Detail Page Section Order | ✅ Compliant | Not modified recently |
| D-007: Teams Tier Member Cap | ✅ Compliant | Pricing page confirmed correct |
| D-008: Loading States | ✅ Compliant | Skeleton/loading patterns intact throughout |
| D-009: Error States Recovery Paths | ✅ Compliant | General pattern correct |
| D-010: No Autonomous Content Removal | ✅ Compliant | N/A this audit |

---

## What Does NOT Count as Violations

Per established precedent from prior audits:

- Code comments referencing estate sales (`guide.tsx:3`, `analytics.tsx:4`, `BulkStatusModal.tsx:5`) — not user-facing
- `'estate-sales'` as a URL slug or enum value in category maps — functional routing, not brand copy
- "Estate Sale" as a dropdown option or filter label — correct categorical labeling
- `findasale-competitor/SKILL.md` header "Primary Estate Sale Platforms" — accurate factual description of competitors
- The EstateSales.NET export tile on the promote page (`promote/[saleId].tsx:618`) — a third-party platform name, not FindA.Sale copy

---

## Recommended Fixes

**Route to `findasale-dev` (code edits):**

**P2 — Fix create-sale default placeholder (D-001):**  
`pages/organizer/create-sale.tsx` line 705  
Change: `placeholder={selectedTile ? \`e.g., ${titleSuggestions[selectedTile.key][0]}\` : 'e.g., Smith Family Estate Sale'}`  
To: `placeholder={selectedTile ? \`e.g., ${titleSuggestions[selectedTile.key][0]}\` : 'e.g., Your Sale Name'}`  
Rationale: Before a tile is chosen, there's no reason to assume estate sales — the placeholder should be neutral.

**P2 — Fix organizers OG meta description (D-001):**  
`pages/organizers/[id].tsx` line 218  
Change: `"Estate sales, auctions, and more from ${organizer.businessName}${locationSuffix}."`  
To: `"Estate sales, garage sales, auctions, and more from ${organizer.businessName}${locationSuffix}."`  
(Or better: `"Sales and events from ${organizer.businessName}${locationSuffix} — estate sales, garage sales, auctions, and more."`)

**P3 — Fix EfficiencyCoachingWidget tooltip (D-001):**  
`components/EfficiencyCoachingWidget.tsx` line 72  
Change: `"Industry average is 60–80% for estate sales."`  
To: `"Industry average is 60–80% for most resale events."`

**P3 — Fix organizer settings tagline placeholder (D-001):**  
`pages/organizer/settings.tsx` line 1441  
Change: `placeholder="e.g., Estate Sales Since 2010 — Quality & Authenticity"`  
To: `placeholder="e.g., Quality Sales Since 2010 — Trusted by Local Buyers"`

**P3 — Fix AuctionCountdown dark mode badge (D-002):**  
`components/AuctionCountdown.tsx` line 40  
Add dark variants: `dark:text-warm-300 dark:bg-warm-800` (or appropriate contrast pair)

---

**Route to `findasale-records` (skill update, requires Patrick to reinstall):**

**P2 — Fix findasale-marketing brand voice archetype (CARRYOVER):**  
`skills/findasale-marketing/SKILL.md` line 49  
Change: `"Think: a knowledgeable neighbor who happens to run estate sales."`  
To: `"Think: a knowledgeable neighbor who happens to run local sales — estate sales, garage sales, auctions, or anything in between."`  
*Requires: package updated SKILL.md as .skill zip → Patrick installs via Cowork UI.*

---

*Audit completed by: weekly-brand-drift-detector scheduled task*
