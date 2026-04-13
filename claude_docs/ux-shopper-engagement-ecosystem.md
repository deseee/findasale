# UX Spec: Shopper Engagement Ecosystem (4-Page Audit & Architecture)

**Status:** Strategic UX Spec (Not Implementation)  
**Date:** 2026-04-11  
**Scope:** Pages: `/shopper/dashboard`, `/shopper/loyalty`, `/shopper/explorer-passport`, `/shopper/hunt-pass`  
**Plus:** `/shopper/loot-legend`, `/shopper/league`, nav structure, and related gamification pages.

---

## Executive Summary

FindA.Sale has **4 overlapping shopper engagement pages** that confuse users about their roles and interplay. The current state mixes three systems (guildXp, Explorer Rank progression, Hunt Pass subscription) across pages with unclear hierarchy, redundant information, and fragmented navigation.

**Key Findings:**
- **Loyalty** and **Dashboard** both show XP + rank + progress — unclear why they're separate
- **Explorer Passport** is identity/discovery config — different job but shares XP display space
- **Hunt Pass** is upsell page + benefits list — should split into "why buy" vs. "how to earn/spend"
- Nav has 4 separate links when 2–3 would suffice
- Missing info: "Where do I spend XP?" answer is fragmented across pages
- Loot Legend and Collector's League are Hunt Pass-gated perks, but don't appear in Hunt Pass page

**Recommendation:** 3-page structure with 1 split, not 4 separate pages.

---

## Current State Audit

### Page 1: `/shopper/loyalty` (Explorer's Guild Passport)

**Current Job-to-be-Done:** Show shopper their rank, XP progress, and how to earn/spend XP.

**Sections:**
1. Header ("Explorer's Guild Passport")
2. XP + Rank Card (display current rank, total XP, progress to next rank)
3. Streak Widget (weekly activity counter)
4. How to Earn XP (3-item grid: scan +10, visit +5, purchase +25)
5. Spend Your Guild XP (2 cards: Discount Coupon 20 XP, Rarity Boost 15 XP)
6. Current Tier Card (display tier emoji, stamps total, progress %)
7. Your Stamps (breakdown grid)
8. Milestones & Badges (achievements earned)
9. Hunt Pass CTA ("🎯 Hunt Pass Exclusive" section + links to loot-legend + league)
10. Explorer's Guild Perks (4-item feature grid)
11. CTA ("Ready to earn more? Browse Sales")
12. Achievement Badges Section (if any)
13. Onboarding Modal (first visit flow)

**Strengths:**
- Comprehensive all-in-one view of the system
- Clear earn/spend mechanics
- Streak widget creates engagement
- Onboarding modal educates new users
- Achievements display is motivating

**Problems:**
- **Naming confusion:** "Loyalty" != "Guild" — page header says "Explorer's Guild Passport" but URL says `loyalty`
- **Information overload:** 13 sections crammed into one page
- **Stamps vs. XP confusion:** Two parallel currency systems visible (stamps + XP) with different rules
- **Redundant with Dashboard:** Dashboard also shows XP + rank + progress bar
- **Hunt Pass positioning:** Buried at position 9 as a section, not featured
- **Loot Legend/League mentioned** but only in a Hunt Pass banner — no full integration
- **Missing action:** No clear button to "spend XP" from this page (only from the cards)

---

### Page 2: `/shopper/dashboard` (Shopper Dashboard)

**Current Job-to-be-Done:** Show shopper their activity, purchases, wishlist, pickup appointments, and subscription status.

**Sections (6 tabs: overview, purchases, subscribed, pickups, brands):**
1. Overview Tab:
   - Activity Summary (favorite counts, purchase counts, streak points)
   - Sales Near You
   - Recently Viewed Items
   - Flash Deals Banner
   - Wishlist Previews
   - Notification Preferences Toggle
   - Pickup Appointments
   - XP Rank Progress (RankBadge + RankProgressBar) ← **ALSO HERE**
   - Streak Widget ← **ALSO HERE**
   - Achievement Badges (if earned) ← **ALSO HERE**
   - Guild Onboarding Banner (if first visit)
   - Referral CTA
   - Hunt Pass CTA
