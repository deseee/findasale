# Explorer's Guild — XP Economy Decisions (Session 407)

## Response to Patrick's 14 Questions — Locked Decisions & Implementation Plan

**Date:** 2026-04-08  
**Status:** LOCKED — Ready for architect handoff  
**Prepared by:** Claude (Game Designer review)  
**Scope:** All 14 Patrick questions answered. XP_AWARDS constants updated. Code migration path specified.

---

# SECTION 1: ANSWER TO ALL 14 QUESTIONS

---

### #1 — Treasure Hunt QR: 25 XP per scan + 50 XP completion (too high?)

**DECISION:** Reduce to **12 XP per clue scan** (down from 25) and **30 XP completion bonus** (down from 50).

**PLAYER EXPERIENCE:** A shopper points their phone at a sale sticker and earns 12 XP — comparable to an organizer getting 10 XP for a review or a shopper earning 10 XP for a haul post. The full treasure hunt (4 clues + completion) now earns ~78 XP — a meaningful activity but not higher than a single auction win (15) or a full-day outing.

**RATIONALE:** 
- 25 XP for 2 seconds of effort was indeed overweighted. 
- Comparison: visit=5 XP (location + app check), purchase=$1/XP (real money), review=8 XP (written effort), auction win=15 XP (competitive outcome). QR scan had zero friction — the cap needed lowering. 
- 12 XP scales with the "point your phone" effort level. 
- 30 XP completion bonus rewards the behavior (multi-stop hunt) without inflating early-game too much.
- New economy: shopper who completes a 4-clue treasure hunt + takes photos at 2 stops earns ~12×4 + 30 + 2×2 = **79 XP** (vs 150+ under old system). This is now comparable to a day at a single sale (visit + $50 purchase = 55 XP).

**IMPACT:** MEDIUM — affects early engagement pacing and grind slope. Benefits late-game player retention (treasure hunts become repeatable earners, not one-time windfall).

---

### #2 — Auction win: 15 XP seems high

**DECISION:** Reduce auction win to **10 XP base** (down from 15). Keep value bonus (+0.5 XP per $100, max +5 XP cap). 

New range: Winning a $50 item = 10 XP + 2.5 bonus = **12.5 XP total**. Winning a $500 item = 10 XP + 5 bonus = **15 XP total**.

**PLAYER EXPERIENCE:** Winning an auction is rewarded as a competitive outcome, but not as a dominant earning path. A shopper who attends a sale and wins a $100 item earns: 5 (visit) + 1 (if they also visit as part of a trail) + 10 (auction win) + 5 (auction bonus) + 3 (item condition rating) = 24 XP for one outcome. Same shopper who buys $100 in purchases earns 100 XP from purchase alone. Auctions are engagement, not the primary grind.

**RATIONALE:**
- Patrick's gut was right: 15 XP base made auction wins too comparable to a full sale visit (5 XP). 
- Auctions should be "nice bonus on top of purchase XP," not a primary earner. 
- Reducing to 10 XP base aligns auction wins with: referral signup (20 XP), haul post (10 XP), share claim (10 XP). 
- Value bonus still rewards high-value auctions without making them gaming targets. 
- Auction winner ALSO gets purchase XP for the item, so total isn't punitive — it's just not overpowered.

**IMPACT:** LOW-MEDIUM — mostly balances competitive engagement. Doesn't break any other mechanic.

---

### #3 — Item photo quality: What is this?

**DECISION:** DECISION NEEDED. This feature is ambiguous and likely not implemented. 

**Two options:**
1. **REMOVE from XP table.** It's not wired into any code. No clear trigger. Not worth the mental overhead.
2. **REDEFINE and implement:** Photo quality is an AI-scored metric (brightness, composition, multiple angles). Each photo organizers upload earns the organizer (not the shopper) 3 XP, capped 10/sale. Awards effort in prep without farming (per-photo, not per-view).

**RECOMMENDATION:** REMOVE. Here's why:
- No code implementation exists. 
- Trigger is unclear ("shopper rating organizer's photos"? "AI quality score"? "Organizer uploading").
- 3 XP + 30/mo cap is negligible (1 XP/day equivalent). 
- It adds surface area (another metric to track) for negligible reward.
- Organizers get plenty of reward from the sale itself (10 XP/publish, review bonuses, referral credit). Adding photo grading adds noise.

**REMOVAL IMPACT:** Organizer still earns 10 XP per published sale (existing). One less feature to explain to users. Cleaner economy.

**IMPACT:** LOW — removing a negligible sink simplifies mental model.

---

### #4 — Condition grade submission: 5 XP, 50/mo cap — is it right?

**DECISION:** Keep **5 XP per condition submission**, 50/mo cap. **Move from shopper action to organizer credit.**

**Change:** Organizer (not shopper) earns 5 XP when a shopper submits a condition grade on one of their items. Cap remains 50 XP/month. This incentivizes organizers to encourage shoppers to fill metadata.

