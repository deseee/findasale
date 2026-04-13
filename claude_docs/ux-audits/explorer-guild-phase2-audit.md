# UX Audit: Explorer's Guild Phase 2
## RankBadge, RankProgressBar, Leaderboard, XP Sinks Clarity

**Audit Date:** 2026-03-24  
**Auditor:** findasale-ux  
**Components Reviewed:**
- RankBadge.tsx
- RankProgressBar.tsx
- useXpProfile.ts hook
- /shopper/loyalty.tsx
- /shopper/leaderboard.tsx

---

## OVERALL ASSESSMENT

**Phase 2 Readiness:** ✅ **READY FOR BETA** with **3 P2 findings** (polish issues that should be addressed before wide rollout) and **1 P3 finding** (nice-to-have).

**Key Strengths:**
- RankBadge component is well-designed with clear emoji associations, good dark mode support, and accessible sizing options
- RankProgressBar properly displays current XP, required XP, percentage, and next rank
- Leaderboard shows rank position, display name, XP, and rank badge clearly
- Loyalty page prominently features the Explorer Rank system with gradient card design
- Loading states and error states present

**Key Gaps:**
- XP sink visibility: Rarity boost and coupon generation endpoints exist but have NO UI exposed to shoppers/organizers
- Empty state (0 XP) on loyalty page needs optimization for new shoppers
- Leaderboard duplicate column header redundancy
- No onboarding tooltip or explainer for what "Guild XP" means

---

## DETAILED FINDINGS

### FINDING 1: RankBadge Visibility — GOOD ✅

**Location:** `/shopper/loyalty.tsx` lines 96–126

**What's Working:**
- RankBadge is displayed prominently in the "Guild XP & Rank Card" section
- Positioned in left column alongside large XP number (line 107: "3xl font-bold"), creates natural visual hierarchy
- Component sizes properly: `size="lg"` on loyalty page (line 104) makes it eye-catching (~4xl emoji)
- Dark mode styling applied correctly (darkBg, darkText, darkBorder classes)
- Emojis are distinct and memorable: 🌱 (Initiate), 🔍 (Scout), 🎯 (Ranger), ✨ (Sage), 👑 (Grandmaster)

**Dark Mode Verified:**
- RankBadge has full dark mode support: `dark:bg-blue-900`, `dark:text-blue-300`, `dark:border-blue-700` (and equivalent for all 5 ranks)
- Card wrapper also has dark mode: `dark:from-gray-800`, `dark:to-gray-700`, `dark:border-indigo-700`

**Issue: None** — RankBadge visibility is optimal for loyalty page.

---

### FINDING 2: RankProgressBar Clarity — GOOD with P2 Issue 📊

**Location:** `/shopper/loyalty.tsx` lines 114–123

**What's Working:**
- Progress bar shows "Progress to SCOUT" label (line 35 in RankProgressBar.tsx) — next rank is visible
- Displays `currentXp / nextRankXp` e.g., "150 / 500 XP" (line 39)
- Percentage display in bottom-right ("42%", line 59)
- Gradient fill color matches current rank (indigo for INITIATE, etc.)
- Animated transition on progress change (`transition-all duration-500`, line 47)
- Proper ARIA attributes for accessibility (role="progressbar", aria-valuenow, aria-valuemin, aria-valuemax)

**Issue — P2: Missing "MAX RANK" State Clarity**
- When user reaches GRANDMASTER, the bar shows "MAX RANK" label (line 35 condition)
- BUT: Progress bar is still filled to 100%, no visual distinction from "almost there"
- Problem: New max-rank player cannot immediately see if they're at max or one level below
- **Recommended fix:** Add visual indicator when `isMaxRank === true`: greyed-out appearance, lock icon, or "You've reached the pinnacle!" message

**Dark Mode:** ✅ Working correctly (dark:bg-gray-700 for background, etc.)

**Severity:** P2 (Polish) — doesn't block functionality but impacts clarity for power users.

---

### FINDING 3: Leaderboard Usability — GOOD with P2 Issue 🏆

**Location:** `/shopper/leaderboard.tsx`

**What's Working:**
- Rank position shown with medal emojis (🥇 🥈 🥉) for top 3, numeric for rest
- Display name shown (line 154: `entry.userName`)
- Guild XP prominently displayed in right column (line 162: `entry.guildXp.toLocaleString()`)
- RankBadge displayed for each player (line 158: `size="sm"` is appropriately compact for table)
- Table header clear and left-aligned for Explorer and Rank columns
- Loading skeleton state present (LeaderboardSkeleton, lines 33–49)
- Empty state handled (lines 171–173)
- "How to earn Guild XP" info card at bottom (lines 177–198)

**Issue — P2: Redundant "Rank" Column Header**
- Table has TWO headers referencing rank:
  - Line 125: "Rank" (for position: 1st, 2nd, 3rd, etc.)
  - Line 127: "Rank" (for Explorer rank: INITIATE, SCOUT, etc.)
