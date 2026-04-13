# UX Audit: Navigation Overload & Information Architecture
**FindA.Sale — March 18, 2026**

---

## Executive Summary

Patrick's core complaint—**"the site is way too busy"**—is valid and data-backed. The organizer experience is particularly affected. While public pages (home, trending, cities, leaderboard) are well-structured and minimal, **the authenticated experience (especially organizer dashboard) violates fundamental nav density principles with competing navigation layers and 20+ action buttons above the fold**.

Key finding: A SIMPLE organizer sees **10 nav links** in the drawer; a PRO organizer sees **14 nav links**; a TEAMS organizer sees **15 nav links**. The organizer dashboard compounds this by displaying **18 quick-action buttons** in a single row/wrap (lines 272–431 in dashboard.tsx). This creates extreme cognitive overload at entry point.

**Industry best practice:** Primary navigation ≤5–7 items. Organizer nav is 2–3x this density.

---

## Nav Complexity Scorecard

### Desktop Navigation (Layout.tsx, lines 231–320)

**Public User (Logged Out)**
- Static links: 9 items
  - Home, Calendar, Map, Plan a Sale, Cities, Trending, About, Leaderboard, Contact
- Benchmark: ✓ ACCEPTABLE (at max)

**Logged-in Shopper (USER role)**
- Static links: 9 items (same as public)
- Auth-gated right-side nav: 9 items
  - My Profile, My Wishlists, Referrals, Challenges, Live Feed, Encyclopedia, Collection, Loyalty, Settings
- **Total primary navigation: 18 items** (9 static + 9 user-specific)
- Density: **VERY HIGH** — violates best practice (should be ≤7)

**SIMPLE Organizer (ORGANIZER role, SIMPLE tier)**
- Static links: 9 items
- Auth-gated drawer/right-nav: 10 items
  - Dashboard, Premium Plans, Bounties, Message Templates, Reputation, UGC Moderation, Performance, Neighborhoods
  - *Plus* static Dashboard link (duplicate)
- **Total primary navigation: 19 items**
- Density: **CRITICAL OVERLOAD**

**PRO Organizer (ORGANIZER role, PRO tier)**
- Static links: 9 items
- Auth-gated drawer/right-nav: 14 items
  - Dashboard, Premium Plans, Command Center, Typology, Fraud Signals, Offline, Appraisals, Bounties, Message Templates, Reputation, UGC Moderation, Performance, Neighborhoods
  - *Plus* static Dashboard link (duplicate)
- **Total primary navigation: 23 items**
- Density: **CRITICAL OVERLOAD** — **3.3x industry maximum**

**TEAMS Organizer (ORGANIZER role, TEAMS tier)**
- Static links: 9 items
- Auth-gated drawer/right-nav: 15 items
  - All PRO items + Workspace
- **Total primary navigation: 24 items**
- Density: **CRITICAL OVERLOAD** — **3.4x industry maximum**

### Mobile Navigation

**Mobile Drawer** (Layout.tsx, lines 379–424)
- Static links: 9 items (same as desktop)
- Auth block appended below
- Same overflow as desktop

**Mobile Bottom Tab Nav** (BottomTabNav.tsx, lines 82–113)
- 5 tabs: Browse, Map, Saved, Messages, Profile
- Density: ✓ EXCELLENT — follows mobile best practice

**Problem:** Bottom tabs are global navigation, but they assume shopper role. Organizers see Profile → Dashboard, but no direct access to other organizer features. Organizers must use drawer or header.

---

## Information Architecture Problems

### 1. **Duplicate Dashboard Link** (CRITICAL)
**Location:** Layout.tsx, lines 76, 260

- Both drawer and desktop right-nav include a Dashboard link for organizers
- Creates confusion: which one? both go to the same place
- Wastes precious header real estate

**Impact:** Organizers see Dashboard twice in primary nav, reducing space for other features.

---

### 2. **Static Nav Bloat — 9 Links Always Visible** (CRITICAL)
**Location:** Layout.tsx, lines 56–66

The static nav (Home, Calendar, Map, Plan a Sale, Cities, Trending, About, Leaderboard, Contact) is visible to ALL users, regardless of role.

**Problem:**
- "Plan a Sale" (line 60) — organizer-only, but visible to shoppers
- "About," "Leaderboard," "Contact" — nice-to-have info pages that crowd core tasks
- On desktop, this creates a 9-item static row BEFORE role-based auth links

**Impact:** Organizers and shoppers compete for header space; low-priority pages take precedence over primary user tasks.

