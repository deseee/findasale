# Shopper Dashboard Creative Brief — Rank-Tiered Design
## P2 Feature: Explorer's Guild Dashboard Evolution

**Date:** 2026-04-13  
**Scope:** `/shopper/dashboard` (rank-aware redesign)  
**Target Role:** FindA.Sale shoppers (Initiate through Grandmaster tiers)  
**Status:** Creative Direction — Ready for Architect + Dev briefs  
**Brand Authority:** Brand Voice Guide (2026-03-16), Explorer's Guild Master Spec (2026-04-06)

---

## Executive Summary

The shopper dashboard today is generic—the same widgets appear for all users regardless of their rank in the Explorer's Guild. **This brief rethinks the dashboard as an evolving experience where each rank tier *feels* distinctly different**, reflecting what shoppers can do, what they've unlocked, and how they belong in the community.

**Core principle:** The dashboard should feel like a progression reward. As shoppers level up from Initiate → Scout → Ranger → Sage → Grandmaster, the interface should emotionally reinforce that they're gaining status, unlocking power, and joining an elite community—without becoming cluttered or losing the "treasure hunt" charm that defines FindA.Sale.

---

## Section 1: Per-Rank Dashboard Personality & Emotional Tone

### Initiate (0–499 XP) — "Welcome to the Hunt"

**Emotional Tone:**  
Excitement, curiosity, guided discovery. You've just arrived and everything is new. The dashboard feels like a gentle onboarding environment—lots of encouragement, helpful tips, and clear next steps. Not overwhelming, but definitely energizing. The dashboard says: "You've found the right place. Let's show you what's possible."

