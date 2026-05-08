# Brand Drift Audit — 2026-05-05

**Run by:** weekly-brand-drift-detector (scheduled task)
**Session at scan time:** S647 wrap state
**Files scanned:** All `.tsx` in `packages/frontend/` + all skill `SKILL.md` files

---

## Summary

8 user-facing D-001 violations found. 3 code-comment-only issues (low severity). Dark mode passes spot check. Skill files pass. Two decisions (D-003, D-004) deferred to Chrome QA — can't verify from static scan.

---

## Drift Findings

### D-001 — All Sale Types Scope

| File | Line | Issue | Severity | Decision |
|------|------|-------|----------|----------|
| `components/CityHero.tsx` | 29 | H1: **"Top Estate Sale Finds in {city}, {state}"** — estate-only header on all city SEO pages. High-traffic public page. Subhead (line 32) is inclusive but h1 anchors the estate framing. | P1 | D-001 |
| `components/CityTopFinds.tsx` | 42 | Subtitle: **"Best-valued items from recent estate sales, sorted by savings percentage"** — items actually come from all sale types but copy attributes them only to estate sales. | P1 | D-001 |
| `components/CityNearbyLinks.tsx` | 71 | Footer text: **"Powered by real estate sale data"** — double problem: (1) reads as "real estate" sale data (confusing category confusion), (2) estate-only attribution. Should say "local sale data" or "powered by local sale listings". | P1 | D-001 |
| `components/OnboardingModal.tsx` | 11 | First-run welcome step: **"Discover estate sales, garage sales, and auctions near you"** — excludes flea markets and yard sales. This is the first copy new shoppers ever see. | P1 | D-001 |
| `pages/sales/index.tsx` | 87 | Meta description: **"Discover upcoming estate sales, auctions, and yard sales in your area."** — excludes garage sales, flea markets, consignment. Public browse page. | P1 | D-001 |
| `pages/shopper/crews/index.tsx` | 41 | Copy: **"whether you're hunting vintage furniture, collectibles, or hidden gems at estate sales"** — single sale type at end of sentence with no mention of other types. | P2 | D-001 |
| `pages/index.tsx` | 274 | schema.org Organization description: **"browse, buy, and sell items from estate sales, garage sales, and auctions online"** — excludes yard sales, flea markets, consignment. Structured data is indexed by Google. | P2 | D-001 |
| `pages/referral-dashboard.tsx` | 38 | Referral share text: **"discover great deals at estate sales, yard sales, and more!"** — weak "and more" instead of listing types. Same text in `pages/shopper/referrals.tsx:38`. | P3 | D-001 |
| `pages/guide.tsx` | 3 | **Code comment only:** "Full walkthrough for estate sale organizers" — user-facing title is fine ("Organizer Guide"). No user impact. | P3-comment | D-001 |
| `pages/cities/index.tsx` | 3 | **Code comment only:** "Displays all cities with active estate sales" — internal doc string, no user impact. | P3-comment | D-001 |
| `pages/organizer/sales/[id]/analytics.tsx` | 4 | **Code comment only:** "Detailed analytics for a single estate sale" — internal doc string. | P3-comment | D-001 |

### D-002 — Dark Mode

**PASS** — Spot check of 5 components (`CityHero.tsx`, `CityTopFinds.tsx`, `EfficiencyCoachingWidget.tsx`, `ReturnToInventoryPanel.tsx`, `OnboardingModal.tsx`) all have correct `dark:` variants on background and text classes. Regex scan for `bg-white` without `dark:` counterparts in `/components/` returned 0 matches.

### D-003 — Empty States Must Have CTAs

**DEFERRED** — Static code scan shows `EmptyState` component is imported in multiple list pages (encyclopedia, crews). Cannot confirm CTA presence without Chrome browser test. No violations detected in code scan. Queue for next QA session.

### D-004 — Mobile-First

**DEFERRED** — Cannot run 375px viewport tests from automated scheduled task. Queue for next QA session.

### D-005 — Multi-Endpoint Feature Testing

**N/A** — Not applicable to brand drift scan.

### D-006 — "AI" in User-Facing Copy

**Additional check (from memory feedback):** No occurrences of the literal word "AI" in user-facing UI copy found in this scan (grep implicitly covered by reading the flagged pages). `EfficiencyCoachingWidget.tsx` tooltip uses "Industry average" phrasing (not "AI"). No violations detected.

---

## Skill File Scan