- Creates confusion: user doesn't know which column each "Rank" refers to
- **Recommended fix:** Rename second header from "Rank" to "Explorer Rank" or "Rank Badge" (line 127)

**Issue — P2: Current User Not Highlighted**
- Leaderboard shows top 50 users
- If logged-in user is NOT in top 50, they don't see themselves
- Page doesn't indicate "You are ranked #142" or similar
- **Recommended fix:** Add footer section: "Your Position: #142 • Guild XP: 2,450" when user is outside top 50

**Issue — P3: Last Updated Timestamp Position**
- "Last updated: 2026-03-24 14:30:00" appears in small text below subtitle (line 111)
- Is not immediately noticeable — users may trust stale data without realizing when it was fetched
- **Recommended fix:** Move to footer near info card, or add refresh button

**Dark Mode:** ✅ Working (dark:bg-gray-800, dark:border-gray-700, etc.)

**Severity:** P2 (Usability) — users may be confused by double "Rank" header and missing self-position.

---

### FINDING 4: XP Sink Visibility — CRITICAL P0/P1 🔴

**Location:** Backend endpoints exist at `/api/xp/sink/rarity-boost` and `/api/xp/sink/coupon` BUT no UI exposes them

**What Should Exist:**
1. **Rarity Boost Sink** (15 XP spend)
   - Endpoint: `POST /xp/sink/rarity-boost` (xpController.ts)
   - Effect: Boosts legendary find odds for a specific sale for 24 hours
   - Use case: Shopper sees a sale they love, spends 15 XP to increase rarity boost
   - **Current UI:** NONE — no button, no page, no modal to spend XP on rarity boost

2. **Coupon Generation Sink** (20 XP spend, organizer-only)
   - Endpoint: `POST /xp/sink/coupon` (xpController.ts)
   - Effect: Organizer generates a discount coupon
   - Use case: Organizer uses Explorer rank XP to create promotional coupons
   - **Current UI:** NONE — no button, no organizer page, no modal

