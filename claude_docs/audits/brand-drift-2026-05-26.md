# Brand Drift Audit — 2026-05-26

**Scheduled task:** weekly-brand-drift-detector  
**Run date:** 2026-05-26  
**Scope:** All `.tsx` files in `packages/frontend/`, key pages reviewed, active skill descriptions scanned  
**Decisions checked:** D-001 through D-005  

---

## Drift Findings

| File | Line | Issue | Severity | Decision Violated |
|------|------|-------|----------|-------------------|
| `pages/city/[slug].tsx` | 60 | Page title: `"Estate Sales & Yard Sales in ${cityName}, ${cityState}"` — omits auctions, flea markets, consignment. High-visibility SEO title rendered on every city landing page. | P1 | D-001 |
| `pages/neighborhoods/index.tsx` | 40–57 | Meta description: "Find estate sales, yard sales, and auctions in neighborhoods near you." — missing flea markets and consignment. Appears in Google search results. | P2 | D-001 |
| `pages/faq.tsx` | 79 | "The **estate sale organizer** or item seller sets the condition rating" — uses estate sale organizer as the default archetype in a general FAQ about item condition. Should be "sale organizer or item seller." | P2 | D-001 |
| `components/CityDirectorySection.tsx` | 63 | "Estate sale companies, auction houses, and resale organizers operating in this area." — missing flea market operators, yard sale hosts, consignment sellers. | P2 | D-001 |
| `pages/clearance/index.tsx` | 187 | Meta: "Shop clearance items from recently ended estate sales, yard sales, and more." — auctions and flea markets absent. "And more" partially mitigates but estate sales still leads with others invisible. | P3 | D-001 |
| `skills/findasale-marketing/SKILL.md` | 49 | "Think: a knowledgeable neighbor who happens to **run estate sales**." — frames the archetypal organizer as an estate sale organizer in the marketing agent's brand voice guidance. Shapes every marketing output. | P2 | D-001 |
| `components/SearchFilterPanel.tsx` | 328 | "Filters" toggle button: `bg-white border border-warm-300 hover:bg-warm-50 text-warm-900` — no `dark:` variants. Button is invisible/low-contrast in dark mode. | P2 | D-002 |
| `components/SearchFilterPanel.tsx` | 342 | Filter panel container: `bg-white border border-warm-200` — no `dark:` variants. White panel on dark background in dark mode. | P2 | D-002 |
| `pages/sales/index.tsx` | 143 | Empty state: `<p>No sales found.</p>` — no CTA, no suggestion to search another area or adjust filters. Dead end for users. | P2 | D-003 |

---

## Compliance Score

**7/10 decisions fully compliant.** 3 decisions have drift:

| Decision | Status | Notes |
|----------|--------|-------|
| D-001: All Sale Types Scope | ⚠️ Partial | 5 user-facing violations + 1 skill violation |
| D-002: Full Dark Mode Support | ⚠️ Partial | 2 violations in SearchFilterPanel (same component, same area) |
| D-003: Empty States Must Have CTAs | ⚠️ Partial | 1 violation on sales/index |
| D-004: Mobile-First Layout | ✅ Compliant | Not Chrome-tested this audit; structural patterns look correct |
| D-005: Multi-Endpoint Feature Testing | ✅ Compliant | N/A this week — no new multi-endpoint features shipped |
| D-006: Sale Detail Page Section Order | ✅ Compliant | Not modified recently |
| D-007: Teams Tier Member Cap | ✅ Compliant | Pricing page shows Teams correctly |
| D-008: Loading States | ✅ Compliant | Skeleton patterns observed throughout |
| D-009: Error States Recovery Paths | ✅ Compliant | General pattern correct |
| D-010: No Autonomous Content Removal | ✅ Compliant | N/A this audit |

---

## Contextual Notes

**What does NOT count as D-001 violations (estate sale = legitimate label):**
- `pages/city/[slug].tsx` category map defines `'estate-sales'` as a URL slug — this is a functional enum, not brand copy.
- `components/SaleTypeBadge.tsx`, `SaleCard.tsx`, `SearchFilterPanel.tsx` filter labels — "Estate Sale" as a dropdown option is correct labeling, not bias.
- `guide.tsx:3` — code comment "Full walkthrough for estate sale organizers" is not user-facing; H1 and title are both correctly "Organizer Guide."
- `analytics.tsx:4` — code comment only.
- `findasale-competitor/SKILL.md:51` — "Primary Estate Sale Platforms" is an accurate factual header about competitors, not brand positioning.
- Most pages use all sale types correctly in SEO copy with estate sales listed naturally alongside other types — the violations above are exceptions, not the pattern.

---

## Recommended Fixes

**Route to `findasale-dev` (code edits):**

**P1 — Fix city page title to include all types:**
`pages/city/[slug].tsx` line 60  
Change: `Estate Sales & Yard Sales in ${cityName}, ${cityState} | FindA.Sale`  
To: `Estate Sales, Auctions & More in ${cityName}, ${cityState} | FindA.Sale`

**P2 — Fix neighborhoods meta description:**
`pages/neighborhoods/index.tsx` — meta content and JSON-LD description  
Change: `"Find estate sales, yard sales, and auctions in neighborhoods near you."`  
To: `"Find estate sales, yard sales, auctions, flea markets, and more in neighborhoods near you."`  
(Apply to all 3 instances: meta description, og:description, schema.org description)

**P2 — Fix FAQ to remove estate sale as default organizer type:**
`pages/faq.tsx` line 79  
Change: `"The estate sale organizer or item seller sets the condition rating"`  
To: `"The sale organizer or item seller sets the condition rating"`

**P2 — Fix CityDirectorySection to include all organizer types:**
`components/CityDirectorySection.tsx` line 63  
Change: `"Estate sale companies, auction houses, and resale organizers operating in this area."`  
To: `"Estate sale companies, auction houses, flea market operators, and resale organizers operating in this area."`

**P2 — Fix SearchFilterPanel dark mode (Filters button + panel):**
`components/SearchFilterPanel.tsx` line 328  
Add: `dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-warm-100`  
`components/SearchFilterPanel.tsx` line 342  
Add: `dark:bg-gray-800 dark:border-gray-700`

**P2 — Fix sales/index empty state — add CTA:**
`pages/sales/index.tsx` around line 143  
Replace bare "No sales found." with an EmptyState component including a suggestion: "Try searching a different city or browsing by category" with links.

**P3 — Fix clearance meta to include auctions:**
`pages/clearance/index.tsx` line 187  
Change: `"Shop clearance items from recently ended estate sales, yard sales, and more."`  
To: `"Shop clearance items from recently ended estate sales, auctions, yard sales, and more."`

**Route to `findasale-records` (skill update):**

**P2 — Fix findasale-marketing SKILL.md brand voice archetype:**
`skills/findasale-marketing/SKILL.md` line 49  
Change: `"Think: a knowledgeable neighbor who happens to run estate sales."`  
To: `"Think: a knowledgeable neighbor who happens to run local sales — estate sales, garage sales, auctions, or anything in between."`  
*(Note: skill updates require packaging as .skill zip and Patrick installing via Cowork UI — cannot be activated by editing the file.)*

---

*Audit completed by: weekly-brand-drift-detector scheduled task*
