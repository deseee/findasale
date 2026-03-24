# FindA.Sale Gamification System — Revised Final Specification
## Implementation-Ready for Developer Dispatch (Session 259)

**Prepared by:** Innovation Agent with four-lens analysis (Innovation, User Champion, Investor, Technical Architect)
**Status:** Board Decisions Locked + Open Design Areas Resolved + Four-Lens Tensions Surfaced
**Confidence:** Ready for dev dispatch after final Patrick review of Tensions section

---

## EXECUTIVE NARRATIVE (FINAL)

**The Explorer's Guild: Permanent Rank Achievement + Seasonal Expedition Framework**

FindA.Sale shoppers progress through five permanent ranks (Initiate → Scout → Ranger → Sage → Grandmaster) that unlock functional rewards at each tier: recurring discounts, priority support, exclusive presale access, and free annual Hunt Pass. Every quarter, they compete on seasonal leaderboards themed as "expeditions" (Spring Awakening, Summer Adventure, Fall Collection, Winter Treasures) without losing permanent rank — solving the veteran-engagement cliff that kills other gamification systems. Organizers earn parallel Host Ranks based on sale quality, shopper satisfaction, and community contribution, unlocking prestige-only rewards: featured placement, service credits, and API access.

The system scales across all five secondary-market sale types (estate sales, yard sales, auctions, flea markets, consignment), differentiating FindA.Sale from competitors (eBay, Poshmark, Etsy) by combining permanent progression + seasonal reset + ecosystem coupling in a dual-shopper-organizer system that no other secondary market platform has built.

---

## 1. EXPLORER'S GUILD — SHOPPER RANK SYSTEM (FINAL)

### Tier Structure & Thresholds (LOCKED)

Five permanent tiers; cumulative Guild XP never resets.

| **Rank** | **Guild XP Threshold** | **Months to Reach (Mid-Tier Shopper)** | **Functional Reward** | **Status/Community Reward** | **Entry Archetype** |
|----------|----------------------|----------------------------------------|------------------------|---------------------------|---------------------|
| **Initiate** | 0 | Day 1 | Baseline access | Blue frame, "Initiate" badge, collector-only Discord | All new members |
| **Scout** | 500 XP | 6–10 months | 5% Hunt Pass discount ($4.74/mo), early access to 1 sale/week (24h pre-public) | Gold frame, "Scout" badge, weekly digest access | Fast buyers or frequent visitors |
| **Ranger** | 2,000 XP | 18–24 months | 10% Hunt Pass discount, priority support (2h response SLA), early access to 3 sales/week | Emerald frame, "Ranger" badge, eligible for Community Mentor role | Committed buyers (50+ purchases) or 20+ visits |
| **Sage** | 5,000 XP | 36–48 months | 15% Hunt Pass discount, priority support (1h), exclusive "Sage's Inner Circle" presale access (24h before public), custom username color | Diamond frame, "Sage" badge, co-host status for private events | High-value collectors (250+ purchases or 75+ visits) |
| **Grandmaster** | 12,000 XP | 60–72 months (4–5 years) | 20% Hunt Pass discount, priority support (15 min), host quarterly "Grandmaster-Only Presale" (48h early access), free Hunt Pass annually (if active) | Platinum frame, "Grandmaster" legacy badge, commemorative passport edition, advisory board seat | Extreme veterans (500+ purchases, 150+ visits, sustained quality) |

**Time-to-Rank Logic (Critical for Motivation):**
- Scout in 6–10 months: Fast enough to feel achievable for engaged new users. By month 10, user has already paid for ~$500 in purchases, making rank feel "earned."
- Ranger in 18–24 months: Long enough that it feels like a real commitment, but not so long that mid-tier users despair. Users at 18 months are "converted" — high retention already.
- Sage in 36–48 months: Switches from time-based to quality-based. This is not a "grind to the end" tier. Instead, requires demonstrable expertise (high-value finds, collection curation, seasonal performance). Time gate prevents ranking inflation.
- Grandmaster in 60+ months: Aspiration goal. Only 1–2% of users will reach this. It should feel like "beating the game." Setting bar at 12k XP means a user spending $12k over 5 years, or attending 240+ sales, or a combination. This is the "hall of fame" tier.

---

### XP Acquisition: Multi-Archetype Design (FINAL)

Guild XP comes from six sources, designed to accommodate three distinct shopper archetypes:

#### **Primary Loop: Purchase-Driven (Core)**
- **$1 spent = 1 XP** (simplest calculation, primary loop)
- Applies to all purchases: sale finds, instant buys, featured items
- No caps; no decay; no reset

**Archetype Enabled:** "Quality Collector" (high-value purchases, fewer visits)

#### **Secondary Loop 1: Visit-Driven (For Bargain Hunters)**
- **5 XP per verified sale visit** (geolocation detected, platform app required)
- **Max 2 visits/day** (prevents farming)
- Applies to all sale types equally (estate, yard, auction, flea, consignment)

**Rationale:** Estate sale shoppers are seasonal; many hit 50+ sales/year but small-ticket purchases. Without visit XP, they'd be stuck at Scout tier. This path allows them to reach Ranger via visits + small purchases. A shopper attending 20 sales/month for 5 years = 1,200 visits = 6,000 XP (plus purchases). Hits Sage threshold.

**Archetype Enabled:** "Bargain Hunter" (many visits, small purchases)

#### **Secondary Loop 2: Referral & Community (Social Connector)**
- **50 XP per successful referral** (one-time, referrer only)
- **Verification:** Referred user must complete their first purchase using a unique payment method (not previously used on FindA.Sale)
- **Fraud control:** Flag accounts earning >20 referral XP/month as suspicious (likely fraudulent chains)

**Archetype Enabled:** "Social Connector" (drives friends, earns bonus XP)

