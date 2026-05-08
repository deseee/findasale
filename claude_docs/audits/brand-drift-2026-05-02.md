# Brand Drift Audit — 2026-05-02

**Run by:** weekly-brand-drift-detector (automated)
**Scope:** All `.tsx` files in `packages/frontend/`, active skill SKILL.md files
**Decisions checked:** D-001, D-002, D-003, D-006 (spot checks on D-004, D-005)
**Status:** Drift found — see Recommended Fixes

---

### Drift Findings

| # | File | Line | Issue | Decision Violated | Severity |
|---|------|------|-------|-------------------|----------|
| 1 | `components/OnboardingModal.tsx` | 11 | Shopper welcome copy: "Discover estate sales, garage sales, and auctions near you." — flea markets omitted from the very first thing new shoppers read | D-001 | P2 |
| 2 | `pages/index.tsx` | 263 | Twitter card meta description: "estate sales, garage sales, yard sales, auctions, and more" — flea markets missing | D-001 | P2 |
| 3 | `pages/index.tsx` | 273 | schema.org description: "estate sales, garage sales, and auctions online" — yard sales and flea markets both absent | D-001 | P2 |
| 4 | `pages/faq.tsx` | 79 | User-facing copy: "The estate sale organizer or item seller sets the condition rating" — solo estate sale framing for all organizers. Should read "The organizer or item seller…" | D-001 | P2 |
| 5 | `components/EfficiencyCoachingWidget.tsx` | 72 | Tooltip: "Industry average is 60–80% for estate sales." — estate sales only; garage/auction/flea market averages differ and organizers of other types see this same stat | D-001 | P2 |
| 6 | `pages/shopper/referrals.tsx` | 38 | Share message: "discover great deals at estate sales, yard sales, and more!" — auctions and flea markets absent | D-001 | P2 |
| 7 | `pages/referral-dashboard.tsx` | 38 | Same share message as referrals.tsx: "estate sales, yard sales, and more!" — identical omission | D-001 | P2 |
| 8 | `components/PriceResearchPanel.tsx` | 175, 192 | Visible user-facing text uses 🤖 robot emoji ("🤖 Smart Estimate") — robot emoji directly signals "AI" to users; D-006 bans "AI" in user-facing copy; use ✨ or 💡 instead | D-006 adjacent | P2 |
| 9 | `skills/findasale-marketing/SKILL.md` | 49 | Skill context: "Think: a knowledgeable neighbor who happens to run estate sales." — sole estate sale framing primes marketing content generation toward estate sales as default | D-001 | P2 |
| 10 | `pages/organizer/create-sale.tsx` | 4 | Dev comment: "Main organizer workflow for setting up a new estate sale." — comment frames the create-sale workflow as estate-sale-specific; cosmetic but drifts agent context | D-001 | P3 |
| 11 | `pages/organizer/sales/[id]/analytics.tsx` | 4 | Dev comment: "Detailed analytics for a single estate sale:" — same estate-sale-as-default comment framing | D-001 | P3 |
| 12 | `pages/neighborhoods/[slug].tsx` | 3 | Dev comment: "SEO-optimised page for estate sales in a specific neighborhood" — comment contradicts the meta description on the same page (which correctly includes all types) | D-001 | P3 |
| 13 | `pages/guide.tsx` | 3 | Dev comment: "Full walkthrough for estate sale organizers." — the guide page title is correctly "Organizer Guide" but the comment seeds estate-sale-default framing | D-001 | P3 |
| 14 | `components/CityHero.tsx` | 66 | "Search All Deals" button: `bg-blue-600 hover:bg-blue-700` — no `dark:` variant; second CTA button has full dark support but this primary CTA does not | D-002 | P3 |

---

### Compliance Score

**D-001 (All Sale Types):** Partially compliant. Homepage meta, OG, keyword, about page, and schema.org are all good. Twitter card, OnboardingModal, FAQ, EfficiencyCoachingWidget tooltip, referral share messages, and findasale-marketing skill carry drift. **8/13 key surfaces clean.**

