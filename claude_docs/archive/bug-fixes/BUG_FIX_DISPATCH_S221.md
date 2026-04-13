# Bug Fix Dispatch to findasale-dev — Session 221

## Overview
Live browser audit of https://finda.sale identified 24 confirmed bugs across the frontend. This dispatch provides full context for subagent implementation.

## CRITICAL Pre-flight Gate (Schema-First)
Before touching ANY .ts/.tsx file:
1. Read packages/database/prisma/schema.prisma
2. Read relevant hook files in packages/frontend/hooks/
3. Read relevant controller files in packages/backend/
4. After ALL changes, run:
   ```bash
   cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
   ```
   **Zero TS errors required before returning output.**

---

## PRIORITY 1 — Broken Routes (404s)

### BUG #1: /explore → 404
- **Status**: Nav shows "Explore" link but route missing
- **Files to Check**:
  - packages/frontend/components/BottomTabNav.tsx (line ~84-113)
  - packages/frontend/components/TierGatedNav.tsx
- **Resolution**: Change nav href from /explore → /search (search.tsx exists)
- **Affected Pages**: Shopper bottom nav, organizer nav
- **Fix Type**: Update 1-2 href values in nav components

### BUG #17: /organizer/profile → 404
- **Status**: URL /organizer/profile should exist but doesn't
- **Files to Check**:
  - packages/frontend/pages/organizer/profile.tsx (does it exist?)
  - packages/frontend/pages/organizer/settings.tsx (reference for Profile tab pattern)
- **Resolution**: Either create organizer/profile.tsx or add redirect route
- **Minimum Fix**: Create packages/frontend/pages/organizer/profile.tsx that mirrors settings Profile tab

### BUG #22: Heart icon nav link uses /wishlist (should be /wishlists)
- **Status**: Nav heart icon href incorrect
- **Files to Check**:
  - packages/frontend/components/BottomTabNav.tsx (line ~96)
- **Current**: href="/wishlist"
- **Correct**: href="/wishlists" (page exists at packages/frontend/pages/wishlists.tsx)
- **Fix Type**: Single href update

---

## PRIORITY 2 — Data/Display Bugs

### BUG #13: Organizer dashboard welcome shows "Welcome," (no name)
- **File**: packages/frontend/pages/organizer/dashboard.tsx
- **Issue**: Greeting renders as "Welcome," with trailing comma, organizer name missing
- **Available Data**: useAuth hook provides organizer/user name
- **Fix Pattern**: `Welcome, {user?.businessName || user?.name}!`

### BUG #14: "How It Works" onboarding section shows despite onboardingComplete: true
- **File**: packages/frontend/pages/organizer/dashboard.tsx
- **Issue**: Onboarding section visible when it should be hidden
- **Available Data**: useAuth hook has user.onboardingComplete flag
- **Fix Pattern**: `{!user?.onboardingComplete && <OnboardingSection />}`

### BUG #15 / #20: Organizer's sales not loading (multiple pages)
- **Affected Pages**:
  - /organizer/sales (shows "No sales yet")
  - /organizer/command-center (shows 0 Active Sales)
  - Fraud Signals dropdown (empty)
  - POS dropdown (empty)
- **Working Reference**: /organizer/insights correctly loads 3 sales
- **Investigation**: Compare API calls and organizer ID resolution between working (/organizer/insights) and broken pages
- **Files to Check**:
  - packages/frontend/pages/organizer/sales.tsx
  - packages/frontend/pages/organizer/command-center.tsx
  - packages/frontend/pages/organizer/insights.tsx (working reference)
  - packages/frontend/pages/organizer/fraud-signals.tsx
  - packages/frontend/pages/organizer/pos.tsx
  - packages/frontend/hooks/ for useSales, useOrganizationSales, useOrganizerSales variations
- **Likely Cause**: Different endpoint, missing organizer ID, or conditional that filters out results
- **Fix Strategy**: Unify API call across all pages

### BUG #18: Settings > Profile tab: Business Name field not pre-populated
- **File**: packages/frontend/pages/organizer/settings.tsx (Profile tab)
- **Issue**: Business Name input shows empty despite data existing elsewhere
- **Reference**: /organizer/brand-kit correctly displays "Riverside Liquidators 2"
- **Investigation**: Which hook loads organizer data in brand-kit? Reuse in settings.
- **Fix Type**: Pre-populate input with organizer.businessName or similar field

### BUG #19: "Unlock Hunt Pass" banner showing to ORGANIZER users
- **Issue**: Hunt Pass feature is shopper-only, but banner appears to organizers
- **Hunt Pass Banner Location**: Likely in layout or global component wrapper
- **Fix Pattern**: `{user?.role === 'SHOPPER' && <HuntPassBanner />}`

### BUG #21: Hunt Pass card on /profile says "No points earned yet" despite user having 50 pts
- **File**: packages/frontend/pages/profile.tsx
- **Data Mismatch**:
  - Header badge correctly shows "50 pts" (from usePoints)
  - Hunt Pass section shows "No points earned yet"
- **Fix**: Use same usePoints hook data in Hunt Pass section's message logic

