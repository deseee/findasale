# FindA.Sale Shopper Engagement System — Year 1 Design (2026)

**Status:** Implementation-Ready Design  
**Created:** 2026-04-23  
**Owner:** Game Design / Innovation  
**Audience:** Developers, Product, Design

---

## Overview

This document consolidates the shopper engagement system for Year 1 (2026). FindA.Sale users progress through five Explorer ranks (Initiate → Scout → Ranger → Sage → Grandmaster) by earning XP from treasure hunting activities. The system combines three coexisting mechanics: guildXp (earned currency), Hunt Pass (optional $4.99/mo subscription), and seasonal challenges.

**Current System State:**
- 5 ranks with cumulative XP thresholds: 0, 500, 2000, 5000, 12000
- 8 achievements across shopper/organizer/shared categories
- 4 seasonal challenges (Spring/Summer/Fall/Holiday 2026) with EASY/MEDIUM difficulty
- 4 stamp categories (Attend Sale / Make Purchase / Write Review / Refer Friend)
- 40+ XP award types and 13 XP sink types

This design addresses overlap between stamps and achievements, introduces mid-milestone pacing, defines full seasonal calendar with micro-events, specifies notification moments, and maps the first-30-day user journey.

---

## Decision 1: Explorer Passport System (Stamp + Achievement Consolidation)

### Concept

Replace the parallel Loyalty Passport (4 stamp types) and Achievements (8 items) systems with a single "Explorer Passport" that collects exploration moments. A passport is a visible, personal collection log that feels earned and place-specific.

The stamp metaphor is retained for clarity — shoppers collect stamps by exploring. Each stamp unlocks at a specific activity and becomes a dated collection record.

### Passport Stamps (12 Total)

Stamps are organized into 4 categories. Shoppers collect one per condition. Each stamp shows:
- Icon (emoji or custom glyph)
- Activity name
- Date earned
- Location (sale name or region)
- Progress toward next milestone

#### Category 1: Visit & Explore (3 stamps)
| Stamp | Trigger | Icon | Notes |
|-------|---------|------|-------|
| First Steps | Attend your first sale (any visit RSVP completion) | 🧭 | One-time. Earned on first saleRSVP. |
| Weekend Warrior | Visit 5 different sales in a calendar month | 🌳 | Resets monthly. Earned on 5th unique sale in month. |
| Road Tripper | Visit sales in 3 different counties/regions in one season | 🗺️ | Seasonal. Resets per season. Based on sale.region. |

#### Category 2: Purchase & Treasure (3 stamps)
| Stamp | Trigger | Icon | Notes |
|-------|---------|------|-------|
| First Find | Complete first purchase | 🛍️ | One-time. Earned on first purchase.status=COMPLETED. |
| Treasure Hunter | Complete 5 purchases | 💎 | Progress tracker: 1/5, 2/5, etc. Earned at 5th. |
| Lakefront Haul | Spend $50+ at a single sale (completed items sum) | 💰 | Can be earned multiple times. Per-sale limit tracking. |

#### Category 3: Share & Contribute (3 stamps)
| Stamp | Trigger | Icon | Notes |
|-------|---------|------|-------|
| Storyteller | Write your first product review | ⭐ | One-time. Earned on first review creation. |
| Collector | Make 10 items favorites | 🎁 | Progress: 1/10, 2/10... Earned at 10th. |
| Haul Curator | Post first haul to haul feed (isHaulPost=true UGCPhoto) | 📸 | One-time. Earned on haul post creation. |

#### Category 4: Community & Referrals (3 stamps)
| Stamp | Trigger | Icon | Notes |
|-------|---------|------|-------|
| Friend Finder | Refer 1 friend who completes first purchase (referral tranche C) | 👥 | Progress: 1 friend, 2 friends. One stamp per referral completed. Reusable. |
| Community Guide | Create or publish a collection guide (GUIDE_PUBLICATION sink) | 📖 | One-time or per guide. Recommend one-time for MVP. |
| Local Legend | Achieve 10+ haul likes on a single haul post | 🏆 | One-time per user. Earned when haul.likeCount reaches 10. |

### Milesones & Cosmetic Rewards

Milestones are reached at cumulative stamp counts. Each milestone grants a cosmetic badge overlay.

| Milestone | Total Stamps | Cosmetic Reward | Description |
|-----------|--------------|-----------------|-------------|
| Bronze | 3 | Badge Overlay: Bronze Star | Circular badge with bronze-tone star. Appears above username on profile. |
| Silver | 6 | Badge Overlay: Silver Compass | Circular badge with compass rose in silver. Signals mid-tier explorer. |
| Gold | 9 | Badge Overlay: Golden Compass | Circular badge with compass rose in gold. Premium collector signal. |
| Platinum | 12 | Badge Overlay: Platinum Crown | Star-encircled crown in platinum. Signals completion of base collection. |

