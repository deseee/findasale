# Rank Perks Display Specification
## FindA.Sale Explorer's Guild

**Document Version:** 1.0  
**Last Updated:** 2026-04-13  
**Owner:** Game Design / UX  
**Status:** Approved for implementation  

---

## 1. Complete Perks Catalog by Rank

Source of truth: `packages/backend/src/utils/rankUtils.ts` (getRankBenefits function)

### INITIATE (0 XP)
- **Hold Duration:** 30 minutes per hold
- **Max Concurrent Holds:** 1 active hold
- **En-Route Grace Holds:** 1 additional hold allowed while in transit
- **Wishlist Capacity:** 1 item saved
- **Confirmation Skips Per Sale:** 0 (must confirm every time)
- **Auto-Confirm All Holds:** No
- **Legendary Early Access Hours:** 0 (no early access)
- **Treasure Trails (Micro-Sinks):** 0 trails available
- **Cosmetics Unlocked:** None
- **Micro-Sinks Enabled:**
  - Scout Reveal: ✘ Locked
  - Haul Unboxing: ✘ Locked
  - Bump Post: ✘ Locked

### SCOUT (500 XP)
- **Hold Duration:** 45 minutes per hold
- **Max Concurrent Holds:** 1 active hold
- **En-Route Grace Holds:** 2 additional holds allowed while in transit
- **Wishlist Capacity:** 3 items saved
- **Confirmation Skips Per Sale:** 0 (must confirm every time)
- **Auto-Confirm All Holds:** No
- **Legendary Early Access Hours:** 1 hour before public sale open
- **Treasure Trails (Micro-Sinks):** 0 trails available
- **Cosmetics Unlocked:** Scout Badge, Scout Map Pin
- **Micro-Sinks Enabled:**
  - Scout Reveal: ✓ Unlock hidden items in a sale (+5 XP)
  - Haul Unboxing: ✓ Unbox a haul from another shopper (+2 XP)
  - Bump Post: ✓ Boost a post visibility (+10 XP)

### RANGER (2,000 XP)
- **Hold Duration:** 60 minutes per hold
- **Max Concurrent Holds:** 2 active holds
- **En-Route Grace Holds:** 2 additional holds allowed while in transit
- **Wishlist Capacity:** 10 items saved
- **Confirmation Skips Per Sale:** 1 skip per sale (auto-hold one item)
- **Auto-Confirm All Holds:** No
- **Legendary Early Access Hours:** 2 hours before public sale open
- **Treasure Trails (Micro-Sinks):** 3 trails available per week
- **Cosmetics Unlocked:** Ranger Badge, Ranger Map Pin, Collector Tier Badges
- **Micro-Sinks Enabled:**
  - Scout Reveal: ✓ Unlock hidden items in a sale (+5 XP)
  - Haul Unboxing: ✓ Unbox a haul from another shopper (+2 XP)
  - Bump Post: ✓ Boost a post visibility (+10 XP)

### SAGE (5,000 XP)
- **Hold Duration:** 75 minutes per hold
- **Max Concurrent Holds:** 3 active holds
- **En-Route Grace Holds:** 3 additional holds allowed while in transit
- **Wishlist Capacity:** 15 items saved
- **Confirmation Skips Per Sale:** 2 skips per sale (auto-hold up to 2 items)
- **Auto-Confirm All Holds:** No
- **Legendary Early Access Hours:** 4 hours before public sale open
- **Treasure Trails (Micro-Sinks):** Unlimited trails available per week
- **Cosmetics Unlocked:** Sage Badge, Sage Map Pin, Collector Tier Badges, Leaderboard Visibility
- **Micro-Sinks Enabled:**
  - Scout Reveal: ✓ Unlock hidden items in a sale (+5 XP)
  - Haul Unboxing: ✓ Unbox a haul from another shopper (+2 XP)
  - Bump Post: ✓ Boost a post visibility (+10 XP)

### GRANDMASTER (12,000 XP)
- **Hold Duration:** 90 minutes per hold
- **Max Concurrent Holds:** 3 active holds
- **En-Route Grace Holds:** 3 additional holds allowed while in transit
- **Wishlist Capacity:** Unlimited items saved
- **Confirmation Skips Per Sale:** All holds auto-confirm (unlimited skips)
- **Auto-Confirm All Holds:** Yes (every hold auto-confirms without action)
- **Legendary Early Access Hours:** 6 hours before public sale open
- **Treasure Trails (Micro-Sinks):** Unlimited trails available per week
- **Cosmetics Unlocked:** Grandmaster Badge, Custom Map Pin Unlock, All Cosmetics Free
- **Micro-Sinks Enabled:**
  - Scout Reveal: ✓ Unlock hidden items in a sale (+5 XP)
  - Haul Unboxing: ✓ Unbox a haul from another shopper (+2 XP)
  - Bump Post: ✓ Boost a post visibility (+10 XP)

---

## 2. Shopper-Friendly Copy — Per-Rank Perk Lists

These strings should display in the perks card to show shoppers what each rank unlocks. Use plain language—no jargon.