### BUG #23: "Saved Items" stat card on /shopper/dashboard missing count
- **File**: packages/frontend/pages/shopper/dashboard.tsx
- **Issue**: Stat cards show: Total Purchases (1), Active Watchlist (0), Saved Items (blank)
- **Fix**: Add data fetch for saved items count (useSavedItems hook or API call)

---

## PRIORITY 3 — UI/Rendering Bugs

### BUG #5: Leaderboard sorts incorrectly (0-point users ranked #1)
- **File**: packages/frontend/pages/leaderboard.tsx
- **Issue**: Sort order is ascending (wrong), should be descending
- **Current**: 0 points at #1 Gold, 750 points at #9
- **Fix**: Sort by points descending (highest → lowest)

### BUG #6: Back button renders raw unicode: `\u2190 Back to browse sales`
- **File**: packages/frontend/pages/sales/[id].tsx
- **Issue**: Literal string `\u2190` displays instead of ← character
- **Fix**: Replace `\u2190` with '←' or character entity

### BUG #7: "Organized by" section shows bare `0` after phone number
- **File**: packages/frontend/pages/sales/[id].tsx
- **Issue**: Undefined/null field rendering directly as "0"
- **Fix**: Add null/undefined checks in organizer info render block

### BUG #9 + #11: Duplicate "Live Activity" widgets AND duplicate "Reviews" sections
- **File**: packages/frontend/pages/sales/[id].tsx
- **Issue**: Two Live Activity widgets + two Reviews sections on same page
- **Fix**: Remove duplicate component instances, keep one of each

### BUG #10: "Reconnecting..." WebSocket status message visible to users
- **File**: Live Activity component (location in components/ TBD)
- **Issue**: Internal connection status exposed in UI
- **Fix**: Hide status entirely OR replace with user-friendly "Connecting..." shown briefly only

### BUG #24: /feed page completely blank
- **File**: packages/frontend/pages/feed.tsx
- **Issue**: Page renders "Your Feed" + "Browse all" headers but zero content AND no empty state
- **Fix Type**:
  1. Verify data fetch is triggered
  2. Add fallback empty state: "No activity yet — follow some sales to see updates here"

### BUG #2: /inspiration shows duplicate empty state messages
- **File**: packages/frontend/pages/inspiration.tsx
- **Issue**: Two identical empty state UI blocks when no content
- **Fix**: Remove one duplicate block

### BUG #3: Sale card images blank on /trending page
- **File**: packages/frontend/pages/trending.tsx
- **Issue**: Images render correctly on other pages but not on trending
- **Investigation**: Check sale card component src logic, image URL construction
- **Fix**: Verify image src matches format used on other pages (compare with search, home, etc.)

### BUG #4: Category pills on /search don't trigger search
- **File**: packages/frontend/pages/search.tsx
- **Issue**: Clicking pills only focuses input, doesn't pre-fill or trigger search
- **Fix**: onClick handler should:
  1. Set input value to pill text
  2. Call search function immediately

---

## Additional Navigation Issue (Not Counted in 24)

**Organizer nav missing Explore/Map/Inspiration links**
- Shopper nav includes these browsing features
- Organizers should also be able to browse sales
- Location: BottomTabNav.tsx, TierGatedNav.tsx, or nav conditionals
- Add these links for users with role === 'ORGANIZER'

---

## Files Most Likely to Change
(In descending order of scope)

1. packages/frontend/pages/organizer/dashboard.tsx (bugs #13, #14)
2. packages/frontend/pages/sales/[id].tsx (bugs #6, #7, #9, #11, #10)
3. packages/frontend/pages/organizer/sales.tsx (bug #15)
4. packages/frontend/pages/organizer/command-center.tsx (bug #15)
5. packages/frontend/pages/search.tsx (bug #4)
6. packages/frontend/pages/feed.tsx (bug #24)
7. packages/frontend/pages/inspiration.tsx (bug #2)
8. packages/frontend/pages/leaderboard.tsx (bug #5)
9. packages/frontend/pages/trending.tsx (bug #3)
10. packages/frontend/pages/profile.tsx (bug #21)
11. packages/frontend/pages/shopper/dashboard.tsx (bug #23)
12. packages/frontend/pages/organizer/settings.tsx (bug #18)
13. packages/frontend/components/BottomTabNav.tsx (bugs #1, #22)
14. packages/frontend/pages/organizer/profile.tsx (bug #17, may need creation)

---

## Return Format

When returning from subagent, provide:
1. List of every file changed with 1-line description of fix
2. Full file paths (absolute, not relative)
3. Do NOT push to GitHub — return changes for main session coordination

Example format:
```
## Files Changed

- /sessions/bold-practical-ritchie/mnt/FindaSale/packages/frontend/components/BottomTabNav.tsx
  Fixed: /wishlists href, /search for explore link

- /sessions/bold-practical-ritchie/mnt/FindaSale/packages/frontend/pages/organizer/dashboard.tsx
  Fixed: Welcome greeting shows name, onboarding hides when complete

... etc
```

Then: "TypeScript check passed (zero errors)."