#### **Secondary Loop 3: Collection Specialties (Quality Path)**
- **25 XP per completed Passport specialty category** (per category, max 8/year = 200 XP/year)
- **Definition of "completed":** Collector designates category on Passport, purchases 3+ items in that category, demonstrates "expertise" (can be auto-detected by tagging or manual curator review)
- Examples: "Vintage Furniture," "Antique Jewelry," "Mid-Century Glass," "Children's Books"

**Rationale:** Encourages curation, not just acquisition. Quality Collectors naturally specialize; this rewards them.

**Archetype Enabled:** "Quality Collector"

#### **Secondary Loop 4: Seasonal Challenges (Event-Driven)**
- **100–500 XP per completed seasonal challenge** (varies by challenge difficulty)
  - Easy (Spring: attend 3 sales) = 100 XP
  - Medium (Fall: complete 3 specialties) = 200 XP
  - Hard (Winter: 50 purchases in calendar year) = 300 XP
  - Seasonal leaderboard top 10 bonus = 500 XP (awarded after season ends)

**Archetype Enabled:** All three (challenges scale to any play style)

#### **Secondary Loop 5: Community Actions (Long-Tail Engagement)**
- **10–50 XP per community action** (peer-reviewed, max 200 XP/month)
  - Mentor another collector (answer Q&A, validate finds) = 25 XP per session (max 4/month = 100/month)
  - Write a public collection guide (e.g., "How to Spot Reproduction Furniture") = 50 XP (one-time per guide)
  - Contribute item valuations to community database = 10 XP per valuation (max 10/month = 100/month)

**Barrier to Exploit:** Requires peer review (other users upvote/downvote contributions). Spam gets flagged; accounts get rate-limited.

**Archetype Enabled:** "Social Connector"

#### **Secondary Loop 6: Monthly Streaks & Anniversaries (Retention-Driven)**
- **1.2x XP multiplier on XP earned during "streak days"** (consecutive days with any purchase, visit, or challenge completion)
- **7-day streak bonus:** 100 XP one-time
- **30-day consecutive active days:** 250 XP one-time, resets monthly
- **Account anniversary:** +0.1x XP multiplier for the user's purchase anniversary month (no reset, one-time/year)

**Rationale:** Encourages habit formation without feeling grindy. Casual players don't notice multiplier; engaged players optimize for it.

**Archetype Enabled:** All three

#### **XP Decay: DECISION (Final)**

**NO DECAY.** Guild XP is permanent and cannot decrease.

**Reasoning:**
- Estate sale shoppers are naturally seasonal (summer/fall peaks, winter slump). Decay punishes legitimate seasonal play patterns.
- Permanent XP feels like "achievement banking" — a collector who steps away for 6 months doesn't lose their place in the ladder.
- Competitors that use decay (some game loyalty programs) see engagement drop during down seasons. No benefit.

**Counter-Risk:** If a user is inactive for 24+ months, they're likely churned. Decay won't bring them back. Better to focus on re-engagement via email ("Your Scout status is waiting for you") than rank decay.

---

## 2. MULTI-ARCHETYPE RETENTION DESIGN (INNOVATION LENS)

The three archetypes (from user research) are **intentionally served equally** by the XP system:

### **Archetype 1: Bargain Hunter**
- **Behavior:** 50+ visits/year, $500–$1,500/year spend, small-ticket items (under $50 avg)
- **Path to Ranger:** 20 visits/year × 5 years = 1,000 visit XP + $500/year × 5 years = 2,500 purchase XP = 3,500 XP (hits Ranger at 2,000)
- **Motivation:** Early Scout badge (6 months) keeps them engaged. Ranger priority support becomes tangible value (they ask questions often).
- **Risk:** If they can't reach Sage via visits alone (12k ÷ 5 = 2,400 XP/year needed, but 1,000 visits = 5,000 XP/year + purchases hits it), they plateau at Ranger. **Mitigations:** Specialty categories are free; collect 8 categories = 200 XP/year, gets them +$200 value perception even if purchase value is low.

### **Archetype 2: Quality Collector**
- **Behavior:** 10–15 visits/year, $3,000–$8,000/year spend, high-value items (avg $200–$500)
- **Path to Grandmaster:** $5,000/year × 5 years = 25k XP (hits Grandmaster at 12k). Reaches it faster than any other archetype.
- **Motivation:** Scout in 3–4 months (500 XP), Ranger in 14–16 months. Rapid early wins = stickiness. Sage presales are most valuable to them (exclusive access to high-value finds).
- **Risk:** Might hit Grandmaster in Year 2 and plateau. **Mitigation:** Seasonal leaderboard competition keeps them engaged even at max rank. Prestige badges (Hall of Fame) provide permanent status differentiation.

### **Archetype 3: Social Connector**
- **Behavior:** 20–30 visits/year, $1,000–$2,000/year spend, but drives 5–10 referrals/year
- **Path to Sage:** $1,500/year × 5 years = 7,500 purchase XP + 8 referrals × 50 XP = 400 XP + 5 visits/month × 12 × 5 = 3,000 visit XP = 10,900 XP (hits Sage at 5,000 in 2.5 years)
- **Motivation:** Early wins from referrals (50 XP per friend is visible). Community Mentor role is aspirational (they can help others).
- **Risk:** Referral fatigue if all their friends are already on platform. **Mitigation:** 50 referral XP/year is enough to unlock one specialty bonus + streaks; doesn't require infinite referrals.

**Verification Metric (Innovation Lens):** Before shipping Phase 1, run a cohort analysis on current shoppers:
- Segment by archetype (via purchase behavior).
- Simulate XP totals under this formula.
- Confirm >80% of all three segments reach Scout within 12 months.
- If Bargain Hunters get stuck, increase visit XP or reduce Ranger threshold.

---

## 3. ORGANIZER TRACK: HOST RANKS (FINAL DESIGN)

### Tier Structure & Advancement (LOCKED, NO FEE DISCOUNTS)