Each badge appears as a small visual icon on:
- User profile page (above username)
- Haul posts (corner badge)
- Leaderboard (next to rank)
- Challenge completion screens

**Implementation Note:** Stamp mechanics already exist in `LoyaltyPassport.tsx` (totalStamps, nextMilestone, stampsToNextMilestone). Database: add `totalStamps` aggregate to User model. Trigger logic in service (checkAndAwardStamps) mirrors achievement logic.

**Consolidation Path:**
- Map current 8 achievements to 8 of the 12 stamps (1:1 where possible)
- Introduce 4 new stamps (Road Tripper, Lakefront Haul, Local Legend, Community Guide)
- Achievements table remains in DB but deprecated — reads fallback to stamp equivalents
- Shopper-facing UI shows "Explorer Passport" exclusively
- Backend deprecation: achievements can be retired gradually post-launch

---

## Decision 2: Mid-Milestone Cadence (Rank Progression Pacing)

### Rationale

The five ranks span 12,000 cumulative XP. Gap sizes range from 500 (Initiate→Scout) to 7,000 (Sage→Grandmaster). Research shows flat spacing creates engagement dead zones — months with no "progress moment."

Non-uniform spacing: gaps under 1,000 XP get 0–1 mid-milestone; gaps 1,500–3,000 get 1–2 mid-milestones; gaps 3,500+ get 2–3 mid-milestones.

Mid-milestones are: visual progress markers (no XP reward), cosmetic badge overlays (tied to lifetime XP, not spendable XP), and emotional checkpoints between rank-ups.

**S553 Context:** 1,000 XP mid-milestone badge overlay already approved. Incorporated below.

### Full Rank Progression Map

#### Initiate (0 XP → Scout)
- **Gap:** 500 XP
- **Decision:** No mid-milestone (gap too small; first rank should feel like immediate momentum)
- **Checkpoints:** 0 (start), 500 (rank-up to Scout)

#### Scout (500 XP → Ranger)
- **Gap:** 1,500 XP
- **Mid-Milestone:** 1 at 1,000 XP
- **Checkpoints:**
  - 500 XP: Scout Rank-Up (RankUpModal + notification)
  - 1,000 XP: Mid-Scout Badge Unlock (progress marker — "Seasoned Scout") — Toast notification
  - 2,000 XP: Ranger Rank-Up (RankUpModal + notification)

**Cosmetic:** Mid-Scout badge = silver compass on a scout-blue background

#### Ranger (2,000 XP → Sage)
- **Gap:** 3,000 XP
- **Mid-Milestones:** 2 at 2,800 XP and 3,500 XP
- **Checkpoints:**
  - 2,000 XP: Ranger Rank-Up (RankUpModal + notification)
  - 2,800 XP: Early Ranger Surge ("Confident Ranger") — Toast notification
  - 3,500 XP: Peak Ranger ("Master Ranger") — Toast notification
  - 5,000 XP: Sage Rank-Up (RankUpModal + notification)

**Cosmetics:** 
- Early Ranger Surge = gold badge with double arrows (upward momentum)
- Peak Ranger = ornate compass in ranger-green

#### Sage (5,000 XP → Grandmaster)
- **Gap:** 7,000 XP
- **Mid-Milestones:** 3 at 6,500 XP, 8,000 XP, and 10,000 XP
- **Checkpoints:**
  - 5,000 XP: Sage Rank-Up (RankUpModal + notification)
  - 6,500 XP: Emerging Sage ("Wise Observer") — Toast notification
  - 8,000 XP: Proven Sage ("Deep Collector") — Toast notification
  - 10,000 XP: Ascending Sage ("Knowledge Seeker") — Toast notification
  - 12,000 XP: Grandmaster Rank-Up (RankUpModal + notification)

**Cosmetics:**
- Wise Observer = 🌟 star badge (light silver)
- Deep Collector = 📚 library badge (sage-green)
- Knowledge Seeker = ✨ sparkle badge (purple glow)

#### Grandmaster (12,000 XP+)
- **Gap:** Infinite
- **Mid-Milestones:** None (Grandmaster is terminal rank)
- **Checkpoints:**
  - 12,000 XP: Grandmaster Rank-Up (RankUpModal + notification)
  - No further milestones

**Cosmetic:** Grandmaster crown (already in UI) — never changes.

### XP Values Summary