**PLAYER EXPERIENCE:** 
- Organizer: Sees "Item condition rated — +5 XP" on 7 items this week. Incentive to ask shoppers to rate items at checkout. 
- Shopper: Still earns the satisfaction + metadata contribution; no XP reward (it's already a call-to-action with no friction).

**RATIONALE:**
- 5 XP is right for the effort level (one drop-down select).
- Original spec had it as shopper reward, but 50/mo cap (~1.6 XP/day) is too small to matter to shoppers.
- It matters MORE to organizers as a "please help me fill in metadata" incentive at sale time.
- Organizers earn 100 XP/first sale, 10 XP/published sale — condition credit fits this tier.
- Shopper's reward is having an organized, filterable sale. No XP needed.

**IMPACT:** MEDIUM — changes who earns, not the total cost.

---

### #5 — Haul posts vs social share — same or different?

**DECISION:** Keep them **different actions, same XP reward** (10 XP each). Clarify the distinction.

**Haul post:** 10 XP (requires 2+ items + photo, posted to in-app Loot Legend). This is curatorial, permanent social proof. Once posted, it stays on profile.

**Social share claim:** 10 XP (shopper claims they shared a haul to external social media — Twitter, TikTok, Instagram, etc. Honor system with confirmation). This is broadcast, external reach. No in-app footprint.

**Why same reward:** Both create content (in-app or external), both require photo + narrative effort, both support the community. Haul stays on FindA.Sale; social share leaves the platform. Equal value, different surface.

**PLAYER EXPERIENCE:** 
- Shopper posts 3 hauls this month = 30 XP + engagement on their profile = lasting social proof.
- Shopper also tweets one haul = 10 XP + external reach for FindA.Sale marketing.
- Both rewarded equally because both serve the platform.

**RATIONALE:** Spec already has both at 10 XP. Keeping them equal is right. The distinction isn't the payout; it's the channel. In-app is community building; external is marketing.

**IMPACT:** LOW — both already cost 10 XP in spec. No change needed.

---

### #6 — Community mentor session: 25 XP, 100/mo cap — what is this??

**DECISION:** REMOVE from XP economy. Not implemented. Not in code. Spec includes it but no definition exists.

**What it might be:** Peer Q&A session, organizer helping shopper with a question, etc. Too vague. Too much like "micro-consultation," which scales unpredictably.

**RATIONALE:**
- Zero code implementation.
- No trigger defined. Is it "any chat"? "Dedicated mentor sessions"? "Organizer office hours"?
- 25 XP + 100/mo cap = 4 sessions/month. This incentivizes what exactly? A chat system we don't have.
- Risk: If implemented, becomes "ask someone random XP question" farming surface.
- Signal to organizers: If we want them helping shoppers, we can reward it differently (e.g., "Organizer answers 5+ comment threads" = 25 XP once/month).

**Recommendation:** Remove entirely. If the feature gets built later, add it at that time with a clear trigger.

**IMPACT:** LOW — removes a placeholder feature with no implementation.

---

### #7 — Public collection guide: 50 XP one-time, no quality gate

**DECISION:** Keep **50 XP one-time per guide**. **Add light quality gate:** Guide must be at least 3 items long + 50 words of description to earn XP.

**PLAYER EXPERIENCE:** A shopper writes a collection guide: "Vintage Mid-Century Furniture Under $200" (6 items, 120 words). Posts it. Earns 50 XP once. If they update it later, no additional XP (one-time, not per-edit).

**RATIONALE:**
- 50 XP for high-effort content is right (it's one-time, lasting, benefits the community).
- Patrick's concern (quality gate) is valid. Without a floor, spam risk is real ("i like stuff" = 3 words, 0 effort).
- Minimum: 3 items + 50 words is a **5-minute effort bar**. Not restrictive, but eliminates drive-by spam.
- Guides are permanent once published. Community can flag/downvote if bad. 50 XP one-time is not a gaming target even at scale.
- Example: 200 active users × 50 XP/guide = 10k XP/year if everyone writes 1 guide. That's manageable (not inflationary).

**IMPACT:** MEDIUM — adds a light validation gate. Prevents spam without blocking genuine contributors.

---

### #8 — Community valuation: 10 XP, 100/mo cap (10 max)

**DECISION:** Reduce to **5 XP per valuation** (down from 10). Cap remains 100/mo (now 20 max instead of 10).

**PLAYER EXPERIENCE:** Shopper submits a price opinion on an item — "I'd pay $25 for this lamp." Gets 5 XP. They do this 20 times in a month = 100 XP. This is contribution without dominance.

**RATIONALE:**
- Patrick's correct: 10 XP per valuation is too high compared to 5 XP for a visit.
- Valuations are low-friction (one number) compared to: review (8 XP, requires text), haul (10 XP, requires 2+ items + photo).
- 5 XP scales with the effort. Cap of 100/mo (now 20 valuations instead of 10) gives high-engagement users a path to earn 100 XP/month from valuations alone.
- This keeps community-generated pricing intel valuable without overpowering the core loop.
- Comparison: 10 visits/month (50 XP) + 20 valuations/month (100 XP) + purchases still dominate. Valuations are side-hustle XP, not primary.

**IMPACT:** MEDIUM — rebalances contributor rewards. More generous cap, lower per-action rate.

---

### #9 — Bounty fulfillment (seasonal): 50–200 XP

**DECISION:** Keep the scale **50–200 XP for top 10 seasonal bounty fulfillments** (1st=200, 2nd=150, 3–5=100, 6–10=50). **Clarify that this is one-time seasonal**, not monthly.

**PLAYER EXPERIENCE:** End of season, leaderboard reveals top 10 bounty fulfillments (most valuable finds). 1st place earner gets 200 XP. 7th place gets 50 XP. This is a seasonal tournament outcome, not a repeatable weekly grind.

**RATIONALE:**
- 200 XP for a competitive seasonal win is appropriate. It's rarer (top 10 per season = ~40 people/year if product scales).
- Comparison: Seasonal challenge hard difficulty = 300 XP (50 purchases in season), seasonal leaderboard top 10 = 500 XP. Bounty top 10 at 50–200 XP sits below both, which is right (bounties are optional/exploratory, not core challenges).
- Prevents farming: One-time per season, not repeatable. No monthlies like the spec might imply.
- Example: User finds 8 high-value antiques in March (per organizer bounties), lands in top 10. Gets 75 XP. Resets next season.

**IMPACT:** MEDIUM — clarifies seasonal cap, prevents inflation from misunderstanding "bounty reward" as repeatable weekly.

---

### #10 — Streak bonuses: Are they right?

**DECISION:** Adopt the **spec version (board-locked S259)** over the code version. Weekly streaks with 1.2x multiplier.

**Locked spec:**
- Weekly streaks (not daily).
- 1.2x XP multiplier on ALL earned during active streak week.
- Resets if user skips a full week.
- 7-day streak bonus (once/month) = 100 XP.
- 30-day active anniversary (once/month) = 250 XP.

**Code discrepancy:** xpService.ts has STREAK_MILESTONE_5/10/20 (5/10/20 XP) which are daily milestones. **These should be removed; they're redundant with the 1.2x multiplier.**

**PLAYER EXPERIENCE:** 
- Shopper attends sales Tue, Wed, Fri (3 days that week). Gets 1.2x multiplier on all XP earned those days. 
- At end of week, if they hit 7 consecutive days of activity, they earn 100 XP bonus (once/month, repeats each month).
- Day 30 of active months = 250 XP milestone (once/month).

**RATIONALE:**
- Weekly > daily because sales are typically weekend activities. Weekly cadence matches shopper behavior.
- 1.2x multiplier is better than fixed bonuses because it rewards consistency across ALL activities (visits, purchases, hauls, reviews), not just "day count."
- 100 XP at 7-day active week = appropriate seasonal milestone. Achievable for engaged players (1.6 weeks of 7-day activity = 1 bonus = reasonable).
- 250 XP at 30-day anniversary = major milestone, motivates month-long engagement.
- The daily STREAK_MILESTONE constants in code are noise. Remove them.

**Code action:** Delete STREAK_MILESTONE_5, STREAK_MILESTONE_10, STREAK_MILESTONE_20 from XP_AWARDS. Implement 7-day streak bonus (100 XP, once/month) and 30-day anniversary (250 XP, once/month) as new constants.

**IMPACT:** MEDIUM — clarifies a confusing discrepancy. Simplifies streak logic (one multiplier, two milestones = clearer than three micro-milestones).

---

### #11 — Seasonal challenges: Are they right?

**DECISION:** Keep as spec'd. **Validate against rank thresholds.**

**Spec values:**
- Easy = 100 XP (attend 3 sales)
- Medium = 200 XP (complete 3 specialties)
- Hard = 300 XP (50 purchases in season)
- Leaderboard top 10 = 500 XP

**Rank threshold check:**
- Scout = 500 XP. Easy challenge alone gets you halfway to Scout.
- Ranger = 2000 XP. Easy (100) + Medium (200) + Hard (300) = 600 XP, roughly 30% of the way to Ranger. Appropriate.
- Sage = 5000 XP. Three full seasons (600 XP/season) = 1800 XP (36% progress). Reasonable.
- Grandmaster = 12000 XP. Even three seasonal cycles + top-10 leaderboard placements don't dominate. Good balance.

**Scale assessment:** Challenges reward seasonal engagement. Easy is onboarding-friendly. Hard requires real commitment (50 purchases = ~$1500+ spend or significant time investment). Top 10 leaderboard is rare. All three tiers combined (600 XP/season) don't break rank progression.

**RATIONALE:** Spec is already validated. No change needed.

**IMPACT:** NONE — decisions are locked.

---

### #12 — Sinks seem too cheap

**DECISION:** Evaluate each sink and adjust where justified.

**Current sinks (from spec):**

| Sink | XP Cost | Assessment | New Cost | Rationale |
|------|---------|------------|----------|-----------|
| Rarity boost (1 sale) | 15 | Right | **15** | Luxury tier (0.13 $/XP). Stackable. Supply-scarce feel = premium pricing. Correct. |
| Hunt Pass discount | 50 | Right | **50** | Baseline rate (0.02 $/XP = $1 off). Correct. |
| Custom username color | 25 | **Cheap** | **50** | Permanent cosmetic for a named user. Should cost more. Raise to Sage+ gate. |
| Custom frame badge | 30 | **Cheap** | **75** | Rare visual, Sage+. Should be more expensive. Raise. |
| Haul visibility boost | 10 | Right | **10** | 7-day boost. Low cost = broad usage. Correct. |
| Bounty visibility boost | 5 | **Too cheap** | **15** | Organizer tool to increase fulfillment odds. Currently 5 = disposable. Raise. |
| Seasonal challenge access | 100 | Right | **100** | Conversion funnel (equiv to Hunt Pass). Correct. |
| Guide publication | 30 | **Too cheap** | **50** | Permanent content. Same tier as "public collection guide" reward (50 XP) — should cost equivalent to earn. Raise. |
| Coupon generation | 50 | Right | **50** | Organizer spends 50 XP → creates $1-off coupon. Cost = value. Correct. |
| Early access boost | 75 | Right | **75** | Organizer presale visibility. Mid-tier. Correct. |
| Listings extension | 100 | Right | **100** | Avoids tier upgrade ($2.99). Cost-avoidance sink. Correct. |
| Event sponsorship | 150 | Right | **150** | Exclusive bounties, high-impact. Correct. |

**New totals:**

```
Rarity boost:           15 XP (unchanged)
Hunt Pass discount:     50 XP (unchanged)
Custom username color:  50 XP (raised from 25)
Custom frame badge:     75 XP (raised from 30)
Haul visibility boost:  10 XP (unchanged)
Bounty visibility boost: 15 XP (raised from 5)
Seasonal challenge:     100 XP (unchanged)
Guide publication:      50 XP (raised from 30)
Coupon generation:      50 XP (unchanged)
Early access boost:     75 XP (unchanged)
Listings extension:     100 XP (unchanged)
Event sponsorship:      150 XP (unchanged)
```

**Rationale:**
- Cosmetics (color, badge) should cost more because they're permanent status symbols. Raising from 25–30 to 50–75 makes them aspirational.
- Bounty visibility boost was a throwaway at 5 XP. 15 XP makes it a real choice (equivalent to rarity boost, a luxury tier spend).
- Guide publication at 30 XP was underpriced vs. the 50 XP reward for publishing a guide. Raise to parity.
- All other sinks are correctly priced or strategically low (haul boost at 10 is intentionally low-friction).

**IMPACT:** MEDIUM — makes cosmetic sinks feel less disposable, increases perceived value of permanent rewards.

---

### #13 — Organizer coupon generation: Should it be a shopper action instead?

**DECISION:** Keep as **organizer action**, but **add a complementary shopper sink: "Discount Code Claim" (spend 25 XP for a $0.50–$1 coupon on your own purchase).**

**Two sinks, two directions:**

1. **Organizer spends 50 XP** → generates a $1-off coupon → can distribute to shoppers (email, QR, social share).
2. **Shopper spends 25 XP** → claims an available coupon (pre-generated or a $0.50 self-applied discount). One per user per organizer per month.

**PLAYER EXPERIENCE:** 
- Organizer: "I want to reward my repeat shoppers." Spends 50 XP, generates coupon, emails to mailing list.
- Shopper: "I have 500 XP, I'm close to Ranger. Let me spend 25 XP on a $1 discount at my favorite shop." Applies a claimed or organizer-issued coupon.

**RATIONALE:**
- Patrick's instinct was right: shoppers buying discounts makes intuitive sense.
- But organizers also need a tool to incentivize shoppers. The current organizer-generated coupon fills a gap (recruitment, retention).
- Two sinks (one for each user type) serve different goals: organizer wants to attract, shopper wants to save.
- 25 XP for $0.50–$1 savings = 0.04–0.02 $/XP (slightly worse rate than Hunt Pass 50 XP = $1, which is intentional — encourages full subscriptions over one-off discounts).
- No conflict: organizer issues coupons, shoppers claim them. Both are rewarded in the ecosystem.

**IMPACT:** MEDIUM — adds a shopper-side sink that makes sense in context. Doesn't remove organizer coupon tool.

---

### #14 — Rank floors / restart from 0

**DECISION:** **Simplify: Remove rank floors. Ranks are milestones, not protective tiers.**

**New model:**
- Your XP balance = your total (no rank floor subtraction).
- Your rank = highest milestone you've achieved (Scout = you've hit 500 XP at some point).
- Spending XP doesn't drop your rank. You stay Scout forever, even if you drop to 200 XP.
- Exception: Seasonal reset applies (Grandmaster → Sage at year boundary), but rank floor logic (spendableXP = currentXP - floor) disappears.

**CODE CHANGE:**
Remove the rank floor logic from spendXp():
```typescript
// OLD (remove this):
// spendableXP = currentXP - rankFloor[currentRank]

// NEW (simplify):
if (user.guildXp < amount) return false; // Insufficient XP
```

**PLAYER EXPERIENCE:**
- Before: "I'm Ranger (2000 XP floor). I have 2500 XP. I can only spend 500 XP on sinks."
- After: "I'm Ranger (I've earned 2000+ XP lifetime). I have 2500 XP. I can spend all 2500 XP if I want. I'll stay 'Ranger' rank forever (in history), but my current balance is 0."

**RATIONALE:**
- Rank floor adds complexity (two mental models: current XP vs. spendable XP) for minimal player value.
- Players want to know: "Can I afford this sink?" Not: "Can I afford it without losing my rank?"
- Seasonal reset already has a floor (drop one tier at year boundary). That's the only floor players care about.
- Simplification: "Rank = lifetime milestone" is clearer than "Rank = current floor."
- Risk mitigation: Players can't accidentally drop ranks by spending. No surprise rank loss.
- Grandmaster stays free Hunt Pass forever (S260 locked) regardless of XP balance. That's the perk.

**Implementation:**
1. Delete `rankFloor` constant and all floor-checking logic.
2. Keep `SEASONAL_RESET_FLOOR` (annual tier drop).
3. Update spendXp() to check `guildXp < amount` only.
4. Ranks now purely milestone-based. No rank protection on spends.

**IMPACT:** HIGH simplification. Removes one of the most confusing rules for zero gameplay benefit. Cleaner mental model.

---

# SECTION 2: CHANGES REQUIRED IN xpService.ts

## Constants to Add
```typescript
// Add to XP_AWARDS
TREASURE_HUNT_SCAN: 12,        // Down from 25
TREASURE_HUNT_COMPLETION: 30,   // Down from 50
STREAK_7DAY_BONUS: 100,        // Weekly streak
ANNIVERSARY_30DAY: 250,        // Monthly anniversary

// Remove from XP_AWARDS (delete these)
ITEM_SCANNED: 25,              // REMOVE — replaced by TREASURE_HUNT_SCAN
STREAK_MILESTONE_5: 5,         // REMOVE — redundant with multiplier
STREAK_MILESTONE_10: 10,       // REMOVE — redundant with multiplier
STREAK_MILESTONE_20: 20,       // REMOVE — redundant with multiplier
```

## Constants to Update
```typescript
// Update XP_SINKS
COUPON_GENERATE: 50,           // Unchanged
COUPON_CLAIM_SHOPPER: 25,     // NEW — shopper spends for discount
RARITY_BOOST: 15,              // Unchanged
HUNT_PASS_DISCOUNT: 50,        // Unchanged
CUSTOM_USERNAME_COLOR: 50,     // Up from 25
CUSTOM_FRAME_BADGE: 75,        // Up from 30
HAUL_VISIBILITY_BOOST: 10,     // Unchanged
BOUNTY_VISIBILITY_BOOST: 15,   // Up from 5
SEASONAL_CHALLENGE_ACCESS: 100, // Unchanged
GUIDE_PUBLICATION: 50,         // Up from 30
EARLY_ACCESS_BOOST: 75,        // Unchanged
LISTINGS_EXTENSION: 100,       // Unchanged
EVENT_SPONSORSHIP: 150,        // Unchanged

// Update MONTHLY_XP_CAPS
VISIT: 150,                    // Unchanged
AUCTION: 100,                  // Unchanged
RSVP: 10,                      // Unchanged
CONDITION_RATING: 50,          // New cap (was in spec)
COMMUNITY_VALUATION: 100,      // Update cap (20 actions/month)
HAUL_ENGAGEMENT: 50,           // Cap for earning from others' hauls
HAUL_POST_LIKES: 50,           // Cap for earning from haul likes
REVIEW_TEXT: 30,               // Cap for seller reviews
REVIEW_PHOTO_BONUS: 30,        // Cap for review photo bonus
SOCIAL_SHARE: 200,             // Unchanged
ITEM_SCANNED: 150,             // Hunt Pass cap (was 100 for non-subscribers)
BOUNTY_ORG_POSTED: 500,        // Cap for all org-posted bounties/month
QUEUE_BONUSES: 100,            // Cap for virtual queue total/month
```

## Constants to Remove
```typescript
// Delete entirely
ITEM_SCANNED: 25,              // Replaced by treasure hunt constants
STREAK_MILESTONE_5: 5,         // Weekly multiplier replaces daily milestones
STREAK_MILESTONE_10: 10,
STREAK_MILESTONE_20: 20,
STREAK_BONUS_PER_WEEK: 2,     // Old daily streak; delete
COMEBACK_BONUS: 20,            // No longer used; delete
```

## Function Updates

### 1. Remove rankFloor logic from spendXp()
```typescript
// Before (lines 312–364):
// Had spendableXP = currentXP - rankFloor[currentRank]
// Delete entire floor check. Replace with:

export async function spendXp(
  userId: string,
  amount: number,
  sinkType: string,
  context?: {
    saleId?: string;
    description?: string;
  }
): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.guildXp < amount) {
      return false; // Insufficient XP — that's it
    }

    // Deduct XP
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        guildXp: {
          decrement: amount,
        },
      },
    });

    // Create negative transaction record
    await prisma.pointsTransaction.create({
      data: {
        userId,
        type: sinkType,
        points: -amount,
        saleId: context?.saleId,
        description: context?.description,
      },
    });

    return true;
  } catch (error) {
    console.error(`[xpService] Failed to spend ${amount} XP for user ${userId}:`, error);
    return false;
  }
}
```

### 2. Delete checkStreakMilestones() entirely
This function (lines 530–565) checks for STREAK_MILESTONE_5/10/20. Remove it. Weekly multiplier replaces this logic (that goes in the streak service, not XP service).

### 3. Add new function: checkWeeklyStreakBonus()
```typescript
/**
 * Check and award 7-day streak bonus
 * Called when streak reaches 7 consecutive days
 * Once per calendar month
 */
export async function checkWeeklyStreakBonus(
  userId: string,
  streakDays: number
): Promise<void> {
  if (streakDays !== 7) return; // Only trigger at exact 7 days

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const existingBonus = await prisma.pointsTransaction.findFirst({
      where: {
        userId,
        type: 'STREAK_7DAY_BONUS',
        createdAt: { gte: monthStart },
      },
    });

    if (!existingBonus) {
      await awardXp(userId, 'STREAK_7DAY_BONUS', 100, {
        description: '7-day active streak bonus',
      });
    }
  } catch (error) {
    console.error(`[xpService] Failed to award 7-day streak bonus:`, error);
  }
}
```

### 4. Add new function: checkMonthlyAnniversary()
```typescript
/**
 * Check and award 30-day active anniversary bonus
 * Called once per calendar month for users with 30+ days of activity lifetime
 * Resets each month (can earn multiple times)
 */
export async function checkMonthlyAnniversary(userId: string): Promise<void> {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Check if user already earned this month
    const existingAnniversary = await prisma.pointsTransaction.findFirst({
      where: {
        userId,
        type: 'ANNIVERSARY_30DAY',
        createdAt: { gte: monthStart },
      },
    });

    if (!existingAnniversary) {
      // Only award if user has 30+ days activity lifetime
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });

      if (user && new Date().getTime() - user.createdAt.getTime() >= 30 * 24 * 60 * 60 * 1000) {
        await awardXp(userId, 'ANNIVERSARY_30DAY', 250, {
          description: '30-day anniversary milestone',
        });
      }
    }
  } catch (error) {
    console.error(`[xpService] Failed to check 30-day anniversary:`, error);
  }
}
```

---

# SECTION 3: CONTROLLER-LEVEL CHANGES

## treasureHuntQRController.ts
Hardcoded values (25 + 50) must be replaced with XP_AWARDS constants:

```typescript
// Before (currently hardcoded):
// const scanXp = 25;
// const completionXp = 50;

// After:
import { XP_AWARDS } from '../services/xpService';
const scanXp = XP_AWARDS.TREASURE_HUNT_SCAN;    // 12
const completionXp = XP_AWARDS.TREASURE_HUNT_COMPLETION; // 30
```

## auctionController.ts
Update auction win logic:

```typescript
// Before:
const auctionXp = XP_AWARDS.AUCTION_WIN; // was 15

// After:
const baseXp = XP_AWARDS.AUCTION_WIN; // now 10
const valueBonus = Math.min(
  Math.floor((itemValue / 100) * XP_AWARDS.AUCTION_VALUE_BONUS_PER_100),
  XP_AWARDS.AUCTION_MAX_BONUS
);
const totalAuctionXp = baseXp + valueBonus;
```

## valuationController.ts (new or updated)
Add community valuation logic (currently not in code):

```typescript
import { XP_AWARDS, checkMonthlyXpCap, awardXp } from '../services/xpService';

export async function submitItemValuation(req, res) {
  // Shopper submits a price opinion on an item
  const { itemId, estimatedPrice } = req.body;
  const userId = req.user.id;

  // Check monthly cap
  const remaining = await checkMonthlyXpCap(userId, 'COMMUNITY_VALUATION');
  if (remaining <= 0) {
    return res.status(400).json({ error: 'Monthly valuation XP cap reached' });
  }

  // Create valuation record
  await prisma.communityValuation.create({
    data: {
      itemId,
      userId,
      estimatedPrice,
    },
  });

  // Award XP (capped)
  const awardAmount = Math.min(XP_AWARDS.COMMUNITY_VALUATION, remaining);
  await awardXp(userId, 'COMMUNITY_VALUATION', awardAmount);

  return res.json({ xpAwarded: awardAmount });
}
```

---

# SECTION 4: SUMMARY TABLE: OLD → NEW

| Feature | Old | New | Change | Notes |
|---------|-----|-----|--------|-------|
| Treasure hunt scan | 25 XP | 12 XP | -13 | Balanced vs auction win |
| Treasure hunt completion | 50 XP | 30 XP | -20 | Proportional reduction |
| Auction win (base) | 15 XP | 10 XP | -5 | Reduced dominance |
| Custom color | 25 XP | 50 XP | +25 | Cosmetic prestige |
| Custom badge | 30 XP | 75 XP | +45 | Cosmetic prestige |
| Bounty visibility boost | 5 XP | 15 XP | +10 | Not disposable |
| Guide publication | 30 XP | 50 XP | +20 | Parity with reward |
| Condition rating | Shopper → Organizer | Organizer action | Moved | Incentivizes org behavior |
| Item photo quality | 3 XP (30/mo) | REMOVED | Removed | Vague, not implemented |
| Community mentor | 25 XP (100/mo) | REMOVED | Removed | Vague, not implemented |
| Community valuation | 10 XP | 5 XP | -5 | Reduced vs visit (5 XP) |
| Community valuation cap | 100/mo (10 max) | 100/mo (20 max) | +10 actions | More generous |
| Coupon claim (new) | — | 25 XP | Added | Shopper sink |
| Weekly streak bonus | 5/10/20 daily | 100 (7-day once/mo) | Replaced | Clearer system |
| 30-day anniversary | — | 250 XP once/mo | Added | Long-term engagement |
| Rank floor | `spendableXP - floor` | Removed | Simplified | Milestone-only ranks |
| Streak multiplier | `+2/week` | 1.2x all earned | Updated | Board-locked spec |

---

# SECTION 5: FINAL LOCKED SPECIFICATIONS (UPDATED)

## Rank System (Simplified)
- **Initiate:** 0 XP lifetime
- **Scout:** 500 XP lifetime (earned once, rank persists forever)
- **Ranger:** 2,000 XP lifetime
- **Sage:** 5,000 XP lifetime
- **Grandmaster:** 12,000 XP lifetime
- **Rank Floor Logic:** REMOVED. Spending XP does not lower rank.
- **Seasonal Reset:** Drop one tier max (Grandmaster → Sage only). But rank floor logic still gone.

## Treasure Hunt (Updated)
- Per clue scan: **12 XP** (was 25)
- Completion bonus: **30 XP** (was 50)
- Example 4-clue hunt: 12×4 + 30 = **78 XP total** (was 150+)

## Auction Win (Updated)
- Base: **10 XP** (was 15)
- Value bonus: +0.5 XP per $100, max +5 XP
- Example $500 item: 10 + 5 = **15 XP** (was 15, now justified by value, not base)

## Sinks (Updated Pricing)
- Custom username color: **50 XP** (was 25)
- Custom frame badge: **75 XP** (was 30)
- Bounty visibility boost: **15 XP** (was 5)
- Guide publication: **50 XP** (was 30)
- Coupon claim (shopper): **25 XP** (new)
- All other sinks unchanged from spec

## New Features
- **Condition grade submission:** Organizer earns 5 XP (50/mo cap)
- **Coupon claim:** Shopper spends 25 XP for $0.50–$1 discount
- **Weekly streak bonus:** 100 XP once/month at 7-day activity
- **30-day anniversary:** 250 XP once/month for active players

## Removed Features
- **Item photo quality:** Removed (3 XP, not implemented)
- **Community mentor session:** Removed (25 XP, vague trigger)
- **Daily streak milestones:** Removed (5/10/20); replaced by 1.2x multiplier
- **Rank floor logic:** Removed from spend calculations

---

**Status:** LOCKED — All 14 decisions made. Code migration path specified.  
**Next step:** Architect review of code changes + dev implementation (single-pass, findasale-dev subagent).  
**Affected files:** xpService.ts, treasureHuntQRController.ts, auctionController.ts, valuationController.ts, [any feature controller that awards XP].


---

# SECTION 2: S418 FOLLOW-UP DECISIONS

**Date:** 2026-04-08 (S418)
**Scope:** Patrick's second round of game design questions. Locked decisions applied to hunt-pass.tsx and xpService.ts.

---

### QR Clue Scan XP — Keep 12 XP

DECISION: Keep TREASURE_HUNT_SCAN at 12 XP. Do not lower further.
PLAYER EXPERIENCE: Scanning a QR clue feels meaningfully rewarded — 12 XP is double a sale visit and reflects the physical effort of being at a location.
RATIONALE: The 100 XP/day cap is the real exploit limiter (~8 scans to hit it). Physical gating prevents digital farming. If post-launch data shows excessive rank acceleration from TH scans alone, lower the daily cap (100 → 75) before touching the per-scan value.
IMPACT: LOW.

---

### Seasonal Challenge Access Cost — Raised to 250 XP

DECISION: SEASONAL_CHALLENGE_ACCESS raised from 100 XP to 250 XP. Updated in xpService.ts (gamedesign S418).
PLAYER EXPERIENCE: A Scout (500 XP floor) needs to earn 250 more before unlocking seasonal content — a meaningful mid-tier goal, not a day-one free pass.
RATIONALE: At 100 XP, the gate was trivially cheap given that seasonal challenges return 100–500 XP across a season. At 250 XP, the sink breaks even after two easy challenges. Hunt Pass holders still get seasonal access free, making this a concrete Hunt Pass value driver for non-subscribers.
IMPACT: MEDIUM on retention. Breaks even quickly so it won't drive away casual users.

---

### Guide Publication — Keep 50 XP

DECISION: GUIDE_PUBLICATION stays at 50 XP for Ranger-level. Free for Sage+. Grandmaster unlimited.
RATIONALE: The cost gate filters spam without punishing real content creators (50 XP is low friction at Ranger level). "Free for Sage+" is the correct incentive structure — it's a perk, not a tax removal.
IMPACT: LOW.

---

### Shopper Coupon Sink — Added to Page

DECISION: Added COUPON_CLAIM_SHOPPER (25 XP) to hunt-pass.tsx sinks. Was missing from page; the organizer COUPON_GENERATE sink was the only coupon entry listed.
PLAYER EXPERIENCE: Shoppers spend 25 XP for a $0.50–$1 discount at any participating sale — one per organizer per month.
RATIONALE: Closes the loop. Organizers CREATE coupons (50 XP), shoppers CLAIM discounts (25 XP). Both are in xpService.ts; only the organizer side was visible on the page. This is the most intuitive sink for a bargain-hunting demographic.
IMPACT: MEDIUM on retention. Direct XP → real savings.

---

### Streak Freeze — Future Sink (Locked Design, Not Yet Built)

DECISION: Streak Freeze (75 XP, one-time use, preserves active week status for one missed week) is locked as a future sink. Add to xpService.ts and hunt-pass.tsx when shipped.
RATIONALE: Duolingo's streak freeze is one of their highest-retention features. For weekend sale hunters who might miss a week, the ability to protect streak momentum is high-value. 75 XP is meaningful (a day's engagement) for a one-time use.
IMPACT: HIGH on retention if built. Defer to post-beta.

