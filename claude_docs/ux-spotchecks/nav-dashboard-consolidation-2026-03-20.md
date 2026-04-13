# Nav & Dashboard Consolidation Spec — 2026-03-20

**Status:** Production-ready implementation guide
**Scope:** Navigation reorganization (Layout.tsx) + Dashboard consolidation (dashboard.tsx)
**Priority:** P0 (Critical UX blocker — blocks public launch perception)
**Complexity:** Medium (reorganization, no new features)

---

## Research Findings

### Prior Session Work

Session 208-209 audit (`ux-audit-nav-overload-2026-03-18.md`) and design critique (`design-critique-2026-03-18.md`) identified two critical UX problems:

1. **Nav Density:** SIMPLE Org = 17 items, PRO Org = 23 items, TEAMS Org = 24 items (vs. industry best practice of 5–7)
2. **Dashboard Density:** 18 action buttons in a flat grid before organizer sees any sales data (mobile: 10+ rows of buttons)

### Status as of 2026-03-20

**Layout.tsx (Navigation):**
- Organizer drawer already has section headers ("Primary", "Pro Tools", "Organizer Tools") — P1 recommendation from audit partially implemented
- Mobile drawer nav structure is improved vs. audit's baseline
- Desktop nav still shows multiple organizer links inline (lines 273–287), not in dropdown; not ideal but acceptable

**dashboard.tsx (Dashboard Actions):**
- Actions already reorganized into **collapsible sections:**
  - "Quick Actions" (always visible: Create Sale, Add Items, Holds, Manage Sales)
  - "Essential Tools" (always visible: Print Inventory, POS, Message Templates)
  - "Pro & Teams Tools" (collapsible, open by default for PRO/TEAMS users)
  - "Community & Growth" (collapsible, closed by default)
- Section headers with expand/collapse affordance (▶/▼ arrows)
- Upgrade CTA for SIMPLE organizers (bottom of sections)
- Tab navigation below (Overview / Sales)

**Assessment:** Dashboard is largely solved. Nav has partial implementation. Spec below consolidates both and ensures consistency.

---

## Problem 1: Navigation Reorganization

### Current State Analysis

**Desktop Header (Layout.tsx lines 238–324):**
- 8 static nav links always visible (Home, Calendar, Map, Cities, Trending, About, Leaderboard, Contact)
- For organizers: 3–5 additional links inline in header (Dashboard, Plan a Sale, Insights, Upgrade)
- For shoppers: 6 additional links + section dividers
- Total header width: ~1400px on 1440px monitor (97% utilization) — **causes Patrick's "too busy" complaint**

**Mobile Drawer (Layout.tsx lines 383–495):**
- Static links first (8 items)
- Auth section with grouping already present
- **Issue:** Desktop nav and mobile drawer have different information architecture
  - Desktop shows organizer links inline with visual separators
  - Drawer shows organizer links with span headers ("Primary", "Pro Tools", etc.)

**Shopper Navigation:**
- Drawer: 9 items (My Profile, Wishlists, Referrals, [My Collection header], Collection, Alerts, Trails, Loot Log, Loyalty, Receipts, [Challenges + Feed], Live Feed, Encyclopedia, Settings)
- Desktop: Same 9 items split across line 290–301 with visual separation (border-l dividers)
- **Inconsistency:** Desktop nav shows fewer groupings than drawer

---

### Proposed Solution

**Principle:** Single information architecture for all users and devices. Desktop shows a cleaner header; mobile drawer mirrors this structure.

#### Primary Navigation (all roles, all devices)

**Desktop Header (fixed, visible always):**
- Logo (left)
- Browse / Map (for shoppers only, in nav)
- 5 primary static nav items: Home, Trending, About, Leaderboard, Contact
- Right-side icons: Saved (heart), Messages, Notification Bell
- User avatar dropdown (click to reveal menu)
- Theme toggle

**Rationale:**
- Reduces static nav from 8 to 5 items (removed Calendar, Cities, Plan a Sale — move to drawer)
- Calendar moved to drawer (secondary discovery)
- Cities moved to drawer or footer
- Plan a Sale → gated to organizers, moved to dropdown or drawer