2. Purchases Tab: Purchase history + refund status
3. Subscribed Tab: Sales user is subscribed to
4. Pickups Tab: MyPickupAppointments component
5. Brands Tab: BrandFollowManager

**Strengths:**
- True "dashboard" aggregating activity + transactions
- Tab navigation handles multiple contexts
- Pickup management is practical
- Referral + Hunt Pass CTAs visible

**Problems:**
- **Redundant XP/Rank display:** Shows RankBadge, RankProgressBar, and StreakWidget — all also on Loyalty page
- **No "how to earn/spend" guidance:** Missing the mechanics that Loyalty page teaches
- **Scatters gamification:** XP progress buried under activity summary, not featured
- **Upsell fatigue:** Multiple CTAs (referral, hunt pass, guild onboarding) competing for attention
- **Two homes for gamification:** Shopper now has two "home" pages for engagement (Dashboard + Loyalty)
- **Navigation confusion:** Which one should a shopper visit first?

---

### Page 3: `/shopper/explorer-passport` (Explorer Passport / Collector Identity)

**Current Job-to-be-Done:** Let shopper define their collecting interests and see matching items.

**Sections:**
1. Header with "finds" badge
2. Your Explorer Identity:
   - Bio textarea (optional)
   - Specialties (add/remove tags)
   - Item Categories (checkbox grid)
   - Keywords (add/remove tags)
   - Save button
3. My Matches (grid of items matching their profile)
4. Achievements Section (if any)
5. Notification Settings (email + push toggles)

**Strengths:**
- Clear editing interface for preferences
- Matches display is actionable
- Notification control is direct
- Separate from gamification concerns

**Problems:**
- **Naming conflict:** Page called "Explorer Passport" but Loyalty page is called "Explorer's Guild Passport"
  - Which is the real "passport"?
  - Shopper sees both nav items and confusion results
- **Info display only:** Shows `totalFinds` badge but no other rank/XP context
- **Orphaned from gamification:** Could reference their rank (e.g., "Scout explorers specialize in X category")
- **Achievements section** duplicates what Loyalty shows
- **No link to Loyalty:** Shopper discovers this page independently, not as part of the engagement flow

---

### Page 4: `/shopper/hunt-pass` (Hunt Pass Upsell + Benefits)

**Current Job-to-be-Done:** Convince shopper to buy $4.99/mo Hunt Pass subscription.

**Sections:**
1. Header ("Hunt Pass" + 👑 emoji)
2. Price Card ($4.99/mo + subscribe button)
3. What's Included (8 benefit cards):
   - 1.5x XP Multiplier
   - Treasure Hunt Pro (+10% XP per scan, 150 cap)
   - 6-Hour Early Access to Flash Deals
   - Rare Finds Pass (6h Rare / 12h Legendary early access)
   - Exclusive Hunt Pass Badge
   - Golden Trophy Avatar Frame
   - Hunt Pass Insider Newsletter
4. How to Earn XP (comprehensive table with standard/Hunt Pass multipliers)
5. How to Spend XP (Discount Coupon, Rarity Boost — same as Loyalty page)

**Strengths:**
- Clear value proposition ($4.99 price front-and-center)
- Comprehensive benefits list with emojis
- XP earn/spend table is educational for new users
- Matches Loyalty page mechanics for reference

**Problems:**
- **Upsell + education mixed:** Page tries to sell AND teach simultaneously
- **Loot Legend/League missing:** The page doesn't link to or mention `/shopper/loot-legend` or `/shopper/league`
  - These are critical Hunt Pass perks but users won't know they exist
- **Earn table is duplicate:** How to Earn XP section repeats Loyalty page info
- **No "how to use" for benefits:** Doesn't explain HOW to access Rare Finds, Loot Legend, or Collector's League
- **Subscribe button goes to modal:** No clear next step (modal content not visible in spec)
- **Doesn't explain rank thresholds:** "Sage/Grandmaster exclusives" mentioned in decisions but not shown here

---

### Pages 5–6: Hunt Pass Perks Pages

#### `/shopper/loot-legend` (Legendary Items Portfolio)