- **Scout→Ranger boundary:** 1,000 (first-time milestone)
- **Ranger zone:** 2,800 (mid-1), 3,500 (mid-2)
- **Sage zone:** 6,500 (mid-1), 8,000 (mid-2), 10,000 (mid-3)
- **Grandmaster:** 12,000 (final)

**Total progression moments per user:** 5 rank-ups + 6 mid-milestones = 11 major moments in Year 1.

### Implementation Requirements

- Backend: Add `milestoneCheckpoints` array to User model (track which XP values user has passed)
- Backend: Create `checkMilestoneAward(userId, xpAmount)` function that triggers on XP award
- Backend: Extend `RankUpModal` component to also display mid-milestone badges
- Frontend: New `MilestoneUnlockedToast` component (lower interrupt than modal)

---

## Decision 3: First-Year Seasonal Calendar (4 Seasons, 11 Weeks Each, with Micro-Events)

### Seasonal Context

FindA.Sale has real seasonality:
- **Spring (Mar–May):** Estate sales peak. High organizer activity. Shoppers hunting furniture, collectibles, home goods.
- **Summer (Jun–Aug):** Yard sales peak. Casual buying season. Shoppers hunting miscellaneous, vintage, decor.
- **Fall (Sep–Nov):** Estate sales return + back-to-school segment. Shoppers hunting antiques, collectibles, seasonal decor.
- **Winter (Dec–Feb):** Slowest season. Holiday gift hunting (Dec), deep-discount season (Jan–Feb), New Year resolutions.

### Season 1: Spring 2026 "Bloom & Hunt" (Mar 1 – May 31)

