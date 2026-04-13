# Explorer's Guild — RPG Economy Spec (S260)

**Research Date:** 2026-03-23
**Status:** All 8 decisions resolved. Ready for Patrick approval → dev dispatch.

---

## RPG Research Findings

### A. Loot Systems (Rarity & Item Scarcity)

- Loot tables use **weighted random selection** — rare items have very low probability weights. Path of Exile's 4-tier system (Normal→Magic→Rare→Unique) demonstrates effective scarcity.
- Games prevent loot inflation through **pity mechanics** (guaranteed drops after N tries) and **seasonal resets** that refresh the item economy.
- **Variable reward schedules** (unpredictable but possible rewards on every action) drive engagement more than fixed rewards. This is the "slot machine effect."
- FindA.Sale application: item rarity should be tied to hunt difficulty and sale size — a rare find from a $500+ estate sale feels more meaningful than one from a $20 yard sale.

### B. XP Economy & Sinks (Preventing Inflation)

- A **currency sink** removes currency from circulation; without sinks, economies hyperinflate (RuneScape taxes 1% per Grand Exchange trade; WoW uses expensive cosmetic mounts).
- Games that produce XP constantly without draining it see top players with millions of XP while new players can't compete, and rare items become worthless.
- **Real sink mechanisms:** degrading items that need XP to repair (RuneScape), expensive cosmetics that don't affect gameplay (WoW), transaction taxes (Grand Exchange).
- Key insight: **the best sinks feel desirable, not punishing.** Players spend because they WANT to, not because they must.

### C. Abuse Prevention Patterns

- **Duolingo:** Limited streak freezes (3 free at day 100, then 100-day wait). Scarcity prevents gaming.
- **MMO bot detection:** Bots detected via action frequency (too regular), traffic patterns (identical command sequences), and behavioral anomalies (zero sleep time, sudden account switches).
- **eBay feedback fraud:** Multi-layered: reputation tracking, pattern analysis (collusion rings), user reporting.
- **Beta MVP approach:** Focus on observation, not automation. Log everything, act only on clear patterns (e.g., 500 bids in 1 hour, 10 accounts from same IP in 1 day).

### D. Reward Currency Design

- **Starbucks model:** 60 Stars = $2 off, 200 Stars = $10 item. Per-item caps prevent over-redemption. Users earn ~1–1.7 Stars per dollar spent.
- **Over-redemption prevention:** Per-customer limits, per-time-period limits (1 coupon/week), percentage caps (max 20% off), minimum purchase thresholds.
- Key principle: make currency feel abundant but not worthless. Starbucks caps redemption value per item ($16 max).

---

## 8 Decisions Resolved

### Decision 1: Seasonal Reset Floor

**APPROVED: Option A — Tiered one-level drop, no more**

- Grandmaster → Sage floor
- Sage → Ranger floor
- Ranger → Scout floor
- Scout stays Scout
- Initiate stays Initiate

*Rationale: Prevents catastrophic status loss that causes abandonment. Mimics Duolingo streak freeze philosophy. Top performers still feel demotion threat; casual players keep their spot.*

---

### Decision 2: Visit XP Formula

**APPROVED: Streak-based with diminishing returns + comeback bonus**

```
Visit XP Formula:
- Base: 10 XP per visit to any sale
- Streak bonus: +2 XP per consecutive week active (max +10 XP at 5+ consecutive weeks)
  (Resets to 0 if user skips a week entirely)
- Diminishing returns: only 1 visit per day earns XP (no same-sale spam)
- Comeback bonus: +20 XP one-time if returning after 2+ weeks away
- Monthly cap: 150 XP from visits only
```

*Rationale: Streak creates habit formation and anticipation. Comeback bonus prevents "I missed one week, I'm done" abandonment. Beats flat 5 XP/visit psychologically.*

---

### Decision 3: Sage-Level Payoffs (3 new rewards)

**APPROVED: Three distinct, FindA.Sale-specific Sage perks**

1. **Sage's Sourcebook** — Sage users can publish public hunting guides (e.g., "Furniture Scores at Grand Rapids Estate Sales"). Other users see the guide tagged with "by @username (Sage)." Sage gets 2 free guide slots; lower ranks pay 30 XP to publish. *Leverages real expertise, gives Sage a permanent platform.*

