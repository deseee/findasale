# Shopper Dashboard Redesign — UX Spec
## "Home Base" Consolidation for Cohesive Gamification

**Document Status:** Design Spec (Ready for Dev)  
**Date:** April 2026  
**Audience:** Dev team (findasale-dev), Patrick (product validation)

---

## 1. Current State Audit

### What's on the Dashboard Today (In Order of Appearance)

The shopper dashboard is a list of **11–12 bolted-on cards** that feel disconnected:

| Component | Purpose | Problem |
|-----------|---------|---------|
| **Hero Welcome** | New vs. returning shopper state | Works but separate from rank system |
| **Pending Payments Alert** | Hold-to-Pay critical reminder | Correct priority, but visually distinct |
| **Collections Hint** | Soft CTA to wishlist | Useful but fights for attention |
| **QR Code** | Checkout/POS verification | Niche use case, takes prime real estate |
| **Quick Links Grid** (6 icons) | Navigation to explorations, loyalty, etc. | Cluttered, emojis vary in color/style |
| **Guild Onboarding Card** | XP system explainer for new/low-XP shoppers | Good pedagogy, dismissible |
| **Streak Widget** | Weekly check-in challenge + XP earn tip | Useful, but visually separated from rank |
| **Rank Progress Card** | Current rank, XP to next rank, tips | **Core content, but competes with 4 other cards below** |
| **Rank Benefits Card (Compact)** | What this rank unlocks | Duplicate data — also in Explorer Passport page |
| **Hunt Pass CTA** | Subscription upsell (rank-aware) | Premium, but fights with rank card |
| **Referral Card** | Share & earn (dismissible) | Good UX, but part of gamification sprawl |
| **Tabs Section** | Purchases, Subscribed, Pickups, Brands | Below the fold, important but undersold |

### Key Issues

1. **No visual hierarchy** — All cards same height/weight. The rank card (THE most important thing) is buried amid 4 other gamification cards.
2. **XP number stale bug** — Nav shows outdated XP; dashboard is the current workaround but nothing signals "this is the truth."
3. **Initiate shoppers feel lost** — They see 11 cards, most of which don't apply until they level up. No clear "here's your next step" path.
4. **Duplicate info** — Benefits shown here, again on Explorer Passport, again on a separate rank card. No single source of truth.
5. **Icon chaos** — 6 quick-link buttons with mismatched emojis, colors, gradients. Looks like a kids' toy.
6. **Missing context** — Referral card, Hunt Pass, QR code, streak challenge all exist independently. No story connecting them.

---

## 2. Proposed "Home Base" Concept

### The Philosophy

**One unified "status hub" that tells your story.**

Imagine the dashboard as a **character sheet in an RPG game**: 
- At the top: **Who you are** (rank, badge, XP meter)
- Below: **What you can do** (unlocked features & perks)
- Middle: **What you're doing** (active holds, pending payments, streaks)
- Bottom: **What's next** (leveling path, perks to unlock, one-click CTAs)

**Remove visual clutter by:**
- Consolidating 6 icon buttons into a **seamless action bar** at the top
- Making rank + XP + benefits into ONE cohesive section (not 3 cards)
- Hiding Hunt Pass / Referral / QR code behind rank-aware toggles (visible only when relevant)
- Moving quick navigation to the sidebar or collapsible menu

### Target Outcome

1. **Initiate shopper lands on dashboard:** Sees rank, current XP, one clear "how to earn XP" path, and a single CTA button.
2. **Sage shopper lands on dashboard:** Sees rank + perks, exclusive features (leaderboard, early access), and community features (teams, hall of fame).
3. **Grandmaster shopper lands on dashboard:** Sees exclusive stats, cosmetics, hall of fame badge, and invites to lead others.
4. **Every shopper:** Knows that XP shown here is the authoritative source (fixes the stale nav bug).

---

## 3. Layout Structure