Four organizer tiers; advancement based on shopper outcomes, not activity volume.

| **Host Rank** | **Advancement Threshold** | **Functional Rewards** | **Prestige Rewards** | **Service Credits/Year** |
|---------------|--------------------------|------------------------|----------------------|--------------------------|
| **Novice Host** | Day 1 listing created | Baseline (0% bonus) | "Novice Host" badge on sale listings | 0 credits |
| **Trusted Host** | 50+ completed sales + 4.5+ star rating (from shopper reviews) | Featured placement in "Trusted Sales" section (homepage + category pages) | "Trusted Host" gold badge, featured in "Community Picks" section | 5 email campaign credits/month (60/year) |
| **Elite Host** | 200+ completed sales + 4.8+ star rating + 0 fraud flags | Guaranteed 4h response SLA (vs. 24h baseline), early beta access to new platform features | "Elite Host" platinum badge, host achievement wall, featured monthly in marketing emails | 15 email campaign credits/month + 5 listing template credits (worth $300/year) |
| **Master Host** | 500+ completed sales + 4.9+ star rating + 10+ "Excellent" reviews from Sage/Grandmaster shoppers | Dedicated account manager (quarterly business review), unlimited API access for inventory sync, white-label integration preview | "Master Host" legacy badge, co-host "Master Host Summit" quarterly webinar, "Master Host of the Year" award voting | 30 email campaign credits/month + 10 listing template credits + monthly photography shoot credit (worth $800/year) |

**Key Design Principles:**

1. **NO FEE DISCOUNTS.** Board rejected this unanimously. Fee discounts cannibalize subscription ARR. Rewards are instead:
   - **Prestige** (badges, featured placement, leaderboard visibility)
   - **Services** (email credits, API access, account manager)
   - **Visibility** (search placement, marketing features)

2. **XP IS SHOPPER-OUTCOME-BASED, NOT ACTIVITY-BASED.** This prevents gaming:
   - **Do NOT count:** Number of sales hosted (organizers could host 1,000 unprofitable sales)
   - **DO count:** Shopper rating (average star from reviews), repeat shopper rate (% of sales with returning buyers), sell-through rate (% of inventory sold), shopper satisfaction (qualitative: "Would recommend?" survey)

3. **Grandmaster Shoppers as Reputation Boost.** Organizers unlock Elite tier if they have 10+ "Excellent" reviews from Sage/Grandmaster shoppers specifically. This incentivizes hosts to attract and satisfy top-tier buyers, not just volume.

### Organizer Advancement Timeline (Realistic)

- **Novice → Trusted:** 3–6 months (50 sales at 1–2 sales/week)
- **Trusted → Elite:** 12–18 months (200 sales; sustaining 4.8+ rating is the gate)
- **Elite → Master:** 24–36 months (500 sales + 10+ Grandmaster endorsements; requires reputation building, not just activity)

**Rationale:** Organizers don't reach Master tier quickly; they're not punished for slow growth. The "10+ Grandmaster reviews" gate makes Master aspirational and quality-driven.

---

## 4. PRESALE ACCESS DESIGN (SAGE TIER) — DETAILED OPERATIONAL SPEC

### Feature Definition

**"Sage's Inner Circle Presale"**: Sage-tier and above shoppers get 24-hour early access to select sales before public listing.

### Eligibility (Fine-Grained)

**Shopper Side:**
- **Scout+**: Early access to 1 sale/week (randomly rotated from Trusted+ hosts)
- **Ranger+**: Early access to 3 sales/week (from Elite+ hosts)
- **Sage+**: Early access to all participating "Sage-worthy" sales, 24h before public, with custom notification (email + in-app)
- **Grandmaster**: Same as Sage, PLUS 48-hour presale (exclusive 48h window before Scout-tier access)

**Organizer Side:**
- **Novice/Trusted Hosts**: Cannot opt into presale system (insufficient reputation)
- **Elite Hosts**: Can opt in (checkbox: "Enable Sage presale access")
- **Master Hosts**: Auto-enrolled in presale system; can opt out only via support request

**Verification:** Both shopper and host must be active (no presales for churned shoppers or inactive hosts).

### User Experience (Shopper)

1. **Pre-Presale (48h before):** Shopper receives notification: "A new Sage presale starts in 48 hours." They can wishlist the sale.
2. **Presale Window (24–48h):** Early-access sale page at `/sales/{id}?presale=sage`. Shows countdown timer ("Available to public in: 18h"). Presale page is identical to public sale except: no public comments yet, early-access shoppers appear as "Early Collectors" leaderboard, star ratings hidden (only after sale closes).
3. **Public Window (After presale ends):** Sale migrates to normal `/sales/{id}`. Presale shoppers appear as "First Collectors" badge on comments/reviews. This creates status for early adopters.

### Financial Model (Cost)

**For FindA.Sale:**
- **Inventory Scarcity Cost**: Master Host's sale with "24h Sage-only" window means 24h of inventory competition is limited to ~2% of user base (estimated Sage+ penetration). This creates artificial scarcity = psychological FOMO. *Expected cost: higher shopper engagement, lower revenue per unit if presale shoppers are more selective.* **Mitigation:** Presale pricing can be slightly higher (organizer sets it); presale shoppers expect to pay premium for early access.
- **Support Cost**: +5% customer support inquiries (presale-specific questions: "Is this item still available in presale?" etc.). Staffing cost: ~$500/month.

**For Organizer:**
- **Benefit**: Top-tier shoppers get first look = higher-quality feedback, repeat customers build trust. Sage shoppers are vetted (5k+ XP = 5+ years or high-value buyer); they're reliable, less likely to back out.
- **Downside**: Can't feature the sale to broader audience during presale. Lost visibility. Master Hosts who feel burned (low presale conversion) can opt out.