2. **Early Bird Alerts (48-hour advance notification)** — Sage users notified 48 hours before a sale goes live (vs. 24 hours for Ranger/Scout), with optional preliminary inventory preview if organizer opts in. *Real competitive advantage without gatekeeping content.*

3. **Sage Coupon Tier** — $3 off $20+ purchases (vs. Scout $1 off, Ranger $2 off). 2 free coupons/month; additional cost 25 XP each. *Direct economic reward tied to actual shopping behavior.*

---

### Decision 4: Top 5 Shareable XP Moments (Ranked by Virality)

**APPROVED:**

1. **Legendary Find** — User finds $500+ item, adds to Loot Legend. Shareable card: photo + value + "I found this treasure!" (#1 because estate sale discovery IS the FindA.Sale narrative)
2. **Grandmaster Rank Up** — Auto-card: "I just reached Grandmaster! Found X items worth $TOTAL" (#2 because achievement milestones are inherently shareable)
3. **Auction Win Streak** — 3+ auction wins in one calendar month → "I'm on a winning streak!" (#3 appeals to auction competitors)
4. **Hunt Pass Unlock** — Reaching Scout, unlocking Hunt Pass offer (#4 moderate virality, monetization moment)
5. **Seasonal Collector** — Completing 1 item from each rarity tier in a season (#5 niche appeal, requires understanding the system)

*All cards use Loot Legend's shareable URLs + FindA.Sale branding + deep link to user's public collection.*

---

### Decision 5: Auction XP

**APPROVED: Wins Only**

```
Auction Win XP Formula:
- Base: 15 XP per auction win
- Value multiplier: +0.5 XP per $100 of item value, capped at +5 XP
- Max: 20 XP per win
- Monthly cap: 100 XP from auction wins
```

*Rationale: Per-bid XP enables bid-spam farming and inflates bid counts. Wins-only is fair (anyone can win), harder to fake, and ties reward to real commerce. Winning feels earned.*

---

### Decision 6: Social Share XP

**APPROVED: Honor system with audit flags (migrate to verified in Year 2)**

```
Implementation:
- User completes shareable action → app generates card
- User clicks "Share" → prompted "Did you share this with at least 1 friend?"
- Yes → +10 XP (no verification)
- Audit flags: >5 social shares per day = flagged; same content shared from 5 new accounts in 1 hour = bot ring flag
```

*Rationale: OAuth integration = 2–3 days dev + 3 days QA. Downside of honor fraud = 10 undeserved XP. Cheaper to ship fast and iterate.*

---

### Decision 7: 3 XP Sinks

**APPROVED:**

1. **XP → Coupon Generation (Organizer sink)** — Organizer spends 20 XP to create a $1-off coupon for shoppers. 5 coupons = 100 XP spent. *Creates a cycle: shopper earns XP → helps organizer → organizer attracts more shoppers.*

2. **XP → Rarity Boost (Shopper sink)** — Shopper spends 15 XP before a specific sale to increase their Legendary find chance by +2% for that sale only. *Doesn't guarantee anything; tilts odds. Creates per-sale spending decisions.*

3. **XP → Hunt Pass Discount (Bridge free→paid)** — Shopper spends 50 XP to get $1 off Hunt Pass ($3.99 instead of $4.99). *Large XP sink, monetization-forward, lets Scouts try Hunt Pass risk-free.*

---

### Decision 8: Item Rarity Tiers for Loot Legend (4-tier system)

**APPROVED:**

| Tier | Name | % of Finds | How Earned | Visual |
|------|------|-----------|-----------|--------|
| 1 | **Common** | ~60% | Any logged purchase (requires photo + description to prevent spam) | Gray/white icon |
| 2 | **Uncommon** | ~25% | Sale >$500, OR item valued $50–$150 | Blue/teal, subtle glow |
| 3 | **Rare** | ~12% | Item valued $150+, OR collector's sale tag. Requires organizer validation OR shopper submits photo + description | Purple, prominent glow, larger thumbnail |
| 4 | **Legendary** | **<3%** | Item valued $500+, OR authenticated collectible (shopper + organizer both confirm), OR item >10x median sale value. Monthly quota: max 10 Legendary/organizer/month | Gold, animated glow, shareable highlight card |

*Key design: Organizer approval gate prevents self-inflation at Legendary tier. Seasonal Loot Legend persists across resets (your collection is forever).*

---

## Abuse Prevention MVP

| Risk | Guard | Complexity |
|------|-------|------------|
| XP farming via visit spam | Cap: 1 visit XP per sale per day. Flag: >50 visits in 24h. | Low |
| Referral fraud (fake accounts) | Accounts need unique email + optional SMS verification (+10 XP incentive). Flag: 10+ accounts from same IP in one day. | Low |
| Bid spam (if per-bid XP were used) | N/A — wins-only XP approved. | N/A |
| Account sharing for rank boosts | Detect: login from 5+ countries in 1 day, OR 5+ auction wins in 1 hour. First offense: warning. Repeat: 7-day cooldown. | Medium |
| Bot ring (collusion) | Flag: 5+ accounts same IP claiming same social shares. Log for manual review. | Low |
| Rarity inflation (self-claimed Legendary) | Organizer approval gate. Seasonal audit: flag if user avg item value >2x median. | Medium |

**Beta implementation approach:**
- Weeks 1–2: Log all events, no blocking. Build flag dashboard.
- Weeks 3–4: Add simple blocks (visit cap, rarity gate).
- Post-beta: Automate decisions based on observed patterns.

---

## Spec Lock Readiness

### All 8 Decisions Resolved ✓

### 6 Items for Patrick to Confirm Before Dev Dispatch

1. **Rarity valuation guide** — Should we ship a simple organizer valuation guide with onboarding (e.g., "Furniture $50–$200, Collectibles $200–$500, Antiques $500+")? *Recommendation: Yes.*

2. **XP sink values** — Are 20 XP/coupon, 15 XP/boost, 50 XP/Hunt-Pass discount the right amounts? Scale by tier later? *Recommendation: Start flat, adjust based on Season 1 data.*

3. **Founder bonus** — First 100 signups: +50% XP for first month if joined before end of April? *Recommendation: Yes (soft launch incentive). No free items.*

4. **Grandmaster Hunt Pass permanence** — Free all year every year? Or only while Grandmaster? *Recommendation: Free forever once earned (keep even if tier drops). It's the ultimate earned flex.*

5. **Reset timing** — January 1st midnight UTC? *Recommendation: UTC midnight (global event feel).*

6. **Loot Legend referral loop** — Track shared Loot Legend link clicks; reward sharer with 20 XP per new signup via their link? *Recommendation: Yes — social loop flywheel.*

---

## Dev Handoff (Once Patrick Signs Off)

### Schema Impact
- Add `rarity` enum to Loot Legend items: `COMMON | UNCOMMON | RARE | LEGENDARY`
- Add `seasonalResetAt` timestamp to User
- Add `explorerRank` to User: `INITIATE | SCOUT | RANGER | SAGE | GRANDMASTER`
- Audit/flag tables: `xp_fraud_flags` (visit_spam, account_sharing, etc.)
- XP sink tables: `xp_coupon_transactions`, `rarity_boosts`, `hunt_pass_discounts`

### Frontend Components Needed
- Shareable moment cards (5 variants)
- Rarity tier badges (4 visual variants with glow/animation for Legendary)
- XP sink UI (coupon generator, rarity boost selector, Hunt Pass discount)
- Loot Legend rarity filter + animated Legendary item display
- Seasonal reset notification + tier floor announcement

### API Endpoints Needed
- `POST /xp-sinks/coupon-generate` — organizer spends XP, creates shopper coupon
- `POST /xp-sinks/rarity-boost` — shopper spends XP, boosts odds for a specific sale
- `GET /user/:id/loot-legend` — with rarity filter param
- `POST /loot-legend/item` — with organizer approval workflow for Rare/Legendary
- `POST /xp/social-share-claim` — honor system social share claim

---

*Research sources: LootLocker, Game Developer, Path of Exile wiki, Medium (game economics), Duolingo analysis, RuneScape/OSRS wiki, Starbucks 2026 rewards announcement, Loyalty & Reward Co., Referral Candy*