**What Currently Shows:**
- Purchases page (line 65–85) shows "My Coupons" section IF user has coupons
- BUT: No way to CREATE a coupon from this page (organizer can't generate via XP)
- Loyalty page has no "Spend XP" or "Use XP Benefits" section

**Problem Statement:**
- Users cannot discover or use XP sinks
- No value prop for spending XP (they can only earn it, never use it)
- "Spend XP" is a core gamification mechanic — without it, XP is a dead-end metric
- Organizers cannot generate coupons via XP (if they know the endpoint, they must use Postman)

**Recommended Fix — P1:**
1. Add **"XP Sink Options"** section to `/shopper/loyalty.tsx` showing:
   - "Legendary Boost (15 XP)" card: "Boost your odds of legendary finds for 24 hours on any sale"
   - "On Sale" text indicating they can activate this on any sale detail page
   
2. On sale detail pages (e.g., `/sales/[id].tsx`):
   - Add button: "Boost with 15 XP" (if user has ≥15 XP and sale is active)
   - On click: POST `/xp/sink/rarity-boost` → show toast "Rarity boost activated!"
   - Disable button after clicking (can't stack boosts)

3. Add **"Generate Coupon"** button to organizer's dashboard/loyalty page:
   - Shows: "Generate Discount Coupon (20 XP)"
   - Modal with coupon amount input + XP confirmation
   - On submit: POST `/xp/sink/coupon` → redirect to coupons management page

4. Alternatively, add dedicated page `/shopper/xp-sinks` or `/organizer/xp-sinks` with all options

**Severity:** P1 (Usability) — Core feature is invisible. Players may not realize XP is spendable.

---

### FINDING 5: Empty State (0 XP) — New Shopper UX ✅

**Location:** `/shopper/loyalty.tsx` lines 96–126

**Current State:**
- If user has 0 XP: loyalty page still renders the Guild XP card with "0 Guild XP" label
- Empty stamps section shows: "No stamps yet. Start shopping to earn stamps!" (line 200)
- Empty milestones section shows: "Earn [amount] stamps to unlock your first badge!" (line 235)

**What's Working:**
- Not confusing or broken
- CTA at bottom: "Browse Sales" (lines 283–290) guides new players
- Tier card shows "Bronze" tier (minimum tier for 0–99 stamps)

**Issue — P2: Motivation Could Be Higher**
- Page feels incomplete for brand-new shoppers (0 XP, 0 stamps, 0 milestones, no badges)
- "Benefits" section (lines 241–280) lists perks but doesn't say "You'll unlock these as you rank up"
- No progress indicator saying "You're 50 XP away from Scout!"
- No "Quick Start" guide: "Here's how to earn your first badges"

**Recommended Fix — P2:**
- Add "Getting Started" card for new players (0 XP):
  - "Welcome to Explorer's Guild! 🌱"
  - "Browse 3 sales → Earn 10 XP → Unlock Scout rank"
  - "Tips: Save sales, explore items, complete milestones"
- Show estimated time to next rank ("About 1–2 hours of browsing")

**Severity:** P2 (Engagement) — not broken, but cold start could be warmer.

---

### FINDING 6: useXpProfile Hook — Loading/Error Handling ✅

**Location:** `hooks/useXpProfile.ts`

**What's Working:**
- Hook properly uses react-query with `enabled` gate (line 26) — doesn't fetch if unauthenticated
- `staleTime: 300_000` (5 minutes) is reasonable — prevents excessive refetches
- Returns shape: `{ isLoading, data, error }` — standard react-query interface
- Properly typed: `XpProfileData` interface with guildXp, explorerRank, rankProgress

**Issue — None detected** — Hook is well-implemented.

**But:** Loyalty page doesn't show loading skeleton for XP profile section. When data is loading, entire card is hidden. Should show placeholder while fetching.

---

### FINDING 7: Dark Mode Comprehensive Check ✅

**All Components:**
- ✅ RankBadge: All 5 rank colors have dark equivalents (dark:bg-*, dark:text-*, dark:border-*)
- ✅ RankProgressBar: Has dark:bg-gray-700 for background, dark bar colors for all ranks
- ✅ Loyalty page: Gradient cards use dark:from-gray-800 dark:to-gray-700, all text has dark: equivalents
- ✅ Leaderboard: Table has dark:bg-gray-800, hover states with dark:hover:bg-gray-700

**No dark mode issues detected.**

---

### FINDING 8: Accessibility Check 🎯

**RankBadge:**
- ✅ Has `title={config.label}` for tooltip (line 92)
- ✅ Semantic HTML

**RankProgressBar:**
- ✅ Proper ARIA attributes: `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` (lines 49–52)
- ✅ No color-only dependency (percentage text is displayed, not just color)

**Leaderboard:**
- ✅ Semantic table markup (thead, tbody, th, td)
- ✅ Medal emojis are visual indicators (not required for understanding)
- ⚠️ No alt text for rank position emojis, but numeric fallback exists

**Loyalty Page:**
- ✅ Heading hierarchy (h1 → h2 → h3)
- ✅ No color-only indication

**No critical accessibility issues.**

---

## SUMMARY OF FINDINGS

| Severity | Finding | Component | Impact | Recommendation |
|----------|---------|-----------|--------|-----------------|
| **P0/P1** | XP Sinks Not Visible | All pages | Users can't spend XP; gamification incomplete | Add UI to loyalty page + sale detail for rarity boost; organizer page for coupon generation |
| **P2** | Leaderboard Column Header Ambiguity | leaderboard.tsx | User confusion about "Rank" vs "Rank Badge" | Rename second "Rank" header to "Explorer Rank" |
| **P2** | User Not Shown When Outside Top 50 | leaderboard.tsx | Players don't know their position if outside top 50 | Add footer: "Your Position: #142" |
| **P2** | MAX RANK State Unclear | RankProgressBar | Can't visually distinguish max rank from "almost there" | Add visual indicator (greyed-out, lock icon) when at GRANDMASTER |
| **P2** | New Shopper Cold Start | loyalty.tsx | 0 XP page feels empty/unmotivating | Add "Getting Started" card with quick wins |
| **P3** | Last Updated Timestamp Undernoticed | leaderboard.tsx | Users might trust stale data | Move to footer or add refresh button |

---

## FINAL VERDICT

### Phase 2 Readiness: **✅ YES, READY FOR BETA RELEASE**

**To Ship As-Is:**
- RankBadge component is solid
- RankProgressBar displays correctly
- Leaderboard has all core elements
- Loyalty page is feature-complete
- Dark mode works throughout
- Accessibility is good

**Should Fix Before Wide Rollout (but can launch internally):**
1. **CRITICAL:** Add XP sink UI (P1) — without this, players won't understand the economy
2. Fix leaderboard header redundancy (P2) — 10 min fix
3. Add user position footer when outside top 50 (P2) — 15 min fix
4. Add MAX RANK visual indicator (P2) — 20 min fix

**Can Iterate Post-Launch:**
- New shopper onboarding flow (P2) — 30 min, can A/B test
- Timestamp prominence (P3) — low priority

### Recommendation

**Ship to beta now** IF you add XP sink UI. Without XP sinks visible, players won't understand why they're collecting XP and will churn. With XP sinks, you have a complete economy loop.

---

## FILES AFFECTED BY AUDIT

- `/packages/frontend/components/RankBadge.tsx` — ✅ No changes needed
- `/packages/frontend/components/RankProgressBar.tsx` — 🔧 Needs MAX RANK visual indicator
- `/packages/frontend/pages/shopper/loyalty.tsx` — 🔧 Needs XP sinks section + getting started card
- `/packages/frontend/pages/shopper/leaderboard.tsx` — 🔧 Needs header rename + user position footer