**Mobile Drawer (same structure, responsive stacking):**
- Static links: Home, Trending, About, Leaderboard, Contact (same as desktop)
- Auth section with collapsible grouping by role

#### User Avatar Dropdown (All authenticated users)

**Location:** Top-right of header (where "Hi, [name]" text currently is at line 272–315)
**Trigger:** Click user avatar or "Hi, [name]" text
**Contents:**

```
┌─────────────────────────────┐
│  Hi, Patrick                │ (read-only)
├─────────────────────────────┤
│ My Profile                  │ (role-specific)
│ [optional: My Wishlists]    │
│ Settings                    │
├─────────────────────────────┤
│ Saved Sales (link)          │ (shoppers: redundant but good for mobile)
├─────────────────────────────┤
│ Subscription / Upgrade      │ (org-only)
│ Notifications               │ (if not in header)
├─────────────────────────────┤
│ Logout                      │
└─────────────────────────────┘
```

**Why:** Desktop nav is overcrowded. Avatar dropdown is a standard pattern (Slack, Figma, etc.). Keeps header clean.

---

### Proposed Drawer Structure — SIMPLE Organizer

**Primary Section** (always visible):
- Dashboard
- Plan a Sale
- Upgrade to PRO (CTA link, amber color)

**Pro Tools** (locked; show but disabled):
- Command Center 🔒
- Typology Classifier 🔒
- Fraud Signals 🔒
- Offline Mode 🔒
- Appraisals 🔒
- Item Library 🔒
- Brand Kit 🔒
- Flip Report 🔒
- Export Data 🔒

**Organizer Tools** (always visible):
- Bounties
- Message Templates
- Reputation
- UGC Moderation
- Performance
- Neighborhoods

**Rationale:** SIMPLE users see locked PRO items to understand what they're missing. The "Upgrade to PRO" link is prominent. UGC Moderation may be tier-specific; confirm with Patrick.

---

### Proposed Drawer Structure — PRO Organizer

**Primary Section** (always visible):
- Dashboard
- Plan a Sale
- Insights 📊 (PRO-only feature)
- Subscription / Upgrade to TEAMS

**Pro Tools** (always visible):
- Command Center
- Typology Classifier
- Fraud Signals
- Offline Mode
- Appraisals
- Item Library
- Brand Kit
- Flip Report
- Export Data

**Organizer Tools** (always visible):
- Bounties
- Message Templates
- Reputation
- UGC Moderation
- Performance
- Neighborhoods

---

### Proposed Drawer Structure — TEAMS Organizer

**Primary Section** (always visible):
- Dashboard
- Plan a Sale
- Insights
- Workspace (TEAMS-only feature)
- Subscription

**Pro Tools** (same as PRO):
- Command Center
- Typology Classifier
- Fraud Signals
- Offline Mode
- Appraisals
- Item Library
- Brand Kit
- Flip Report
- Export Data

**Advanced** (for TEAMS):
- Webhooks

**Organizer Tools** (same as above):
- Bounties
- Message Templates
- Reputation
- UGC Moderation
- Performance
- Neighborhoods

---

### Proposed Drawer Structure — Shopper

**Primary Section** (always visible):
- My Profile
- My Wishlists
- Referrals

**My Collection** (subsection header, always visible):
- Collection
- Wishlist Alerts
- Treasure Trails
- Loot Log
- Loyalty
- Receipts

**Browse & Explore** (subsection header):
- Challenges
- Live Sale Feed
- Encyclopedia

**Settings** (footer):
- Settings

**Rationale:** Mirrors current drawer structure (lines 139–184), which is clean. Removes "Saved Sales" (redundant with bottom tab nav).

---

### Implementation Details — Layout.tsx

**Desktop Header (lines 238–324):**

1. **Simplify static nav** (lines 247–250):
   - Remove Calendar and Cities from map
   - Keep: Home, Trending, About, Leaderboard, Contact (5 items)
   - Move Calendar/Cities to drawer and footer