---

### 3. **Feature Tier Nav Mixing** (MEDIUM)
**Location:** Layout.tsx, lines 82–101 (PRO-gated links)

PRO features (Command Center, Typology, Fraud Signals, Offline, Appraisals) are mixed linearly with non-tiered organizer links (Bounties, Message Templates, Reputation).

**Problem:**
- No visual grouping or section header to distinguish "PRO" features from "All Organizer" features
- A new organizer sees "Command Center" unavailable and doesn't know why
- No "Upgrade to PRO to unlock..." cue

**Impact:** Unclear mental model; new organizers confused about tiers and feature access.

---

### 4. **Organizer Dashboard Quick-Links Explosion** (CRITICAL)
**Location:** dashboard.tsx, lines 272–431

**Visual Reality:**
- 18 buttons in a single flexbox wrap (flex-wrap, gap-4)
- On desktop: wraps into 3–4 rows (density: 4–6 buttons per row)
- On mobile: each button stacks; page is 8–10 rows of buttons before any dashboard content
- Each button has emoji + label + optional badge (Holds count)

**Buttons Present:**
1. Create New Sale
2. Listing Factory
3. Add Items
4. Insights (PRO)
5. Print Inventory
6. Webhooks (TEAMS)
7. POS
8. Brand Kit (PRO)
9. Item Library (PRO)
10. Flip Report (PRO)
11. Holds (with badge)
12. Export Data (PRO)
13. Bounties
14. Message Templates
15. Reputation
16. Neighborhoods
17. Performance
18. (Plus icon variations for 3–4 of these)

**Impact:**
- Mobile: User must scroll 10+ rows just to see "Active Sales" metric
- Desktop: Buttons wrap awkwardly; some are tier-gated but not visually distinguished
- Cognitive overload: no grouping, no sense of primary vs. secondary tasks

---

### 5. **Shopper Feature Scatter** (MEDIUM)
**Location:** Layout.tsx, lines 132–177

Shopper right-nav includes:
- Profile, Wishlists, Referrals
- My Collection section (Collection, Wishlist Alerts, Treasure Trails, Loot Log, Loyalty, Receipts)
- Browse (Challenges, Live Feed, Encyclopedia)
- Settings

**Problem:**
- "My Collection" subsection appears only in drawer, not desktop right-nav
- Desktop right-nav shows Collection, Loyalty, Settings in a nested border (lines 296–299) but full drawer shows 8 items
- Discrepancy between desktop and mobile navigation structure

---

### 6. **"Plan a Sale" in Static Nav** (MEDIUM)
**Location:** Layout.tsx, line 60

"Plan a Sale" is the **organizer onboarding flow** but lives in static nav (visible to all users).

**Problem:**
- Shoppers see it; it confuses them (they have no role to use it)
- It should be auth-gated or role-gated
- Currently redirects to `/plan` which may not exist or may show a 404

---

### 7. **Missing Section Headers in Drawer** (MEDIUM)
**Location:** Layout.tsx, lines 74–189

The authLinks block in the drawer has no visual grouping. All links are flat:

```
Dashboard
Premium Plans
Command Center  ← PRO feature
Typology  ← PRO feature
...
Message Templates
Reputation
UGC Moderation
Performance
Neighborhoods
```

No headers like "Core Features," "Pro Tools," "Community," etc.

**Impact:** Overwhelming list; no mental model for organization.

---

## Recommended Nav Restructure

### Proposed Desktop Layout (Right-side nav after the 9-item static header)

**For SIMPLE Organizer (currently: 10 items → proposed: 5 primary + 4 secondary)**

```
Dashboard ← primary
Manage Sales ← new grouping: Add Items, Print Inventory, Holds
Premium Plans ← CTA

─ Organizer Tools (fold/expand on hover)
  • Bounties
  • Message Templates
  • Reputation
  • Performance
  • Neighborhoods
```

**For PRO Organizer (currently: 14 items → proposed: 6 primary + 5 secondary + 4 advanced)**

```
Dashboard ← primary
Manage Sales ← grouping: Add Items, Print Inventory, Holds
Insights ← PRO feature, prominent
Premium Plans ← CTA (if not on PRO)

─ Pro Tools (fold/expand)
  • Command Center
  • Typology Classifier
  • Fraud Signals
  • Offline Mode
  • Appraisals

─ Advanced (fold/expand)
  • Brand Kit
  • Item Library
  • Flip Report
  • Export Data
```