### INITIATE
```
🔓 Hold items for 30 minutes
🎯 Save 1 item to wishlist
🏠 Basic home feed access
```

### SCOUT (Recommended for new explorers)
```
⏱️ Hold items for 45 minutes
🎯 Save up to 3 items to wishlist
💬 Early sale announcements (1 hour early)
✨ Unlock Scout cosmetics & badges
🔓 Unlock micro-sinks: Scout Reveal, Haul Unboxing, Bump Post
```

### RANGER (For active hunters)
```
⏱️ Hold items for 60 minutes
🎯 Save up to 10 items to wishlist
🏃 Hold 2 items at the same time
💬 Legendary early access (2 hours early)
⚡ Auto-skip confirmation on 1 item per sale
🎭 Unlock Ranger cosmetics & collector badges
🗺️ Treasure Trails available: 3 per week
```

### SAGE (For dedicated collectors)
```
⏱️ Hold items for 75 minutes
🎯 Save up to 15 items to wishlist
🏃 Hold 3 items at the same time
💬 Legendary early access (4 hours early)
⚡ Auto-skip confirmation on 2 items per sale
🧙 Visible on leaderboards & hall of fame
🎭 Unlock Sage cosmetics & profile colors
🗺️ Treasure Trails available: Unlimited
```

### GRANDMASTER (The ultimate explorer)
```
⏱️ Hold items for 90 minutes
🎯 Save unlimited items to wishlist
🏃 Hold 3 items at the same time (auto-confirm all)
💬 Legendary early access (6 hours early)
⚡ All holds auto-confirm automatically
👑 Permanent hall of fame eligibility
💎 All cosmetics unlocked for free
🗺️ Treasure Trails available: Unlimited
```

---

## 3. Recommended Display Location & Justification

### **Location: Dedicated `/shopper/ranks` Page**

**Why this location:**
1. **Dedicated real estate** — The perks system is rich (5 ranks × ~6–8 perks each). A dedicated page shows all tiers clearly, not compressed.
2. **Comparison affordance** — Shoppers can easily see "what's next" without scrolling through loyalty page sections.
3. **Onboarding funnel** — New users landing on `/shopper/ranks` immediately understand the progression path and what they unlock at each step.
4. **Mobile-friendly** — Dedicated page can optimize layout for small screens without layout conflicts.
5. **Searchable/shareable** — Direct URL makes it easier to link to a specific rank or share with friends.
6. **Mirrors game design precedent** — Games like Valorant, Fortnite, and Clash Royale have dedicated "Battle Pass" or "Season Pass" pages that show rewards clearly.

**Secondary display:**
- Include a **"View all rank benefits"** link/button on the loyalty page (currently exists at line 525–526 of loyalty.tsx) that navigates to `/shopper/ranks`.
- Keep the compact `RankBenefitsCard` on the shopper dashboard (line 537) for quick reference of current rank.

---

## 4. Display Format Recommendation

### **Progressive Tier Cards (Vertical Stack or Horizontal Scroll)**

**Structure per rank:**
```
┌─────────────────────────────────────────┐
│  [Rank Badge] Rank Name (X,XXX XP)     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  ✓ Perk 1                               │
│  ✓ Perk 2                               │
│  ✓ Perk 3                               │
│  ✓ Perk 4                               │
│  ✓ Perk 5                               │
└─────────────────────────────────────────┘
```

**Desktop (≥768px):**
- Display all 5 rank cards in a vertical stack (full width)
- Each card spans 100% width, ~140px height
- Clear visual hierarchy: current rank highlighted with border color + background tint

**Mobile (<768px):**
- Stack cards vertically, full width minus padding
- Each card adjusts to mobile width with left-aligned icons + text
- Current rank "You are here" indicator is prominent