2. **Replace inline organizer/shopper nav with Avatar Dropdown** (lines 260–315):
   - Delete all inline links (Dashboard, Plan a Sale, Insights, Bounties, Reputation, etc.)
   - Keep Saved (heart) icon and Messages icon
   - Add Avatar component with dropdown menu
   - Avatar dropdown contains:
     - For ORGANIZER: Dashboard, Plan a Sale, Insights (if PRO), Workspace (if TEAMS), Subscription, Settings
     - For USER: My Profile, Saved Sales (for mobile access), Settings
     - All: Logout

3. **Position:** Avatar dropdown replaces the 20+ inline links currently at 271–315, freeing ~800px of header width

**Mobile Drawer (lines 383–495):**

1. **Keep structure as-is** — it already has good grouping
2. **Add PRO/TEAMS feature locking:**
   - For SIMPLE org: Show locked items (🔒 symbol, disabled state)
   - Wire `canAccess('PRO')` checks to grey out and disable links

3. **Update organizer drawer section to use** consistent SectionHeader component (already imported on line 7)

---

## Problem 2: Dashboard Consolidation

### Current State Analysis

**Status:** Already reorganized into collapsible sections (lines 273–523).

**Quick Actions** (always visible):
- Create New Sale (primary CTA)
- Add Items (with sale selector)
- Holds (with badge)
- Manage Sales

**Essential Tools** (always visible):
- Print Inventory
- POS
- Message Templates

**Pro & Teams Tools** (collapsible, open by default for PRO/TEAMS):
- Insights
- Command Center
- Typology Classifier
- Fraud Signals
- Offline Mode
- Appraisals
- Brand Kit
- Item Library
- Flip Report
- Export Data
- Webhooks (TEAMS)

**Community & Growth** (collapsible, closed by default):
- Bounties
- Reputation
- Neighborhoods
- Performance

**Upgrade CTA** (for SIMPLE organizers):
- Unlock Pro Features callout with link to /organizer/premium

---

### Assessment: This is Good

The dashboard is already well-organized. The sections are logical, collapsible, and respect tier gating.

**Issues to address:**

1. **Section order:** "Community & Growth" should come before "Pro & Teams Tools" conceptually (growth comes after you have the core tools). But current order is fine since Pro section is the main upsell.

2. **Mobile optimization:** On mobile, consider:
   - Single-column button layout (buttons are ~full width)
   - Sections still collapsible
   - Above the fold: only "Quick Actions" + metrics (Active Sales, Total Items, Total Revenue)
   - "Essential Tools" visible but below fold
   - Pro/Community sections collapsed by default on mobile

3. **Sales List Position:** Currently comes after all action sections (lines 525–end). This is good — organizer should see all quick actions before diving into sales list. **Keep this order.**

4. **Copy improvements:**
   - "Pro & Teams Tools" → "Pro Features" (shorter)
   - "Community & Growth" → "Community & Reputation" (clearer)
   - "Essential Tools" → solid as-is

---

### Proposed Changes (Minor Refinements)

No major restructuring needed. Implement:

1. **Copy updates:**
   - Line 379: Change "Pro & Teams Tools" → "Pro Features"
   - Line 473: Change "Community & Growth" → "Community"

2. **Mobile section collapsing (optional enhancement):**
   - Detect mobile via `useMediaQuery` or CSS
   - On mobile (sm: breakpoint):
     - Keep "Quick Actions" + metrics always visible
     - Collapse "Essential Tools" by default
     - Collapse "Pro Features" by default (only for PRO/TEAMS users)
     - Collapse "Community" by default
   - On desktop (md+): Keep current behavior (all sections visible)

3. **Accessibility:**
   - Ensure `<details>` elements have proper ARIA labels
   - Verify `group-open:` pseudo-class works with all screen readers
   - Add aria-expanded to summary elements

---

## Implementation Plan

### Phase 1: Navigation (Medium effort, high impact)

**File:** `packages/frontend/components/Layout.tsx`

**Changes:**

1. Create new **AvatarDropdown** component (or use existing if available):
   - File: `packages/frontend/components/AvatarDropdown.tsx` (new)
   - Shows user name + role-specific menu
   - Includes Logout button
   - Responsive: visible on desktop, hidden on mobile (use mobile drawer instead)