---

### Item Photo Quality & Community Mentor Session — Removed

DECISION: Both rows removed from hunt-pass.tsx XP earning table. Neither event exists in xpService.ts.
RATIONALE: Phantom XP sources erode trust. Remove now, add back if/when built.
IMPACT: LOW.

---

### Seasonal Bounty Fulfillment — Moved to Seasonal Challenges Section

DECISION: Row moved from Community section to Seasonal Challenges section in the full XP table.
RATIONALE: Seasonal bounties are seasonal mechanics, not everyday community actions.
IMPACT: LOW (organization only).

---

## Section 3 — S418 Pass 4/5 Decisions (Exchange Rate, New Sinks, Dual-Rail, Coupons, Refunds)

Locked 2026-04-08. Anchor: **1 XP = $0.01** (from S388 spec, PURCHASE = 1 XP per $1 spent).

### Exchange-rate calibration (all shopper sinks now anchored)

| Sink | Old | New | Rationale |
|---|---|---|---|
| Custom Username Color | 50 XP | 100 XP | Permanent cosmetic should feel earned |
| Custom Frame Badge | 75 XP | 200 XP | Permanent cosmetic, status symbol |
| Haul Visibility Boost | 10 XP | 25 XP | $0.10 was almost free for 7-day promo |
| Event Sponsorship | 150 XP | 500 XP | $1.50 absurdly cheap vs EstateSales.net $15-30 |
| Shopper $1 off coupon | (added) | 100 XP | 1:1 with $1 = 100 cents |
| Hunt Pass $1 discount | 50 XP | 100 XP | 1:1 alignment |
| Seasonal Challenge Access | 100 XP | 250 XP | Premium content, $2.50 anchor |