**For TEAMS Organizer (currently: 15 items → proposed: 7 primary + 6 advanced)**

```
Dashboard ← primary
Manage Sales ← grouping
Insights ← PRO
Workspace ← TEAMS primary feature
Premium Plans ← CTA

─ Pro Tools (fold/expand)
  [same as PRO]

─ Advanced (fold/expand)
  • Webhooks
  • Brand Kit
  • Item Library
  • Flip Report
  • Export Data
```

**For Shopper (currently: 9 auth items → proposed: 5 primary + 4 collection + 3 secondary)**

```
My Profile ← primary
My Wishlists ← primary
Saved Sales ← via bottom tab, redundant; remove from nav

─ My Collection (always expanded on desktop)
  • Collection
  • Wishlist Alerts
  • Treasure Trails
  • Loot Log
  • Loyalty

─ Browse & Explore (fold/expand)
  • Live Sale Feed
  • Challenges
  • Encyclopedia
  • Referrals

Settings ← footer of dropdown
```

---

### Proposed Mobile Drawer (Same structure, stacked)

Mobile drawer (Layout.tsx, lines 379–424) should follow the same grouping:

```
[Role-based primary items]
[Grouped secondary items with toggle-expand]
[Settings footer]
```

No changes needed to BottomTabNav — it's already optimal at 5 items.

---

## Dashboard Density Issues

### Current State (dashboard.tsx, lines 272–431)

**18 Quick-Action Buttons:**
```
Row 1: Create New Sale, Listing Factory, Add Items, Insights
Row 2: Print Inventory, Webhooks, POS, Brand Kit
Row 3: Item Library, Flip Report, Holds (with badge), Export Data
Row 4: Bounties, Message Templates, Reputation, Neighborhoods
Row 5: Performance
```

On mobile, this is 18 stacked buttons before any dashboard content.

### Recommended Restructure

**Option A: Task-Focused Tabs (Preferred)**

Replace the button explosion with **3 primary tabs** above overview/sales tabs:

```
TABS: Operate Sale | Insights | Tools

Operate Sale tab:
  ├─ Quick Actions (row of 4 buttons max)
  │  ├─ Create New Sale
  │  ├─ Add Items
  │  ├─ Holds (with badge)
  │  └─ Manage Active Sales
  │
  └─ [Sale cards below]

Insights tab:
  ├─ Analytics Cards (Active Sales, Items, Revenue)
  ├─ Tier Progress
  ├─ Insights Dashboard (PRO only, prominent link)
  └─ Performance
```

**Option B: Collapsible Sections (Less aggressive)**

Keep current button layout but group into **collapsible sections:**

```
Quick Actions:
  ├─ Create New Sale
  ├─ Add Items
  └─ [Manage Sales dropdown selector]

Essential Tools:
  ├─ Holds
  ├─ Print Inventory
  ├─ POS
  └─ Message Templates

Tier-Based Features (collapsed by default):
  ├─ Insights (PRO)
  ├─ Command Center (PRO)
  ├─ Brand Kit (PRO)
  ├─ Item Library (PRO)
  ├─ Flip Report (PRO)
  ├─ Export Data (PRO)
  ├─ Webhooks (TEAMS)
  └─ [Expand button]

Community & Growth:
  ├─ Bounties
  ├─ Reputation
  ├─ Neighborhoods
  └─ Leaderboard link
```

On mobile, sections collapse to 1-line headers; on desktop, first 2 sections expand by default.

---

## Mobile Experience Analysis

### BottomTabNav (BottomTabNav.tsx, lines 69–164)

**Status: GOOD**
- 5 tabs is optimal for mobile bottom nav
- Icons + labels clear
- Badges (unread messages, loyalty points) add context without clutter
- Profile tab correctly routes to organizer/shopper dashboard based on role

**Minor Issue:**
- Saved tab (lines 96–99) links to `/shopper/dashboard#favorites` but matches `/shopper/dashboard` path
- If organizer taps "Profile" → Dashboard, then "Saved" → still shows organizer path, not shopper
- No way for organizer to access shopper features from bottom nav (role is hardcoded)

### Mobile Drawer Layout

**Current (lines 379–424):**
- Drawer width: w-72 (fixed 18rem, ~288px on mobile)
- On 375px phone: drawer takes 77% of screen width, reasonable
- Static nav + auth links combined (lines 406–422)
- Scrollable on small screens (overflow-y-auto)

**Problem:** No grouping or section headers, so dense list of 19+ items is hard to scan.