**Visual Personality:**
- Warm, inviting color palette (grounded in FindA.Sale's friendly brand)
- Clear hierarchy: one obvious primary action per section
- Generous whitespace; nothing cramped
- Prominent guideposts (arrows, numbered steps, highlight cards with tips)
- Celebratory micro-copy ("You're off to a great start!", "First purchase unlocked")
- Light, encouraging tone in all copy

**Vibe:** First day at a treasure hunt—you're still learning the terrain, but someone friendly is showing you where to look.

---

### Scout (500–1,999 XP) — "You Know the Territory"

**Emotional Tone:**  
Competence, familiarity, early momentum. You're not new anymore—you know how the platform works, you've made a few purchases, you're starting to recognize patterns. The dashboard reflects that. It's less tutorial-heavy and more action-focused. You're still discovering, but with more confidence. The dashboard says: "You're in the groove now. Here's what's hot and what's new."

**Visual Personality:**
- Still warm and approachable, but cleaner and more streamlined
- Reduced guidance; more direct access to tools
- New perks and unlocks are visible (45-min holds, seasonal challenges, cosmetic color unlock)
- Curated discovery (personalized picks, trending hauls, nearby sales)
- Secondary copy shifts from "learn how" to "get moving"
- Early signs of community (haul posts from similar scouts, reviews, organizer ratings)

**Vibe:** Your third weekend treasure hunting—you've got a route now, you know which organizers are good, you're starting to develop taste.

---

### Ranger (2,000–4,999 XP) — "You're a Serious Hunter"

**Emotional Tone:**  
Capability, respect, specialization. You're not just a shopper anymore—you're a *collector*, a *curator*, someone with opinions and strategy. The dashboard recognizes that. It's less about discovery and more about *optimization*: saved items, haul history, custom collections, guides you've written. The dashboard says: "You know what you're looking for. Let's make it easier to find and keep track of it."

**Visual Personality:**
- More sophisticated layout; dense with useful information but still scannable
- Power tools are prominent: saved items, collection tracking, past hauls, guides
- Personal context is visible: your saved searches, your favorite organizers, your haul history
- Status symbols are understated but clear (custom username color, custom frame badge)
- Community contribution is highlighted (guides you've published, reviews you've left, items you've graded)
- Less onboarding, more tactical

**Vibe:** You've got a collection, you know the market, you're looking for specific items—the dashboard is your hunting command center.

---

### Sage (5,000–11,999 XP) — "You're Trusted by the Community"

**Emotional Tone:**  
Authority, recognition, leadership. You're not just a hunter—you're a trusted member of the community. Your opinions matter. The dashboard reflects your status: leaderboard position is visible, your review count is shown, community members are watching your hauls and collections. There's a sense of responsibility and prestige. The dashboard says: "You're a pillar of this community. Here's how you're impacting it and where you stand."

**Visual Personality:**
- Clean, sophisticated design with visual hierarchy that emphasizes your achievements
- Leaderboard position is prominent (seasonal rank, total XP, badges earned)
- Your influence is quantified: reviews written, hauls liked, guides followed
- Perks are tangible: appraisal requests from others, exclusive previews, community mentorship opportunities
- Status symbols are visible and distinctive: Sage-tier frame badge, leaderboard placement
- Early access signals to premium events or limited drops
- Community features are central: mention of followers, activity feed from people you follow

**Vibe:** You're the person other treasure hunters ask for advice. The dashboard is your reputation and status card.

---

### Grandmaster (12,000+ XP) — "You've Mastered the Hunt"

**Emotional Tone:**  
Elite status, mastery, legacy. You're at the top. The dashboard is a command center that respects your time and expertise. Clutter is removed; only the most important info and highest-leverage actions are visible. Perks are extraordinary (free Hunt Pass forever, exclusive cosmetics, early access to rare inventory). The dashboard says: "You've earned the top tier. Here's what you can do that no one else can."

**Visual Personality:**
- Refined, minimal design (respect your expertise—you don't need hand-holding)
- Visual distinction from all other tiers: signature colors, exclusive badge variants, premium iconography
- XP stats are visible but not central (you're already at the top; growth is secondary)
- Exclusive perks listed clearly: free Hunt Pass forever, tier-locked cosmetics, early access mechanics
- High-leverage actions are front and center (publish guides, mentor other hunters, claim exclusive drops)
- Leaderboard position and achievements are subtle but unmissable
- Optional power-user features: XP sinks (rarity boosts, bounty visibility boosts), advanced filtering, custom collections

**Vibe:** You're the grandmaster of the hunt. The dashboard gets out of your way and gives you the tools to stay on top.

---

## Section 2: Card Prioritization by Rank

This section defines which widgets and cards should be **prominent, secondary, or hidden** at each rank tier. "Prominent" = above the fold, high visual weight. "Secondary" = visible but lower priority, below fold on mobile. "Hidden" = not shown to this tier.

### Initiate (0–499 XP)

| Widget | Priority | Placement | Notes |
|--------|----------|-----------|-------|
| **Welcome Message + Onboarding Prompt** | Prominent | Top, full-width card | "Ready for your first treasure hunt?" with CTA |
| **First Sale Tips** | Prominent | Hero section | 3–4 actionable tips (e.g., "Check sale hours before you go", "Bring cash and small bills") |
| **XP Progress to Scout** | Prominent | Highlighted card, % bar | "500 XP to Scout — unlock 45-minute holds" |
| **Your First Treasure Hunt Checklist** | Prominent | Expandable card | 5-step pre-visit checklist (e.g., check address, read reviews, set budget) |
| **Nearby Sales This Weekend** | Prominent | Scrollable grid or list | 3–5 recommended sales; highlight Initiate-friendly ones (established organizers, good reviews) |
| **What You Can Do (Initiate Perks)** | Secondary | Card below primary section | "Base features: browse sales, save items, write reviews, post hauls" |
| **Trending Hauls** | Secondary | Small grid, 3 items | Show engaging hauls from all ranks to inspire |
| **Quick Start Links** | Secondary | Simple link row | Browse sales, set location preferences, complete profile |
| **Saved Items** | Hidden for new users | — | Show if shopper has any saved; otherwise, recommend saving an item |
| **Hunt Pass Upsell** | Secondary | Soft card, not aggressive | "Hunt Pass members earn XP 1.5x faster" (not blocking) |
| **Leaderboard** | Hidden | — | Not relevant yet |
| **Your Stats** | Hidden | — | Too early |

**Mobile-first notes:** Stack cards vertically. One prominent primary action per card. Whitespace is generous. No complex interactions—taps lead directly to actions, not modals.

---

### Scout (500–1,999 XP)

| Widget | Priority | Placement | Notes |
|--------|----------|-----------|-------|
| **XP Progress to Ranger** | Prominent | Progress bar with unlock preview | "1,500 XP to Ranger — unlock custom colors & guides" |
| **Nearby Sales (Personalized)** | Prominent | Scrollable carousel or grid | Use visit history + saved items to recommend sales; highlight sales with items in user's favorite categories |
| **Seasonal Challenges** | Prominent | Call-out card with icon | "Easy Challenge Available: Attend 3 sales" (unlock: 100 XP) |
| **Your Perks (Scout Unlocked)** | Secondary | Collapsible card | List perks: "45-min holds, seasonal challenges, cosmetic color unlock" |
| **Recent Hauls (Community)** | Secondary | Small grid, 4–6 recent hauls | Show hauls from scouts and above; encourage user to post their own |
| **Hunt Pass Offer** | Secondary | Softer upsell, value-focused | "Hunt Pass members earn XP 1.5x faster — saves you 500 XP to reach Ranger" |
| **Trending Hauls** | Secondary | Grid, 4–6 items | Seasonal or category-based |
| **Saved Items** | Secondary | Show count + link | "You're watching 8 items — refresh to see if any are still available" |
| **Quick Actions** | Secondary | 2-3 icon buttons | Save item, post haul, write review |
| **Leaderboard** | Hidden | — | Still too early |
| **Your Stats** | Hidden | — | Still minimal |

**Mobile-first notes:** Seasonal challenges should have a distinct visual treatment (color, icon, animation). Carousels swipeable with thumb. Saved items should be accessible via quick link.

---

### Ranger (2,000–4,999 XP)

| Widget | Priority | Placement | Notes |
|--------|----------|-----------|-------|
| **XP Progress to Sage** | Prominent | Progress bar with milestone breakdown | "3,000 XP to Sage — unlock leaderboard visibility & appraisal access" |
| **Your Saved Items** | Prominent | Smart list or carousel | Group by category or organizer; show stock status, prices, notes you added |
| **Collections (Custom)** | Prominent | List or grid tabs | Show user-created collections (e.g., "Mid-Century Furniture", "Vintage Kitchenware") |
| **Haul History** | Prominent | Monthly summary or recent list | "You posted 6 hauls this month — 120 likes total" |
| **Guides You're Writing/Published** | Secondary | Collapsible section | List published guides with like count; show draft status |
| **Your Stats** | Secondary | Summary card | Total XP, purchases, reviews written, items graded; no leaderboard rank yet |
| **Nearby Sales (Curated)** | Secondary | Smart list based on saved items | "3 sales this weekend have items matching your collections" |
| **Seasonal Challenges Progress** | Secondary | Compact progress cards | Show which challenges you're close to completing |
| **Reviews You've Written** | Secondary | Count + link to see them | "15 reviews — 120 likes" |
| **Hunt Pass Option** | Secondary | Subtle card | "Hunt Pass: earn XP 1.5x faster + early challenges access" |
| **Community Mentions** | Secondary | Small section if applicable | "5 people liked your haul about mid-century finds" |
| **Leaderboard** | Hidden | — | Not yet visible |

**Mobile-first notes:** Collections should be swipeable tabs. Haul history should show thumbnails of items. Guides should have visual badges (draft/published). One-tap access to your reviews and stats.

---

### Sage (5,000–11,999 XP)

| Widget | Priority | Placement | Notes |
|--------|----------|-----------|-------|
| **Leaderboard Position** | Prominent | Large card at top with visual hierarchy | Seasonal rank (e.g., "Ranked #47 This Season — 8,500 XP"), badge count, status |
| **Your Influence** | Prominent | Summary metrics | "42 reviews, 850+ likes, 12 guides, 95 followers" |
| **Your Collections** | Prominent | Grid view with cover image | Highlight most-followed or most-active collections |
| **Appraisal Requests** | Prominent | Call-out card if any pending | "3 community members asked about these items" |
| **Your Saved Items** | Secondary | Scrollable, grouped by status | Organize by urgency, category, or organizer |
| **Haul History** | Secondary | Monthly summary with trends | "Your hauls averaged 45 likes this month (↑ 12% vs last month)" |
| **Guides & Expertise** | Secondary | Show published guides + like counts | Option to pin top guides |
| **Nearby Sales (Expert Curated)** | Secondary | Highly personalized list | "Based on your collections, these 5 sales have rare finds for you" |
| **Seasonal Challenges Status** | Secondary | Compact progress cards | Show which challenges you've completed + earned XP |
| **Your Stats** | Secondary | Detailed summary | Total XP, lifetime purchases, total reviews, guides published, followers, collections created |
| **Hunt Pass (If Subscribed)** | Secondary | Status + renewal date | "Active — renews April 30" |
| **Community Mentions & Activity** | Secondary | Feed of recent engagement | "5 people followed you", "Your guide was recommended in category X" |
| **Exclusive Perks (Sage)** | Secondary | Subtle card | Early access to special drops, appraisal request priority, mentor badge eligibility |

**Mobile-first notes:** Leaderboard card should use a large rank number and color-coded badge. Influence metrics should be in a scannable format (icons + numbers). Appraisal requests should have a distinct visual treatment. Collections should show cover images and follower counts.

---

### Grandmaster (12,000+ XP)

| Widget | Priority | Placement | Notes |
|--------|----------|-----------|-------|
| **Status & Achievements** | Prominent | Premium card at top | "Grandmaster — 15,200 XP | #5 All-Time | Free Hunt Pass Forever" with Grandmaster badge |
| **Exclusive Perks & Access** | Prominent | Feature card | "You have: Free Hunt Pass (forever), exclusive cosmetics, early access to rare drops, mentor privileges" |
| **Your Dominance Stats** | Prominent | Metric cards | Lifetime purchases, all-time XP rank, reviews written, guides published, collections created, followers |
| **Your Collections** | Prominent | Gallery view with follower counts | Show top collections by followers/likes; option to feature or archive |
| **Leaderboard Tier** | Prominent | Visual rank card | "Top 5 All-Time | 15,200 XP | [Seasonal Position]" |
| **Appraisal Requests** | Secondary | If any pending | "8 community members requested your expertise" |
| **Guides & Expertise** | Secondary | Curated list of your best-performing guides | Highlight guides by like count, follower engagement, or recency |
| **Power User Tools (XP Sinks)** | Secondary | Collapsible section | "Use your XP: rarity boosts (15 XP), bounty visibility boosts (5 XP), early access boost (75 XP)" |
| **Haul History** | Secondary | Compact monthly summary | Trending items, average likes, subscriber-only hauls option |
| **Saved Items** | Secondary | Smart list; minimal | Only if active watching |
| **Community Contributions** | Secondary | Dashboard of impact | "Your contributions: 127 reviews, 15 guides, 450+ followers, 2,300+ haul likes, 5 mentor sessions" |
| **Nearby Sales** | Hidden unless subscribed to alerts | — | Not central to experience; optional feed |
| **Onboarding or Tips** | Hidden | — | None; you're an expert |

**Mobile-first notes:** Status card should be distinctly styled (premium gradient, exclusive badge). Perks should be scannable (checkmarks, icons, text). Power user tools should be subtle but accessible. Collections should be searchable or filterable.

---

## Section 3: Perks Communication Strategy

**Goal:** Make rank progression feel rewarding. Shoppers should know exactly what perks they've unlocked, what's coming next, and how to reach the next tier. All perks are defined in the Explorer's Guild Master Spec (2026-04-06).

### Recommended Approach: Tiered Multi-Channel System

We recommend a **three-channel approach** to communicate perks:

1. **On-Dashboard Unlock Bar (Primary — all ranks except Grandmaster)**  
   Visible at the top of the dashboard. Shows current rank, current XP, XP to next rank, and **one specific unlock preview**. Non-intrusive, always present.

2. **Rank-Up Celebration Modal (Secondary — triggered once per rank-up)**  
   When a shopper reaches a new rank, show a full-screen or modal celebration that lists all new perks. Celebratory tone. Can be dismissed; shown only once per rank-up.

3. **Persistent "Your Perks" Card (Tertiary — always accessible)**  
   A collapsible or tab-accessible card on the dashboard that lists all unlocked perks for the current rank. Serves as a reference guide.

### Implementation Details

#### Channel 1: Dashboard Unlock Bar (Top of Dashboard)

**Copy Structure:**
```
[RANK NAME] — [CURRENT XP] / [RANK FLOOR]
[PROGRESS BAR: % complete toward next rank]
[NEXT UNLOCK PREVIEW]
```

**Example for Scout:**
```
Scout — 1,250 / 2,000 XP
[████████░░░░░░░░░░ 62% complete]
750 XP to Ranger — unlock custom colors & guides
```

**Design Notes:**
- Use rank-specific color (Initiate = warm blue, Scout = teal, Ranger = purple, Sage = gold, Grandmaster = platinum)
- Progress bar fills as XP increases
- Next unlock preview is **specific and concrete** (not vague like "new features")
- On mobile: compact horizontal bar; on desktop: slightly larger with more breathing room
- **Not dismissible** — always visible as motivation

#### Channel 2: Rank-Up Modal (One-Time Per Rank)

**Trigger:** When `currentXP >= rankFloor[newRank]`

**Content Structure:**
```
[CELEBRATORY HEADLINE]
"You've reached [RANK NAME]! 🎉"

[VISUAL ELEMENT]
Rank badge or icon (premium styling for higher ranks)

[PERKS LIST]
✓ [Perk 1 — brief description]
✓ [Perk 2 — brief description]
✓ [Perk 3 — brief description]
[... up to 5 perks, not more]

[SECONDARY COPY]
Encouraging message about what this rank enables

[CTA BUTTON]
"Got it" or "Explore [Rank Name] features"
```

**Examples:**

**Scout Rank-Up:**
```
You've become a Scout! 🎉
Welcome to the inner circle.

✓ Hold sales for 45 minutes (instead of 30)
✓ Unlock seasonal challenges + earn 100 XP
✓ Customize your username color
✓ Boost haul visibility for 7 days (costs 10 XP)

You're no longer just browsing—you're building a hunt strategy.
```

**Sage Rank-Up:**
```
You're now a Sage! 🏆
The community trusts your expertise.

✓ Leaderboard visibility — see your ranking
✓ Appraisal requests — others ask for your insights
✓ Mentor privileges — guide new hunters
✓ Early access to rare drops & special events
✓ Custom frame badge (Sage-exclusive)

Your opinions matter. Your guides help the community. Keep it up.
```

**Grandmaster Rank-Up:**
```
You've reached Grandmaster! ✨
You've mastered the hunt.

✓ Free Hunt Pass forever ($4.99/month value)
✓ Exclusive Grandmaster cosmetics & badges
✓ Early access to all rare inventory drops
✓ Lifetime mentor privileges
✓ Advanced XP sinks (rarity boosts, visibility power-ups)

You're at the top. Only the rarest treasures and the most exclusive community privileges await.
```

**Design Notes:**
- Modal is fullscreen on mobile, smaller on desktop (center-aligned with backdrop blur)
- Shown once per rank-up; user can re-visit perks card to see again
- Celebratory but on-brand (warm, treasure-hunt aesthetic, not generic confetti)

#### Channel 3: Persistent "Your Perks" Reference Card

**Placement:** Visible on every dashboard load, but collapsible/minimizable. Mobile: below primary content or in a tab. Desktop: right sidebar or below fold.

**Content Structure:**
```
[TAB/CARD HEADER]
Your Perks — [RANK NAME]

[PERKS LIST — organized by category]

Category: Holds & Access
• [Perk 1]
• [Perk 2]

Category: Cosmetics & Status
• [Perk 3]
• [Perk 4]

Category: Community & Influence
• [Perk 5]

[FOOTER]
"See what you'll unlock at [NEXT RANK]" (link to next rank's perks)
```

**Example for Ranger:**
```
Your Perks — Ranger

✓ Holds & Access
  • Hold sales for 60 minutes (vs 45 at Scout)
  
✓ Customization
  • Custom username color (20+ color options)
  • Custom frame badge (Ranger-exclusive designs)
  
✓ Content Creation
  • Publish hunting guides (30 XP to unlock)
  
✓ Community
  • Write reviews that count toward Ranger reputation
  • Save unlimited items in custom collections

What's next? Reach Sage (5,000 XP total) to unlock:
• Leaderboard visibility
• Appraisal request access
```

**Design Notes:**
- Clear visual hierarchy: main perks prominent, flavor text smaller
- Uses checkmarks or icons to signal "unlocked"
- Simple, scannable format (not walls of text)
- Link to next rank's perks is subtle but present
- On mobile: single-column layout, swipe to see more
- On desktop: grid or list layout, 2–3 column max

---

## Section 4: Mobile-First Layout & Interaction Patterns

FindA.Sale shoppers are primarily on mobile (phone in hand at a sale). The dashboard must be:
- **Thumb-reachable:** Primary actions in the middle-to-lower half of the screen
- **Swipeable:** Carousels and list cards use horizontal scroll; easy to navigate with one hand
- **Scannable:** Information hierarchy is clear; no cognitive overload
- **Fast:** Minimal taps to reach an action (2–3 taps max)

### Core Mobile Layout Pattern

**Dashboard = Vertical Stack of Cards:**

```
[STATUS BAR — rank, XP progress, unlock preview]
[PRIMARY CARD — top priority widget for this rank]
  [SECONDARY CARD — second priority]
  [SECONDARY CARD — third priority]
  [TERTIARY CARD — nice-to-have]
  [FOOTER — more options link]
```

### Example: Scout Mobile Dashboard Layout

```
┌─────────────────────────┐
│  Scout  │ 1,250 / 2,000 XP
│  ████████░░░░░░░░░░ 62%
│  750 XP to Ranger
└─────────────────────────┘
     ↓ (tap for details)

┌─────────────────────────┐
│  SEASONAL CHALLENGES    │
│  [Easy: Attend 3 sales] │
│  Progress: 2/3          │
│  Reward: 100 XP         │
│  [Tap to Join] ────→    │
└─────────────────────────┘

┌─────────────────────────┐
│  NEARBY SALES TODAY     │
│  ← Swipe for more →     │
│                         │
│  [Sale 1] [Sale 2] ...  │
│  (carousel, thumb-sized)│
└─────────────────────────┘

┌─────────────────────────┐
│  TRENDING HAULS         │
│  ← Swipe for more →     │
│                         │
│  [Haul 1] [Haul 2] ...  │
│  (carousel, images)     │
└─────────────────────────┘

┌─────────────────────────┐
│  YOUR PERKS             │
│  ✓ 45-min holds         │
│  ✓ Seasonal challenges  │
│  ✓ Color unlock         │
│  [Learn more...] ────→  │
└─────────────────────────┘

[FOOTER LINKS]
Browse all sales | Write a review | See your stats
```

### Touch Target Sizes (Per Material Design)

- **Buttons & Tap Areas:** Minimum 44x44 px (iOS) / 48x48 px (Android)
- **Card Padding:** 16px minimum margin between thumb-reachable zones
- **Carousel Items:** Width = screen width - 32px (left/right margin); thumb swipe = 3-4 items visible
- **List Item Height:** 48–56 px for easy single-tap access

### Interaction Patterns by Card Type

#### Pattern 1: Status/Progress Bar
- **Visual:** Horizontal bar with percentage fill, rank name, numeric display
- **Interaction:** Tap to expand and see full perks list
- **State:** Always visible, non-dismissible

#### Pattern 2: Call-Out Card (Challenges, Appraisals, Exclusive)
- **Visual:** Distinct background color, icon, headline, brief copy, CTA button
- **Interaction:** Tap card or CTA button to open detail view or launch action
- **State:** Collapsible on mobile; full width

#### Pattern 3: Carousel (Hauls, Sales, Collections)
- **Visual:** Horizontal scroll, 3–4 items visible, snaps to next item
- **Interaction:** Swipe horizontally; tap item to detail view
- **State:** Auto-snaps after swipe; no sticky headers

#### Pattern 4: List (Saved Items, Guides, Reviews)
- **Visual:** Vertical stack, thumbnail + title + metadata, chevron/arrow
- **Interaction:** Tap to detail view; swipe to reveal secondary actions (save, share, delete)
- **State:** List persists; no auto-dismiss

#### Pattern 5: Collapsible Section (Your Perks, Your Stats, More Options)
- **Visual:** Headline + collapse/expand icon; expands to show content
- **Interaction:** Tap header to toggle; tap item within to open detail
- **State:** Expanded by default on first load; user can collapse to save space

### Example: Rank-Up Modal Mobile View

```
┌────────────────────────────┐
│  [BACKDROP BLUR]           │
│                            │
│  ┌────────────────────┐    │
│  │                    │    │
│  │  🎉  YOU'VE BECOME │    │
│  │      A SCOUT!      │    │
│  │                    │    │
│  │  [Rank Badge]      │    │
│  │                    │    │
│  │  ✓ 45-min holds    │    │
│  │  ✓ Challenges      │    │
│  │  ✓ Color unlock    │    │
│  │  ✓ Haul boosts     │    │
│  │                    │    │
│  │  Welcome to the    │    │
│  │  inner circle.     │    │
│  │                    │    │
│  │  [Got it button]   │    │
│  │                    │    │
│  └────────────────────┘    │
│                            │
└────────────────────────────┘
```

---

## Section 5: Zero State Design (Initiate — First Login)

When a new shopper logs in with zero XP, zero purchases, zero saved items, the dashboard should feel **exciting and welcoming**, not empty.

### Zero State Goals
- **Celebrate arrival:** Make the user feel welcomed to the community
- **Set expectations:** Show what's possible (hauls, challenges, purchases, guides)
- **Provide clear next steps:** What should they do first?
- **Avoid fear:** "I have nothing yet" should not feel like failure

### Zero State Layout

```
┌────────────────────────────┐
│  Welcome Message           │
│  "Welcome to FindA.Sale"   │
│  "Your treasure hunt       │
│   starts here."            │
│  (warm, friendly image)    │
└────────────────────────────┘

┌────────────────────────────┐
│  XP PROGRESS               │
│  Initiate — 0 / 500 XP     │
│  ░░░░░░░░░░░░░░░░░░░░░░░░ │
│  500 XP to Scout!          │
│  "Start with your first    │
│   purchase and you're      │
│   5% of the way there."    │
└────────────────────────────┘

┌────────────────────────────┐
│  GET STARTED (3 Steps)     │
│  1. Find a sale nearby     │
│     [Browse Sales] ──→     │
│  2. Visit & find a         │
│     treasure               │
│  3. Post your haul or      │
│     write a review         │
│     (Earn XP!)             │
└────────────────────────────┘

┌────────────────────────────┐
│  NEARBY SALES THIS         │
│  WEEKEND                   │
│  ← Swipe for more →        │
│  [Sale 1] [Sale 2] ...     │
│  (carousel)                │
└────────────────────────────┘

┌────────────────────────────┐
│  INSPIRATION: TRENDING     │
│  HAULS FROM THE            │
│  COMMUNITY                 │
│  ← Swipe for more →        │
│  [Haul 1] [Haul 2] ...     │
│  (carousel with images)    │
│  "See what other hunters   │
│   are finding"             │
└────────────────────────────┘

┌────────────────────────────┐
│  HOW EXPLORER'S GUILD      │
│  WORKS (Expanded)          │
│  • Earn XP for purchases,  │
│    visits, reviews         │
│  • Climb ranks Initiate → │
│    Grandmaster             │
│  • Unlock perks, cosmetics,│
│    exclusive access        │
│  [Learn More] ──→          │
└────────────────────────────┘

[FOOTER]
Questions? See FAQ | Read guides | Contact support
```

### Zero State Copy Examples

**Welcome Section:**
> "Welcome to FindA.Sale. You're about to join thousands of treasure hunters in Grand Rapids discovering estate sales, garage sales, auctions, and more. Let's get you started."

**Get Started Steps:**
> "1. **Find a sale nearby** — Browse sales happening this weekend  
> 2. **Visit and hunt** — Explore, chat with organizers, find your treasure  
> 3. **Post your haul** — Share what you found and earn XP  
> 
> Every haul, purchase, and review earns XP. Reach 500 XP to become a Scout and unlock new perks."

**Inspiration Section:**
> "Explore what other hunters are finding in your neighborhood. Save items you love—you can hold them at checkout or grab them before anyone else."

### Zero State Visual Treatment

- **Hero Image:** Warm, authentic photo of a shopper at a sale finding something they love (not stock photo)
- **Color Palette:** Warm, inviting; use FindA.Sale brand colors
- **Typography:** Large, clear headlines; conversational body copy
- **Icons:** Simple, friendly icons for steps and categories
- **No Clutter:** Only 4–5 sections max; generous whitespace

### Transition from Zero State

Once the user completes their **first action** (visit a sale, save an item, view a sale, write a review), the dashboard transitions to the Scout/Initiate layout with that widget positioned prominently.

**Example:** If user saves an item before visiting a sale, "Your Saved Items" becomes a secondary card on the dashboard. If user visits first, "Nearby Sales" remains prominent but now shows "You visited 1 sale — great start!"

---

## Section 6: Brand Voice & Tone in Dashboard Copy

All dashboard copy must adhere to the Brand Voice Guide (2026-03-16). Key principles:

### Voice Attributes
- **Helpful:** Explain next steps clearly
- **Honest:** No artificial pressure or false scarcity
- **Inclusive:** All ranks are valued; no gatekeeping language
- **Curious:** Celebrate the hunt and discovery
- **Warm:** Conversational tone; feel like a friend

### Copy Dos & Don'ts

**DO:**
✅ "You're 500 XP from Scout. Start with your first purchase—every dollar counts."  
✅ "Seasonal challenges are live. Earn 100 XP by visiting 3 sales this month."  
✅ "Your haul got 45 likes! Great finds."  
✅ "Organizers trust you. Three people asked for your expert opinion."  

**DON'T:**
❌ "Only 500 XP remaining to advance" (sounds arbitrary)  
❌ "UNLOCK SCOUT NOW" (high-pressure)  
❌ "Elite hunters only" (gatekeeping)  
❌ "You've earned a rank-up reward" (feels transactional)  

### Rank-Specific Tone Shifts

**Initiate:** Encouraging, guided, excited
> "You're off to a great start. Here's what's next..."

**Scout:** Supportive, momentum-focused, discovery-oriented
> "You're in the groove now. Here's what's trending in your area..."

**Ranger:** Respectful, recognition-based, expertise-acknowledging
> "Your collections are impressive. Here's what matches your taste..."

**Sage:** Authoritative, community-focused, leadership-emphasizing
> "Your opinions matter. The community is watching..."

**Grandmaster:** Reverent, minimal, elite-honoring
> "You've mastered the hunt. Early access to rare drops is live."

---

## Section 7: Implementation Checklist for Dev

Before building, verify these components and systems exist or are defined:

### Data Requirements
- [ ] User rank tier stored in `shopper.guildRank` or similar
- [ ] Current XP for user stored and queryable
- [ ] XP thresholds for each rank (already defined in Master Spec)
- [ ] Perks list per rank (already defined in Master Spec)
- [ ] User's unlocked perks (computed from rank)
- [ ] "First rank-up" flag to show modal once per tier
- [ ] User's saved items count
- [ ] User's haul posts count and recent 5
- [ ] User's reviews written count
- [ ] User's guides written count (if applicable)
- [ ] Nearby sales (geolocation or user preference)
- [ ] Trending community hauls (last 7 days, sorted by likes)
- [ ] Seasonal challenge data (active challenge, progress, rewards)
- [ ] Leaderboard position (for Sage+)

### Components to Build
- [ ] RankProgressBar (displays rank name, XP, progress bar, next unlock)
- [ ] PerksCard (collapsible or tabbed, shows unlocked perks per rank)
- [ ] RankUpModal (celebration modal, triggered once per rank-up)
- [ ] NearbySalesCard (carousel or grid, mobile-optimized)
- [ ] TrendingHaulsCard (carousel, image-heavy, mobile-optimized)
- [ ] SeasonalChallengesCard (call-out, progress bar, CTA)
- [ ] SavedItemsCard (smart list, grouped by status or category)
- [ ] YourStatsCard (metric summary: purchases, reviews, guides, etc.)
- [ ] LeaderboardCard (rank position, for Sage+ only)
- [ ] AppraisalRequestsCard (call-out, for Sage+ only)
- [ ] CollectionsCard (gallery or list, for Ranger+)
- [ ] GuidesCard (list of published/draft guides, for Ranger+)
- [ ] ZeroStateLayout (full welcome sequence for Initiate with 0 XP)

### Responsive Design Requirements
- [ ] Mobile: cards stack vertically; 1-column layout
- [ ] Tablet: cards 1–2 columns depending on card width
- [ ] Desktop: cards can be 2–3 columns or sidebar layout
- [ ] Carousels: swipeable on mobile, clickable arrows on desktop
- [ ] Touch targets: 44–48 px minimum
- [ ] Safe area padding: 16px on mobile, 24px on desktop

### Accessibility Checklist
- [ ] ARIA labels on expandable sections
- [ ] Color contrast: WCAG AA minimum (perks cards, status bar)
- [ ] Keyboard navigation: tabs/focus visible on all interactive elements
- [ ] Semantic HTML: `<main>`, `<section>`, headings hierarchy (h1 → h3)
- [ ] Alt text on all images (haul thumbnails, organizer photos, etc.)

### Testing Scenarios
- [ ] Initiate with 0 XP (zero state)
- [ ] Initiate at 450 XP (near Scout threshold)
- [ ] Scout with active seasonal challenge
- [ ] Scout without any saved items
- [ ] Ranger with multiple collections
- [ ] Ranger with published guides
- [ ] Sage with high leaderboard position
- [ ] Sage with pending appraisal requests
- [ ] Grandmaster with free Hunt Pass active
- [ ] Dark mode appearance for all ranks
- [ ] Mobile (iOS & Android) touch interactions

---

## Section 8: Success Metrics & Measurement

After launch, track these metrics to validate the rank-tiered dashboard design:

### Engagement Metrics
- **Rank-Up Completion Rate:** % of Initiates who reach Scout within 30 days (target: 40%+)
- **Dashboard Return Rate:** % of daily users returning to dashboard after rank-up (target: 60%+)
- **Perks Card Expansion Rate:** % of users who expand "Your Perks" card (target: 45%+)
- **Modal Completion Rate:** % of users who interact with rank-up modal vs dismiss (target: 75%+)

### Behavior Metrics
- **Post-Rank-Up Action Rate:** % of users who complete a ranked-specific action within 7 days (target: 50%+)
  - Example: Scout reaching > 45-min hold, Ranger publishing guide
- **Seasonal Challenge Enrollment:** % of eligible users (Scout+) joining seasonal challenges (target: 35%+)
- **Guide Publication Rate (Ranger+):** % of Ranger-tier users publishing guides (target: 15%+)

### Business Metrics
- **Hunt Pass Conversion:** % of Scout/Ranger users subscribing to Hunt Pass (target: 8%+)
- **Lifetime Haul Posts (per rank):** Average hauls posted by Ranger vs Initiate (target: 2.5x increase)

### Qualitative Feedback (Post-Launch)
- **NPS on Rank Experience:** "How likely are you to recommend the Explorer's Guild to friends?" (target: 7+/10)
- **Perks Clarity:** "I understand what perks I've unlocked" (target: 85%+ agree)
- **Motivation to Rank-Up:** "I feel motivated to progress to the next rank" (target: 70%+ agree)

---

## Glossary of Terms

| Term | Definition |
|------|-----------|
| **Rank / Tier** | One of five progression levels in Explorer's Guild: Initiate, Scout, Ranger, Sage, Grandmaster |
| **XP (Experience Points)** | Currency earned through purchases, visits, reviews, hauls, and other actions; required to progress ranks |
| **Spending Floor** | Minimum XP required to maintain a rank; prevents players from rank-downgrading via XP sinks |
| **Haul** | User-generated post showing items purchased or found at a sale; includes photos and descriptions |
| **Hunt Pass** | Premium subscription ($4.99/mo) that grants 1.5x XP multiplier, early challenge access, and exclusive cosmetics |
| **Perks** | Benefits unlocked by reaching each rank (holds duration, cosmetics, community features, etc.) |
| **Cosmetics** | Visual customizations earned through rank progression (username colors, frame badges, exclusive designs) |
| **Appraisal Requests** | Community members asking Sage+ shoppers for expert opinions on item value or authenticity |
| **Seasonal Challenge** | Limited-time goals (e.g., "visit 3 sales") completed for XP rewards; resets annually |
| **Leaderboard** | Visible ranking of Sage+ users by seasonal XP or all-time achievement |
| **Collections** | Custom groupings of saved items by category (e.g., "Mid-Century Furniture") |
| **Guides** | User-published tips, hunting strategies, or educational content (available at Ranger tier) |
| **Collector Passport** | Specialty system rewarding purchases across diverse item categories (future phase) |
| **Treasure Trails** | Curated multi-stop local experiences combining sales with community landmarks (future phase) |

---

## Appendix: Sample Dashboard States by Rank

### Appendix A: Initiate (0 XP) — Zero State
*See Section 5 for full zero state layout.*

### Appendix B: Scout (850 XP / 500–1,999)
*Primary cards:* Seasonal Challenges, Nearby Sales, Trending Hauls  
*Secondary cards:* Your Perks (Scout), Hunt Pass offer  
*Progress bar:* 850 XP toward Ranger (1,150 remaining)  

### Appendix C: Ranger (3,500 XP / 2,000–4,999)
*Primary cards:* Saved Items, Collections, Haul History  
*Secondary cards:* Guides (published/drafts), Your Stats, Nearby Sales, Challenges Progress  
*Progress bar:* 3,500 XP toward Sage (1,500 remaining)  

### Appendix D: Sage (7,200 XP / 5,000–11,999)
*Primary cards:* Leaderboard Position, Your Influence (metrics), Collections  
*Secondary cards:* Appraisal Requests (if any), Saved Items, Haul History, Guides, Stats  
*Progress bar:* 7,200 XP toward Grandmaster (4,800 remaining)  

### Appendix E: Grandmaster (15,200 XP / 12,000+)
*Primary cards:* Status & Achievements, Exclusive Perks & Access, Your Dominance Stats  
*Secondary cards:* Collections, Leaderboard Tier, Appraisal Requests (if any), Guides, Power User Tools  
*Progress bar:* Replaced with "All-Time Rank: #5" and "Free Hunt Pass: Forever"  

---

## Document Ownership & Revision History

| Date | Author | Change | Status |
|------|--------|--------|--------|
| 2026-04-13 | UX Brief Author | Initial creative brief | Ready for Architect |

**Next Steps:**
1. Architect review → architecture/system design doc
2. Dev handoff → implementation brief with component specs
3. QA planning → per-rank test scenarios + browser verification
4. Design system → component tokens (colors, spacing, typography by rank)

---

**End of Brief**

For questions, refer to the Brand Voice Guide (2026-03-16), Explorer's Guild Master Spec (2026-04-06), or contact Patrick directly.