### Removed phantom earning row

"Public collection guide" was listed as both an EARNING (50/75 XP) and a SINK (50 XP). It is a SINK only — guide publication costs XP, doesn't award it. Earnings row removed from hunt-pass.tsx.

### New sinks approved (7 — to be built via BoostPurchase service)

| Sink | XP cost | Cash cost | Duration | Notes |
|---|---|---|---|---|
| Sale Bump | 50 XP | $0.50 | 1 hour | Push sale to top of map/list at peak browse times |
| Treasure Trail Sponsor | 100 XP | $1.00 | sale duration | Mini scavenger hunt attached to sale |
| Wishlist Notification Boost | 30 XP/mo | $0.30/mo | 30 days | First-alert when matching item posted |
| Lucky Roll / Mystery Box | 100 XP | XP only | weekly | Gacha — needs separate design pass |
| Profile Showcase Slot | 50/150 XP | XP only | permanent | Pin favorite hauls to profile |
| Guild/Crew Creation | 500 XP | XP only | permanent | Named collector crews, social retention |
| Custom Map Pin | 75 XP | XP only | permanent | Replace default pin with themed icon |

**Guiding principle:** Time-sensitive/opportunity-based sinks get a cash rail. Permanent cosmetics and status symbols stay XP-only.

### Dual-rail system (locked — see ADR)

