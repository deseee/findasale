# Executive Summary: FindA.Sale Gamification Research
## For Patrick – Key Decisions & Recommendations

**Document:** Full research available in `gamification-xp-economy-S259.md`

---

## Your Questions Answered

### 1. "Uncapped is probably ok" – Grandmaster Hunt Pass
**CONFIRMED.** Grandmaster tier does NOT reset seasonally. Once you reach Grandmaster, you stay there. Hunt Pass progress carries over (you don't lose it on annual reset). This aligns with how Call of Duty handles Prestige—you earned it, you keep it.

---

### 2. "What do video games do for seasonal resets?"
**Soft reset (not hard reset).** Every major game uses it:
- Fortnite: Account level persists, only season BP resets
- Apex Legends: Drop 1.5 tiers (Diamond → Platinum)
- League of Legends: Tier-based soft reset
- Clash Royale: Partial reset to 10–12K trophy range
- Path of Exile: Full hard reset *because* there's a permanent "Standard" backup (safety net)

**For FindA.Sale:** Annual reset (January 1). Tier 1 → Copper, Tier 2+ → Bronze, Tier 3+ → Silver. Grandmaster uncapped. All badges/achievements persist. Organizers see your "peak" history. This matches seasonal estate sale shopping patterns.

---

### 3. "What would a game designer use for daily engagement?"
**Three layers:**

**A. Streak mechanic** – 7-day weekly streak (resets Mondays, no cascade guilt). Duolingo gets 3.6x better completion rates with streaks. Loss aversion works.

**B. Escalating rewards** – Day 1 = +500 XP, Day 7 = +2500 XP (5x). Pokemon GO model. Creates "almost there" momentum.

**C. Appointment mechanic** – Weekly quests (expire after 7 days). Fortnite's approach. Creates urgency without punishment.

**For FindA.Sale:** Daily login (10 XP) → Weekly active (3+ days = 25 XP bonus) → 30-day prestige tracker (Pathfinder/Scout/Ranger badges). Seasonal mini-quests rotate Thursdays.

**Expected behavior:** Casual shoppers hit "Weekly Active" without grinding. Engaged collectors can earn Ranger prestige (3+ consecutive months).

---

### 4. "What else could be the Sage tier big payoff?" (No organizer coercion)
**Option C is the winner: Loot Legend.**

Sage-tier unlock a personal collection registry showing all items ever purchased, total spend, favorite categories, and a public shareable profile. Leaderboards by category ("Antiques Collector #1 Grand Rapids"). Monthly featured collectors on FindA.Sale homepage.

**Why it wins:**
- Taps into collector identity (these people *love* showing off)
- Tangible portfolio/status (not a badge)
- Zero organizer participation required
- Highly shareable ("Check out my Loot Legend—1,200+ pieces")
- Very high virality potential

Alternative B (Treasure Trail – gamified discovery with leaderboards) is strong secondary. Alternative A (Passport) is lower priority but buildable.

---

### 5. "No discounts" – Organizer compensation
**CONFIRMED.** Done. Sage payoff is shopper-centric, not organizer-dependent.

---

### 6. "What else could we offer? XP economy design?"
**Complete table in research document.** Key decisions:

**Flat per-item (NOT dollar-tied):**
- Buy any item: 15 XP (protects bargain hunters)
- Buy $50+ order: +25 XP bonus (incentivizes larger hauls)
- Reject dollar-tied rewards (estate sale shoppers are bargain hunters, not whales)

**Why not dollar-tied:**
- Starbucks/airlines do it, but FindA.Sale is different
- Estate shoppers value *volume* (10 × $5 finds) over prestige
- Would punish browsers and create "pay-to-win" perception

**Shareable actions (highest virality):**
- Referral (friend signup): 50 XP → 75 XP (first purchase) = 5/5 virality
- Auction win: 40 XP + shareable moment = 4/5 virality
- Photo upload: 10 XP + auto-suggest Instagram share = 4/5 virality
- Social share: 20 XP per sale share = 4/5 virality
- Wishlist item found: 30 XP + notification = 4/5 virality

**Reasonable monthly totals:**
- Casual (1–2 visits/week): 540 XP/month → 6,480/year
- Regular (3–4 visits/week): 840 XP/month → 10,080/year
- Hardcore (daily): 2,360 XP/month → 28,320/year

**Grandmaster:** 5,000+ lifetime XP. Casual players hit it in 10 months. Hardcore players hit it in 2 months. Prestige is earned, not bought.

---

## What's Ready to Build vs. What Needs Your Input

### ✅ Ready to Implement (No decisions needed)
- Daily login + weekly streak system
- Tier progression (Copper → Ruby → Emerald → Amethyst → Diamond → Grandmaster)
- XP values for all standard actions (purchase, review, visit, share)
- Loot Legend Sage perk
- Seasonal mini-quest system (5 quests/week, rotate Thursdays)
- Auction mechanics and rewards
- Social share capture + notification loops
- Referral incentive structure

### ⚠️ Needs Patrick Decision
1. **Hunt Pass pricing & multiplier** – Is $4.99/month + 1.5x XP multiplier right? Or different price/multiplier?
2. **Sage perk priority** – Build Loot Legend first, then Treasure Trail in Phase 2?
3. **Referral unlock behavior** – Should referral milestones unlock exclusive features (e.g., "early access to sales")?
4. **Wishlist trigger** – Discovery-focused (just notify) or scarcity-focused (limited-time auction when item found)?
5. **Seasonal challenge ownership** – Who designs challenges? FindA.Sale team, community vote, or organizer-requested?
6. **Share rate caps** – Current: 1 sale share/day, 2 item shares/day. Too strict? Should enable unlimited with decay?

---

## Budget Estimate (Dev time)

Based on typical gamification implementation:

- XP/tier system: 40 hours
- Hunt Pass (passes + multiplier): 30 hours
- Loot Legend (collection registry + leaderboard): 50 hours
- Treasure Trail (optional Phase 2): 40 hours
- Seasonal challenges system: 25 hours
- Viral notification system: 20 hours
- Badge/prestige rendering: 15 hours

**Total: ~180–220 hours (5–6 weeks, 2-person team)**

Recommend Phase 1: XP + Hunt Pass + Loot Legend (12 weeks), Phase 2: Treasure Trail + advanced challenges.

---

## Next Step
Review decisions section (8 items above). Return with your picks, and findasale-dev will dispatch implementation tasks.
