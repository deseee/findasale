# FindA.Sale — Code & Live Site Audit — 2026-03-20
**Method:** Source code inspection (Layout.tsx, SaleCard.tsx, BottomTabNav.tsx, TierGatedNav.tsx, dashboard.tsx + key shopper pages) + live WebFetch of production
**Note:** Chrome MCP not connected this session. All findings are from actual source files and live HTTP responses.

---

## Executive Summary

Platform is **functionally sound** with correct role gating, tier enforcement, and good brand voice on primary flows. **Three new critical dark mode bugs found** not in prior audits: shopper nav links (13 items) and two shopper pages (favorites, loyalty) have zero dark: Tailwind classes — shoppers in dark mode will see **invisible nav and unreadable pages**. The badge explosion and nav density from March 18 remain unaddressed. Dashboard button count is 25 (not 18 as previously estimated).

**Beta risk: MEDIUM-HIGH** — shopper dark mode is a real user-facing bug that will hit immediately.

---

## New Critical Findings (Not In Prior Audits)

### 🔴 C1: Shopper Nav Links — Zero Dark Mode
**File:** `components/Layout.tsx` lines 139–184
**Code:** 13 shopper auth links use `text-warm-900 hover:text-amber-600` with **0 dark: classes**. In dark mode the drawer background goes dark but text stays near-black → links are invisible.
**Affected:** My Profile, Wishlists, Referrals, Collector Passport, Alerts, Trails, Loot Log, Loyalty, Receipts, Challenges, Live Feed, Encyclopedia, Settings
**Fix:** Add `dark:text-warm-100 dark:hover:text-amber-400 dark:hover:bg-gray-700` — matches organizer nav pattern on lines 74–138 which is done correctly.

### 🔴 C2: Shopper Pages Missing Dark Mode Entirely
- `pages/shopper/favorites.tsx` — **0 dark: classes** across entire page
- `pages/shopper/loyalty.tsx` — **0 dark: classes** across entire page
In dark mode: dark background, warm-900 text = effectively unreadable.
(shopper/achievements.tsx has 17 dark: classes — that page is fine.)

### 🔴 C3: SaleCard Dark Mode — Only 5 of ~15 Styled Elements Covered
**File:** `components/SaleCard.tsx`
Dark classes exist for: image area bg, skeleton loader, card title, metadata text, favorite count.
**Missing dark: on:** card container/bg, organizer name link, price, VerifiedBadge row, the card border/shadow in dark context.

### 🔴 C4: Raw Unstyled "Not Found" States
- `pages/organizers/[id].tsx`: `<div className="min-h-screen flex items-center justify-center">Organizer not found</div>` — bare text, no CTA
- `pages/shoppers/[id].tsx`: same pattern — "Shopper not found"
- `pages/items/[id].tsx`: `<div className="p-6">Item not found.</div>` — no EmptyState component, no CTA

---

## Prior Audit Findings — Status Confirmed

### Badge Explosion (March 18 design-critique #1) — STILL PRESENT
**Code:** SaleCard lines 123–151 render SOLD, LIVE, Flash Deal, AUCTION, TODAY in a single `flex gap-1` container. Conditional suppression reduces some overlap but **LIVE + AUCTION can coexist**, **AUCTION + TODAY can coexist** — up to 3 badges simultaneously.
Badge styles: still `text-xs font-bold` (12px) — unaddressed.

### Nav Density (March 18 ux-audit) — CONFIRMED, COUNTS UPDATED
**Confirmed from Layout.tsx:**

| Role | Auth Drawer Links | Static Header Links | Total |
|------|------------------|---------------------|-------|
| Public | 0 | 8 | 8 ✅ |
| Shopper | 13 | 8 | **21** 🔴 |
| SIMPLE Org | 9 | 8 | **17** 🔴 |
| PRO Org | 9 + 6 locked PRO items visible | 8 | **23** 🔴 |
| TEAMS Org | PRO + Workspace | 8 | **24** 🔴 |

**Note:** PRO/TEAMS items show as `🔒` locked links for SIMPLE via TierGatedNavLink (not hidden). This is good for discoverability but inflates nav count.