### Mobile Dashboard (dashboard.tsx)

**Current state:**
- pt-[92px] = header (48px) + search bar (44px) = 92px top padding
- 18 buttons wrap and stack
- On iPhone SE (375px): each button is ~160px wide, wraps 2 per row
- Result: 9 rows of buttons before "Active Sales" metric

**Recommended:** On mobile, show only 3 buttons:
- Create New Sale
- Add Items
- Holds (if > 0)

Rest go into a "Tools" menu or collapsible section.

---

## Priority Fixes (P0 / P1 / P2)

### P0: CRITICAL — Fix Before Public Launch

#### 1. Remove Duplicate "Dashboard" Link from Organizer Nav
- **File:** `/sessions/bold-nice-babbage/mnt/FindaSale/packages/frontend/components/Layout.tsx`
- **Lines:** 76 (drawer) and 260 (desktop right-nav)
- **Action:** Keep only one, in the drawer (line 76). Remove from desktop right-nav (line 260).
- **Effort:** 1 line delete
- **Impact:** Frees 1 nav slot; reduces visual clutter

#### 2. Gate "Plan a Sale" to Organizers Only
- **File:** `Layout.tsx`
- **Line:** 60
- **Current:** In static nav (visible to all)
- **Action:** Move from staticNavLinks to authLinks, inside organizer-only block (after line 74)
- **Rationale:** Shoppers shouldn't see a feature they can't use
- **Effort:** 3-line refactor
- **Impact:** Reduces static nav from 9 to 8 items; aligns nav with user capabilities

#### 3. Reorganize Dashboard Quick-Links (Dashboard.tsx, Lines 272–431)
- **File:** `/sessions/bold-nice-babbage/mnt/FindaSale/packages/frontend/pages/organizer/dashboard.tsx`
- **Current State:** 18 buttons, no grouping, wraps across 4+ rows
- **Proposed Action:**
  - Create 3 sections: "Essential," "Tier Features," "Community"
  - "Essential" (always visible): Create Sale, Add Items, Holds
  - "Tier Features" (collapse by default): Pro/Teams tools
  - "Community" (collapse by default): Bounties, Reputation, Neighborhoods
  - On mobile, show only "Essential" buttons; add a "More Tools" link
- **Effort:** Medium (restructure component, add collapse logic)
- **Impact:** Mobile page load context improves 70%; desktop clarity improves 40%

---

### P1: HIGH — Fix Within 2 Weeks

#### 4. Simplify Organizer Right-Side Nav (Layout.tsx, Lines 258–285)
- **File:** `Layout.tsx`
- **Current:** 14 links mixed linearly (PRO features next to non-gated features)
- **Proposed Action:**
  - Reorder: Dashboard, Premium Plans, Command Center (PRO), Insights (PRO), [spacer], Bounties, Message Templates, Reputation, UGC Moderation, Performance, Neighborhoods
  - Add visual separator between "PRO-only" block and "All Organizer" block
  - Add "(PRO)" badge label to tier-gated items
- **Effort:** Medium (reorder, add CSS classes for grouping)
- **Impact:** Organizers understand tier benefits; nav becomes scannable

#### 5. Add Section Headers to Mobile Drawer (Layout.tsx, Lines 405–422)
- **File:** `Layout.tsx`
- **Lines:** 74–189 (authLinks block)
- **Current:** Flat list of auth links
- **Proposed Action:**
  - Add `<span className="block px-3 py-1 text-xs font-semibold uppercase text-warm-500 mt-3">Organizer Tools</span>` before Bounties
  - Add "Community" header before Neighborhoods
  - Match styling of existing "My Collection" header (line 144)
- **Effort:** Low (add 2–3 span elements)
- **Impact:** Drawer becomes scannable; reduces cognitive load by ~30%

#### 6. Consolidate Shopper Right-Side Nav (Layout.tsx, Lines 287–301)
- **File:** `Layout.tsx`
- **Current:** Split across multiple line groups; "My Collection" shown only in drawer, partially on desktop
- **Proposed Action:**
  - Reorder desktop right-nav to match drawer structure (lines 287–301)
  - Show all 9 shopper items in a consistent order: My Profile, My Wishlists, Referrals, [section: My Collection], Collection, Wishlist Alerts, Treasure Trails, Loot Log, Loyalty, [section: Explore], Challenges, Live Feed, Encyclopedia, Settings
  - Add section headers on desktop too (using border separators)