**Duration:** 13 weeks  
**Theme:** Fresh starts, spring renewal, treasure renewal  
**Emoji:** 🌸  
**Color Palette:** Sage green (#8FB897), cream, blush pink  

**Challenge Objectives (3 total, EASY difficulty):**
| Objective ID | Description | Type | Target | XP Reward |
|--------------|-------------|------|--------|-----------|
| spring-refresh | Find furniture or art pieces from any sale | PURCHASE_CATEGORY | 2 items | 15 XP each |
| spring-explorer | Visit 3 different sales | VISIT_SALES | 3 | 20 XP each |
| spring-collector | Favorite 5 items across all sales | FAVORITE_ITEMS | 5 | 10 XP each |

**Challenge Completion XP:** 25 XP (EASY tier)  
**Badge:** "Spring Keeper" — circular badge with sprouting leaf icon in sage green

**Seasonal Micro-Event:** "Spring Flash Hunt" (Apr 15–21, 7 days)
- **Objective:** Visit 1 sale + make 1 purchase during Flash Hunt week
- **Reward:** 50 XP + "Flash Finder" cosmetic badge (lightning bolt icon)
- **Copy:** "One week only! Sale events with Flash Hunt tags award 2x XP this week."

**Seasonal Cosmetic Reward (on challenge completion):**
- Avatar Frame: "Spring Bloom" — ornate frame with blooming flowers and vines

---

### Season 2: Summer 2026 "Clearance Chase" (Jun 1 – Aug 31)

**Duration:** 13 weeks  
**Theme:** Hot deals, yard sale season, clearing inventory  
**Emoji:** ☀️  
**Color Palette:** Sunny gold (#FFB347), white, ocean blue  

**Challenge Objectives (3 total, EASY difficulty):**
| Objective ID | Description | Type | Target | XP Reward |
|--------------|-------------|------|--------|-----------|
| summer-deals | Purchase 2 items at any sale | PURCHASE_ITEM | 2 | 25 XP each |
| summer-explorer | Visit 2 different sales | VISIT_SALES | 2 | 20 XP each |
| summer-favorites | Favorite 10 items | FAVORITE_ITEMS | 10 | 8 XP each |

**Challenge Completion XP:** 25 XP (EASY tier)  
**Badge:** "Summer Scout" — circular badge with sun icon in gold

**Seasonal Micro-Event:** "Yard Sale Blitz" (Jul 20–26, 7 days)
- **Objective:** Visit 2 sales + favorite 5 items during Blitz week
- **Reward:** 60 XP + "Blitz Tracker" cosmetic badge (target icon)
- **Copy:** "Yard sales everywhere! Blitz-week yards award bonus XP."

**Seasonal Cosmetic Reward (on challenge completion):**
- Title: "☀️ Summer Scavenger" — appears next to username

---

### Season 3: Fall 2026 "Harvest Hunt" (Sep 1 – Nov 30)

**Duration:** 13 weeks  
**Theme:** Autumn treasures, antique season, collectors' peak  
**Emoji:** 🍂  
**Color Palette:** Burnt orange (#CC5500), rust, deep brown  

**Challenge Objectives (3 total, MEDIUM difficulty):**
| Objective ID | Description | Type | Target | XP Reward |
|--------------|-------------|------|--------|-----------|
| fall-collectibles | Purchase 1 item from Collectibles category | PURCHASE_CATEGORY | 1 | 40 XP |
| fall-explorer | Visit 2 different sales | VISIT_SALES | 2 | 25 XP each |
| fall-favorites | Favorite 8 items | FAVORITE_ITEMS | 8 | 10 XP each |

**Challenge Completion XP:** 50 XP (MEDIUM tier)  
**Badge:** "Autumn Keeper" — circular badge with falling leaves in rust

**Seasonal Micro-Event:** "Antique Awakening" (Oct 8–14, 7 days)
- **Objective:** Visit 1 estate sale + write 1 review during Awakening week
- **Reward:** 75 XP + "Antique Eye" cosmetic badge (magnifying glass)
- **Copy:** "Estate sales peak this month. Antique sales earn 3x XP during Awakening week."

**Seasonal Cosmetic Reward (on challenge completion):**
- Avatar Frame: "Autumn Harvest" — ornate frame with wheat and acorns

---

### Season 4: Holiday & Winter 2026 "Treasure Vault" (Dec 1, 2026 – Feb 28, 2027)

**Duration:** 14 weeks (runs into 2027)  
**Theme:** Gift hunting, deep inventory, year-end celebration, New Year fresh starts  
**Emoji:** 🎄  
**Color Palette:** Deep red (#C41E3A), gold, evergreen (#228B22)  

**Challenge Objectives (4 total, MEDIUM difficulty):**
| Objective ID | Description | Type | Target | XP Reward |
|--------------|-------------|------|--------|-----------|
| holiday-gifts | Purchase 3 items total (for gifting or self) | PURCHASE_ITEM | 3 | 20 XP each |
| holiday-explorer | Visit 3 different sales | VISIT_SALES | 3 | 20 XP each |
| holiday-kitchen-art | Purchase from Kitchen or Art & Decor category | PURCHASE_CATEGORY | 1 | 40 XP |
| holiday-favorites | Favorite 10 items | FAVORITE_ITEMS | 10 | 8 XP each |

**Challenge Completion XP:** 50 XP (MEDIUM tier)  
**Badge:** "Holiday Treasure" — circular badge with wrapped gift and snowflake

**Seasonal Micro-Event:** "New Year Dash" (Jan 1–7, 7 days)
- **Objective:** Visit 1 sale + complete 1 purchase + refer 1 friend (refer code share counts) during Dash week
- **Reward:** 100 XP + "Resolution Keeper" cosmetic badge (checkmark icon)
- **Copy:** "New year, new treasures! Start 2027 strong. Every Dash-week action counts double."

**Seasonal Cosmetic Reward (on challenge completion):**
- Title: "🎄 Holiday Curator" — appears next to username

---

### Seasonal Calendar at a Glance

| Season | Dates | Theme | Difficulty | Base XP | Micro-Event | Micro Dates | Micro XP |
|--------|-------|-------|------------|---------|-------------|-------------|----------|
| Spring | Mar 1–May 31 | Bloom & Hunt | EASY | 25 | Spring Flash Hunt | Apr 15–21 | 50 |
| Summer | Jun 1–Aug 31 | Clearance Chase | EASY | 25 | Yard Sale Blitz | Jul 20–26 | 60 |
| Fall | Sep 1–Nov 30 | Harvest Hunt | MEDIUM | 50 | Antique Awakening | Oct 8–14 | 75 |
| Holiday | Dec 1, 2026–Feb 28, 2027 | Treasure Vault | MEDIUM | 50 | New Year Dash | Jan 1–7 | 100 |

**Year 1 XP Potential from Challenges Alone:**
- 4 seasonal challenges @ 25–50 XP each = 150 XP
- 4 micro-events @ 50–100 XP each = 285 XP
- **Total from challenges: ~435 XP** (if user completes all)

---

## Decision 4: Achievement Notification Moments

### Notification Architecture

Five distinct moments trigger notifications. Each has specific interrupt level, duration, and flow.

#### 1. Mid-Milestone Crossing (Low Interrupt)

**Trigger:** User XP crosses a mid-milestone threshold (1,000, 2,800, 3,500, 6,500, 8,000, 10,000)

**What User Sees:** 
- **Component:** `MilestoneUnlockedToast` (bottom-right corner toast, not modal)
- **Display Duration:** 4 seconds (auto-dismiss, no interaction required)
- **Skippable:** Yes (user can dismiss early or just let it fade)
- **Content Example:**
  ```
  ✨ Seasoned Scout
  You've reached a new milestone! New badge unlocked.
  [View Profile] or [Dismiss]
  ```
- **Animation:** Slide in from bottom-right, fade out
- **Icon:** Animated sparkles (★ or ✨)

**Why Toast:** Low interrupt. Milestone is progress marker, not a major unlock. User can continue browsing without interruption.

---

#### 2. Achievement Unlock (Low Interrupt)

**Trigger:** User completes an achievement (e.g., First Find, Treasure Hunter) or earns a stamp

**What User Sees:**
- **Component:** `AchievementUnlockedToast` 
- **Display Duration:** 5 seconds (auto-dismiss)
- **Skippable:** Yes
- **Content Example:**
  ```
  🎉 Achievement Unlocked
  Treasure Hunter — Completed 5 purchases
  [View Passport] or [Dismiss]
  ```
- **Animation:** Confetti burst effect, then fade
- **Placement:** Center-bottom of screen

**Why Toast:** Achievement is a data acknowledgment, not a major life event. Multiple achievements per month expected. Toast keeps UX flowing.

---

#### 3. Rank-Up (Medium Interrupt)

**Trigger:** User XP crosses a rank threshold (500→Scout, 2000→Ranger, etc.)

**What User Sees:**
- **Component:** `RankUpModal` (existing — keep as-is)
- **Display Duration:** Until user taps "View Profile" or "Continue Exploring"
- **Skippable:** Yes (button to close/continue)
- **Content Example:**
  ```
  ⭐ You've Reached Scout!
  
  Congratulations, explorer!
  
  New Perks Unlocked:
  • 1-hour early access to Legendary items
  • Hold items for 45 minutes
  • Scout Reveal + Haul Unboxing unlocked
  
  [View Profile] [Keep Exploring]
  ```
- **Animation:** Scale-in from center (expansion effect), badge animation
- **Styling:** Full modal with rank color gradient background (sage green for Scout, etc.)

**Why Modal:** Rank-up is a major milestone. User should pause and see perks. Happens 5 times per year maximum (not spammy). Matches existing implementation.

---

#### 4. Seasonal Challenge Completion (Medium Interrupt)

**Trigger:** User completes all objectives in a seasonal challenge

**What User Sees:**
- **Component:** `ChallengeCompletedModal` (new)
- **Display Duration:** Until user taps "Claim Badge" or "Keep Hunting"
- **Skippable:** Yes
- **Content Example:**
  ```
  🌸 Spring Challenge Complete!
  
  Bloom & Hunt — Finished!
  
  Season Badge Earned: Spring Keeper
  XP Awarded: +25 XP
  Avatar Frame Unlocked: Spring Bloom
  
  [Claim Badge] [Keep Hunting]
  ```
- **Animation:** Badge emerges from center, sparkles
- **Styling:** Seasonal colors (sage green for Spring, gold for Summer, etc.)

**Why Modal:** Challenge completion is a meaty achievement (takes 3–13 weeks to reach). User should celebrate. Happens 4 times per year.

---

#### 5. Seasonal Cosmetic Award (Low-Medium Interrupt)

**Trigger:** User earns seasonal cosmetic (avatar frame, title badge) from challenge completion

**What User Sees:**
- **Component:** `CosmeticUnlockedModal` (new) or overlay on Challenge completion modal
- **Display Duration:** Until dismissed
- **Skippable:** Yes
- **Content Example:**
  ```
  🎨 New Avatar Frame Unlocked
  
  Spring Bloom
  An ornate frame with blooming flowers.
  
  Apply to Profile? 
  [Yes, Apply] [View Later]
  ```
- **Animation:** Frame animates around the profile avatar (preview)
- **Styling:** Frame preview centered, with apply button

**Why Modal/Overlay:** Cosmetic is a visual reward. User should see it applied before committing. Low interrupt since it's optional to apply immediately.

---

### Notification Frequency Matrix

| Moment | Frequency | Per Year | Interrupt Level |
|--------|-----------|----------|-----------------|
| Mid-Milestone | Every 700–2,500 XP | ~8–10 times | Low (toast) |
| Achievement | Variable (1–12 stamps) | ~12 times | Low (toast) |
| Rank-Up | Every rank crossed | 5 times (Initiate→GM) | Medium (modal) |
| Challenge Completion | Per season | 4 times | Medium (modal) |
| Cosmetic Award | Per seasonal reward | 4 times | Low-Medium (overlay) |

**User Experience:** Toasts are frequent but unobtrusive. Modals are rare (9 per year total for rank + challenge). User is never bombarded.

---

### Implementation Checklist

- **Notification Service:** Extend `createNotification` to handle 5 types (MILESTONE_UNLOCK, ACHIEVEMENT_UNLOCK, RANK_UP, CHALLENGE_COMPLETE, COSMETIC_AWARD)
- **Toast Component:** Create `MilestoneUnlockedToast` and `AchievementUnlockedToast` (4s timeout)
- **Modal Components:** Extend `RankUpModal`, create `ChallengeCompletedModal` and `CosmeticUnlockedModal`
- **Trigger Functions:** 
  - `checkMilestoneNotification(userId, newXp)` — fires on mid-milestone cross
  - `checkAchievementNotification(userId, achievement)` — fires on stamp earn
  - Existing: `checkRankUp()` in awardXp service
  - `checkChallengeCompletion(userId, challengeId)` — fires on all objectives done
  - `checkCosmeticAward(userId, seasonId)` — fires on cosmetic unlock

---

## Decision 5: New User 30-Day Journey (Cohesion Audit)

### Scenario: New Shopper with Realistic Engagement

**User Profile:**
- Name: Morgan
- Signup Date: Day 0 (Mar 15, during Spring 2026 season)
- Activity: 2 sales attended, 3 purchases, 1 review written, 1 friend referred (friend completes purchase by day 30)

### Hour-by-Hour Moments (First 30 Days)

| Time | Trigger | What Happens | XP Award | Notification |
|------|---------|--------------|----------|--------------|
| **Day 0 (Signup)** |
| 10:00 AM | Create account | Onboarding flow shows 4 rank badges, XP bar set to 0, Explorer Passport intro | 0 | None |
| **Day 1** |
| 2:00 PM | Attend sale #1 (RSVP) | Morgan shows up at estate sale downtown | +5 XP (VISIT) | None |
| | Post-sale | Explores sale map, browses items | 0 XP | None |
| 4:30 PM | First purchase | Buys vintage table for $35 | +10 XP (PURCHASE) | ⚡ Achievement Toast: "First Find unlocked! Treasure Hunter starting..." |
| 5:00 PM | Leave sale | guildXp now 15 | 0 XP | None |
| **Day 2–3** |
| Offline | No activity | — | 0 XP | — |
| **Day 4** |
| 11:00 AM | Favorite 5 items | Browses app, saves items to wishlist | +0 XP (favoriting doesn't award XP directly, but progress counts toward Spring Challenge) | None |
| 3:00 PM | Write review | Leaves 5-star review on first purchase | +5 XP (REVIEW) | ⚡ Achievement Toast: "Storyteller unlocked! You're contributing to the community." |
| | guildXp = 20 | — | | None |
| **Day 7** |
| 1:00 PM | Attend sale #2 | Estate sale in different county | +5 XP (VISIT) | None |
| 2:30 PM | Make purchase #2 | Buys decorative plates for $12 | +10 XP (PURCHASE) | ⚡ Achievement Toast: "Treasure Hunter — 2 of 5 purchases." |
| | guildXp = 35 | | | None |
| **Day 10** |
| 6:00 PM | Refer friend Sarah | Shares referral code via text | 0 XP (referral XP awarded later on friend milestone, not on share) | None |
| **Day 15** |
| 10:00 AM | Attend sale #3 | Same-county sale (Spring Road Tripper objective: 3 counties not yet met) | +5 XP (VISIT) | None |
| 11:30 AM | Make purchase #3 | Vintage books, $18 | +10 XP (PURCHASE) | ⚡ Achievement Toast: "Treasure Hunter — 3 of 5 purchases." |
| | guildXp = 50 | | | None |
| 4:00 PM | Spring Challenge Check | Morgan has: 2 items from Furniture category (Objective 1: ✓ complete). 3 sales visited (Objective 2: ✓ complete). 5 favorites (Objective 3: ✓ complete). | 0 XP (completion XP awarded when badge is earned) | ✨ Challenge Toast: "Spring Bloom Challenge Complete! Claim your Spring Keeper badge." |
| | | Morgan clicks "Claim" | +25 XP (SEASONAL_CHALLENGE_COMPLETE) | 🎉 Modal: "Spring Challenge Complete! Badge earned: Spring Keeper. Avatar Frame unlocked: Spring Bloom. XP +25." |
| | guildXp = 75 | | | Morgan applies Spring Bloom frame to profile |
| **Day 18** |
| 12:00 PM | Sarah's first purchase completes | Friend Morgan referred (Sarah) makes 1st purchase on platform (Referral Tranche C) | +100 XP for Morgan (REFERRAL_TRANCHE_C awarded to referrer) | ⚡ Achievement Toast: "Friend Finder — 1 successful referral!" |
| | guildXp = 175 | | | |
| **Day 20** |
| 9:00 PM | Offline browsing | Morgan views haul feed, sees hauls from other Scouts | 0 XP | None |
| **Day 25** |
| 2:00 PM | Post haul | After small thrift haul, Morgan posts photos to haul feed (isHaulPost=true) | +15 XP (HAUL_POST) | ⚡ Achievement Toast: "Haul Curator unlocked! Your treasures on display." |
| | guildXp = 190 | | | |
| **Day 28** |
| Cumulative check | Status: 5 stamps earned (First Steps, First Find, Storyteller, Friend Finder, Haul Curator), Spring Challenge badge earned, 190 XP toward next rank (Scout is at 500) | | |
| | | Morgan is at **Initiate rank** (0–499 XP). Next: Scout at 500 XP. 310 XP to go. | | None |

### Journey Analysis: Engagement Moments

#### ✓ Strong Moments (Wow / Delightful)

1. **Day 1 PM:** First purchase triggers achievement toast immediately. Morgan feels progress on first outing.
2. **Day 15 PM:** Spring Challenge completion feels like a "season victory" — all three objectives done, badge earned, cosmetic unlocked, 25 XP boost. This is the biggest moment.
3. **Day 18:** Referral friend completes purchase → instant 100 XP notification. Feels unexpected and rewarding.

#### ⚠️ Dead Air Moments (Gaps Where Nothing Happens)

1. **Days 2–3:** Morgan is offline. Expected.
2. **Days 4–6:** Morgan earns 5 XP for review on Day 4, but then silent for 2 days. No intermediate moment.
3. **Days 16–17:** After challenge completion on Day 15, nothing new happens. Morgan is 310 XP from Scout rank — at current pace (20 XP every 5 days) will take ~75 more days to rank up. **Dead zone is 3+ weeks with no rank progress.**

#### 🎯 Recommended Gaps to Fill

1. **Weekly check-in prompt:** On Day 7, Day 14, Day 21, send a non-obtrusive notification: "You've visited X sales and made X purchases this week. Keep the momentum going!" (Counts toward streak if implemented separately, but not tied to XP.)

2. **Mid-Milestone at Initiate:** No mid-milestone currently (gap too small per design). **Recommendation:** Introduce a special "Initiate Milestone" at 250 XP as a "Halfway to Scout" checkpoint. Award a small cosmetic (faint star badge) and 0 XP, just for the progress signal. This bridges the gap and gives Morgan a moment at day 40–50 (if continuing at current pace).

3. **Gamification of favorites:** Currently favoriting items has no reward signal. **Recommendation:** When user reaches 5 favorites (Favorite 5 item achievement), show a toast: "You're collecting treasures!" This reframes favoriting as progress.

4. **Seasonal micro-event hype:** Spring Flash Hunt starts Apr 15 (Day 31 for Morgan). **Gap:** Morgan won't see it in the first 30 days. **For onboarding cohort**: Show a teaser on Day 20–25: "Next week: Spring Flash Hunt! Visit a sale and purchase an item for 2x XP. Apr 15–21." Creates anticipation.

### 30-Day Totals for Morgan

| Metric | Count | Notes |
|--------|-------|-------|
| Sales Attended | 3 | Qualifies for Scout rank (Attend 1st sale ✓) |
| Purchases | 3 | Toward Treasure Hunter (3/5) |
| Reviews | 1 | Storyteller unlocked |
| Favorites | 5+ | Collector progress (5/10) |
| Referrals Completed | 1 | Friend Finder (1/reusable) |
| Hauls Posted | 1 | Haul Curator unlocked |
| XP Earned | 190 | Initiate rank (0–499) |
| Stamps Earned | 5 | First Steps, First Find, Storyteller, Friend Finder, Haul Curator |
| Badges Earned | 1 | Spring Keeper (challenge), Spring Bloom frame (cosmetic) |
| Engagement Sessions | ~10 | Days with activity |

### Wow Moments Summary

1. **First Purchase (Day 1):** Immediate achievement + emotional high (got a bargain)
2. **Spring Challenge Complete (Day 15):** Biggest moment — badge, cosmetic, 25 XP, visible profile change
3. **Referral Completed (Day 18):** Surprise 100 XP boost, unexpected reward
4. **Haul Post & Community (Day 25):** Shares treasure on feed, social moment

### Dead Zones to Watch

1. **Days 16–30:** Scout rank is 310 XP away at current pace. User has no intermediate checkpoint. Recommend "Halfway to Scout" milestone at ~250 XP to fill gap.
2. **General pacing:** 190 XP in 30 days = 6.3 XP/day average. User will reach Scout around Day 80–90 if activity holds. That's 50–60 day gap between signup and first rank-up. **This is acceptable** (season-long cadence) but should be acknowledged in onboarding: "Ranks take weeks to earn. Every action counts."

### Recommendation

The journey shows solid early engagement but benefits from:
1. Weekly activity summaries (non-obtrusive, no XP)
2. "Halfway" milestone at 250 XP (cosmetic only, no XP)
3. Seasonal micro-event teaser 1 week before start
4. Favoriting progress signal (toast at 5 favorites)

These are low-cost additions that fill ~70% of dead zones without inflating XP awards.

---

## Appendix A: XP Award Values Summary

**Current system (from xpService.ts):**

| Activity | Base XP | Notes |
|----------|---------|-------|
| VISIT | 5 | Per sale, once per day max |
| PURCHASE | 10 | Flat, not per-dollar |
| REVIEW | 5 | Per product review |
| HAUL_POST | 15 | Post-purchase photo haul |
| FIRST_PURCHASE | 50 | One-time |
| AUCTION_WIN | 20 | Competitive win |
| REFERRAL_TRANCHE_C | 150 | When friend completes 1st purchase |
| TREASURE_HUNT_SCAN | 3 | Per clue |
| TREASURE_HUNT_COMPLETION | 15 | All clues bonus |
| PHOTO_STATION_SCAN | 5 | Photo station interaction |
| RSVP | 2 | Sale RSVP (capped 10/mo) |
| STREAK_7DAY_BONUS | 100 | 7 active days/month |
| SEASONAL_CHALLENGE_COMPLETE | 25–50 | Difficulty-based |

All values are locked per gamedesign decisions (D-XP-004, D-XP-009, D-XP-015, etc.). No changes proposed in this document.

---

## Appendix B: Implementation Order (Phases)

### Phase 1: Foundation (Weeks 1–2)
- [ ] Explorer Passport UI refresh (consolidate stamps + achievements display)
- [ ] Mid-milestone badge system (add checkpoints to User model, render badges)
- [ ] `MilestoneUnlockedToast` + `AchievementUnlockedToast` components
- [ ] Update `LoyaltyPassport.tsx` to show 12-stamp grid with milestone progress

### Phase 2: Seasonal Integration (Weeks 3–4)
- [ ] Verify seasonal challenge config (4 seasons in challengeService.ts — already exists, validate dates/objectives)
- [ ] `ChallengeCompletedModal` component
- [ ] Cosmetic reward system (avatar frames, titles) tied to seasonal completion
- [ ] Season UI landing page (teaser, progress, leaderboard)

### Phase 3: Notifications (Weeks 5–6)
- [ ] Extend notification service to handle 5 types
- [ ] Toast animations (Framer Motion or CSS)
- [ ] Modal animations (scale-in, confetti on rank-up)
- [ ] Test notification frequency matrix (8–10 toasts/year shouldn't overwhelm)

### Phase 4: Polish & Testing (Weeks 7–8)
- [ ] End-to-end testing: new user signup → Day 30 journey
- [ ] Dark mode audit (all badges, frames, cosmetics)
- [ ] Mobile responsiveness (toast positioning, modal scaling)
- [ ] QA: Verify all notification moments fire at correct XP thresholds

---

## Appendix C: Decisions Locked for Development

1. **Stamp Consolidation:** Loyalty Passport (4 stamps) + Achievements (8 items) → Explorer Passport (12 stamps). One-time decision, no backtrack.

2. **Mid-Milestone Cadence:** Non-uniform spacing with 6 mid-milestones total (1 at Scout→Ranger, 2 at Ranger→Sage, 3 at Sage→Grandmaster). Specific XP thresholds locked: 1000, 2800, 3500, 6500, 8000, 10000.

3. **Seasonal Calendar:** 4 fixed seasons (Spring/Summer/Fall/Holiday-Winter), one micro-event per season (7-day sub-challenge). Objectives and XP amounts locked. No seasonal rotation between years in Year 1 (can revisit for 2027).

4. **Notification Architecture:** 5 distinct moments with specific interrupt levels (2 toasts, 3 modals). No notification fatigue — max 9 meaningful notifications per user per year.

5. **30-Day Journey Baseline:** Realistic engagement (2 sales, 3 purchases, 1 review, 1 referral) reaches 190 XP in 30 days, unlocks 5 stamps, earns 1 seasonal badge. Scout rank reached around Day 80–90. Expected cadence.

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-23 | Game Design | Initial comprehensive Year 1 design. All 5 decisions locked for development. |