2. **Simplify desktop header** (lines 238–324):
   - Line 247–250: Keep only 5 static links (Home, Trending, About, Leaderboard, Contact)
   - Lines 260–315: Replace all inline organizer/shopper links with AvatarDropdown component
   - Lines 261–265 (Saved/Messages): Keep; position after AvatarDropdown

3. **Update organizer drawer section** (lines 424–489):
   - Ensure all PRO/TEAMS links have `canAccess('PRO')` / `canAccess('TEAMS')` checks
   - Add visual locking for SIMPLE organizers (show links but with 🔒 and opacity-50, disabled state)
   - Structure is already good; just wire up tier gating

**Testing Checklist:**
- [ ] Desktop nav width now ~800px (55% utilization vs. 97% before)
- [ ] Organizer can see Dashboard, Insights, Workspace from avatar dropdown
- [ ] Shopper can see My Profile, Settings from avatar dropdown
- [ ] Mobile drawer mirrors drawer structure
- [ ] Locked PRO items are visible but disabled for SIMPLE organizers
- [ ] Subscription/Upgrade link always visible and actionable

**Effort:** 4–6 hours (depends on whether AvatarDropdown component exists)

---

### Phase 2: Dashboard (Low effort, polish only)

**File:** `packages/frontend/pages/organizer/dashboard.tsx`

**Changes:**

1. **Copy updates** (2 lines):
   - Line 379: "Pro & Teams Tools" → "Pro Features"
   - Line 473: "Community & Growth" → "Community"

2. **Mobile collapsing** (optional, 2–3 hours):
   - Import `useMediaQuery` hook (or create if missing)
   - Wrap `<details>` elements in condition:
     ```tsx
     const isMobile = useMediaQuery('(max-width: 768px)');
     ```
   - Change `open={canAccess('PRO') || canAccess('TEAMS')}` to:
     ```tsx
     open={(!isMobile) && (canAccess('PRO') || canAccess('TEAMS'))}
     ```
   - Keep "Quick Actions" and "Essential Tools" always visible on mobile

**Testing Checklist:**
- [ ] Copy is clearer and shorter
- [ ] Mobile: only "Quick Actions" visible above fold
- [ ] Desktop: all sections visible as before
- [ ] Sections collapse/expand smoothly
- [ ] No layout shift on collapse

**Effort:** 1–2 hours (copy) + 2–3 hours (mobile optimization)

---

## What Changes in Layout.tsx

### Current Structure (lines 238–324)

```
Header (fixed)
├── Logo (left)
├── Desktop nav (8 links: Home, Calendar, Map, Cities, Trending, About, Leaderboard, Contact)
├── Right-side nav:
│   ├── Saved icon
│   ├── Messages icon
│   ├── [Role-specific links: Dashboard, Plan a Sale, Insights, Upgrade, Bounties, Reputation, Performance]
│   ├── NotificationBell
│   ├── Low Bandwidth badge
│   ├── Logout button
│   └── Theme toggle
```

### Proposed Structure (clean)

```
Header (fixed)
├── Logo (left)
├── Desktop nav (5 links: Home, Trending, About, Leaderboard, Contact)
├── Right-side nav:
│   ├── Saved icon
│   ├── Messages icon
│   ├── Avatar + Dropdown Menu
│   │   ├── Hi, [Name] (display only)
│   │   ├── [Role-specific items: Dashboard, Insights, Plan a Sale, etc.]
│   │   ├── Settings
│   │   └── Logout
│   ├── NotificationBell
│   ├── Theme toggle
```

**Result:** Header width reduced from 1400px to ~800px (43% reduction), solving the "too busy" complaint.

---

## What Changes in dashboard.tsx

### Before

Lines 273–523: Action buttons organized into 4 sections with consistent structure.

### After

Lines 273–523: Same structure, with minor copy improvements and optional mobile optimization:

```
Quick Actions (always visible)
├── Create New Sale
├── Add Items
├── Holds
└── Manage Sales

Essential Tools (visible on desktop, collapsed on mobile)
├── Print Inventory
├── POS
├── Message Templates

Pro Features (collapsed on desktop if SIMPLE, collapsed on mobile)
├── [10 tier-gated buttons]

Community (collapsed by default)
├── Bounties
├── Reputation
├── Neighborhoods
├── Performance
```