**Threshold to Keep Program Healthy:**
- **Target conversion:** 40%+ of Sage-tier shoppers convert to buyers in presale window (vs. 15% baseline for public sales). If <30%, program is losing inventory value for hosts.
- **Target organizer retention:** 80%+ of Master Hosts who opt in stay opted in for 6+ months. If dropout >20%, redesign reward structure.

### Legal & ToS (Required)

Board flagged this; Legal Counsel flagged it. New ToS language needed:

> "Sage Rank Presale Access: Early access to certain sales is a platform benefit earned through Sage rank (5,000+ Guild XP). Early access is not a purchase guarantee; availability is at the organizer's discretion. Early access may not be resold, transferred, or used in violation of platform terms. FindA.Sale reserves the right to modify or discontinue presale access."

---

## 5. HUNT PASS ↔ RANK INTEGRATION: CANNIBALIZATION MITIGATION (FINAL)

### Current Hunt Pass Model (Baseline)

**Hunt Pass = $4.99/month subscription**
- Unlimited sale listings search
- Save collections
- Advanced filters
- $500–800 annual revenue (estimated 100–160 subscribers)

### Rank-Based Discount Structure (Board Approved)

| **Rank** | **Hunt Pass Price** | **Annual Cost** | **Annual Savings vs. Initiate** |
|----------|-------------------|-----------------|-------------------------------|
| **Initiate** | $4.99/mo | $59.88 | $0 |
| **Scout** | $4.74/mo (5% off) | $56.88 | $3/year |
| **Ranger** | $4.49/mo (10% off) | $53.88 | $6/year |
| **Sage** | $4.24/mo (15% off) | $50.88 | $9/year |
| **Grandmaster** | $0/mo (FREE) | $0 | $59.88/year |

### Cannibalization Risk (Investor Lens)

**Risk:** If 20% of Hunt Pass revenue is from Grandmasters, giving them free pass = $160 revenue loss.

**Mitigation (Final):**

1. **Grandmaster Free Hunt Pass is Capped at 1,000 Users**
   - Once 1,000 Grandmasters exist, new Grandmasters at 1,001+ pay Scout rate (5% off).
   - Justification: Grandmaster is aspirational (1–2% of base); capping keeps it exclusive and revenue-protecting.
   - Tracking: Monthly check on "active Grandmaster count with free Hunt Pass." If approaching 900, Marketing sends campaign: "Approaching Grandmaster cap — reach it before the limit!" (creates scarcity).

2. **Alternative Value Design: Hunt Pass ITSELF Accelerates Rank**
   - **New mechanic (Phase 2):** Active Hunt Pass subscribers earn 1.5x XP for purchase and visit actions.
   - **Effect:** Hunt Pass becomes a "rank acceleration" tool, not just a feature unlock.
   - **This realigns incentives:** A player at 400 XP (close to Scout) might subscribe to Hunt Pass to hit 500 XP faster, knowing they'll get 5% discount back immediately.
   - **Revenue impact:** +$200–300/month if even 10% of Initiates/Scouts subscribe to "speed-run" Scout tier.

3. **Presale Access is NOT Discounted.**
   - Sage/Grandmaster presale access is not reduced/modified by Hunt Pass. It's a rank-only benefit.
   - This creates a distinction: "Hunt Pass = features," "Rank = prestige benefits."
   - Prevents: Hunt Pass becoming so valuable that everyone subscribes → cannibalization.

4. **Monitor & Adjust (Data-Driven)**
   - **Metric 1:** Hunt Pass conversion rate (% of Initiates converting to Hunt Pass subscribers). Baseline: ~2%. Target: maintain at 2%+ even after rank integration.
   - **Metric 2:** Grandmaster free Hunt Pass uptake (% of Grandmasters who would have paid, now free). Target: <$500/year opportunity loss (i.e., avoid giving away >10 annual subscriptions worth).
   - **Quarterly Review:** If Hunt Pass revenue drops >10%, pause free Grandmaster benefit, revert to Scout rate (5% off).

### Secondary Benefit (Innovation Lens)

**Hunt Pass + Rank integration creates a unique value ladder** not seen in competitors:
- Starbucks: "Buy now, get free coffee later" (discount only)
- Poshmark: "Ambassador = revenue share" (shares unclear, limited to top 2%)
- FindA.Sale: "Scout = $3/year savings + early access + presales" (compound value)

This compound value is defensible and hard to replicate.

---

## 6. SEASONAL EXPEDITIONS: FOUR COMPLETE DESIGNS (FINAL)

Each expedition has a theme, 3–4 challenges, seasonal badges, and organizer incentives. Leaderboard resets quarterly. Permanent rank persists.

### Q1: Spring Awakening Expedition (March–May)

**Theme:** Spring renewal, estate clearances peak (post-holiday downsizing, spring cleaning season)

**Narrative Hook:** "After winter hibernation, the Guild awakens. Fresh inventory emerges from spring cleanings and estate clearances."

**Challenges (3 core, difficulty progressive):**

1. **"Spring Treasure Hunt"** (Easy, 200 XP)
   - Find 10 items from 3 different sale types (must include ≥1 estate, ≥1 yard, ≥1 flea/consignment)
   - Completion: Mark items as "found" in app (auto-tracks via purchase history)
   - Badge: "Spring Wanderer" (appears on profile, seasonal leaderboard)

2. **"Renewal Streak"** (Medium, 150 XP + 1.5x XP multiplier for 7 days)
   - Attend sales on 7 consecutive calendar days
   - Completion: Geolocation verification (or manual check-in via app)
   - Badge: "Renewal Collector" (appears on Collector Passport spring section)
   - Bonus: For each day in streak, all XP earned that day is multiplied by 1.5x

3. **"Community Garden"** (Medium, 100 XP)
   - Collect 5 gardening-themed items (auto-tagged by system or curator-verified)
   - Completion: Auto-detect via item tags or manual passport claim
   - Badge: "Garden Keeper" (permanent, appears in community council)