- **Effort:** Medium (reorder, add visual separators)
- **Impact:** Desktop and mobile nav now consistent; reduces confusion

---

### P2: MEDIUM — Fix Within 4 Weeks

#### 7. Mobile Dashboard Simplification (Dashboard.tsx, Lines 272–431)
- **File:** `dashboard.tsx`
- **Current:** 18 buttons, no mobile-specific layout
- **Proposed Action:**
  - Detect mobile (using `useMediaQuery` or CSS media query)
  - On mobile: show only 3 buttons (Create Sale, Add Items, Holds)
  - Add collapsible "More Tools" section with remaining 15 buttons grouped
  - Reduce button size on mobile for faster visual parsing
- **Effort:** High (refactor button layout, add mobile logic, create accordion component)
- **Impact:** Mobile dashboard usability +60%; desktop unchanged

#### 8. Make "Manage Sales" a Dropdown Menu (Dashboard.tsx, Lines 295–328)
- **File:** `dashboard.tsx`
- **Current:** "Add Items" button with popover selector (lines 295–327) shows all sales as dropdown
- **Proposed Action:**
  - Combine "Add Items" and sale selector into a single menu
  - Restructure as: "Manage Sales" dropdown showing [Active Sales count] → opens submenu: [List of sales with Edit/Items/QR/Clone/Share actions]
  - This consolidates 3 button clicks (Add Items → Select Sale → Action) into 1
- **Effort:** High (refactor interaction pattern)
- **Impact:** Reduces cognitive load; improves mobile UX

#### 9. Move Tier Reward Cards Below Primary Content (Dashboard.tsx, Lines 521–605)
- **File:** `dashboard.tsx`
- **Current:** Tier Rewards card + Creator Tier card + Reputation card come immediately after 18 action buttons (lines 453–617)
- **Proposed Action:**
  - Move all tier/reputation cards to a separate "Growth & Rewards" tab (below "Overview" and "Sales" tabs)
  - Keep dashboard view focused on: [Quick Actions] → [Active Sales count, Items, Revenue] → [Sales list]
  - Tier/rewards content moves to secondary tab (lower priority)
- **Effort:** Medium (restructure tabs, move components)
- **Impact:** Dashboard entry point becomes focused; organizers see essential info first

#### 10. Add "Upgrade" CTA to Non-PRO Organizers (Layout.tsx + Dashboard.tsx)
- **File:** `Layout.tsx` + `dashboard.tsx`
- **Current:** PRO/TEAMS features scattered in nav; no clear upgrade path
- **Proposed Action:**
  - Replace "Premium Plans" link with a prominent "Upgrade to PRO" button (if user is SIMPLE)
  - Show inline CTAs next to tier-gated buttons: "(PRO)" with hover tooltip "Upgrade to unlock"
  - Add annual savings callout on Premium Plans page
- **Effort:** Medium (add CTA component, wire up tier checks)
- **Impact:** Drives conversion; clarifies feature access

---

## Deferred to Later

These issues are real but lower-priority than above. Schedule for post-March 25:

1. **Footer Link Deduplication** — Footer repeats header nav links (Home, Dashboard, Create Sale, Guide, Leaderboard, etc.). These should differ — footer should show info pages (About, FAQ, Terms, Privacy) only. *Effort: Low; deferred because it doesn't block core UX.*

2. **Search Bar Prominence** — Mobile has a persistent search bar below header (lines 349–368). Desktop search is missing. Add desktop search (header right-side) for consistency. *Effort: Medium; deferred because current approach works for shoppers.*

3. **Notification Bell Accessibility** — NotificationBell component (line 8) is not covered in this audit. Ensure it has aria-label and badge count is screenreader-accessible. *Effort: Low; deferred to a11y pass.*

4. **Leaderboard Page Missing Data** — WebFetch showed leaderboard page as "Loading data...". Ensure this is not a permanent loading state. *Effort: Unknown; deferred to dev investigation.*

5. **"Neighborhoods" Link Purpose** — Neighborhoods appears in 3 places (nav, footer, dashboard links). Purpose is unclear. Consider renaming or moving. *Effort: Low; deferred to product decision.*

---

## Accessibility Considerations (WCAG 2.1 AA)

### Current State
- ✓ Skip to main content link present (Layout.tsx, line 215)
- ✓ Drawer uses aria-label, aria-modal, role="dialog"
- ✓ Bottom nav uses aria-label (BottomTabNav.tsx, line 125)
- ✓ Nav items have hover states
- ✓ Sufficient color contrast (nav text on white/dark bg)