**D-002 (Dark Mode):** Largely compliant. One specific button in CityHero.tsx lacks a dark variant. All sampled components had appropriate dark: class counts. **Flag as P3.**

**D-003 (Empty States):** Not fully audited — requires Chrome browser interaction to verify CTAs render. Deferred to next QA session.

**D-004 (Mobile-First):** Not verified this run — requires Chrome viewport testing. Deferred.

**D-005 (Multi-Endpoint):** Not in scope for copy/brand audit — covered by QA dispatches.

**D-006 (No "AI" in copy):** Mostly compliant. "AI-generated" appears in support.tsx and guide.tsx but both are warnings *against* using AI-generated content (acceptable context). The 🤖 robot emoji in PriceResearchPanel.tsx is the only live violation — it visually communicates "AI" to users. Rendered text does NOT use the word "AI" anywhere in user-facing JSX strings.

---

### Recommended Fixes

**P2 — Route to findasale-dev (code) or findasale-marketing (copy):**

1. **OnboardingModal.tsx line 11** → Change "estate sales, garage sales, and auctions" to "estate sales, garage sales, auctions, flea markets, and more" — *findasale-dev*

2. **index.tsx line 263** (Twitter meta) → Add "flea markets" to match OG and standard meta: "estate sales, garage sales, yard sales, auctions, flea markets, and more" — *findasale-dev*

3. **index.tsx line 273** (schema.org) → Expand: "estate sales, garage sales, yard sales, auctions, flea markets, and more" — *findasale-dev*

4. **faq.tsx line 79** → Change "The estate sale organizer or item seller" to "The organizer or item seller" — *findasale-dev*

5. **EfficiencyCoachingWidget.tsx line 72** → Change tooltip to "Industry average is 60–80% for estate sales; varies by sale type." OR "Varies by sale type — estate sales average 60–80%." — *findasale-dev*

6. **referrals.tsx and referral-dashboard.tsx line 38** → Change share text to "discover great deals at estate sales, garage sales, auctions, flea markets, and more!" — *findasale-dev* (2 files, same change)

7. **PriceResearchPanel.tsx lines 175, 192** → Replace 🤖 emoji with ✨ or 💡 — *findasale-dev*

8. **findasale-marketing SKILL.md line 49** → Change "a knowledgeable neighbor who happens to run estate sales" to "a knowledgeable neighbor who knows the secondary resale world — estate sales, garage sales, auctions, flea markets." — *findasale-records* (skill update)

**P3 — Batch cosmetic fixes:**

9. **create-sale.tsx line 4** → Update comment: "Main organizer workflow for setting up a new sale (estate sale, garage sale, auction, flea market, etc.)" — *findasale-dev*

10. **analytics.tsx line 4** → Update comment: "Detailed analytics for a single sale:" — *findasale-dev*

11. **neighborhoods/[slug].tsx line 3** → Update comment: "SEO-optimised page for sales in a specific neighborhood." — *findasale-dev*

12. **guide.tsx line 3** → Update comment: "Full walkthrough for all organizer types." — *findasale-dev*

13. **CityHero.tsx line 66** → Add dark variant to Search All Deals button: `dark:bg-blue-700 dark:hover:bg-blue-800` — *findasale-dev*

---

### Summary

No P0 or P1 violations found. The platform's primary SEO surfaces (homepage meta, OG tags, about page, keyword tags) correctly represent all sale types. Drift is concentrated in secondary surfaces: the first-run shopper onboarding experience, referral share messages, tooltip copy, and the findasale-marketing skill context line. The 🤖 emoji in PriceResearchPanel is the most user-visible D-006 concern and should be addressed in the next dev batch.

All P3 items are developer comments and a single missing dark class — safe to batch together as a low-token cosmetic fix.