**Seasonal Leaderboard:**
- Top 100 finishers get permanent "Q1 Spring Legend" badge + featured on homepage
- Top 10 get "Spring Champion" title + custom emoji in community chat
- Leaderboard resets Q2 Day 1

**Organizer Incentive:**
- Hosts can tag sales "Spring Themed" (cleanup, renewal, seasonal items)
- Sales with "Spring" tag get featured in "Spring Expeditions" search filter for full Q1
- Hosts can also offer 15% fee discount if all items tagged with seasonal keywords (encourage curation)

**Real-World Tie-In:** March–May is peak estate sale season (winter downsizing complete, spring cleaning cultural practice). Inventory peaks. This matches real collector behavior.

---

### Q2: Summer Adventure Expedition (June–August)

**Theme:** Travel season, regional hopping, vacation memorabilia, summer nostalgia

**Narrative Hook:** "Summer expands horizons. Collectors travel, hunt across regions, and pursue travel-themed treasures."

**Challenges (3 core):**

1. **"Region Hopper"** (Hard, 250 XP)
   - Attend sales in 5 different cities or ZIP code regions (tracked via geolocation on visit)
   - Completion: Platform auto-detects from sale location data
   - Badge: "Summer Wanderer" (appears on profile with region counter)

2. **"Travel Curator"** (Medium, 150 XP)
   - Collect 5 items tagged "travel," "vacation," "vintage maps," "souvenirs," or geographic items
   - Completion: Auto-tag or passport claim
   - Badge: "Vacation Collector" (appears on Collector Passport)

3. **"Seller Connection"** (Easy, 100 XP)
   - Make 5 purchases from the same organizer (shows return-customer loyalty)
   - Completion: Auto-tracked via purchase history
   - Badge: "Host Favorite" (appears on organizer's sale listings, increases their reputation)

**Seasonal Leaderboard:**
- Top 50 finishers: "Summer Champion" title + featured in travel/region-themed email campaigns
- Top 10: "Summer Expedition Master" legacy badge (permanent)

**Organizer Incentive:**
- Organizers with travel-themed, regional, or vacation memorabilia sales can feature "Summer Travel Collection" tag
- Featured in "Summer Expeditions" homepage carousel for full Q2
- Can offer "Region Bonus": 2x XP for "Region Hopper" challenge if sale is in an under-visited region (incentivizes geographic diversity)

**Real-World Tie-In:** June–August is travel season; collectors visit new regions, hunt locally during vacations. Summer memorabilia (vacation posters, travel guides) peaks.

---

### Q3: Fall Collection Expedition (September–November)

**Theme:** Curation, specialization mastery, white-whale hunting, holiday preparation

**Narrative Hook:** "The Guild takes stock. Collectors refine specialties, pursue rare finds, and prepare gift discoveries for the holidays ahead."

**Challenges (3–4 core):**

1. **"Specialty Mastery"** (Hard, 200 XP per category, max 3 categories = 600 XP possible)
   - Complete a full Passport specialty category (define category + purchase/curate 8+ items in that category)
   - Completion: Passport auto-completes on 8-item threshold; user claims challenge
   - Badge: "Specialist" per category (stackable: "Furniture Specialist," "Jewelry Specialist," etc.)

2. **"Collection Quest"** (Hard, 250 XP)
   - Find your collection's "white whale" (highest-value item in your primary specialty, or item you've been hunting for 3+ months)
   - Completion: Manual claim ("Mark as White Whale" button on item detail page)
   - Badge: "Treasure Seeker" (appears on profile, auto-links to the item)

3. **"Holiday Prepper"** (Medium, 150 XP)
   - Collect 10 gift-worthy items (curated by finder, system-verified as <$100 and new condition or designer/vintage), add to "Holiday Gift Collection"
   - Completion: App auto-detects
   - Badge: "Gift Curator" (appears on profile, unlocks "Gift Curator" presale access in Q4 — organizers feature gift-tier items for Curators)

**Seasonal Leaderboard:**
- Top 100: "Fall Sage" title + featured in holiday gift guide marketing (organic traffic driver for FindA.Sale marketing)
- Top 10: "Autumn Master" legacy badge + co-design Q4 "Holiday Collections" with Marketing team

**Organizer Incentive:**
- Hosts can create "Seasonal Collection Themes" (e.g., "Vintage Holiday Decor," "Collectible Christmas Village Pieces")
- Items tagged with theme get 2x XP bonus for "Specialty Mastery" challenge
- Featured in "Fall Collections" homepage section for full Q3

**Real-World Tie-In:** September–November is curation season (holidays coming, planners prepare gifts, collection evaluations happen). Peak antique/vintage fair season. Highest collector engagement.

---

### Q4: Winter Treasures Expedition (December–February)

**Theme:** Gift giving, celebration, year-end reflection, nostalgia, New Year resolutions

**Narrative Hook:** "The season of giving. Collectors hunt gift-worthy finds, celebrate wins, and reflect on the year. The Guild's year concludes with a grand hall of fame."

**Challenges (3–4 core):**

1. **"Gift Guide Curator"** (Medium, 200 XP)
   - Find 7 items under $50 that fit curated gift themes (Marketing provides 5–8 seasonal gift guides: "For the Reader," "For the Home Decor Lover," "For the Tech Minimalist," etc.)
   - Completion: User claims items against guide themes
   - Badge: "Gift Finder" (appears on profile, unlocks gift curator presale access in next Q4)

2. **"Year-End Reflection"** (Variable, 300 XP)
   - Reach 50+ total lifetime purchases OR 50 purchases in calendar year
   - Completion: Auto-tracked
   - Badge: "Year-End Champion" (unique design per year: "2026 Champion," "2027 Champion," etc.)
   - Bonus: Generate personalized "Collector's Year in Review" (shareable graphic with stats: total purchases, top categories, favorite hosts, rank achieved, etc.)