### Dashboard Button Count — WORSE THAN ESTIMATED
**Confirmed:** 25 href/button targets in the quick actions section (lines 273–530).
Prior estimate was 18 — actual is **25**.

### Duplicate Dashboard Link — STILL PRESENT
Dashboard appears in both drawer (line 77) and desktop right nav (line 275).

---

## Role Gating — Confirmed Working ✅

`TierGatedButton` and `TierGatedNavLink` are properly implemented:
- `isLocked = !canAccess(requiredTier)` check
- Locked → disabled, 🔒 icon, `cursor-not-allowed`, tooltip "Upgrade to [tier] to unlock [feature]"
- Both components have dark: classes
- No unauthorized access confirmed

`BottomTabNav`: role-aware — Profile tab routes to `/organizer/dashboard` for organizers, `/shopper/dashboard` for shoppers. aria-label present on all 5 tabs.

---

## Dark Mode Summary

| Component | dark: Count | Status |
|-----------|-------------|--------|
| Organizer drawer nav | Full (on all links) | ✅ |
| **Shopper drawer nav** | **0** | **🔴 BUG** |
| Organizer dashboard | 89 | ✅ |
| TierGatedNav/Button | Present | ✅ |
| SaleCard | 5 (partial) | 🟡 |
| shopper/achievements | 17 | ✅ |
| **shopper/favorites** | **0** | **🔴 BUG** |
| **shopper/loyalty** | **0** | **🔴 BUG** |

---

## Brand Voice Assessment

**✅ Good:**
- Hero: "Discover Amazing Deals — Find estate sales, garage sales, and auctions near you" — includes all sale types
- 404 page: clear, friendly, has support email + CTA
- Favorites empty state: "No favorites yet — Start saving items you love! Tap the heart on any item to add it to your favorites." + Browse Sales CTA
- Pro features page: "Join estate sale organizers who trust FindA.Sale." — specific
- Tier upsell on brand-kit: "Upgrade to PRO to customize your brand font" — clear and specific

**⚠️ Needs Improvement:**
- Flip Report gate: "Flip Report is a PRO feature. Upgrade your plan to access post-sale analytics." — generic. Missing value proposition.
- Photo Op gate: just "Upgrade to PRO" header with no value prop
- Organizer upsell on dashboard: "Unlock Pro Features" — too generic for an upsell modal

**🔴 Off-Brand:**
- `pages/shopper/loot-log/` uses `text-slate-700` — outside brand warm palette
- "Organizer not found" / "Shopper not found" / "Item not found." — raw, unstyled, no warmth or CTA

---

## Blockers Before Beta

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Shopper nav invisible in dark mode | Layout.tsx:139–184 | Add dark: classes to 13 links |
| 2 | shopper/favorites — no dark mode | pages/shopper/favorites.tsx | Full dark: audit of page |
| 3 | shopper/loyalty — no dark mode | pages/shopper/loyalty.tsx | Full dark: audit of page |
| 4 | Raw unstyled "not found" states | organizers/[id], shoppers/[id], items/[id] | Replace with EmptyState + CTA |

## High Priority (Before Public Growth)

| # | Issue | Fix |
|---|-------|-----|
| 5 | Badge explosion | Single-badge priority logic (highest wins) |
| 6 | Dashboard 25 buttons | Collapsible sections or role-aware reduction |
| 7 | Nav density 17–24 items | Progressive disclosure / grouped sections |
| 8 | SaleCard dark: incomplete | Add dark: to price, organizer row, card bg |
| 9 | loot-log uses slate-700 | Replace with warm-700 |
| 10 | Generic tier upsell copy | Add value-prop language to Flip Report + Photo Op gates |

---

## What's Working Well
- ✅ Role gating: TierGatedButton/TierGatedNavLink fully functional
- ✅ BottomTabNav role-aware + aria-labeled
- ✅ Organizer nav + dashboard: full dark mode coverage
- ✅ Hero copy includes all sale types (estate, garage, auctions)
- ✅ Favorites empty state: warm, helpful, has CTA
- ✅ 404 page: clean, has support contact
- ✅ TierGatedNav shows 🔒 locked items (feature discovery preserved)
- ✅ Shopper achievements page: 17 dark: classes, well covered
- ✅ Tier upsell language is specific on brand-kit page