---

## Implementation Notes

### Dark Mode
- All changes already support dark mode (dark: prefixes present in existing code)
- Avatar dropdown inherits dark mode styling from existing pattern

### Mobile Breakpoints
- Header: `hidden md:flex` (line 238)
- Desktop nav: `hidden md:flex` (lines 238–250)
- Mobile drawer: `md:hidden` (line 383)
- Bottom nav: `md:hidden` (BottomTabNav.tsx)
- Consistent Tailwind breakpoint: md (768px)

### Accessibility
- Dropdown: Add `aria-expanded`, `aria-haspopup="true"` to trigger
- Drawer: Already has `role="dialog"`, `aria-modal="true"`, `aria-label="Navigation menu"`
- Details/Summary: Ensure `aria-expanded` syncs with visual state
- Focus management: Avatar dropdown should trap focus (use Headless UI Dialog or similar)

### Component Reuse
- Use existing `SectionHeader` component (line 7 import) for drawer grouping
- Consider extracting AvatarDropdown as a reusable component for consistency with admin panel

---

## Open Questions for Patrick

1. **Calendar & Cities navigation:** Currently in static nav. Should these move to footer, drawer only, or secondary nav bar? (Audit recommends drawer/footer.)

2. **"Plan a Sale" visibility:** Currently visible to all users in static nav. Should organizer-only link appear in:
   - Avatar dropdown only?
   - Drawer + Avatar dropdown?
   - Both?
   - Current: static nav (visible to shoppers, confusing) — recommendation: move to drawer/dropdown.

3. **Pro feature locking for SIMPLE organizers:** Should locked items show 🔒 icon with disabled state, or be hidden completely?
   - Current dashboard shows locked items with inline (PRO) badge
   - Recommendation: Show locked items in drawer with 🔒 icon to educate user about features they can unlock

4. **Neighborhoods purpose:** Audit flagged this as unclear. Confirm whether it should stay in "Community" section or move elsewhere.

5. **Mobile section collapsing:** Is the "all collapsed on mobile except Quick Actions" UX preferable, or should all sections stay expanded?

---

## Estimated Timeline

- **Phase 1 (Nav):** 6–8 hours (dev) + 2 hours (QA)
- **Phase 2 (Dashboard):** 2–3 hours (dev) + 1 hour (QA)
- **Total:** 11–14 hours active dev time
- **Can ship:** Both phases together as single PR (related changes)

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Desktop header width | <900px (62% utilization) | Browser dev tools, responsiveness test |
| Nav density (organizer drawer) | 15 items max (was 23) | Item count in drawer |
| Dashboard above-fold buttons | 4 visible (Quick Actions) | Mobile viewport at 375px width |
| Cognitive load reduction | Qualitative | User testing feedback, Patrick review |
| Mobile scroll depth to sales list | First fold (0–100px) | Measure against current (10+ rows) |

---

## Files to Modify

- `/sessions/lucid-eloquent-faraday/mnt/FindaSale/packages/frontend/components/Layout.tsx` (primary)
- `/sessions/lucid-eloquent-faraday/mnt/FindaSale/packages/frontend/pages/organizer/dashboard.tsx` (minor copy + mobile optimization)
- `/sessions/lucid-eloquent-faraday/mnt/FindaSale/packages/frontend/components/AvatarDropdown.tsx` (new, if not exists)

---

## Appendix: Audit References

- **ux-audit-nav-overload-2026-03-18.md** — Baseline nav density analysis, proposed reorganization
- **design-critique-2026-03-18.md** — Visual hierarchy and desktop header overload findings

**Key Finding from Audit:**
> "Patrick's core complaint—'the site is way too busy'—is valid and data-backed. While public pages are well-structured, the authenticated experience (especially organizer dashboard) violates fundamental nav density principles with competing navigation layers and 20+ action buttons above the fold."

**This spec addresses both problems with minimal disruption to existing functionality.**