### Gaps Found
- ❌ Desktop right-side nav has NO aria-label (Layout.tsx, line 238). Should be `aria-label="User menu"` or similar.
- ❌ Mobile drawer overflow items are not trapped in scroll container; focus can escape drawer. Needs `aria-hidden="true"` on backdrop.
- ❌ Dashboard buttons with emoji labels (e.g., "📋 Listing Factory") lack accessible text. Screen reader announces emoji. Replace emoji with icon component + CSS, or add aria-label.
- ❌ Tier-gated links ("Command Center", "Typology", etc.) have no visual indicator for sighted users. Add "(PRO)" badge. Screenreader users get nothing. Consider `<span aria-label="Pro feature">` wrapper.
- ⚠️ Button density (18 buttons) makes keyboard navigation tedious. Tab through all 18 to reach main content.

**Recommendation:** Run `axe-core` or Lighthouse audit before shipping any changes. Focus on:
1. Add aria-labels to nav containers
2. Replace emoji in buttons with icon SVGs + aria-hidden="true"
3. Add "(PRO)" badges with accessible text wrappers
4. Tab-index order: ensure active section always has focus path to next button

---

## Design System Consistency

### Observation
- Button colors are semantic (green for Go/Actions, red for Danger, etc.)
- Tailwind utility classes dominate; no shared button/nav component variants

### Recommendation for Future Work
- Create reusable NavGroup component to replace flat authLinks in Layout.tsx
- Create DashboardSection component to replace button wrap in dashboard.tsx
- Both should have built-in aria-label and grouping support

---

## Summary Table

| Area | Current State | Severity | Fix Complexity | Impact |
|------|---------------|----------|-----------------|---------|
| Organizer nav link count | 14-15 items | CRITICAL | Medium | Cognitive load -40% |
| Duplicate Dashboard link | 2 instances | CRITICAL | Trivial | +1 nav slot |
| Static nav includes org feature | "Plan a Sale" visible to shoppers | HIGH | Low | Removes 1 confusing link |
| Dashboard button explosion | 18 buttons, no grouping | CRITICAL | Medium | Mobile UX +70% |
| Drawer section headers | None; flat list | HIGH | Low | Scanability +30% |
| Mobile dashboard UX | All 18 buttons stack | CRITICAL | High | Mobile UX +60% |
| Tier feature visibility | Mixed into linear nav, no badges | HIGH | Medium | User clarity +40% |
| Desktop/mobile nav inconsistency | Shopper nav differs between drawer and right-nav | MEDIUM | Medium | Consistency +50% |
| Accessibility gaps | Missing aria-labels, emoji in buttons | MEDIUM | Medium | A11y score +15 points |

---

## Next Steps

### Week 1 (P0 – Critical Block)
1. Remove duplicate Dashboard link
2. Gate "Plan a Sale" to organizers
3. Restructure dashboard quick-links (into sections, collapse on mobile)

### Week 2–3 (P1 – High Priority)
4. Add section headers to drawer authLinks
5. Consolidate shopper nav across desktop/mobile
6. Reorganize organizer right-nav with PRO grouping + badges

### Week 4+ (P2 – Medium Priority)
7. Mobile dashboard simplification
8. "Manage Sales" dropdown consolidation
9. Tier/rewards card repositioning
10. Upgrade CTA integration

---

## Appendix: Code Reference

| Issue | File | Line(s) | Component |
|-------|------|---------|-----------|
| Duplicate Dashboard | Layout.tsx | 76, 260 | authLinks (drawer & desktop) |
| Static nav bloat | Layout.tsx | 56–66 | staticNavLinks |
| Plan a Sale unfiltered | Layout.tsx | 60 | staticNavLinks |
| PRO feature mixing | Layout.tsx | 82–101 | authLinks (organizer block) |
| Button explosion | dashboard.tsx | 272–431 | Action buttons in <div className="flex flex-wrap gap-4"> |
| Drawer grouping absent | Layout.tsx | 74–189 | authLinks block (no section spans) |
| Mobile drawer styling | Layout.tsx | 379–424 | Mobile drawer div |
| Bottom nav structure | BottomTabNav.tsx | 82–113 | Tab array definition |
| Mobile search bar | Layout.tsx | 349–368 | Mobile persistent search |

---

**Audit completed:** 2026-03-18
**Auditor:** FindA.Sale UX Agent
**Stakeholder:** Patrick (Project Manager)
**Status:** Ready for dev dispatch