**Accent colors (match RANK_COLORS from rankUtils.ts):**
- INITIATE: Gray (#6B7280)
- SCOUT: Blue (#3B82F6)
- RANGER: Green (#10B981)
- SAGE: Amber (#F59E0B)
- GRANDMASTER: Purple (#8B5CF6)

---

## 5. "You're Here" Indicator

**Visual treatment:**
1. **Current rank card** gets a **left border accent** (4px solid, colored by rank)
2. **Card background** gets a subtle tint (10% opacity of rank color)
3. **Text label** shows **"Your Current Rank"** or **"📍 You are here"** at the top-right corner of the card
4. **All higher-tier cards** show a muted/grayed-out state with text "Unlock at X,XXX XP" below the rank name

**Example:**
```
YOUR CURRENT RANK:
┌─ Blue left border ─────────────────────┐
│ 🐦 Scout (500 XP)                   📍 │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│ ✓ Hold items for 45 minutes            │
│ ✓ Save up to 3 items to wishlist       │
│ ... (current perk list)                │
└─────────────────────────────────────────┘

NEXT RANK:
┌─ Grayed out ──────────────────────────┐
│ 🧗 Ranger (2,000 XP) — Unlock at 1,234 │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│ ✗ Hold items for 60 minutes            │
│ ✗ Save up to 10 items to wishlist      │
│ ... (grayed out)                       │
└─────────────────────────────────────────┘
```

---

## 6. Next Rank Preview — YES (with reasoning)

**Decision: SHOW next rank preview — but carefully**

**Why show it:**
1. **Engagement** — "X more XP to unlock 60-minute holds" creates motivation to earn more XP.
2. **Clear progression path** — Shoppers understand what effort gets them what reward.
3. **FOMO reduction** — Transparent about requirements prevents surprise disappointment.
4. **Existing component precedent** — RankBenefitsCard.tsx already implements this (line 119–132).

**Implementation:**
- **Current rank card:** Show full perk list (all items enabled/checkmarked)
- **Immediately below:** Show "Next rank preview" section:
  ```
  Next rank (Ranger) unlocks:
  • Hold items for 60 minutes
  • Save up to 10 items to wishlist
  • 2 concurrent holds
  (Show first 3, with "+ X more" button)
  ```
- **Display in grayed-out state** so user knows these are locked
- **Include XP counter:** "Unlock at 2,000 XP (1,234 XP to go)"

**For GRANDMASTER:** Skip "next rank" section since there is no rank above. Instead show:
```
You've reached the peak! 👑
Legendary explorer status unlocked.
All perks and cosmetics available.
```

---

## 7. Component Architecture & File Locations

### Existing Components (to leverage)
- `packages/frontend/components/RankBenefitsCard.tsx` — Already exists, displays single rank with next-rank preview
- `packages/frontend/components/RankBadge.tsx` — Renders rank badge with color/emoji
- `packages/frontend/components/RankProgressBar.tsx` — Shows XP progress to next rank

### New Components (to create)
- **`RankPerksPage.tsx`** — Full page layout at `/shopper/ranks`
  - Imports RankBenefitsCard
  - Loops through all 5 ranks
  - Shows current rank highlighted
  - Displays XP requirements for each

### New Page File
- **`packages/frontend/pages/shopper/ranks.tsx`** — Entry point for `/shopper/ranks` route
  - Uses `useXpProfile` hook to fetch current user's XP and rank
  - Renders RankPerksPage component

### Backend (no changes needed)
- rankUtils.ts already exports RANK_NAMES, RANK_COLORS, RANK_THRESHOLDS
- getRankBenefits() already returns all perks per rank
- No schema or API changes required

---

## 8. UI Copy & Tone

All strings should match FindA.Sale voice: **friendly, encouraging, game-like, no jargon**.

**Page Title:**
```
"Explorer Rank Benefits"
Subtitle: "Climb the ranks and unlock exclusive perks"
```

**Rank Label Template:**
```
[Emoji] [Rank Name] (X,XXX XP required)
```

**Perk List Prefix:**
```
✓ (checkmark icon) + perk description
```

**Next Rank Section:**
```
"Next rank ([Name]) unlocks:"
"• [Perk]"
"Unlock at X,XXX XP ([XP remaining] to go)"
```

**For Already-Unlocked Ranks (above current):**
```
"Unlock at X,XXX XP"
```

---

## 9. Acceptance Criteria for Implementation

- [ ] Page renders at `/shopper/ranks` with no errors
- [ ] All 5 ranks display with correct perks from rankUtils.ts
- [ ] Current user rank is visually distinct (left border + tint + "You are here" label)
- [ ] XP thresholds match RANK_THRESHOLDS constant (0, 500, 2000, 5000, 12000)
- [ ] Next rank preview shows for all ranks except GRANDMASTER
- [ ] Mobile layout (< 768px) displays cards full-width, readable on small screens
- [ ] Dark mode works (colors inverted appropriately)
- [ ] Responsive: desktop 3-column layout option OR single-column stack works equally well
- [ ] Page loads within 2s on average network
- [ ] Accessibility: ARIA labels for rank badges, proper heading hierarchy (h1 → h2 → h3)
- [ ] XP progress bar correctly calculates % to next rank
- [ ] "View all rank benefits" link on loyalty page navigates here correctly
- [ ] No console errors or TypeScript warnings

---

## 10. Future Enhancements (Out of Scope, Post-Ship)

1. **Interactive rank calculator** — "How long to reach Sage?" based on play frequency
2. **Notification on rank-up** — Toast/modal when user hits new threshold
3. **Share rank achievement** — Button to generate shareable image of new rank
4. **Rank-locked content teaser** — Show perks locked behind higher ranks with "Coming soon" state
5. **XP earning breakdown** — "Your last 10 activities earned X XP" on this page
6. **Rank comparison** — Compare two shoppers' ranks in leaderboard context

---

## Document Sign-Off

**Version History:**
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-04-13 | Initial spec from rankUtils.ts audit | Game Design |

**References:**
- Source code: `packages/backend/src/utils/rankUtils.ts`
- Component: `packages/frontend/components/RankBenefitsCard.tsx`
- Page: `packages/frontend/pages/shopper/loyalty.tsx`
- Design colors: rankUtils.ts RANK_COLORS constant

