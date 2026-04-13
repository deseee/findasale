# Shopper Dashboard Visual Directive
## Concrete Design Specifications for Rank-Tiered Loyalty UI

**Date:** 2026-04-13  
**Audience:** Dev team (findasale-dev), Designer handoff, QA verification  
**Status:** Visual Directive — Ready for Build  
**Reference:** Loyalty patterns from Duolingo, Strava, Nike Run Club, RPG character screens

---

## Overview

This directive translates loyalty/progression patterns from leading apps (Duolingo's always-visible streaks, Strava's athlete identity-first layout, Nike's aspirational tier badges) into specific, buildable FindA.Sale shopper dashboard zones.

**Core principle:** Identity first (who am I as a shopper), progress second (how far to next tier), action third (what should I do now). No stacked cards. Each rank tier has visually distinct personality.

---

## 1. Layout Zones — Desktop & Mobile

### 1.1 Zone Hierarchy (Top-to-Bottom)

```
┌─────────────────────────────────────────────────────────┐
│  ZONE 1: HERO IDENTITY ZONE (Always visible, above fold)│
│  Rank badge + Name + XP bar + Benefits list              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  ZONE 2: ACTION BAR (Primary interactions)               │
│  Browse Sales | Collections | History | Trails | More    │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  ZONE 3: STATUS/CONTEXT ZONE (Conditional)               │
│  Pending payments | Streak progress | Hunt Pass status    │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  ZONE 4: FEATURE UNLOCK ZONE (Rank-aware previews)       │
│  "Unlock at [Rank]" cards | Hall of Fame preview (Sage+) │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  ZONE 5: SECONDARY CARDS (Dismissible)                   │
│  Hunt Pass upsell | Referral | Secondary tools            │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  ZONE 6: TABS & HISTORY (Always visible, below fold)    │
│  Purchases | Subscribed | Pickups | Brands               │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Mobile Responsiveness (375px baseline)

| Zone | Desktop (≥1025px) | Tablet (641–1024px) | Mobile (≤640px) |
|------|------|------|------|
| **Zone 1: Hero** | Full width, side-by-side (badge + info left, benefits grid right) | Full width, stacked but compact (badge centered top, benefits below) | Full width, vertical stack, no horizontal scroll |
| **Zone 2: Action Bar** | Horizontal, 5 buttons | Horizontal, 4 buttons | Vertical stack, full-width buttons (48px height) |
| **Zone 3: Status** | Card grid, 2–3 columns | Single column | Full-width stacked cards |
| **Zone 4: Unlocks** | 2–3 column grid | Single column | Full-width stacked |
| **Zone 5: Secondary** | 2 column grid | Single column | Full-width |
| **Zone 6: Tabs** | Horizontal tabs, full width | Horizontal tabs, scroll if needed | Horizontal tabs, scroll |

**Mobile critical rule:** Zone 1 + Zone 2 must fit in viewport (≤ 600px) without scrolling. On 375px phone, max height for hero + action bar combined = 500px.

---

## 2. Zone 1: Hero Identity Zone — Per-Rank Visual Specifications

### 2.1 Initiate (0–499 XP) — "Welcome to the Hunt"

**Background & Layout:**
- Container: `bg-gradient-to-r from-amber-50 to-orange-50` (light mode) / `dark:from-amber-900/20 dark:to-orange-900/20` (dark mode)
- Border: `border-2 border-amber-200` (light) / `dark:border-amber-700/40` (dark)
- Padding: `p-6 md:p-8` (16px/24px mobile/desktop)
- Corner radius: `rounded-xl` (16px)
- Shadow: `shadow-sm hover:shadow-md` (light lift on hover)
- Layout pattern: **Vertical stack on mobile, side-by-side on tablet+**

**Rank Badge Display:**
- Badge emoji: `⭐` (star)
- Badge text: "Initiate" in `text-xl md:text-2xl font-bold text-amber-900 dark:text-amber-200`
- Layout: Icon + text left-aligned, wrapped in flex container
- Below badge: Shopper name (if available), `text-sm text-gray-600 dark:text-gray-400`
- Visual style: Badge has light background circle (40x40px) containing emoji, text beside it

**XP Progress Bar:**
- Label above: "Welcome! You're just starting your adventure"
- Current XP: `text-base font-semibold text-amber-900 dark:text-amber-300`
- Progress bar: `bg-gradient-to-r from-amber-400 to-orange-400` (unfilled: `bg-gray-300 dark:bg-gray-600`)
- Height: `h-3` (12px)
- Border radius: `rounded-full`
- Percentage text inside bar (if space): `text-white text-xs font-bold`
- Below bar: "50 / 500 XP until Scout (10% progress)"

**Benefits List (Initiate-specific):**
- Header: "What You Can Do Now" in `text-sm font-semibold text-amber-900 dark:text-amber-300`
- List style: Bulleted, no line numbers (Initiate is not ordinal)
- Items: `text-sm text-gray-700 dark:text-gray-300`
  - "10 min holds on any item"
  - "1 concurrent hold at a time"
  - "Browse all sales in your area"
  - "Collect items into your wishlist"
- Icon prefix: `✓` (checkmark) in amber color `text-amber-600 dark:text-amber-400`

**CTA Below Hero:**
- Primary: `[🔍 START EXPLORING SALES]` (amber button, `bg-amber-600 hover:bg-amber-700`, white text)
- Secondary: `[How to Earn XP →]` (text link, `text-amber-700 dark:text-amber-300`)

**Micro-copy tone:**
"You've got this! Every purchase and scan = XP. Climb the ranks to unlock longer holds and exclusive previews."

---

### 2.2 Scout (500–1,999 XP) — "You Know the Territory"

**Background & Layout:**
- Container: `bg-gradient-to-r from-green-50 to-teal-50` (light) / `dark:from-green-900/20 dark:to-teal-900/20` (dark)
- Border: `border-2 border-green-300` (light) / `dark:border-green-700/40` (dark)
- Padding: `p-6 md:p-8`
- Corner radius: `rounded-xl`

**Rank Badge Display:**
- Badge emoji: `🥾` (hiking boot)
- Badge text: "Scout" in `text-xl md:text-2xl font-bold text-green-900 dark:text-green-200`
- Below: Shopper name + "Level 2 Explorer"

**XP Progress Bar:**
- Label: "You're building momentum"
- Bar: `bg-gradient-to-r from-green-400 to-teal-400`
- Display: "650 / 2000 XP until Ranger (33%)"
- Progress text: Shows XP remaining (`1,350 XP to go`) in muted tone

**Benefits List (Scout-specific — more perks unlocked):**
- Header: "Your Scout Perks" in `text-sm font-semibold text-green-900 dark:text-green-300`
- Items with icon prefixes (small checkmarks):
  - "45 min holds (vs 10 min before)"
  - "2 concurrent holds"
  - "1h early access to Legendary items"
  - "Browse trending hauls"
  - "30% bonus XP on first purchase of the day"
- Item styling: `text-sm text-gray-700 dark:text-gray-300`, no bullet, checkmark icon

**CTA Below Hero:**
- Primary: `[EXPLORE NEARBY SALES]` (green button, `bg-green-600 hover:bg-green-700`)
- Secondary: `[See All Scout Perks →]` (text link)

**Micro-copy:**
"Nice work! Your early access to Legendaries is now active. Keep collecting—you're halfway to Ranger."

---

### 2.3 Ranger (2,000–4,999 XP) — "You're a Serious Hunter"

**Background & Layout:**
- Container: `bg-gradient-to-r from-blue-50 to-indigo-50` (light) / `dark:from-blue-900/20 dark:to-indigo-900/20` (dark)
- Border: `border-2 border-blue-300` (light) / `dark:border-blue-700/40` (dark)
- Padding: `p-6 md:p-8`
- Corner radius: `rounded-xl`

**Rank Badge Display:**
- Badge emoji: `🧭` (compass)
- Badge text: "Ranger" in `text-xl md:text-2xl font-bold text-blue-900 dark:text-blue-200`
- Below: Shopper name + "Level 3 Explorer"

**XP Progress Bar:**
- Label: "You're a serious hunter now"
- Bar: `bg-gradient-to-r from-blue-500 to-indigo-500`
- Display: "3,200 / 5,000 XP until Sage (64%)"
- Progress text: "1,800 XP to advance" in `text-gray-600 dark:text-gray-400`

**Benefits List (Ranger-specific — significant power unlocked):**
- Header: "Your Ranger Advantages" in `text-sm font-semibold text-blue-900 dark:text-blue-300`
- Items (no bullets, checkmark icons):
  - "60 min holds"
  - "3 concurrent holds"
  - "2h early access to Legendary items"
  - "Custom collection tracking"
  - "Haul posting + tagging"
  - "50% bonus XP on verified purchases"
- Styling: `text-sm text-gray-700 dark:text-gray-300`
- Visual: Slight elevation/emphasis on highest-value perks (early access)

**Status badge (right of hero, small):**
- Shows "3 Holds Active" (if applicable) or "3 Collections Saved" in `text-xs text-blue-700 dark:text-blue-300`

**CTA Below Hero:**
- Primary: `[MANAGE YOUR COLLECTIONS]` (blue button)
- Secondary: `[See Your Haul History →]` (text link)

**Micro-copy:**
"You're building your collection strategy. Your 2h early access and custom tracking tools are ready to use."

---

### 2.4 Sage (5,000–11,999 XP) — "You're Trusted by the Community"

**Background & Layout:**
- Container: `bg-gradient-to-r from-purple-50 to-pink-50` (light) / `dark:from-purple-900/20 dark:to-pink-900/20` (dark)
- Border: `border-2 border-purple-300` (light) / `dark:border-purple-700/40` (dark)
- Padding: `p-6 md:p-8`
- Corner radius: `rounded-xl`
- **Additional visual distinction:** Gold or silver accent stripe (thin `h-1` bar) at top of hero: `bg-gradient-to-r from-purple-400 to-pink-400`

**Rank Badge Display:**
- Badge emoji: `🔮` (crystal ball)
- Badge text: "Sage" in `text-xl md:text-2xl font-bold text-purple-900 dark:text-purple-200`
- Below: Shopper name + "Level 4 Explorer" + "(Top 5% of Hunters)"

**XP Progress Bar:**
- Label: "You're a pillar of this community"
- Bar: `bg-gradient-to-r from-purple-500 to-pink-500`
- Display: "8,500 / 12,000 XP until Grandmaster (71%)"
- Progress text: "3,500 XP away" in `text-gray-600`

**Benefits List (Sage-specific — leadership perks):**
- Header: "Your Sage Authority" in `text-sm font-semibold text-purple-900 dark:text-purple-300`
- Items (no bullets, icons):
  - "75 min holds"
  - "4 concurrent holds"
  - "4h early access to Legendary items"
  - "Leaderboard position visible"
  - "Appraisal requests from community"
  - "Your reviews carry 2x weight in item grades"
  - "Community mentor status (optional)"
- Styling: Slightly larger text `text-sm`

**Status badge (right of hero):**
- Shows "Leaderboard: #47 (Region)" + "123 helpful reviews"
- Styling: `text-xs font-semibold text-purple-700 dark:text-purple-300`

**CTA Below Hero:**
- Primary: `[VIEW YOUR LEADERBOARD POSITION]` (purple button)
- Secondary: `[See Appraisal Requests (3) →]` (text link, highlight count)

**Micro-copy:**
"You've earned trust. Your reviews and hauls influence what other hunters discover. You've unlocked 4-hour early access and leaderboard status."

---

### 2.5 Grandmaster (12,000+ XP) — "You've Mastered the Hunt"

**Background & Layout:**
- Container: **Distinct premium styling** `bg-gradient-to-r from-gray-900 to-slate-800` (light mode) / `dark:from-gray-800 to-slate-700` (dark mode)
- Border: `border-2 border-yellow-400` (gold accent, both modes)
- Padding: `p-6 md:p-8`
- Corner radius: `rounded-xl`
- **Visual distinction:** Animated gold gradient stripe at top OR subtle gold glow effect on border
- Shadow: `shadow-lg` (more prominent)

**Rank Badge Display:**
- Badge emoji: `👑` (crown)
- Badge text: "GRANDMASTER" in `text-2xl md:text-3xl font-bold text-yellow-300`
- Below: Shopper name + "Master of the Hunt"
- Additional: Small trophy emoji `🏆` beside rank

**XP Progress Bar:**
- Label: "You're at the summit" (different tone from other ranks)
- Bar: `bg-gradient-to-r from-yellow-400 to-amber-400`
- Display: "15,000 XP (Lifetime achievement)" in gold `text-yellow-300`
- XP growth mode: Instead of "XP to next rank," show "XP earned this season (competitive metric)"

**Benefits List (Grandmaster-specific — exclusive perks only):**
- Header: "Your Exclusive Mastery Perks" in `text-sm font-semibold text-yellow-300`
- Items (no bullets, crown icons):
  - "90 min holds"
  - "5 concurrent holds"
  - "6h early access to Legendary + exclusive drops"
  - "FREE Hunt Pass forever"
  - "Exclusive Grandmaster cosmetics (gold badge frame, premium avatar border)"
  - "Lifetime Hall of Fame eligibility"
  - "Exclusive merchandise previews (Grandmaster apparel line)"
- Styling: `text-sm text-yellow-100`, premium feel

**Status badge (right of hero):**
- Shows "Hall of Fame Rank: #12 (All-Time)" + "Followers: 847"
- Styling: `text-xs font-semibold text-yellow-300`

**CTA Below Hero:**
- Primary: `[YOUR HALL OF FAME PROFILE]` (gold button, `bg-yellow-500 hover:bg-yellow-600 text-gray-900`)
- Secondary: `[Invite New Hunters →]` (text link, gold)

**Micro-copy:**
"You've reached the pinnacle. Exclusive perks, free Hunt Pass, and Hall of Fame status are yours. Others look to you for guidance."

---

## 3. Zone 2: Action Bar — Exact Specifications

### 3.1 Structure & Components

**Container:**
- Width: Full width, `w-full`
- Padding: `px-4 py-3` mobile, `px-6 py-4` desktop
- Background: Subtle gray `bg-gray-50 dark:bg-gray-800/40`
- Border bottom: `border-b border-gray-200 dark:border-gray-700`
- Layout: Flex row with `justify-between` or `justify-start gap-2` (responsive)

**Button Grid (Mobile):**
- Display: Vertical stack (one per row)
- Width: Full width per button
- Height: `h-12` (48px min touch target for WCAG)
- Text + icon layout: Icon left (20px), text right, no emoji
- Responsive: 2 buttons side-by-side on tablet+, single column on mobile

**Button Grid (Tablet/Desktop):**
- Display: Horizontal row, evenly spaced
- Max 5 buttons visible (6th = "More Actions" dropdown)
- Gap between buttons: `gap-3`
- Height: `h-10` (40px, can be smaller)

### 3.2 Individual Button Styling

**Base button:**
```
bg-white dark:bg-gray-700
border border-gray-200 dark:border-gray-600
rounded-lg
px-4 py-2 (desktop) / px-3 py-3 (mobile)
text-sm font-medium text-gray-900 dark:text-gray-100
hover:bg-gray-100 dark:hover:bg-gray-600
hover:shadow-md
transition-all 200ms
```

**Icon styling:**
- SVG or icon font, 20px
- Left margin: `mr-2`
- Color: Inherit from text color
- NO emoji (use SVG or icon font only)

### 3.3 Button Order & Labels (By Rank)

**Initiate visible buttons:**
1. `🔍 Browse Sales` → `/explore`
2. `💕 Collections` → `/collections`
3. `📋 History` → `/purchases`
4. `⋯ More Actions` → dropdown

**Scout+ visible buttons:**
1. `🔍 Browse Sales` → `/explore`
2. `💕 Collections` → `/collections`
3. `📋 History` → `/purchases`
4. `🗺️ Trails` → `/trails` (Scout+)
5. `⋯ More Actions` → dropdown

**Ranger+ visible buttons:**
All 5 buttons shown (no dropdown needed)

**More Actions dropdown (if visible):**
- Opens below action bar
- Contains: My Finds, Guides, Recommendations, Settings
- Width: `min-w-48`
- Shadow: `shadow-lg`
- Background: `bg-white dark:bg-gray-800`
- Border: `border border-gray-300 dark:border-gray-700`
- Item styling: `px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700`

---

## 4. Zone 3: Status/Context Zone — Conditional Displays

### 4.1 Pending Payments Alert (Highest Priority)

**Display rule:** Show ONLY if unpaid invoices exist. Appears ABOVE all other content in Zone 3.

**Container:**
- Background: `bg-red-50 dark:bg-red-900/20`
- Border: `border-l-4 border-red-500`
- Padding: `p-4 md:p-5`
- Corner radius: `rounded-r-lg`

**Content layout:**
```
┌──────────────────────────────────────┐
│ 💳 Pending Payments (2 items)        │
│ Due by April 20                       │
│                                      │
│ [Item 1 thumb] [Item 2 thumb]       │
│ [Complete Payments]  [View Details] │
└──────────────────────────────────────┘
```

**Header:** `💳 Pending Payments (N)` in `text-base font-semibold text-red-900 dark:text-red-200`

**Subheader:** "Due by [date]" in `text-sm text-red-700 dark:text-red-300`

**Item thumbnails:**
- Size: `w-12 h-12` (48px)
- Border radius: `rounded-md`
- Layout: Horizontal flex, `gap-2`
- Show max 3 items, then "+N more" if > 3

**CTAs:**
- Primary: `[COMPLETE PAYMENTS]` (red button, `bg-red-600 hover:bg-red-700`)
- Secondary: `[View Details →]` (text link)

---

### 4.2 Streak Widget (Ranger+)

**Display rule:** Show ONLY if Ranger rank or higher. Dismissible.

**Container:**
- Background: `bg-gradient-to-r from-orange-50 to-yellow-50` (light) / `dark:from-orange-900/20 dark:to-yellow-900/20` (dark)
- Border: `border-l-4 border-orange-500`
- Padding: `p-4 md:p-5`
- Corner radius: `rounded-r-lg`

**Header:** `🔥 Your Streak: N visits` in `text-base font-semibold text-orange-900 dark:text-orange-200`

**Subheader:** "Visit 1 more sale [this week/today] for +5 XP" in `text-sm text-orange-700 dark:text-orange-300`

**Progress bar (within card):**
- Label: "Weekly progress"
- Bar height: `h-2`
- Background: `bg-gradient-to-r from-orange-400 to-yellow-400`
- Unfilled: `bg-gray-300 dark:bg-gray-600`
- Percentage: "70% to weekly bonus"

**CTA:**
- `[BROWSE SALES NEAR YOU →]` (orange text link or subtle button)

**Dismiss button:**
- Top right: Small `X` in `text-gray-400 hover:text-gray-600`

---

### 4.3 Hunt Pass Status (Conditional)

**Display rule:** 
- If NOT subscribed + Rank ≤ Sage: Show upsell card
- If subscribed: Show confirmation card
- If Grandmaster: Hide (included in perks list)

**Upsell card (not subscribed):**
- Background: `bg-gradient-to-r from-purple-50 to-pink-50` (light) / `dark:from-purple-900/20 dark:to-pink-900/20` (dark)
- Padding: `p-4 md:p-5`
- Corner radius: `rounded-lg`

```
┌────────────────────────────────────┐
│ 🎯 Hunt Pass — 1.5x XP + Early    │
│ Access ⭐⭐⭐ $4.99/month           │
│                                    │
│ • 1.5x XP on every action         │
│ • 6-hour early access to Legendaries
│ • Exclusive cosmetics             │
│                                    │
│ [UNLOCK HUNT PASS]  [DISMISS]     │
└────────────────────────────────────┘
```

- Header: `🎯 Hunt Pass` in `text-base font-semibold`
- Stars: Show 3 stars `⭐⭐⭐` in orange `text-orange-500`
- Price: `$4.99/month` in `text-sm text-gray-600 dark:text-gray-400`
- Perks list: Bullet points, `text-sm text-gray-700 dark:text-gray-300`
- CTAs: 
  - Primary: `[UNLOCK HUNT PASS]` (purple button, `bg-purple-600 hover:bg-purple-700`)
  - Secondary: `[DISMISS]` (gray text link)

**Confirmation card (subscribed):**
```
┌────────────────────────────────────┐
│ ✅ Hunt Pass Active                │
│ You're earning 1.5x XP + 6h early  │
│ access to Legendaries              │
│                                    │
│ Next renewal: April 20, 2026       │
└────────────────────────────────────┘
```

- Background: `bg-green-50 dark:bg-green-900/20`
- Header: `✅ Hunt Pass Active` in green
- Subtext: Benefit summary in `text-sm text-gray-700`
- Footer: "Next renewal: [date]" in `text-xs text-gray-500`

---

## 5. Zone 4: Feature Unlock Previews — Rank Progression

### 5.1 For Initiate Only

**Card:**
- Background: `bg-gradient-to-r from-amber-50 to-orange-50` (light) / `dark:from-amber-900/10 dark:to-orange-900/10` (dark)
- Border: `border border-dashed border-amber-300 dark:border-amber-700/50`
- Padding: `p-4 md:p-5`
- Corner radius: `rounded-lg`

```
┌─────────────────────────────────────┐
│ 🎯 Scout Unlocks (at 500 XP)       │
│                                     │
│ At Scout rank you'll gain:          │
│ • 45 min holds (vs 10 min now)     │
│ • 2 concurrent holds (vs 1)        │
│ • 1h early access to Legendaries   │
│                                     │
│ How to earn XP fast:                │
│ • Scan items: +10 XP per scan      │
│ • Make a purchase: +25 XP          │
│ • Rate items: +5 XP each           │
│                                     │
│ [BROWSE SALES TO EARN XP →]        │
└─────────────────────────────────────┘
```

- Header: `🎯 Scout Unlocks (at 500 XP)` in `text-base font-semibold text-amber-900 dark:text-amber-200`
- Subheader: "At Scout rank you'll gain:" in `text-sm text-amber-800 dark:text-amber-300`
- Perks list: Bullet points, `text-sm text-gray-700 dark:text-gray-300`
- "How to earn XP fast:" subheading
- Methods list: Bullet points with XP values in amber `text-amber-700 dark:text-amber-300`
- CTA: `[BROWSE SALES TO EARN XP →]` (amber text link, bold)

---

### 5.2 For Scout (Approaching Ranger)

**Display rule:** Show when Ranger is within ~500 XP (customizable threshold).

**Card:**
- Background: `bg-gradient-to-r from-green-50 to-teal-50` (light) / `dark:from-green-900/10 dark:to-teal-900/10` (dark)
- Border: `border border-solid border-green-300 dark:border-green-700/50`
- Padding: `p-4 md:p-5`
- Corner radius: `rounded-lg`

```
┌─────────────────────────────────────┐
│ ⭐ Almost Ranger! (237 XP to go)   │
│                                     │
│ At Ranger you'll unlock:            │
│ • 60 min holds (vs 45 min)         │
│ • 3 concurrent holds (vs 2)        │
│ • 2h early access to Legendaries   │
│ • Custom collection tracking       │
│                                     │
│ [SEE ALL RANGER PERKS →]           │
│ [QUICK ACTIONS TO EARN XP ▼]       │
└─────────────────────────────────────┘
```

- Header: `⭐ Almost Ranger! (N XP to go)` in `text-base font-semibold text-green-900 dark:text-green-200`
- Subheader: "At Ranger you'll unlock:" in `text-sm text-green-800`
- Perks list: Max 4 items, bullet points
- CTAs:
  - Primary: `[SEE ALL RANGER PERKS →]` (green text link)
  - Secondary: `[QUICK ACTIONS TO EARN XP ▼]` (collapsible, shows quick XP methods)

---

### 5.3 For Ranger (Approaching Sage)

Similar structure to Scout card above, but with:
- Header: `🧭 Almost Sage! (N XP to go)`
- Color scheme: Blue
- Highlighted perk: Leaderboard visibility + community status

---

### 5.4 For Sage (Eligible for Hall of Fame)

**Display rule:** Show if Sage rank AND total posts/reviews > threshold.

**Card:**
- Background: `bg-gradient-to-r from-purple-50 to-pink-50` (light) / `dark:from-purple-900/10 dark:to-pink-900/10` (dark)
- Border: `border border-solid border-purple-300 dark:border-purple-700/50`
- Padding: `p-4 md:p-5`
- Corner radius: `rounded-lg`

```
┌──────────────────────────────────────┐
│ 🏆 Hall of Fame Eligible            │
│                                      │
│ Your profile has earned recognition │
│ and can now be featured in our       │
│ Hall of Fame. Your hauls, reviews,  │
│ and contributions inspire other      │
│ hunters.                             │
│                                      │
│ [VIEW YOUR PUBLIC PROFILE →]         │
│ [SEE HALL OF FAME →]                │
└──────────────────────────────────────┘
```

- Header: `🏆 Hall of Fame Eligible` in `text-base font-semibold text-purple-900`
- Body text: `text-sm text-gray-700` (warm, inviting tone)
- CTAs:
  - Primary: `[VIEW YOUR PUBLIC PROFILE →]` (purple text link)
  - Secondary: `[SEE HALL OF FAME →]` (purple text link)

---

## 6. Dark Mode Color Palette — Exact Specifications

### 6.1 Per-Rank Color Anchors (Dark Mode)

| Rank | Light BG | Dark BG | Light Text | Dark Text | Accent | Dark Accent |
|------|---|---|---|---|---|---|
| **Initiate** | `bg-amber-50` | `dark:bg-amber-900/20` | `text-amber-900` | `dark:text-amber-200` | `border-amber-200` | `dark:border-amber-700/40` |
| **Scout** | `bg-green-50` | `dark:bg-green-900/20` | `text-green-900` | `dark:text-green-200` | `border-green-300` | `dark:border-green-700/40` |
| **Ranger** | `bg-blue-50` | `dark:bg-blue-900/20` | `text-blue-900` | `dark:text-blue-200` | `border-blue-300` | `dark:border-blue-700/40` |
| **Sage** | `bg-purple-50` | `dark:bg-purple-900/20` | `text-purple-900` | `dark:text-purple-200` | `border-purple-300` | `dark:border-purple-700/40` |
| **Grandmaster** | `bg-gray-900` | `dark:bg-gray-800` | `text-yellow-300` | `text-yellow-300` | `border-yellow-400` | `border-yellow-400` |

### 6.2 Dark Mode Contrast Verification

**All text must pass WCAG AA (4.5:1 contrast ratio minimum):**

- ✅ Dark text (`text-gray-900`) on light backgrounds: **15:1 contrast**
- ✅ Light text (`text-gray-100`) on dark backgrounds: **15:1 contrast**
- ✅ Rank-specific text (e.g., `text-amber-200` on `bg-amber-900/20`): **7:1 contrast** (passes AA)
- ✅ Accent borders (e.g., `border-amber-700/40` on dark): **Visible at 3px+ width**

**Dark mode QA checklist:**
- [ ] Rank badge emoji legible (not blurred or lost in background)
- [ ] XP progress bar bar-color distinct from background (min 3:1 local contrast)
- [ ] Benefits list text readable without eye strain
- [ ] Action bar button text clear on button background
- [ ] Borders visible (not invisible due to low opacity)
- [ ] Cards have visible shadows or borders (no floating effect)

---

## 7. Mobile-Specific Implementations (≤640px)

### 7.1 Hero Zone on Mobile

**Layout:**
- Full width with 16px padding on each side (`px-4`)
- Rank badge: Centered horizontally, 40x40px emoji circle + centered text below
- XP progress bar: Full width of card
- Benefits list: Single column, full width

**Typography sizing:**
- Rank name: `text-lg` (18px, vs `text-xl` on desktop)
- Subheader ("You're just starting..."): `text-xs` (12px)
- XP display: `text-sm` (14px)
- Benefits list: `text-xs` (12px)

**Height constraint:**
- Hero + Action Bar combined ≤ 500px on 375px device
- Action Bar buttons: `h-12` (48px each)
- Max 2 buttons per row on mobile

---

### 7.2 Action Bar on Mobile

**Layout:**
- Vertical stack, 1 button per row
- Full width minus 16px padding
- Height: `h-12` (48px per button for WCAG touch target)
- Total height for 4 buttons: 192px
- Last button or "More Actions" if space constrained

**Button sizing:**
- Text size: `text-sm` (14px)
- Icon size: `w-5 h-5` (20px)
- Padding: `px-3 py-3`
- Touch target: 48px high × full width

---

### 7.3 Cards Below Hero (Mobile)

**Layout:**
- Full width with `px-4 mx-0`
- Stacked vertically
- Margin between cards: `gap-3`
- Card width: 100% of viewport - 32px padding

**Text sizing on cards:**
- Headers: `text-sm` (14px) vs `text-base` (16px) on desktop
- Body text: `text-xs` (12px) vs `text-sm` (14px) on desktop
- Thumbnails (e.g., pending items): `w-10 h-10` (40px vs 48px)

---

## 8. QR Code Display — Mobile-First Rules

**Display rule:**
- **Desktop (≥1025px):** Show QR code in collapsible section below hero ("Checkout QR")
- **Tablet (641–1024px):** Show QR code in collapsible section, OR move to Zone 5 if space tight
- **Mobile (≤640px):** Hide QR code by default. Show only if explicitly requested via button ("Show Checkout QR")

**Rationale:** Scanning from same phone is rare. Desktop/POS checkout is primary use case.

**QR code card (when visible):**
- Background: White (`bg-white dark:bg-gray-700`)
- Size: `w-32 h-32` (128px, fits comfortable in hand when printed)
- Border: `border-2 border-gray-300 dark:border-gray-600`
- Padding: `p-2`
- Below QR: "Scan at checkout" in `text-xs text-gray-600`

---

## 9. Implementation Checklist for Dev

### Before Building

- [ ] Read `rankDashboardConfig.ts` — confirm all 5 rank tiers
- [ ] Read existing `RankBadge.tsx`, `RankProgressBar.tsx`, `StreakWidget.tsx` components
- [ ] Confirm XP data structure in backend response
- [ ] Check dark mode CSS variables in Tailwind config

### Zone 1: Hero Identity

- [ ] Create new `RankHeroSection.tsx` component combining:
  - Rank badge + name (existing `RankBadge` reused)
  - XP progress bar (existing `RankProgressBar` reused)
  - Benefits list (render from rank tier config)
  - CTAs (link to next action)
- [ ] Implement per-rank background gradient (5 color sets)
- [ ] Test dark mode for all 5 ranks
- [ ] Test mobile layout (hero ≤250px height)
- [ ] Test accessibility (semantic HTML, labels, contrast)

### Zone 2: Action Bar

- [ ] Create `ActionBar.tsx` component
- [ ] Implement responsive button layout (vertical stack mobile, horizontal tablet+)
- [ ] Wire visibility rules from `rankDashboardConfig`
- [ ] Implement "More Actions" dropdown (if space tight)
- [ ] Ensure 48px touch target on mobile
- [ ] Test hover/active states in dark mode

### Zone 3: Status

- [ ] Pending Payments: Render only if invoices exist
- [ ] Streak Widget: Render only if Ranger+
- [ ] Hunt Pass card: Show/hide based on subscription + rank rules

### Zone 4: Feature Unlocks

- [ ] Create `FeatureUnlockPreview.tsx` component
- [ ] Implement per-rank unlock card (Initiate, Scout, Ranger, Sage)
- [ ] Implement Hall of Fame card (Sage+ only)
- [ ] Test conditional rendering

### Dark Mode

- [ ] Verify all 5 rank colors have 4.5:1 contrast on dark backgrounds
- [ ] Test QR code visibility on dark backgrounds (may need white border)
- [ ] Test icon colors in dark mode
- [ ] Test link colors (hover states must be visible)

### Mobile QA

- [ ] Verify hero + action bar fit in viewport (≤500px combined on 375px device)
- [ ] Test all buttons are 48px tall on mobile
- [ ] Test card stacking below fold
- [ ] Test QR code is hidden on mobile
- [ ] Test dark mode on mobile

### Accessibility

- [ ] All buttons have `aria-label` or visible text
- [ ] Form inputs (if any) have labels
- [ ] Color not the only indicator (use icons + text)
- [ ] Screen reader test on at least one rank (Initiate + Sage)
- [ ] Keyboard navigation: Tab through all buttons, Enter to click

---

## 10. File Structure & Component Locations

**New components to create:**
```
packages/frontend/components/
├── RankHeroSection.tsx          (consolidates rank + XP + benefits)
├── ActionBar.tsx                 (unified navigation)
├── RankLevelingHint.tsx          (how to earn XP tip)
├── PendingPaymentsSection.tsx    (active holds)
├── FeatureUnlockPreview.tsx      (coming at next rank)
├── RankStatusBadge.tsx           (optional: status indicator)
```

**Config files:**
```
packages/frontend/utils/
├── rankDashboardConfig.ts        (existing, no changes)
├── rankColorMap.ts               (NEW: maps rank to color palette)
├── unlockMessagesConfig.ts       (NEW: per-rank unlock copy)
```

**Page using these:**
```
packages/frontend/pages/shopper/dashboard.tsx
```

---

## 11. Design Rationale & Principles

### Why This Works for FindA.Sale

1. **Identity-first (Duolingo model):** Rank badge + XP prominent at top. User knows "who I am" immediately.
2. **Athlete-centric (Strava model):** Weekly/seasonal stats (streak, ranking position) are visible for engaged users.
3. **Aspirational unlocks (Nike Run Club model):** Next-rank features are grayed out but visible, motivating progression.
4. **RPG-like progression (character sheet):** Each tier feels visually distinct—colors, perks, status all reinforce growth.
5. **Mobile-first design:** Hero + action bar fit on small screens without scroll; secondary content below fold.
6. **Dark mode native:** All 5 rank colors designed with dark mode from start, not afterthought.

### What This Solves

- ✅ Stale nav XP bug (dashboard is now source of truth)
- ✅ Initiate paralysis (one clear next step, not 11 cards)
- ✅ Rank identity (each tier feels different—not generic)
- ✅ Cluttered layout (consolidated hero, hidden/toggled secondary cards)
- ✅ Feature discoverability (unlock previews show what's next)
- ✅ Dark mode contrast (all text passes WCAG AA)
- ✅ Mobile experience (hero + action fit above fold)

---

## 12. Success Criteria (QA Sign-Off)

**Before marking ✅:**

1. **All 5 ranks render** without console errors (INITIATE, SCOUT, RANGER, SAGE, GRANDMASTER test profiles)
2. **Hero zone** visually distinct per rank (5 different color schemes applied)
3. **XP bar** displays correctly, matches backend data (not stale)
4. **Benefits list** shows rank-appropriate perks (Scout shows "45 min holds," Ranger shows "60 min holds," etc.)
5. **Action bar** buttons are responsive:
   - Mobile: 2 buttons per row, 48px height, full width
   - Desktop: 5 buttons per row, 40px height, evenly spaced
6. **Dark mode:** All text legible on dark backgrounds (contrast ≥4.5:1)
7. **Pending payments:** If invoices exist, card appears above hero with correct item count + due date
8. **Streak widget:** Shows only for Ranger+ rank
9. **Hunt Pass card:** Shows upsell for non-subscribers (rank ≤ Sage), confirmation for subscribers
10. **Feature unlock preview:** Correct card shown per rank (Initiate sees "Scout Unlocks," etc.)
11. **Mobile viewport:** Hero + action bar combined height ≤ 500px on 375px device
12. **Accessibility:** Buttons have visible labels, colors not only indicator of state, keyboard navigable

---

**End of Visual Directive**

---

## References & Inspiration Sources

- [Duolingo — Streak System Detailed Breakdown & Design](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)
- [Duolingo UX Design Breakdown: 12 Patterns That Make It Addictive (2026)](https://www.925studios.co/blog/duolingo-design-breakdown)
- [Strava Athlete Profile & Progress Summary](https://support.strava.com/hc/en-us/articles/28437860016141-Progress-Summary-Chart)
- [Nike Run Club Tier Badges & Progression](https://www.nike.com/help/a/nrc-run-level)
- [RPG UI Design Principles](https://www.gameuidatabase.com/)