A unified `BoostPurchase` service handles all 8 promotional boost types with two payment rails (XP via xpService.spendXp, or Stripe via platform-account paymentIntent). Adding a future boost requires only: enum value + pricing row + UI button. Full ADR at `claude_docs/feature-notes/ADR-featured-boost-dual-rail-S418.md`.

**Cash-rail boosts:** Sale Bump, Haul Visibility, Bounty Visibility, Event Sponsorship, Wishlist Notification, Seasonal Challenge Access, Guide Publication, Rarity Boost.

**XP-only:** All cosmetics + Lucky Roll + Profile Showcase + Guild Creation + Custom Map Pin.

### Shopper coupon system (locked)

Three tiers, all require Stripe-cleared transactions to redeem, none stack with organizer-issued coupons, all expire 30 days after generation:

| Coupon | XP cost | Min purchase | Monthly cap | Net to us |
|---|---|---|---|---|
| $1 off any $10+ purchase | 100 XP | $10 | 1/mo | $0 (breakeven) |
| $1.50 off any $20+ purchase | 150 XP | $20 | 3/mo | +$0.50/redemption |
| $5 off any $50+ purchase | 500 XP | $50 | 1/mo | $0 (breakeven) |

**Anti-fraud:** Tied to real Stripe payment, monthly per-shopper caps, no stacking with organizer coupons, 30-day expiry. Sock-puppet farming requires real card transactions which is much harder than free-account farming.