### Above the Fold (Hero Section)

#### 3.1 State-Aware Hero (New vs. Returning)

**New Shoppers (0 purchases):**
```
┌─────────────────────────────────────────┐
│ Welcome to treasure hunting!             │
│ Explore nearby sales & collect treasures │
│  [Browse Sales]  [See What's Near You]   │
└─────────────────────────────────────────┘
```
(No change — this works)

**Returning Shoppers (has purchases):**
```
┌─────────────────────────────────────────┐
│ Welcome back, [Name]!                    │
│                                          │
│ ⭐ YOUR EXPLORER STATUS                  │
│ ┌─────────────────────────────────────┐ │
│ │ [Rank Badge] Sage                   │ │
│ │ 8500 / 12000 XP  ████████░░░░░ 71% │ │
│ │ 3500 XP until Grandmaster           │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ THIS RANK UNLOCKS:                      │
│ • 75 min holds  • 3 concurrent holds    │
│ • 4h early access to Legendaries        │
│ • Leaderboard visibility                │
│ • Hall of Fame eligibility              │
│                                          │
│ [BEST WAY TO EARN →] [SEE ALL PERKS →] │
└─────────────────────────────────────────┘
```

**Key changes:**
- Rank badge + name + XP in ONE visual block (not split across cards)
- Benefits shown inline, rank-aware (what **you** have unlocked)
- CTAs point to highest-value actions for your rank
- Dark mode: sage-green (#6B8F71) accent, proper contrast

---

#### 3.2 Action Bar (Replaces 6-Button Grid)

**Current:** 6 emoji buttons scattered (Explorer, Loyalty, Collections, Trails, History, My Finds)

**New:** Unified action bar, 4–5 essential actions, scannable:

```
┌──────────────────────────────────────┐
│ [🔍 Browse Sales] [💕 Collections]   │
│ [📋 History]     [🗺️ Trails]        │
│ [⋯ More Actions]                     │
└──────────────────────────────────────┘
```

- Use text labels + icons (no emoji chaos)
- Only show actions relevant to their rank
- "More Actions" expands if space is tight or lower-rank shoppers
- Dark mode: sage green border, proper hover states

---

### Primary Content (Below Hero)

#### 3.3 Active Status Section (Conditional, rank-aware)

**If pending invoices exist (highest priority):**
```
┌─────────────────────────────────────────┐
│ 💳 Pending Payments (1)                  │
│ Due by April 15                          │
│ ┌──────┐  ┌──────┐                      │
│ │Item 1│  │Item 2│  [Complete Payments]│
│ └──────┘  └──────┘                      │
└─────────────────────────────────────────┘
```

**If on a streak (Ranger+):**
```
┌─────────────────────────────────────────┐
│ 🔥 Your Streak: 7 visits                │
│ Visit 1 more sale this week for +5 XP  │
│ ┌─────────────────────────────────────┐│
│ │████████░░░ 70% to next week's bonus ││
│ └─────────────────────────────────────┘│
│ [Browse Sales Near You →]               │
└─────────────────────────────────────────┘
```

---

#### 3.4 Rank-Locked Feature Previews (Progressive Disclosure)

**For Initiate only:**
```
┌─────────────────────────────────────────┐
│ 🎯 Unlock at Scout (500 XP)             │
│ Scout Reveals, Haul Unboxing, Bump Post │
│ Earn XP: Scan items (+10), Purchase (+10)
│ [Browse Sales →]                        │
└─────────────────────────────────────────┘
```

**For Scout (as they approach Ranger):**
```
┌─────────────────────────────────────────┐
│ ⭐ Almost Ranger! (1 more XP)            │
│ At Ranger you unlock:                   │
│ • 2 concurrent holds (vs 1)              │
│ • 2h early access to Legendary items     │
│ [See Ranger Perks →]                    │
└─────────────────────────────────────────┘
```

**For Sage+:**
```
┌─────────────────────────────────────────┐
│ 🏆 Hall of Fame (Eligible)               │
│ Your profile has been nominated.         │
│ [View Your Public Profile →]             │
└─────────────────────────────────────────┘
```

---

### Secondary Content (Conditional, Below Hero)

#### 3.5 Hunt Pass Card (Rank-Aware, Dismissible)

**Show only if NOT active + rank ≤ Sage:**
```
┌─────────────────────────────────────────┐
│ 🎯 Hunt Pass — 1.5x XP + Early Access  │
│ ⭐⭐⭐ $4.99/month                       │
│ • 1.5x XP on every action               │
│ • 6-hour early access to Legendaries     │
│ [Unlock Hunt Pass →]  [Dismiss]         │
└─────────────────────────────────────────┘
```

**If already active:**
```
┌─────────────────────────────────────────┐
│ ✅ Hunt Pass Active                      │
│ You're earning 1.5x XP + 6h early access
└─────────────────────────────────────────┘
```

---

#### 3.6 Referral Card (Rank-Aware, Dismissible)

**Show for all ranks, but tailored copy:**
```
┌─────────────────────────────────────────┐
│ 🎁 Share & Earn                         │
│ Refer a friend → earn 20 XP when they   │
│ sign up + make their first purchase      │
│ [Copy Link →] [View Referrals →]        │
│                                    [✕]  │
└─────────────────────────────────────────┘
```

---

#### 3.7 Tabs (Purchases, Subscribed, Pickups, Brands)

**No change to tab content** — but move above fold on mobile, simplify tab labels.

---

## 4. Rank-Tiered Visibility Matrix

| Component | Initiate | Scout | Ranger | Sage | Grandmaster |
|-----------|----------|-------|--------|------|------------|
| **Hero + Rank** | ✅ Prominent | ✅ Prominent | ✅ Prominent | ✅ Prominent | ✅ Prominent |
| **XP Progress** | ✅ Big + copy | ✅ Full | ✅ Full | ✅ Full | ✅ (at peak) |
| **Unlocked Benefits** | ✅ 3 items | ✅ 6 items | ✅ 6 items | ✅ 7 items | ✅ All cosmetics |
| **Guild Onboarding** | ✅ Show | ⚠️ Dismiss | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| **Streak Widget** | ❌ Hidden | ✅ Show | ✅ Prominent | ✅ Shown | ✅ Shown |
| **Hunt Pass CTA** | ✅ Rank-aware copy | ✅ Rank-aware copy | ✅ Rank-aware copy | ✅ Prominent | ❌ Hidden |
| **Action Bar** | Limited (Browse, Collections) | Full | Full | Full | Full |
| **QR Code** | ❌ Hidden | ❌ Hidden | ✅ Collapsible | ✅ Collapsible | ✅ Collapsible |
| **Referral Card** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **Leaderboard Preview** | ❌ Hidden | ❌ Hidden | ❌ Hidden | ✅ Link | ✅ Full stats |
| **Hall of Fame** | ❌ Hidden | ❌ Hidden | ❌ Hidden | ✅ Eligible | ✅ Your entry |

---

## 5. The ONE Canonical Rank + XP Location

### The Problem It Solves

Currently, XP appears in **5 places**:
1. Sidebar nav (stale bug, confuses shoppers)
2. Rank Progress Card
3. Streak Widget
4. Hunt Pass card hint text
5. Explorer Passport page

**Fix:** This dashboard becomes the **authoritative source**. All other locations link back to it or mirror what's shown here.

### Implementation Detail

- **XP Profile Hook** (`useXpProfile`) fetches once at dashboard load
- All child components read from context, not separate API calls
- Sidebar nav shows **read-only badge** (no XP number) with link to dashboard
- Explorer Passport shows same XP but with historical/educational context
- Every place XP is shown, add a subtle "(verified as of now)" timestamp + link back to dashboard

---

## 6. Component Map

### Reuse (Existing Components)

| Component | Used Where | Status |
|-----------|-----------|--------|
| `RankBadge` | Hero + rank section | ✅ Reuse as-is |
| `RankProgressBar` | XP meter in hero | ✅ Reuse as-is |
| `StreakWidget` | Streak section | ✅ Reuse (with context) |
| `PointsBadge` | Streak points display | ✅ Reuse as-is |
| `AchievementBadgesSection` | Hall of Fame preview (Sage+) | ✅ Reuse, show 3 items |
| `ClaimCard` | Pending payments section | ✅ Reuse as-is |
| `MyTeamsCard` | Teams section (Ranger+) | ✅ Reuse as-is |
| Tabs (Purchases, etc.) | Bottom tabs | ✅ Reuse, no change |

### New Components

| Component | Purpose | Complexity |
|-----------|---------|-----------|
| `RankHeroSection` | Hero + rank + XP in one block | Med (combines 2–3 existing) |
| `ActionBar` | Unified top navigation | Low (grid of links) |
| `RankLevelingHint` | "How to earn XP" + next rank preview | Low (conditional text) |
| `PendingPaymentsSection` | Active holds grid + CTA | Low (wraps ClaimCard) |
| `FeatureUnlockPreview` | "Unlock at Rank X" cards | Low (conditional render) |

---

## 7. Dark Mode Notes

### Color Palette Anchors

- **Background:** `bg-warm-50` (light) / `dark:bg-gray-900` (dark) — keep as-is
- **Cards:** `bg-white` / `dark:bg-gray-800` — keep as-is
- **Primary accent (rank hero):** sage-green `#6B8F71` with proper WCAG AA contrast
  - Light mode text: `text-sage-700` on `bg-sage-50`
  - Dark mode text: `text-sage-300` on `bg-sage-900/30`
- **CTA buttons:** Amber `bg-amber-600` → `hover:bg-amber-700`, same for dark
- **Hunt Pass card:** Purple gradient `from-purple-50 to-pink-50` / `dark:from-purple-900/30 dark:to-pink-900/30`
- **Status/alerts:** Red (pending), green (active), blue (info) — all with `/30` opacity in dark mode

### Specific Dark Mode Checks

- [ ] Rank badge emoji + text legible on dark background
- [ ] XP progress bar has enough contrast (not white-on-light-gray)
- [ ] Action bar buttons have visible hover states (not just text color change)
- [ ] Cards have visible borders in dark mode (no floating effect)
- [ ] QR code image is visible (may need border or background)

---

## 8. Mobile Considerations

### Responsive Breakpoints

- **Mobile (≤640px):** Stack hero vertically, single-column action bar, hide "More Actions" until scroll
- **Tablet (641–1024px):** Hero side-by-side (badge + XP on left, benefits on right), 2-column action bar
- **Desktop (≥1025px):** Full multi-column layout, action bar horizontal, 2–3 column grid for secondary cards

### Mobile-Specific UX

1. **Hero section should fit in viewport without scrolling** (new + returning)
2. **Action bar buttons should have 48px touch target height** (WCAG)
3. **QR code only shown on desktop** (scanning from phone itself is rare; collapse/link on mobile)
4. **Pending payments grid should be full-width cards stacked** on mobile

---

## 9. Implementation Roadmap

### Phase 1: Hero Consolidation (Dev Effort: ~4 hours)
1. Combine Rank badge, XP progress, and benefits into one `RankHeroSection` component
2. Replace 3 separate cards (Rank Progress, Benefits, RankBenefitsCard) with this new hero
3. Add rank-aware "how to earn XP" tip below progress bar
4. Test dark mode, mobile

### Phase 2: Action Bar (Dev Effort: ~2 hours)
1. Create `ActionBar` component with 4–5 buttons (Browse, Collections, History, Trails, ⋯More)
2. Replace 6-emoji grid with this bar
3. Wire up visibility rules based on `rankDashboardConfig`

### Phase 3: Conditional Sections (Dev Effort: ~3 hours)
1. Extract Pending Payments into `PendingPaymentsSection`
2. Extract Streak into its own section with context-aware copy
3. Create `FeatureUnlockPreview` component for "coming at next rank" cards
4. Implement visibility matrix from §4

### Phase 4: Refinement (Dev Effort: ~2 hours)
1. Test full dashboard flow for all 5 ranks (script test data if needed)
2. Dark mode pass (colors, contrast, borders)
3. Mobile responsiveness pass
4. Accessibility audit (labels, keyboard nav, screen reader)

**Total Dev Effort:** ~11 hours (1.5 dev days, can parallelize sections)

---

## 10. Design Rationale

### Why This Works

1. **Clear visual hierarchy:** Rank + XP biggest, CTAs next, secondary info below
2. **Initiate-friendly:** New shoppers see one rank card + one "here's how to level up" card. No paralysis.
3. **Sage+growth path:** Advanced players see features they've unlocked, hall of fame, leaderboard — keeps them engaged
4. **One source of truth:** Dashboard = authoritative XP location. Fixes the stale nav bug by making this THE place.
5. **Cohesive story:** Not 11 separate widgets. It's a character sheet: "Here's who I am, what I can do, what I'm working on, what's next."
6. **Dark mode native:** Sage green + proper contrast from day one, not an afterthought

### What We're NOT Doing

- ❌ Removing any existing features (Hunt Pass, Referral, QR code still exist, just hidden/toggled)
- ❌ Removing Tabs section (Purchases, History, etc. stay as-is)
- ❌ Redesigning individual card styles (reuse existing components)
- ❌ Changing the XP earning logic (just reorganizing how it's displayed)

---

## 11. Success Criteria (QA Gates)

**Before marking ✅:**
1. All 5 ranks load without errors (test INITIATE, SCOUT, RANGER, SAGE, GRANDMASTER profiles)
2. XP displayed on dashboard matches backend (not stale)
3. Rank-aware visibility working: Initiate sees no Leaderboard, Sage sees it
4. Dark mode: all text legible, no white-on-white or black-on-black
5. Mobile: hero + action bar fit in viewport, touch targets ≥48px
6. Pending payments: if any invoices exist, they appear prominently above hero
7. Streak: shows only if Ranger+, includes dynamic "next step" copy
8. Action bar: 4–5 buttons visible, "More" option works if needed
9. No duplicate API calls (XP fetched once, shared via context)
10. External links work: "Browse Sales," "See Perks," "View Referrals," etc.

---

## Appendix: Quick Reference for Dev

### File Locations

- **Current dashboard page:** `packages/frontend/pages/shopper/dashboard.tsx`
- **Components to reuse:** `packages/frontend/components/RankBadge.tsx`, `RankProgressBar.tsx`, `StreakWidget.tsx`, `ClaimCard.tsx`, etc.
- **Rank config:** `packages/frontend/utils/rankDashboardConfig.ts`
- **Backend rank logic:** `packages/backend/src/utils/rankUtils.ts`

### Hooks to Use

- `useXpProfile()` — fetch XP + rank data
- `useAuth()` — get current user + stream points
- `useQuery({ queryKey: ['pending-invoices'], ... })` — fetch holds
- `useMyAchievements()` — fetch achievements (for Hall of Fame preview)

### Tailwind Classes Reference

- Rank hero background: `bg-gradient-to-br from-sage-50 to-white dark:from-sage-900/20 dark:to-gray-800`
- Action buttons: `bg-white border border-warm-200 dark:bg-gray-800 dark:border-gray-700 rounded-lg p-3 hover:shadow-md`
- Progress bar: use existing `RankProgressBar` component, no custom CSS needed

---

**End of Spec**