**Job-to-be-Done:** Show Hunt Pass members their purchased LEGENDARY + EPIC items in a portfolio.

**Sections:**
1. Header ("Loot Legend" / "Your Legendary Collection")
2. Hunt Pass gate (upgrade CTA if not active)
3. Trial banner (7-day free trial button)
4. Item grid (photo gallery of legendary/epic purchases)

**Strengths:**
- Tight focus on one collection
- Visual-first design (grid of photos)
- Trial activation option

**Problems:**
- **Orphaned from Hunt Pass page:** User won't know this exists
- **No context:** Doesn't explain why these items are "legendary" or how rarity works
- **No interaction:** Just a gallery, no detail view or actions

---

#### `/shopper/league` (Collector's League Leaderboard)

**Job-to-be-Done:** Show Hunt Pass members the top 50 XP holders (Collector's League leaderboard).

**Sections:**
1. Header ("Collector's League")
2. Hunt Pass gate
3. Top 50 leaderboard (position, name, rank, XP, hunt pass status)
4. Current user's position highlighted

**Strengths:**
- Competitive gamification (leaderboard)
- Shows Hunt Pass badge next to names
- Rank display contextualizes XP

**Problems:**
- **Orphaned from Hunt Pass page:** User won't know this exists
- **No incentive copy:** Doesn't explain why to chase the leaderboard
- **No badges/rewards:** Just position + XP, feels incomplete

---

## Three-System Breakdown

### System 1: guildXp (Earned Currency)

**Earn:**
- Visit a sale: +5 XP
- Scan an item: +10 XP
- Make a purchase: +25 XP
- Hunt Pass multiplier: 1.5x on all actions
- Daily treasure hunt cap: 100 (150 for Hunt Pass)

**Spend:**
- Generate $1 coupon: 20 XP
- Rarity boost on a sale: 15 XP

**Display Location:** Loyalty page (primary) + Dashboard overview (redundant)

---

### System 2: Explorer Rank (Progression Track)

**Progression:** Initiate (🌱) → Scout (🐦) → Ranger (🧗) → Sage (🧙) → Grandmaster (👑)

**Thresholds:** 500 / 1,500 / 2,500 / 5,000 XP

**Perks:** "Rank-gated" but limited visibility (Sage/Grandmaster get Hunt Pass perks)

**Display Location:** Loyalty page (primary) + Dashboard overview (redundant) + League leaderboard

**Confusion:** The page says "each rank unlocks real perks" but doesn't show what perks each rank gets

---

### System 3: Hunt Pass Subscription ($4.99/mo)

**What it includes:**
- 1.5x XP multiplier (on guildXp earn)
- 6h early access to flash deals
- 6h early access to Rare items / 12h early access to Legendary items
- Exclusive Hunt Pass badge
- Golden Trophy avatar frame
- Hunt Pass Insider Newsletter
- Access to Loot Legend portfolio
- Access to Collector's League leaderboard
- Treasure Hunt Pro (+10% per scan, 150 cap)

**Display Location:** Hunt Pass page (primary) + Loyalty page (banner) + Loot Legend (gate) + League (gate)

**Confusion:** Loot Legend and Collector's League are never mentioned on the Hunt Pass page — user won't discover them

---

## Information Architecture Issues

### 1. Two Entry Points to Engagement

- **Shopper Dashboard** (`/shopper/dashboard`) — activity aggregator
- **Loyalty/Guild Passport** (`/shopper/loyalty`) — gamification hub

Shopper doesn't know which to use first. Dashboard doesn't explain engagement mechanics. Loyalty duplicates activity context from Dashboard.

### 2. Naming Ambiguity

- "Loyalty Passport" in URL, but page headline says "Explorer's **Guild** Passport"
- "Explorer Passport" is a separate page for identity config
- Which is the real "passport"?

### 3. Stamps vs. XP Currency Collision

- Loyalty page shows both "total stamps" (unlocks tiers) and "guild XP" (currency)
- Unclear relationship: are stamps earned like XP? Conversion rate?
- Tier system (Initiate/Scout/etc.) is based on stamps, not XP, but text mixes them

### 4. Hunt Pass as Modal/Buried vs. Featured

- Hunt Pass benefits only visible on dedicated page OR as buried banner on Loyalty
- Loot Legend + Collector's League are Hunt Pass perks but never mentioned on Hunt Pass page
- User won't know these premium features exist

### 5. Fragmented Achievement Display

- Achievements shown on Loyalty page
- Also shown on Dashboard
- Also referenced in Explorer Passport
- Three places to see the same badges

---

## Shopper Journey Map (Current State)

```
First Visit
  ↓
[Login → Dashboard overview tab]
  ├─ sees XP progress widget
  ├─ sees "Hunt Pass" CTA banner (can dismiss)
  └─ sees "Guild Onboarding" modal (dismissible)
  
Curious about engagement system
  ↓
[Click "Loyalty" nav link]
  ├─ comprehensive 13-section page
  ├─ learns how to earn/spend
  ├─ sees tier progression
  └─ sees Hunt Pass banner again
  
Interested in Hunt Pass benefits
  ↓
[Click "Hunt Pass" nav link OR "View Loot Legend" button]
  ├─ if Hunt Pass link: sees $4.99 price + 8 benefit cards
  ├─ if Loot Legend button: jumps to portfolio (confusing context shift)
  └─ learns 1.5x XP but doesn't see Loot Legend/League mentioned
  
Wants to see perks
  ↓
[No direct path from Hunt Pass page]
  ├─ user must guess that /shopper/loot-legend exists
  ├─ or see "View Loot Legend" link from Loyalty page
  └─ or discover "Collector's League" from nav

Wants to define interests
  ↓
[Click "Explorer Passport" nav link]
  ├─ clear config interface
  ├─ sees matches based on settings
  └─ isolated from gamification context (no rank/XP display)
```

---

## Recommended Page Structure

### Option A: 3 Pages (Recommended)

**Page 1: `/shopper/dashboard` (Enhanced)**
- **Job:** Activity hub + engagement entry point
- **Sections:**
  1. Activity Summary (purchases, saved, streak)
  2. XP Progress Card (current rank, XP, progress bar) — **featured, not buried**
  3. Sales Near You
  4. Recently Viewed
  5. Flash Deals
  6. Wishlist Preview
  7. Pickup Appointments
  8. "How to Earn XP" quick ref (3-item grid)
  9. CTA section (Hunt Pass + referral)

**Page 2: `/shopper/engagement` (Renamed from "Loyalty")**
- **Job:** Comprehensive engagement hub (XP, rank, spending, Hunt Pass)
- **Sections:**
  1. Your Rank & XP (full card with visual)
  2. XP Earning Mechanics (full table)
  3. XP Spending Options (cards + buttons to redeem)
  4. Rank Progression Track (all 5 ranks + thresholds)
  5. Tier Badges & Achievements
  6. Hunt Pass Explainer (what + why + price)
  7. Hunt Pass Perks Quick Links (Loot Legend + League)
  8. Current status (subscribed or CTA to upgrade)

**Page 3: `/shopper/interests` (Renamed from "Explorer Passport")**
- **Job:** Define collector profile + get recommendations
- **Sections:**
  1. Your Explorer Identity (bio, specialties, categories, keywords)
  2. Matching Items (grid based on profile)
  3. Quick Stats (rank summary, favorite count)
  4. Notification Settings
  5. Achievement Highlights (if earned)

**Hunt Pass Perks Pages (Subsidiary):**
- `/shopper/loot-legend` — stays as-is, linked from Engagement page + nav
- `/shopper/league` — stays as-is, linked from Engagement page + nav
- `/shopper/rare-finds` — also stays, linked from Engagement page

**Removed:**
- `/shopper/hunt-pass` page (merge into Engagement page as section 6)

---

### Option B: 4 Pages (If separate "Hunt Pass Sales Page" needed)

If Patrick wants a dedicated upsell landing page for non-subscribers:

**Page 1: `/shopper/dashboard` (same as Option A)**

**Page 2: `/shopper/engagement` (same as Option A, but without "Hunt Pass Explainer" section)**

**Page 3: `/shopper/interests` (same as Option A)**

**Page 4: `/shopper/hunt-pass` (Marketing/Upsell page — stays as-is)**
- Positioned as external link (not in main nav, only in CTAs)
- Or: reserved for non-Hunt-Pass subscribers (upsell context)

---

## Recommended Nav Structure

### Current Nav (4 links, overlapping):
```
🏠 Shopper Dashboard
📚 My Collection
   └─ Saved Sales
   └─ My Bids
   └─ My Holds
   └─ History
🗺️ Explorer Passport
🎯 Explorer's Guild Passport (Loyalty)
🎟️ Hunt Pass
```

### Recommended Nav (3–4 links, clear hierarchy):
```
🏠 Dashboard
🎯 Engagement (formerly "Loyalty" or rename to "Rank & Rewards")
🗺️ My Interests (formerly "Explorer Passport")
🎟️ Hunt Pass [OPTIONAL — link only if non-subscriber]

Sub-sections under Engagement:
  ├─ Loot Legend (Hunt Pass-gated)
  └─ Collector's League (Hunt Pass-gated)

OR simpler (3 items):
🏠 Dashboard
🎯 Rank & Rewards (engagement hub)
🗺️ My Interests (profile/discovery)
```

---

## Per-Page UX Spec

### Page 1: Enhanced Dashboard

**Header:**
- "Your Dashboard" or "Welcome back, [name]"
- Subtitle: "Quick view of your activity and engagement"

**Section A: XP Progress** (featured, not buried)
- **Component:** RankBadge (large, left) + RankProgressBar (right)
- **Content:**
  - Current rank emoji + name + "Explorer Rank"
  - XP total (e.g., "1,245 Guild XP")
  - Progress to next rank with %-complete
  - Info tooltip: "Earn XP by visiting sales (+5), scanning items (+10), and making purchases (+25)"
- **Action:** Button: "View Full Rank Progression" → links to Engagement page

**Section B: Quick Earn Reference**
- **Component:** 3-card grid
- **Cards:**
  1. 🚪 Visit a Sale → +5 XP
  2. 📱 Scan an Item → +10 XP
  3. 🛒 Make a Purchase → +25 XP
- **Action:** Each card has a subtle link to relevant action (Browse Sales, Camera, History)

**Section C: Activity Summary**
- *existing* (purchases, saves, wishlist counts)

**Section D: Sales Near You**
- *existing*

**Section E: Wishlist Preview**
- *existing*

**Section F: Pickups**
- *existing*

**Section G: CTAs**
- Hunt Pass CTA (if not subscribed): "Earn 1.5x XP" → button to `/shopper/engagement#hunt-pass`
- Referral CTA (if not shown): "Share & Earn" → button to referral flow

**Removed:**
- Streak widget (move to Engagement page)
- Achievement badges (move to Engagement page)
- Guild onboarding modal (simplify to on-page card dismissible in Engagement page)

---

### Page 2: Engagement (Rank & Rewards Hub)

**Header:**
- "Explorer's Guild" or "Rank & Rewards"
- Subtitle: "Track your progress, earn XP, unlock perks"

**Section A: Your Current Rank** (Hero card)
- **Component:** Large RankBadge (center or left) + progress details
- **Content:**
  - Current rank with emoji + name
  - Total XP to date
  - Thresholds for all 5 ranks (visual pyramid or list)
  - Current progress to next rank (%)
- **Action:** No action needed (info-only)

**Section B: Earn XP** (Mechanics table)
- **Component:** Responsive table
- **Columns:**
  - Action (Visit / Scan / Purchase / Treasure Hunt / etc.)
  - Standard XP
  - Hunt Pass XP (1.5x)
  - Daily Cap (if applicable)
- **Action:** No action (educational)

**Section C: Spend XP** (Action cards)
- **Component:** 2 cards with buttons
- **Cards:**
  1. 🎫 Discount Coupon
     - Cost: 20 XP
     - Benefit: $1 off any sale
     - Valid: 30 days
     - **Button:** "Generate Coupon" (enabled if XP ≥ 20)
  2. ✨ Rarity Boost
     - Cost: 15 XP
     - Benefit: Boost visibility of a sale you love
     - **Button:** "Boost a Sale" (opens modal, enabled if XP ≥ 15)
- **Action:** Click buttons to redeem

**Section D: Rank Progression Visual**
- **Component:** Pyramid or timeline showing all 5 ranks
- **Content:**
  - Rank name + emoji + threshold
  - Perks unlocked at each rank (if any)
- **Example:**
  ```
  👑 Grandmaster (5,000 XP) — Sage perks + [future perks]
  🧙 Sage (2,500 XP) — Hunt Pass perks
  🧗 Ranger (1,500 XP) — [future perks]
  🐦 Scout (500 XP) — [future perks]
  🌱 Initiate (0 XP) — Base game
  ```

**Section E: Achievements & Badges**
- **Component:** Grid of earned achievement badges
- **Content:**
  - Badge image + name + earn date
- **Action:** Click to view details (if applicable)

**Section F: Streak Widget**
- **Component:** Weekly activity counter
- **Content:**
  - "X week streak!" + visual counter
- **Action:** Motivational display

**Section G: Hunt Pass Explainer**
- **Component:** Compact card or accordion
- **Content:**
  - Price: $4.99/month
  - Key benefits summary (1.5x XP, 6h early access, badge)
  - Status indicator (subscribed or upgrade CTA)
  - **Button:** "Learn More" (if not subscribed) or "Manage Subscription" (if subscribed)

**Section H: Hunt Pass Perks Quick Links**
- **Component:** 2 cards (if subscribed)
- **Cards:**
  1. 💎 Loot Legend — Your legendary collection
     - **Button:** "View My Loot"
  2. 🏆 Collector's League — Top XP holders
     - **Button:** "View Leaderboard"
- **Display:** Only if user has active Hunt Pass

**Section I: Onboarding (First Visit)**
- **Component:** Dismissible card or modal
- **Content:**
  - "New to the Explorer's Guild?"
  - 3-step explanation (Earn XP → Climb Ranks → Unlock Perks)
  - **Button:** "Got It" (dismisses, sets localStorage flag)

---

### Page 3: My Interests (Collector Profile)

**Header:**
- "My Explorer Identity"
- Subtitle: "Define what you hunt for and get matched recommendations"

**Section A: Profile Settings** (Form card)
- **Fields:**
  1. Bio (textarea, optional)
     - Placeholder: "What drives your hunt? e.g., 'Passionate explorer of mid-century modern furniture'"
     - Help text: "Optional — visible on your public profile"
  2. Specialties (tag input)
     - Help text: "Categories you explore most. Auto-detected from activity."
     - **Action:** Add/remove tags
  3. Item Categories (checkbox grid)
     - 9 categories: Furniture, Jewelry, Art & Decor, Clothing, Kitchenware, Tools, Collectibles, Electronics, Books
     - **Action:** Toggle checkboxes
  4. Keywords (tag input)
     - Placeholder: "e.g., eames, pyrex, walnut, art deco"
     - Help text: "Search terms we use to alert you to matching items."
     - **Action:** Add/remove tags
  5. **Button:** "Save Preferences"

**Section B: Matching Items**
- **Component:** 4-column grid (responsive: 1–4 columns)
- **Content:**
  - Item cards with photo, title, price, sale name
  - Click to navigate to sale detail
- **Empty state:** "No matches yet. Complete your profile above to start seeing recommendations."

**Section C: Your Stats** (Info card)
- **Content:**
  - Total finds count (badge)
  - Current rank (RankBadge, small)
  - Favorite count
  - Total spent
- **Action:** No action (info-only)

**Section D: Notification Settings**
- **Component:** 2 toggles
- **Settings:**
  1. Email Alerts — "Notify me via email when items match my interests"
  2. Push Notifications — "Notify me via push when items match my interests"
- **Action:** Click toggles to enable/disable

**Section E: Achievement Highlights** (If earned)
- **Component:** Row of earned badges (truncated, link to full Engagement page)
- **Content:**
  - Display 5 most recent achievements
- **Action:** Click "View All" → to Engagement page

---

## Hunt Pass Perks Pages (Subsidiary)

### `/shopper/loot-legend`

No changes recommended. Add context on Engagement page via link.

**Improvement:** Add brief explainer: "Your collection of Rare and Legendary items. Hunt Pass exclusive — see the finest treasures from your hunts."

---

### `/shopper/league`

No changes recommended. Add context on Engagement page via link.

**Improvement:** Add leaderboard explanation: "Top 50 Hunt Pass holders ranked by Explorer's Guild XP. Compete with collectors worldwide."

---

## Data Gaps & Backend Needs

### Required for New IA:

1. **Rank thresholds API** — confirm current thresholds (500/1500/2500/5000 XP)
2. **Perks-by-rank mapping** — what does each rank unlock?
   - Currently: "Each rank unlocks real perks" but perks are Hunt Pass-gated, not rank-gated
   - Clarify: Do non-Hunt-Pass Sages get any perks? Or only Hunt Pass holders?
3. **Daily treasure hunt cap logic** — where is 100 cap implemented? Hunt Pass raises to 150?
4. **Spend XP endpoints** — confirm coupon generation + rarity boost endpoints are working
5. **Loot Legend API** — returning Legendary + Epic items only? Filter logic?
6. **Collector's League API** — top 50 Hunt Pass members only? Or all users by XP?
7. **Match algorithm** — how does /loyalty/my-matches work? Keywords + categories?

### Nice-to-Have:

- Rank-based perks (future: each rank could unlock real benefits, not just cosmetic)
- Seasonal leaderboards (reset monthly, add flavor)
- XP burn alerts (notify when user is close to coupon redemption)
- Badges for spending (e.g., "Generous" for rarity boosts)

---

## Open Questions for Patrick

1. **Stamps vs. XP:** What is the relationship between "total stamps" (shown on Loyalty page) and "guild XP"? Are they the same? Different earn rates? Is stamps an artifact of the old system?

2. **Rank perks:** Do ranks unlock real perks beyond cosmetic badges? The decisions log says "Sage/Grandmaster exclusives" are Hunt Pass perks. Do non-Hunt-Pass Sages get anything?

3. **Hunt Pass marketing:** Should `/shopper/hunt-pass` remain as a dedicated landing page (for email links, external referrals), or merge into Engagement page entirely?

4. **Explorer Passport naming:** "Explorer Passport" (interests page) vs. "Explorer's Guild Passport" (engagement page) — which is the real "passport"? Should we rename one?

5. **Favorite display:** Should Dashboard show a "you have X saved sales" summary card, or is the "My Collection" nav section enough?

6. **Leaderboard timing:** Is Collector's League leaderboard real-time, or recalculated daily? Does current-user position update instantly?

7. **Trial offer:** Loot Legend page mentions 7-day free trial. Is this a general Hunt Pass trial, or Loot Legend-specific?

8. **Achievement cosmetics:** Are achievements purely badges, or do they unlock rewards (coupons, multipliers)?

---

## Naming Recommendations

| Current | Recommended | Rationale |
|---------|-------------|-----------|
| `/shopper/loyalty` | `/shopper/engagement` or `/shopper/guild` | "Loyalty" implies rewards at checkout; "Engagement" or "Guild" are clearer |
| "Explorer's Guild Passport" (page title) | "Guild" or "Your Rank & Rewards" | Shorter, clearer |
| `/shopper/explorer-passport` | `/shopper/interests` | "Explorer Passport" confuses (duplicate with Guild page) |
| "Explorer Passport" (nav link) | "My Interests" | Clearer intent |
| Nav: "🎯 Explorer's Guild Passport" | Nav: "🎯 Engagement" | Shorter, clearer hierarchy |

---

## Summary of Recommended Changes

### Consolidation:

| Current | Action | Result |
|---------|--------|--------|
| `/shopper/loyalty` (13 sections) | Merge gamification sections | Keep as engagement hub, remove redundant Dashboard duplication |
| `/shopper/dashboard` (6 tabs) | Featured XP progress | Add XP card to top, remove buried rank widget |
| `/shopper/explorer-passport` | Clarify naming | Rename to "Interests", separate from gamification |
| `/shopper/hunt-pass` | Merge into Engagement page | Delete standalone page, add section to Engagement page |
| `/shopper/loot-legend` | Link from Engagement | Keep page, add discovery link |
| `/shopper/league` | Link from Engagement | Keep page, add discovery link |

### Navigation:

| Current (4 links) | Recommended (3 links) |
|-------------------|----------------------|
| 🏠 Shopper Dashboard | 🏠 Dashboard |
| 🗺️ Explorer Passport | 🎯 Engagement |
| 🎯 Explorer's Guild Passport | 🗺️ My Interests |
| 🎟️ Hunt Pass | *(removed, linked from Engagement)* |

### Information Architecture:

**Flow:**
1. New shopper lands on Dashboard → sees XP progress featured
2. Curious → clicks "Engagement" → comprehensive gamification hub
3. Wants to earn more → "How to Earn XP" section → links to browse sales
4. Ready to spend → "Spend XP" section → redeem coupon or boost
5. Interested in premium → "Hunt Pass Explainer" section → upgrade CTA
6. If subscribed → "Loot Legend" + "Collector's League" links appear
7. Wants to configure discovery → "My Interests" page → setup bio, keywords, categories
8. Gets matched → browse recommendations

---

## FAQ for Implementation

**Q: Merge Loyalty + Dashboard?**  
A: No. Dashboard is activity-first (purchases, pickups, follows). Engagement page is gamification-first. Different jobs. Dashboard should feature XP prominently but not replicate the full 13-section experience.

**Q: Keep Hunt Pass as a separate upsell page?**  
A: Only if Patrick wants it for external marketing (email links, paid ads). Otherwise, merge into Engagement page as section 6.

**Q: Delete Explorer Passport page?**  
A: No, rename and keep. It's a critical feature (match algorithm, keyword config). Just clarify its name and position in the flow.

**Q: Consolidate achievements display?**  
A: Yes. Achievements should live on Engagement page (where rank/XP context is clear). Dashboard can show a brief "recent badges" row linking to full page.

**Q: When should Stamps be phased out?**  
A: Confirm with Patrick if "stamps" is legacy (old points system) or still used for tier progression. If legacy, remove from Loyalty page entirely.

**Q: Should rank unlocks real perks?**  
A: Currently Sage/Grandmaster perks are Hunt Pass-gated, not rank-gated. Consider future expansion (Ranger → 50% faster item upload, Sage → batch item operations, etc.) to make rank progression meaningful beyond cosmetics.

---

## Success Metrics (Post-Implementation)

1. **Navigation clarity:** User clicks correct page for their intent on first try (measure via analytics)
2. **Engagement page dwell time:** Average session >2 min (currently unknown)
3. **XP redemption rate:** % of users who spend earned XP (currently unknown)
4. **Hunt Pass discovery:** % of page views from Engagement section vs. standalone page
5. **Loot Legend/League discovery:** % of users who find these perks after subscribing (vs. trial-only)
6. **Rank progression:** % of users reaching Ranger+ (vs. stalling at Initiate)

---

## Appendix: Code Locations

**Current Pages:**
- `/pages/shopper/dashboard.tsx` — 12.5k lines
- `/pages/shopper/loyalty.tsx` — 593 lines
- `/pages/shopper/explorer-passport.tsx` — 401 lines
- `/pages/shopper/hunt-pass.tsx` — 400+ lines
- `/pages/shopper/loot-legend.tsx` — 200+ lines
- `/pages/shopper/league.tsx` — 200+ lines

**Components:**
- `RankBadge` — used in all gamification pages
- `RankProgressBar` — used in Loyalty + Dashboard
- `StreakWidget` — used in Loyalty + Dashboard
- `AchievementBadgesSection` — used in Loyalty + Explorer Passport + Dashboard

**Hooks:**
- `useXpProfile()` — Dashboard + Loyalty
- `useLoyaltyPassport()` — Loyalty only
- `useMyPassport()` / `useUpdatePassport()` / `useMyMatches()` — Explorer Passport only
- `useMyAchievements()` — all pages

**Nav:**
- `Layout.tsx` lines 452–563 (shopper section)

---

**Spec Complete.** Ready for Patrick review and developer dispatch.