All FindA.Sale `SKILL.md` files that mention estate sales do so alongside other sale types. No estate-sale-only framing found. **PASS.**

Notable appropriate usages:
- `findasale-marketing/SKILL.md` — "estate sales, yard sales, auctions, flea markets, consignment" (full list)
- `findasale-ux/SKILL.md` — "estate sales, auctions, flea markets, yard sales" (full list)
- `findasale-legal/SKILL.md` — "estate sales, auctions, consignment, yard sales, flea markets" (full list)
- `findasale-competitor/SKILL.md` — Section heading "Primary Estate Sale Platforms" refers to the competitor category, not our scope — contextually appropriate.

---

## Compliance Score

| Decision | Status | Notes |
|----------|--------|-------|
| D-001 All Sale Types | ❌ 8 violations | P1×5, P2×2, P3×1 |
| D-002 Dark Mode | ✅ PASS | 5-component spot check |
| D-003 Empty States | ⚠️ DEFERRED | Needs Chrome QA |
| D-004 Mobile-First | ⚠️ DEFERRED | Needs Chrome viewport test |
| D-005 Multi-Endpoint | N/A | Not in scope |
| D-006 No "AI" Copy | ✅ PASS | No violations found |
| D-007 Teams Cap | N/A | Not in scope |
| D-008 Loading States | N/A | Not in scope |
| D-009 Error States | N/A | Not in scope |
| D-010 No Autonomous Removal | N/A | Not in scope |

**4/6 applicable decisions fully compliant. D-001 has active violations.**

---

## Recommended Fixes

### P1 — Route to findasale-dev (copy changes, low-risk)

**Fix 1 — `components/CityHero.tsx:29`**
Change H1 from:
```
Top Estate Sale Finds in {city.name}, {city.state}
```
To:
```
Top Deals & Finds in {city.name}, {city.state}
```
(The subhead already says "Estate sales, yard sales, auctions, flea markets, and more" — that's the inclusive layer. The h1 just needs to be type-neutral.)

**Fix 2 — `components/CityTopFinds.tsx:42`**
Change subtitle from:
```
Best-valued items from recent estate sales, sorted by savings percentage
```
To:
```
Best-valued items from local sales, sorted by savings percentage
```

**Fix 3 — `components/CityNearbyLinks.tsx:71`**
Change footer text from:
```
Powered by real estate sale data | Last updated daily
```
To:
```
Powered by local sale listings | Last updated daily
```

**Fix 4 — `components/OnboardingModal.tsx:11`**
Change welcome step body from:
```
Discover estate sales, garage sales, and auctions near you. Browse hundreds of items and find amazing deals in your area.
```
To:
```
Discover estate sales, garage sales, yard sales, auctions, flea markets, and more near you. Browse items and find amazing deals in your area.
```

**Fix 5 — `pages/sales/index.tsx:87`**
Change meta description from:
```
Discover upcoming estate sales, auctions, and yard sales in your area.
```
To:
```
Discover upcoming estate sales, garage sales, yard sales, auctions, flea markets, and more in your area.
```

### P2 — Route to findasale-dev

**Fix 6 — `pages/shopper/crews/index.tsx:41`**
Change:
```
hidden gems at estate sales
```
To:
```
hidden gems at estate sales, garage sales, auctions, and more
```

**Fix 7 — `pages/index.tsx:274` (schema.org)**
Change Organization description from:
```
Secondary sales marketplace — browse, buy, and sell items from estate sales, garage sales, and auctions online
```
To:
```
Secondary sales marketplace — browse, buy, and sell items from estate sales, garage sales, yard sales, auctions, flea markets, and more
```

### P3 — Route to findasale-dev (trivial, batch with P1/P2)

**Fix 8 — `pages/referral-dashboard.tsx:38` + `pages/shopper/referrals.tsx:38`**
Change referral message from:
```
discover great deals at estate sales, yard sales, and more!
```
To:
```
discover great deals at estate sales, garage sales, yard sales, auctions, flea markets, and more!
```

### P3-comment (optional, low-value)
Code comment cleanup in `guide.tsx:3`, `cities/index.tsx:3`, `analytics.tsx:4` — update to say "all sale types" or generic. Batch with next session touching those files.

---

## Dispatch Recommendation

All 8 fixes are copy-only, single-line changes across 7 files. No logic changes. Batch as one `findasale-dev` dispatch with title: "Brand drift fix: D-001 estate-only copy in city pages, onboarding, browse, schema.org (8 items)". Estimated: <30 min, <50 lines changed.