3. **"Grandmaster Gathering"** (Hard, 150 XP)
   - Attend "Grandmaster-Only Holiday Presale" event (quarterly live event, virtual or in-person in Grand Rapids)
   - Completion: Manual check-in or registration confirmation
   - Badge: "Grandmaster Gathering" (exclusive, digital collectible: Winter Ornament NFT-equivalent or digital badge)

**Seasonal Leaderboard (Annual):**
- Top 100 finishers (year-end): "Hall of Fame" permanent fixture (cannot fall off; shows "Q4 2026 Champion" eternally)
- Top 10: Named "Winter Legend," featured in New Year marketing campaign
- Cumulative counter: "Seasonal Champions" (shows "Q1 2026 | Q3 2026" for players who've won multiple seasons)

**Organizer Incentive:**
- "Giving Back Challenge": Hosts who donate 5% of sale proceeds to local Grand Rapids charity get 0% platform fee for that sale (double the normal discount equivalent)
- Featured in "Good Deed Hosts" marketing
- Charitable impact reported to community (transparency + PR value for organizer)

**Real-World Tie-In:** December–February is peak gift-giving season, year-end reflection, New Year resolution purchasing (home improvement, hobby investment). Emotional connection to "giving" and "reflection" resonates with collectors.

---

## 7. MICRO-EVENTS: 8 LAUNCH + 8 PHASE 2 (BOARD DECISION)

Board approved 8 micro-events at Phase 1 launch (reduced from 16+). These 8 are high-value, tied to real calendar behavior, and distribute across the year to maintain engagement momentum.

### Phase 1 Launch (8 events, chosen for impact):

1. **Valentine's Treasure Hunt** (Feb 1–14) — Gift-buying season, jewelry/decor peak
2. **Tax Season Spring Cleaning** (Apr 1–15) — Tax refunds drive spending; spring cleaning cultural practice
3. **Back-to-School Hunt** (Aug 1–31) — Peak student furniture/supplies demand
4. **Black Friday Flip** (Nov 20–Dec 2) — Biggest retail event; secondary market inventory peak
5. **Holiday Gift Quest** (Dec 1–23) — Gift-buying season peak
6. **New Year, New Collections** (Jan 1–14) — Estate clearances peak; New Year resolution shopping
7. **Summer Adventure Picnic** (Jul 1–7) — July 4th, summer entertaining season
8. **Spooktacular Collectibles** (Oct 1–31) — Halloween, vintage costume/decor demand

**XP Rewards per Event:**
- Easy challenge (e.g., "Find 3 items"): 75 XP
- Medium challenge (e.g., "Attend 5 sales"): 150 XP
- Hard challenge (e.g., "Build a collection"): 250 XP
- Leaderboard bonus (top 50): 200 XP after event ends

**Event Duration:** 1–3 weeks per event. No overlap (prevents "event fatigue").

### Phase 2 (8 additional events, deferred):

- Earth Day Treasures (Apr 15–30)
- Graduation Gift Guide (May 1–31)
- Pride Month Celebration (Jun 1–30)
- Vintage Fashion Fiesta (Jul 8–31)
- Labor Day Deals (Sep 1–7)
- Antique Appraisal Event (Oct 15–31)
- Gratitude Gathering (Nov 1–15)
- Black History Month Discoveries (Feb 1–28)

**Rationale for Phasing:**
- Phase 1's 8 events are "must-haves" (tie to major spending seasons: holidays, tax refunds, back-to-school, summer, New Year)
- Phase 2's 8 events are "nice-to-haves" (cultural celebrations, niche specialties like fashion/antiques)
- Shipping 8 initially keeps complexity low; Phase 2 expands if Phase 1 engagement is strong

---

## 8. PHASE 1 SCOPE (IMPLEMENTATION-READY)

### What Ships in Phase 1 (4–5 weeks)

**Core Systems:**
1. Permanent Rank system (Initiate → Grandmaster)
2. XP service (purchase, visit, referral, specialty, challenge, community loops)
3. Collector Passport redesign (show rank, seasonal placement, badges)
4. Hunt Pass integration (Scout/Ranger/Sage/Grandmaster discounts)
5. Four seasonal expeditions (Spring/Summer/Fall/Winter with challenges)
6. Seasonal leaderboard (quarterly reset)
7. Notifications (rank-up, challenge completion, seasonal badges)
8. QA test matrix (all tiers, rank thresholds, challenge completions)

**NOT in Phase 1:**
- Organizer Host Ranks (Phase 2)
- 16 micro-events (Phase 1: 8 events only)
- Sage/Grandmaster presale access (Phase 2)
- Admin event management UI (Phase 2)
- Mystery boxes, daily spin wheel, appraisal tokens (Phase 3)

---

## 9. PHASE 2 CONDITIONAL GATE (LOCKED)

Phase 2 proceeds **only if Phase 1 hits all four metrics at 4-week post-launch checkpoint:**

1. **Rank Penetration ≥25%**: At least 25% of monthly active users reach Scout (500 XP)
2. **Engagement Lift ≥10%**: DAU increases 10%+ vs. pre-Phase 1 baseline
3. **Hunt Pass Conversion ≥1.5%**: Scout+ users convert to Hunt Pass at 1.5%+ rate (vs. <1% baseline Initiate)
4. **Churn Reduction ≥5%**: Sage+ players churn 5% lower than Initiate baseline

**If Metrics Miss:**
- **Rank Penetration <10%**: Gamification narrative isn't resonating. Consider simpler badge system; defer ranks.
- **Engagement Lift <5%**: System isn't driving behavior change. Investigate onboarding friction or reward clarity issues. Iterate copy/UI.
- **Hunt Pass Conversion <1.5%**: Rank discounts aren't driving monetization. Consider increasing discount % for higher tiers (Scout 10% instead of 5%).
- **Churn >neutral**: System may actually *increase* churn if low-rank players feel stuck. Add retention campaign messaging.

**If Metrics Hit:** Proceed to Phase 2 immediately.

---

## 10. KEY TECHNICAL SPECS (FOR ARCHITECT/DEV HANDOFF)

### Schema (5 New Tables, 3 Modified)

**New Tables:**
1. `UserRank` (pk: id, fk: userId, rank enum, totalGuildXP, rankedAt)
2. `SeasonalLeaderboard` (pk: id, fk: userId, seasonId, seasonalScore, rank, badgesEarned, createdAt)
3. `GuildXPTransaction` (pk: id, fk: userId, amount, reason enum, relatedId, createdAt) — audit log
4. `SeasonalChallenge` (pk: id, seasonId, eventId, challengeKey, name, xpReward, badgeId, isActive, startsAt, endsAt)
5. `UserSeasonalProgress` (pk: id, fk: userId, fk: challengeId, progress int, completed bool, completedAt)

**Modified Tables:**
1. `User` — add huntPassTier enum (INITIATE–GRANDMASTER), totalGuildXP int (cache), seasonalBadges string[] (JSON)
2. `Badge` — add isSeasonalBadge bool, seasonId string optional
3. HuntPass pricing logic (not schema, but PricingService applies XP-based discount)

### XP Calculation (Sync + Async Hybrid)

- **Synchronous:** Purchase XP awarded immediately (critical engagement loop)
- **Asynchronous:** Visit, referral, challenge, community XP awarded via Bull queue (5-min batches)
- **Caching:** Redis cache on User.totalGuildXP (TTL 5 min); invalidate on write

### Event Orchestration (Static Registry, Phase 1)

- Hardcoded `EVENTS.ts` with all 8 Phase 1 events
- On every user action (purchase, visit, challenge), check if action falls within active event window
- Apply XP multiplier if active event matched
- No scheduled tasks needed; expiration happens passively (next user action after end date finds no matching event)

---

## 11. KEY TENSIONS SURFACE FOR PATRICK (FOUR-LENS ANALYSIS)

**Note:** These tensions are *real* and *unresolved*. They represent genuine trade-offs between four perspectives. Patrick should decide based on business priorities, not on "optimizing" all four lenses simultaneously (impossible).

### TENSION 1: Grandmaster Free Hunt Pass vs. Revenue (Investor vs. User Champion)

**The Tension:**
- **Investor lens:** Giving free Hunt Pass to top 1,000 Grandmasters = ~$60k annual revenue loss. This is real margin erosion.
- **User Champion lens:** Grandmaster players have spent $12k+ or 500+ purchases. Showing gratitude with free Hunt Pass is expected. If they start paying again, you lose them.

**Trade-Off:**
- **Option A (Investor win):** Cap free Hunt Pass at 100 users (only top 0.1%). Grandmaster 101+ get 5% Scout discount instead. **Revenue loss:** ~$6k/year. **User impact:** Resentment from "almost Grandmaster" tier.
- **Option B (User Champion win):** Free Hunt Pass for all Grandmasters. **Revenue loss:** ~$60k/year. **User impact:** Feels good; community sentiment positive. **Upside:** Grandmasters are "brand ambassadors" — they tell 5–10 friends about the platform; each friend = $60/year revenue. Net might break even.
- **Option C (Compromise):** Free Hunt Pass capped at 1,000, with tier-down to 5% discount for those above. **Revenue loss:** ~$40k/year. **User impact:** "Achievement cap" feels artificial but acceptable.

**Patrick's Call Required:** Do you want to maximize revenue (Option A) or maximize long-term retention and word-of-mouth (Option B)?

---

### TENSION 2: Seasonal Leaderboard Resets vs. Veteran Engagement (Innovation vs. User Champion)

**The Tension:**
- **Innovation lens:** Seasonal resets create fresh engagement loops; they enable mid-tier players to "compete" each quarter. Without resets, leaderboard is frozen after Month 1 (same top 10 every time).
- **User Champion lens:** Estate sale veterans who hit #20 on Q1 leaderboard feel cheated on Q2 Day 1 when they're back at zero. Engagement cliff is real in seasonal-reset systems (documented in gaming literature: "second-season dropout").

**Trade-Off:**
- **Option A (Strict Reset):** Leaderboard fully resets Q1 Day 1. Top 100 Q1 players get permanent "Q1 Champion" badge, but competitive score goes to zero. **Risk:** ~10–15% dropout among Q1 top 50–200 players.
- **Option B (Soft Reset):** Leaderboard resets, but previous-season champions get +0.2x XP multiplier in next season. **Effect:** They climb faster; feel momentum. **Risk:** Multiplier stacking feels "unfair" to new players.
- **Option C (Hybrid — Recommended):** Leaderboard resets, but introduces "Retirement Leaderboard" for players 40+ (separate competition, softer resets). **Effect:** Veterans feel seen. New players still have main leaderboard. **Risk:** Complexity; two leaderboards to maintain.

**Patrick's Call Required:** How risk-averse are you around churn for players in positions #20–200 on seasonal boards? Can you afford to lose 5–10% of them?

---

### TENSION 3: Visit XP Parity vs. Purchase-Driven Business Model (User Champion vs. Investor)

**The Tension:**
- **User Champion lens:** Bargain hunters (50+ visits/year, $500 spend) should reach Ranger via visits alone. They're engaged, loyal, just not high-value spenders.
- **Investor lens:** Visits generate no revenue. Giving them free rank status that unlocks paid perks (Hunt Pass discount, priority support) creates cost without revenue offset.

**Trade-Off:**
- **Option A (User Champion win):** 5 XP per visit with no caps. Bargain hunter can hit Ranger in 18 months. **Cost:** ~$300–400/year in Hunt Pass discounts given away for non-spending engagement. **Benefit:** Bargain hunters don't churn; feel valued.
- **Option B (Investor win):** Visits give 1 XP (5x reduced). Bargain hunters can't reach Ranger on visits alone. **Cost:** Low. **Benefit:** Revenue protected. **Risk:** Bargain hunters churned out; engagement drops.
- **Option C (Compromise — Recommended):** Keep 5 XP per visit, but cap at 100 visits/month (2 per day). Add "visit streak bonus" (consecutive days = 1.2x multiplier). **Effect:** Bargain hunters can reach Ranger, but it takes commitment; cost is bounded.

**Patrick's Call Required:** What's your TAM breakdown? If 40% of your base are "Bargain Hunters," you can't ignore them. Cost the trade-off.

---

### TENSION 4: Presale Access (Sage) as Recruitment vs. Inventory Scarcity (Innovation vs. Technical Architect)

**The Tension:**
- **Innovation lens:** 24h Sage-tier presale is a *unique* perk; no competitor offers it. Creates FOMO, drives retention, defensible moat.
- **Technical Architect lens:** Managing presale routing, inventory locks, permissions, and organizer opt-in/opt-out is complex. Adds ~15% effort to Phase 2. If feature has poor adoption (Sage players don't convert to buyers in presales), you've paid the complexity cost for no return.

**Trade-Off:**
- **Option A (Innovation win):** Ship presale feature as designed. **Complexity:** +15% Phase 2 effort. **Upside:** If it works, it's defensible. **Downside:** If Sage penetration <5%, complexity wasn't worth it.
- **Option B (Architect win):** Presale access is *promised* but *manually managed* (Marketing team manually curates which sales get presale access). **Complexity:** -80% (no code change). **Upside:** Flexibility; no bugs. **Downside:** Doesn't scale; feels ad-hoc.
- **Option C (Hybrid — Recommended):** Ship presale routing for *Elite/Master Hosts only* (smallest set, ~<100 organizers). Manual presale selection for Scout/Ranger (wider audience). **Effect:** Complexity is bound; can scale if it works.

**Patrick's Call Required:** How much technical debt can you stomach for a feature that might have 5% penetration? Are you willing to measure before committing to full implementation?

---

### TENSION 5: Organizer Fee Discounts (via Micro-Events) vs. Board Veto (Investor vs. Everything Else)

**The Tension:**
- **Investor lens (LOCKED):** No fee discounts. Platform fees fund operations; gamification can't cannibalize them.
- **Organizer interviews** (future Phase 2 gate): Will likely ask "Why don't I get discounts like scouts do?" Creates pressure to reverse the board decision.

**Trade-Off:**
- **Option A (Stick to Board Veto):** No organizer fee discounts, ever. Defend this in organizer interviews. **Risk:** Organizer adoption of Host Ranks is slower. **Upside:** Revenue is protected.
- **Option B (Negotiate Micro-Discount):** Offer 0.5% fee discount for Master Hosts only (smallest tier, rare). **Revenue impact:** ~$200/year per Master Host (assume 20 Master Hosts = $4k loss). **Upside:** Organizers feel recognized.
- **Option C (Service Credits Instead):** No fee discounts, but offer $200 annual "service credit" (email campaigns, listing templates, etc.). Organizer perceives value without real margin loss. **Risk:** Organizers might prefer cash discount.

**Patrick's Call Required:** Are you willing to defend "no organizer fee discounts" in user interviews? Or do you want to allocate a small budget (~$1–2k/year) to organizer discounts as a morale/adoption tool?

---

## 12. FINAL RECOMMENDATIONS (INNOVATION AGENT SYNTHESIS)

**For Phase 1 Go-Live:**

1. ✅ **Ship permanent ranks + 4 seasonal expeditions + 8 micro-events** (as designed above).
2. ✅ **Lock Grandmaster free Hunt Pass at 1,000-user cap** (protects revenue without alienating players).
3. ✅ **Implement Visit XP with 5 visits/day cap** (serves Bargain Hunters without infinite cost).
4. ⚠️ **Defer Sage presale routing to Phase 2** (reduce Phase 1 complexity; measure organizer adoption first).
5. ✅ **Plan 5–10 organizer interviews before Phase 2 lock-in** (determine if Host Ranks solve organizer pain).

**For Board Presentation:**

- Show the Four Tensions explicitly. Patrick makes the calls; you don't pretend all four lenses can be "optimized" simultaneously.
- Highlight that Tension 1 (Grandmaster free Hunt Pass) is the biggest financial risk; recommend capping at 1,000 users.
- Recommend post-Phase 1 metrics gate (4-week checkpoint) before Phase 2 approval.

**For Developer Handoff:**

- Provide the full implementation spec above (sections 1–10).
- Flag the three technical concerns from the deep-dive spec (denormalization, XP scaling, event orchestration).
- Confirm that Phase 1 excludes organizer ranks, presale routing, and 8+ micro-events; Phase 2 includes them.

---

## 13. DOCUMENT VALIDATION CHECKLIST

Before shipping to dev:

- [ ] Patrick reviews Tensions section (1–5) and makes three decisions:
  - Grandmaster free Hunt Pass: Cap at 1,000 or proceed as-is?
  - Seasonal leaderboard resets: Retirement leaderboard or strict reset?
  - Visit XP parity: Keep 5/visit or reduce?
- [ ] Legal reviews presale ToS language (Tension 4).
- [ ] Architect confirms schema footprint and XP logic (sections 10).
- [ ] QA confirms test matrix scope (all tiers × all rank thresholds × all seasons).
- [ ] Investor confirms Grandmaster free Hunt Pass revenue impact and mitigation strategy.

---

**Prepared by:** Innovation Agent (S259)
**Status:** Implementation-Ready for Developer Dispatch
**Next Step:** Patrick decision on Five Tensions (above), then dispatch to `findasale-dev` skill with full spec.