### Refund policy (locked)

**Stripe rail:** Admin-only refunds. Two auto-refund cases: (a) Stripe charged but webhook didn't fire and reconciliation failed within 24h, (b) targeted entity deleted within 1 hour of purchase (e.g. organizer cancelled the sale). Everything else goes to support queue.

**XP rail:** No refunds. XP refunds create rank-up/rank-down chaos and an obvious abuse path. Same two auto-refund exceptions apply.

**Self-serve undo window:** 5-minute "undo" button on the boost purchase success modal. After 5 minutes, no self-serve cancellation.

**Industry comparison:** Matches Facebook Ads, Google Ads, eBay Promoted Listings, Etsy Offsite Ads — all admin-discretionary, no self-serve refunds for digital promotion purchases. Most mobile games have zero XP refunds (Clash Royale, Genshin, Pokémon GO).

### Lucky Roll / Mystery Box — DEFERRED

Excluded from BoostPurchase ADR. Needs separate gacha-design session: pity counter, reward table, weekly cap, randomness fairness model, regulatory considerations (loot boxes are regulated in some jurisdictions). Recommend findasale-gamedesign session before architect work.

### Wishlist Notification subscription mode — DEFERRED

Shipping as monthly one-shot first (user re-buys each month). Revisit Stripe Subscription mode if churn data shows users forget to re-buy.

### Featured slot scarcity cap

Hard-coded to **max 5 featured pins per viewport** initially. Adjustable via env var. Validate against first 10 organizers' usage before tuning.

