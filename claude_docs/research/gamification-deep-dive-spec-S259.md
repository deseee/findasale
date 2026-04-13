# FindA.Sale Gamification Deep Dive Spec
## Board-Ready Specification (Session 259)

**Prepared for:** Advisory Board Review (12-seat panel)
**Scope:** Shopper + Organizer gamification architecture
**Status:** Ready for Devil's Advocate + Architect scrutiny
**Foundation:** Concepts 1 (Treasure Map Guild) + 3 (Seasonal Circuit) blended, competitive research integrated

---

## 1. NARRATIVE SUMMARY

**The Collector's Guild: A Permanent Rank + Seasonal Expedition Framework**

FindA.Sale players progress through five permanent ranks (Initiate → Scout → Ranger → Sage → Grandmaster) that represent lasting expertise and unlock functional rewards at each tier. Every quarter, they compete in themed seasonal expeditions (Spring Cleanings, Summer Hunts, Fall Collections, Winter Treasures) on resetting leaderboards without losing their permanent rank. This dual-system design solves the "engagement cliff" that killed previous gamification attempts: veteran collectors don't feel cheated by seasonal resets because their rank permanence continues upward. New players feel the seasonal leaderboard as a fresh starting line each quarter, not an insurmountable wall.

The narrative connects collectors (shoppers) to curators (organizers) through a companion tier system: organizers gain Host Ranks (Novice Host → Master Host) based on sale quality, shopper ratings, and community contribution, earning discounts on platform fees and exclusive early access to high-value shopper insights. The system is designed to scale across all five secondary sale types: estate sales, yard sales, auctions, flea markets, and consignment shops.

---

## 2. SHOPPER RANK SYSTEM + REWARDS TABLE

### Architecture: Permanent Rank Progression

Each rank requires cumulative Guild XP (lifetime points) and triggers functional unlocks at each tier, not just cosmetic badges.

| **Rank** | **Title** | **Unlock Threshold (Guild XP)** | **Functional Reward** | **Status Reward** | **Community Reward** | **Entry Mechanic** |
|----------|-----------|--------------------------------|----------------------|------------------|---------------------|--------------------|
| **Initiate** | Member (New Collector) | 0 XP | N/A (baseline access) | Blue profile frame, "Initiate" badge | Access to collector-only Discord | Day 1 onboarding |
| **Scout** | Early Hunter | 500 XP | 5% Hunt Pass discount ($4.74/mo instead of $4.99), first-look early access to 1 sale/week | Gold frame, "Scout" badge, custom emoji | Scout-tier role in community forum, access to "What's Trending" weekly digest | First 10 purchases OR 5 visits + 1 referral |
| **Ranger** | Experienced Collector | 2,000 XP | 10% Hunt Pass discount, priority customer support (2h response vs. 24h baseline), early access to 3 sales/week | Emerald frame, "Ranger" badge, collector passport "Ranger" section highlight | Eligible to become Community Mentor (answer Q&A, earn bonus points), featured collector spotlight quarterly |  Collector specialties registered + 25 total purchases OR 20 sale visits |
| **Sage** | Master Collector | 5,000 XP | 15% Hunt Pass discount, priority support (1h), exclusive "Sage's Inner Circle" presale (24h before public), custom username color | Diamond frame, "Sage" badge, personalized collector passport cover image | Co-host status: host private shopper events, curate limited collections, appear on "Sage Council" leaderboard | 250+ total purchases OR 75 sale visits + demonstrated collection quality (high-value finds) |
| **Grandmaster** | Guild Legend | 12,000 XP | 20% Hunt Pass discount, priority support (15 min response), host quarterly "Grandmaster-Only Presale" (48h early access), Hunt Pass free annually (if active) | Platinum frame, "Grandmaster" legacy badge, commemorative collector passport edition | Advisor status: quarterly advisory board seat on product decisions, co-design seasonal themes, appear on all-time leaderboard permanently | 500+ purchases OR 150+ sale visits + Sage-tier quality sustained for 12+ months |

### XP Acquisition System

Guild XP is earned by:
- **Purchase:** $1 spent = 1 XP (primary loop)
- **Referral:** First purchase from referred user = 50 XP (one-time, referrer only)
- **Sale Visit:** Attending a sale (verified geolocation) = 5 XP per visit (max 2/day)
- **Passport Specialties:** Complete a specialty collection category = 25 XP (per category, max 8/year)
- **Seasonal Milestone:** Win seasonal challenge = 100–500 XP (based on achievement rarity)
- **Community Action:** Mentor another collector, contribute item valuations, answer Q&A = 10–50 XP (peer-reviewed, max 200/month)

**Reset Rules:** Guild XP is NEVER reset. Permanent rank is permanent. Seasonal challenges run independently on a quarterly leaderboard reset.

---

## 3. ORGANIZER TRACK: HOST RANKS

### Architecture: Parallel Tier System for Organizers

Organizers are ranked separately from shoppers on "Host Ranks" based on sale quality, responsiveness, shopper ratings, and inventory management. This creates a dual-achievement system: shoppers climb Guild ranks, hosts climb Host ranks. They interact at the top tier only.

| **Host Rank** | **Title** | **Unlock Threshold** | **Functional Reward** | **Status Reward** | **Community Reward** | **Entry Mechanic** |
|---------------|-----------|----------------------|----------------------|------------------|---------------------|--------------------|
| **Novice Host** | New Organizer | Day 1 listing created | N/A (baseline) | "Novice Host" badge on sale listings | Access to host guidelines, early tips forum | First sale created in platform |
| **Trusted Host** | Reliable Organizer | 50+ completed sales + 4.5+ star average rating | 1% platform fee discount (9% instead of 10%), priority listing placement in local search | "Trusted Host" gold badge, featured in "Trusted Sales" section | Eligible for featured placement (organic, not paid), access to "Pro Host" resources |  50 sales + 4.5+ rating |
| **Elite Host** | Expert Organizer | 200+ completed sales + 4.8+ rating + 0 fraud flags | 2% fee discount (8%), guaranteed response SLA (4h), early access to new platform features (beta testing) | "Elite Host" platinum badge, custom sale listing template, host achievement wall | Featured monthly in "Elite Hosts" marketing, co-design seasonal sale themes, appear on host leaderboard |  200+ sales + 4.8+ rating sustained |
| **Master Host** | Community Leader | 500+ sales + 4.9+ rating + 10+ "Excellent" reviews from Grandmaster shoppers | 3% fee discount (7%), dedicated account manager, unlimited API access, white-label integration preview | "Master Host" legacy badge, custom branding kit (logo, colors, fonts) applied to sale listings | Advisory board seat on seller tools roadmap, co-host quarterly "Master Host Summit" webinar, named "Master Host of the Year" award |  500+ sales + 4.9+ rating + Sage/Grandmaster endorsements |

### Shopper-Host Interaction Mechanics

- **Sage/Grandmaster Presales:** Top-tier shoppers get 24–48 hour exclusive access to Master/Elite host sales before public listing
- **Host Recognition:** Each shopper collector passport shows "Favorite Hosts I Follow" (organizers they've purchased from 3+ times)
- **Collaborative Collections:** Elite/Master hosts can request Sage+ collectors to "curate" specific sale categories (vintage, furniture, jewelry), earning both shopper and host bonus points
- **Host Endorsement:** Grandmaster shoppers can give public "Seal of Approval" endorsements on host sales, which boost sale visibility and host reputation score

---

## 4. SEASONAL ARC DESIGN: EXPEDITIONS

### Framework: Quarterly Theme Cycles with Leaderboard Resets

Each season has a 12-week arc with a distinct narrative, themed challenges, bonus XP multipliers, limited-edition badges, and a reset leaderboard. Permanent ranks persist; seasonal scores reset Q1.

#### **Q1: SPRING AWAKENING EXPEDITION** (March–May)
**Theme:** Spring cleaning, estate clearances, renewal season

- **Narrative:** After winter hibernation, the Guild awakens. Spring cleaning season brings fresh inventory. Collect items tied to renewal: gardening tools, seasonal decor, vintage finds from long-closed estates.
- **Seasonal Badges (Limited):** "Spring Cleaner" (purchased 3+ items tagged "seasonal/spring"), "Estate Scout" (visited 3+ estate sales), "Renewal Collector" (specialize in home goods category)
- **Challenges:**
  - "Spring Treasure Hunt" — Find 10 items in 3 different sale types (estate, yard, flea), 200 XP bonus
  - "Renewal Streak" — Attend sales 7 consecutive days, 150 XP bonus + 7-day streak multiplier (1.5x)
  - "Community Garden" — Collect 5 gardening-themed items, "Garden Keeper" seasonal badge + 100 XP
- **Leaderboard Incentive:** Top 10 on Seasonal Leaderboard get "Spring Legend" badge + feature on homepage + 500 bonus XP after season ends
- **Host Challenge:** Hosts with "Spring Sale" themed sales (with seasonal tags curated by Marketing) get 15% platform fee discount for Q1

#### **Q2: SUMMER ADVENTURE EXPEDITION** (June–August)
**Theme:** Travel season, vacation shopping, summer discovery

- **Narrative:** Summer expands horizons. Collectors travel, visit sales in new regions, hunt for travel-themed treasures and vacation memorabilia.
- **Seasonal Badges:** "Summer Wanderer" (purchased items from sales in 3+ different regions), "Travel Curator" (collected travel/vacation items), "Coastal Collector" (geographic region specialization)
- **Challenges:**
  - "Region Hopper" — Visit sales in 5 different cities/regions, 250 XP bonus
  - "Summer Finds" — Collect travel, vacation, or summer-themed items from 3+ sales, "Vacation Collector" badge + 150 XP
  - "Seller Connection" — Make 5 purchases from same host, 100 XP + "Host Favorite" seasonal badge
- **Leaderboard Incentive:** "Summer Champion" titles, feature in travel-themed email campaign, early access to Fall inventory
- **Micro-Event:** "Picnic Treasures" (July 1–7) — All items tagged "picnic/outdoor dining" give 2x XP

#### **Q3: FALL COLLECTION EXPEDITION** (September–November)
**Theme:** Curation, specialization, preparation for holidays

- **Narrative:** The Guild takes stock. Collectors refine specialties, pursue "white whale" collection items, prepare gift finds for upcoming holidays.
- **Seasonal Badges:** "Specialist" (completed 3+ Passport specialties), "Collection Curator" (high-value items accumulated), "Holiday Prepper" (holiday-themed collections)
- **Challenges:**
  - "Specialty Mastery" — Complete 3 Passport specialty categories, 200 XP per category
  - "Collection Quest" — Find 5 items for your #1 specialty category, "Master Collector" badge + 250 XP
  - "Treasure Finder" — Purchase highest-value item of season (tracked), "Treasure Seeker" badge + variable XP (100–500 based on rarity)
- **Leaderboard Incentive:** "Fall Sage" title, featured in holiday gift guide marketing, exclusive "Gift Curator" presale access in Q4
- **Host Challenge:** Hosts can launch "Seasonal Collection Themes" (e.g., "Vintage Holiday Decor") and receive 2x XP bonus for items shoppers purchase in theme categories

#### **Q4: WINTER TREASURES EXPEDITION** (December–February)
**Theme:** Gifts, celebration, year-end review

- **Narrative:** The season of giving. Collectors hunt gift-worthy finds, celebrate wins, prepare reflections on the year. Holiday shopping + gift guides + year-end retrospectives.
- **Seasonal Badges:** "Gift Master" (purchased 10+ gift-wrapped items), "Year-End Legend" (top 50 on annual leaderboard), "Celebration Collector" (holiday-themed specialization)
- **Challenges:**
  - "Gift Guide Curator" — Find 7 items under $50 that fit curated gift themes (provided by Marketing), 200 XP + "Gift Finder" seasonal badge
  - "Year-End Reflection" — Reach 50 total purchases in calendar year, "Year-End Champion" badge + 300 XP + annual report (personalized collector summary)
  - "Grandmaster Gathering" — Attend "Grandmaster-Only Holiday Presale" event (live or virtual), 150 XP + exclusive Winter Ornament digital collectible
- **Leaderboard Incentive:** "Winter Legend" hall of fame, feature in New Year email campaign, special "Year in Review" shareable graphic
- **Host Challenge:** "Giving Back Challenge" — Hosts who donate 5% of sale proceeds to local charity get double platform fee discount (would be 0% fee on that sale)

### Seasonal Integration Points

- **Permanent Rank Rewards Don't Reset:** A Sage who reaches 5k XP keeps Sage status through all seasons. Seasonal leaderboards exist separately.
- **Multiplier Stacking:** Seasonal streak bonuses (1.5x XP for 7-day attendance) stack with monthly anniversary bonuses (1.1x XP on purchase anniversary dates).
- **Progressive Thresholds:** Seasonal challenges scale difficulty: Spring is approachable for new players (3 sales = easy), Fall requires mastery (3 specialties = intermediate), Winter tests dedication (50 lifetime purchases = commitment)

---

## 5. MICRO-EVENT CALENDAR: 12–16 Holiday & Calendar Events

### Beyond the 4 Seasonal Arcs: Bonus XP + Limited Badges

Micro-events are 1–3 week sprints overlaid on the seasonal calendar. They don't reset leaderboards but offer themed challenges, bonus XP multipliers, limited-edition badges, and tie into real-world secondary market behavior patterns.

#### **January Events**

**Event JAN-01: "New Year, New Collections" (Jan 1–14)**
- **Timing:** Post-holiday season, estate clearances peak after holidays, New Year resolution shopping
- **Mechanic:** All purchases during event window earn 1.5x XP. New Year-themed badge "Fresh Start Collector"
- **Challenge:** Attend 5 different sales, start a new Passport specialty category = "Resolution Setter" badge + 150 XP
- **Host Angle:** Hosts listing "Estate Clearance" sales get featured placement in search for 2 weeks
- **Real-world Tie-in:** January is peak estate sale month (holiday wealth transfer, downsizing after holidays)

**Event JAN-02: "Vintage Rendezvous" (Jan 15–31)**
- **Timing:** Mid-month, sustain engagement from New Year push
- **Mechanic:** Vintage-tagged items give 2x XP. Specialty for vintage items gives bonus 50 XP per item
- **Challenge:** Collect 3 vintage items from 3 different sales = "Vintage Devotee" badge + 100 XP
- **Host Angle:** Auctions and vintage dealers can feature vintage-heavy sales for 2 weeks free
- **Real-world Tie-in:** January auctions and estate sales specialize in vintage furniture and antiques

#### **February Events**

**Event FEB-01: "Valentine's Treasure Hunt" (Feb 1–14)**
- **Timing:** Valentine's Day tie-in, gift-buying behavior
- **Mechanic:** Items tagged "gifts," "jewelry," "home decor" (typically gift-worthy categories) earn 2x XP
- **Challenge:** Find 5 gift-worthy items under $100, give 1 as a gift reference to a friend = "Cupid's Collector" badge + 150 XP
- **Host Angle:** Hosts can tag sales "Valentine-Friendly" and receive 10% fee discount for this period
- **Real-world Tie-in:** Valentine's spending peak on jewelry, home gifts, niche collectibles

**Event FEB-02: "Black History Month Discoveries" (Feb 1–28)**
- **Timing:** Cultural awareness, civil rights education, support BIPOC vendors
- **Mechanic:** Items related to Black history, culture, art, authors earn 1.5x XP. Purchases from BIPOC-owned vendors earn bonus 25 XP
- **Challenge:** Find 3 items celebrating Black history or culture, visit BIPOC host sale = "Culture Collector" badge + 100 XP
- **Host Angle:** BIPOC hosts promoted in search results for full month, 5% fee discount
- **Real-world Tie-in:** February is peak month for cultural merchandise and educational items

#### **March Events**

**Event MAR-01: "St. Patrick's Luck" (Mar 1–17)**
- **Timing:** St. Patrick's Day, cultural celebration, green-themed shopping
- **Mechanic:** Items with green, Celtic, or Irish themes earn 1.5x XP
- **Challenge:** Collect 5 green-themed items = "Lucky Collector" badge + 75 XP
- **Host Angle:** Sales featuring Irish/Celtic antiques and memorabilia get featured placement
- **Real-world Tie-in:** March is seasonal for Irish estate collections, cultural memorabilia auctions

#### **April Events**

**Event APR-01: "Spring Cleaning Sprint" (Apr 1–15)**
- **Timing:** Tax refund spending season, spring organization season (distinct from Q1 Expedition)
- **Mechanic:** Organization items (shelving, storage, furniture for organizing) earn 2x XP
- **Challenge:** Fill a new Passport specialty category + purchase 3 organizational items = "Organizer Supreme" badge + 150 XP
- **Host Angle:** Hosts running "Organization Solutions" sales get top search placement
- **Real-world Tie-in:** April tax refunds drive spending; spring cleaning is cultural practice

**Event APR-02: "Earth Day Treasures" (Apr 15–30)**
- **Timing:** Earth Day (Apr 22), sustainability, upcycling
- **Mechanic:** Upcycled, vintage, or eco-friendly items earn 1.5x XP. Purchases from hosts with "Green Host" certification earn 50 bonus XP
- **Challenge:** Find 5 sustainable/vintage items, pledge to upcycle them = "Eco Collector" badge + 100 XP
- **Host Angle:** Hosts promoting "Sustainability Focus" or "Upcycled Items" get 7% fee discount this month
- **Real-world Tie-in:** Earth Day drives sustainability interest; estate sales naturally align with upcycling values

#### **May Events**

**Event MAY-01: "Graduation Gift Guide" (May 1–31)**
- **Timing:** High school/college graduations, gift-buying season
- **Mechanic:** Items tagged "gifts," "decor," "lifestyle" for young adults earn 2x XP
- **Challenge:** Curate 5 gift-worthy items under $75 each, recommend to a friend = "Gift Curator" badge + 150 XP
- **Host Angle:** Hosts curating "Graduation Gifts" section get featured placement, 8% fee (instead of 10%)
- **Real-world Tie-in:** May graduations drive gift demand; estate sales have furniture and decor suitable for first apartments

#### **June Events**

**Event JUN-01: "Pride Month Celebration" (Jun 1–30)**
- **Timing:** LGBTQ+ cultural celebration, allyship visibility
- **Mechanic:** Items related to LGBTQ+ pride, artists, or content earn 1.5x XP. Purchases from LGBTQ+-owned vendors earn bonus 25 XP
- **Challenge:** Find 3 items celebrating LGBTQ+ culture or art, visit pride-themed sale = "Pride Ally" badge + 100 XP
- **Host Angle:** LGBTQ+-owned vendors get 5% fee discount, featured search placement for full month
- **Real-world Tie-in:** June visibility aligns with estate/vintage sales of LGBTQ+ artist works and memorabilia

#### **July Events**

**Event JUL-01: "Picnic Treasures Summer Bash" (Jul 1–7)**
- **Timing:** July 4th, summer entertainment season
- **Mechanic:** Outdoor/picnic/entertaining items earn 2x XP
- **Challenge:** Collect 5 picnic, entertaining, or outdoor-themed items = "Summer Entertainer" badge + 100 XP
- **Host Angle:** Sales featuring garden furniture, picnic sets, outdoor decor get featured placement
- **Real-world Tie-in:** Summer entertaining season; peak for patio furniture at estate/yard sales

**Event JUL-02: "Vintage Fashion Fiesta" (Jul 8–31)**
- **Timing:** Summer fashion, vintage clothing peak season
- **Mechanic:** Vintage clothing, shoes, accessories earn 2x XP
- **Challenge:** Build a vintage outfit (7+ vintage clothing items from different sales) = "Vintage Fashion Icon" badge + 150 XP
- **Host Angle:** Fashion-forward hosts running vintage clothing sales get featured placement, 8% fee
- **Real-world Tie-in:** July estate sales feature summer wardrobes; vintage clothing is evergreen demand

#### **August Events**

**Event AUG-01: "Back-to-School Hunt" (Aug 1–31)**
- **Timing:** K-12/college back-to-school shopping peak season
- **Mechanic:** Items tagged "school supplies," "student furniture," "books" earn 2x XP
- **Challenge:** Assemble a "student starter kit" (desk, chair, books, supplies) = "Student Sponsor" badge + 150 XP
- **Host Angle:** Hosts offering "Back-to-School" themed sales get 7% fee discount, featured placement
- **Real-world Tie-in:** August is peak for used student furniture, textbooks, dorm supplies from estate sales

#### **September Events**

**Event SEP-01: "Labor Day Deals" (Sep 1–7)**
- **Timing:** Labor Day weekend, summer-to-fall transition, informal sales season
- **Mechanic:** All purchases during 3-day weekend earn 1.5x XP
- **Challenge:** Attend a sale on Labor Day weekend = 50 bonus XP
- **Host Angle:** Hosts running sales over Labor Day weekend get 2x visibility in regional search
- **Real-world Tie-in:** Labor Day weekend is informal estate sale season in many regions

#### **October Events**

**Event OCT-01: "Spooktacular Collectibles" (Oct 1–31)**
- **Timing:** Halloween, costume/decor season
- **Mechanic:** Halloween, horror, vintage costume items earn 2x XP
- **Challenge:** Collect 7 Halloween-themed items or vintage costumes = "Spook Master" seasonal badge + 150 XP
- **Host Angle:** Hosts featuring "Vintage Halloween Decor" or "Costume Auctions" get featured placement, 8% fee
- **Real-world Tie-in:** October Halloween season drives demand for vintage decor, costumes, memorabilia

**Event OCT-02: "Antique Appraisal Event" (Oct 15–31)**
- **Timing:** Late October, preparation for holiday shopping, appraisal season
- **Mechanic:** Items 30+ years old get 1.5x XP. Purchasing appraisal/authentication services (future feature) gives 50 XP
- **Challenge:** Find 5 genuine antiques (verified by age), research provenance = "Antique Authority" badge + 150 XP
- **Host Angle:** Antique specialists and auction houses get featured placement, early access to appraisal feature beta
- **Real-world Tie-in:** October is appraisal season; preparation for holiday sales and estate planning

#### **November Events**

**Event NOV-01: "Gratitude Gathering" (Nov 1–15)**
- **Timing:** Thanksgiving, gratitude/harvest cultural theme
- **Mechanic:** Items tagged "Thanksgiving," "harvest," "collectible dinnerware" earn 1.5x XP
- **Challenge:** Collect vintage dinnerware or Thanksgiving-themed items for a complete set = "Table Master" badge + 150 XP
- **Host Angle:** Hosts featuring vintage dinnerware, holiday serving pieces get featured placement
- **Real-world Tie-in:** Thanksgiving drives demand for vintage dishware, serving pieces, décor

**Event NOV-02: "Black Friday Flip" (Nov 20–Dec 2)** ← Extends into December
- **Timing:** Black Friday/Cyber Monday, holiday shopping season opener
- **Mechanic:** All purchases earn 2x XP. Resale items (items purchased and resold within 30 days elsewhere) earn bonus "Flipper" badge + 100 XP if tracked via platform integration
- **Challenge:** Make 10+ purchases during Black Friday week = "Black Friday Legend" badge + 200 XP
- **Host Angle:** Hosts running major Black Friday sales get 15% platform fee discount, featured across all channels
- **Real-world Tie-in:** Black Friday is the biggest retail event; secondary market shoppers hunt estate sales for inventory

#### **December Events**

**Event DEC-01: "Holiday Gift Quest" (Dec 1–23)**
- **Timing:** Holiday shopping season peak, gift-giving culture
- **Mechanic:** Gift-worthy items earn 2x XP. Purchases of items under $50 (budget gifts) earn 1.5x XP
- **Challenge:** Curate 12 gift-worthy items (one for each "day of Christmas"), all under $75 = "Gift Master Supreme" badge + 250 XP
- **Host Angle:** Hosts running "Holiday Gifts" themed sales get 10% fee discount, featured email campaigns
- **Real-world Tie-in:** December is peak gift-shopping season; secondary market offers budget gift options

**Event DEC-02: "Year-End Reflection" (Dec 24–31)**
- **Timing:** End of year, reflection, New Year preparation
- **Mechanic:** Completion of annual milestone (50 purchases) unlocks "Year-End Champion" badge + 300 XP
- **Challenge:** Complete annual "Collector's Report" (shareable graphic of year stats) = "Year Legend" badge + 150 XP
- **Host Angle:** Host annual awards: "Host of the Year," "Most Helpful," "Best Collector," voted by shoppers
- **Real-world Tie-in:** December closures and clearances; year-end estate settlements; New Year preparation

### Summary: 16 Micro-Events (Staggered, Non-Overlapping)

| **Month** | **Events** | **Count** |
|-----------|-----------|----------|
| Jan | New Year, New Collections; Vintage Rendezvous | 2 |
| Feb | Valentine's Treasure Hunt; Black History Month | 2 |
| Mar | St. Patrick's Luck | 1 |
| Apr | Spring Cleaning Sprint; Earth Day Treasures | 2 |
| May | Graduation Gift Guide | 1 |
| Jun | Pride Month Celebration | 1 |
| Jul | Picnic Treasures; Vintage Fashion Fiesta | 2 |
| Aug | Back-to-School Hunt | 1 |
| Sep | Labor Day Deals | 1 |
| Oct | Spooktacular Collectibles; Antique Appraisal | 2 |
| Nov | Gratitude Gathering; Black Friday Flip | 2 |
| Dec | Holiday Gift Quest; Year-End Reflection | 2 |
| **TOTAL** | | **19** |

---

## 6. DEVIL'S ADVOCATE PRE-FLIGHT: TOP 3 OBJECTIONS + STEELMAN RESPONSES

### Objection 1: "This is Too Complex — Users Won't Understand It"

**DA Opening:** "Five rank tiers + four seasonal leaderboards + 19 micro-events + dual shopper/organizer systems = cognitive overload. Estate sale shoppers skew older and less tech-savvy. You'll confuse 60% of users and convert nobody."

#### **Steelman Response: Simplicity Layer Design**

**Design Principle:** Complexity is opt-in; simplicity is default.

**For Casual Shoppers (60% of base):**
- **Default UX:** "You have 2,500 Guild Points. Keep purchasing and visiting sales to unlock cool perks." Simple progress bar on dashboard. No mention of rank tiers initially.
- **Onboarding:** Show ONE number: "Guild XP." Explain in 1 sentence: "Every dollar spent earns 1 point. Get to 500 points to unlock Hunt Pass discount." Done.
- **Seasonal challenges:** Optional. They appear as a toggle on the Collector Passport ("See what's trending this season?") but don't block anything.

**For Engaged Collectors (30% of base):**
- **Earned UI:** After first 100 XP, unlock full rank progression UI. Show the five-tier ladder: "You're an Initiate. Reach Scout (500 XP) for exclusive perks."
- **Seasonal challenges:** Featured prominently. "Spring Awakening Challenge: Attend 5 sales this quarter and unlock seasonal badges."

**For Hardcore (10% of base):**
- **Competitive UI:** Full leaderboard, micro-event tracker, estimated rank-up date, optimization guides. "You'll hit Grandmaster in 18 months at current pace. Here's how to accelerate."

**Precedent:** Starbucks Rewards has 300M users. Most don't understand the math behind star redemptions. They just see: "Buy coffee → get free coffee." The complex tier system exists but stays invisible until players seek it out. FindA.Sale would mirror this: **simple surface, complex depth available on demand.**

**Counterpoint to DA:** If complexity kills adoption, Etsy (10 seller tiers + subcategory ratings + shipping badges) would have collapsed. It didn't. Users self-educate as they grow. The rank metaphor (Initiate → Grandmaster) is instantly understandable — fantasy games have normalized this across all age groups.

**Board confidence signal:** Commission a UX clarity audit (5 Figma prototypes of onboarding) and show to 10 real estate sale shoppers. Measure: "Can you explain what Guild XP is in one sentence?" Target: 80%+ get it right. Do the audit before full dev.

---

### Objection 2: "This is Just a Badge System with a Fancy Name"

**DA Opening:** "You've renamed 'badges' as 'Guild Ranks.' You've renamed 'discount codes' as 'functional rewards.' But under the hood, it's the same loyalty-points system every company copies from Starbucks. Where's the defensible differentiation?"

#### **Steelman Response: Functional Rewards + Dual Progression**

**What Makes This Different:**

1. **Permanent Rank + Seasonal Reset (Dual Progression):** No other secondary market platform has this. eBay has seller tiers (permanent). Poshmark has Ambassador tiers (permanent). Etsy has seller stars (permanent). None have "your rank persists but your quarterly leaderboard resets." This solves the veteran-engagement cliff: a Grandmaster in Month 1 of Q1 doesn't lose their status on Q2 Day 1, so they don't get demoralized by a reset.

2. **Functional Rewards Are Non-Reversible Benefits:**
   - **Scout:** 5% Hunt Pass discount ($4.74 instead of $4.99) is recurring, not a one-time code. It ships as a billing line-item adjustment (code lives in Stripe subscription logic, not a promo code system).
   - **Ranger:** Priority support (2h SLA vs. 24h) changes operational capacity. It's a real staffing implication — you can't take it back without breaking trust.
   - **Sage:** "24h presale access" is a product feature, not a badge. It's a route (`/api/sales/presale/sage-only`) with geofencing and time locks. It costs something (inventory scarcity, complexity).
   - **Grandmaster:** Free Hunt Pass annually is $59.88/year cost per user at scale. It's not cosmetic; it's p&l real.

3. **Organizer Tier Interaction:** Shoppers don't typically gamify with hosts in badges-only systems. Here, a Sage shopper gets early access to a Master Host's sale 24h early — a co-created value (shopper gets first pick, host gets presale revenue). This is **ecosystem design, not just cosmetics.**

4. **Micro-Events Tie to Real Behavioral Patterns:** "Black Friday Flip" and "Tax Refund Spring Cleaning Sprint" are events designed around documented secondary-market shopper behavior, not arbitrary calendar dates. The real-world tie-ins make the system feel credible, not gamified.

**Board Confidence Signal:** Commission competitive matrix:
- Starbucks: Permanent stars only (no seasonal reset). Cosmetic badges + simple discount. ✓ Scale: 300M users. ✗ Engagement cliff at Star level.
- eBay: Permanent seller tiers. Functional (listing limits, feature access). ✓ Powerful for sellers. ✗ Boring for buyers.
- Poshmark: Ambassador tiers. Partially functional (revenue share). ✓ Unique. ✗ Limited to top 2%.
- **FindA.Sale:** Permanent rank + seasonal leaderboard + ecosystem interaction. ✓ Drives new engagement loop. ✓ Works for all user tiers.

If board is not convinced, reduce to **Core Only:** Ship permanent ranks (Initiate → Grandmaster) + functional rewards in Year 1. Seasonal expeditions + micro-events become Year 2 expansion. This preserves the dual-progression defensibility while deferring complexity.

---

### Objection 3: "Seasonal Resets Will Frustrate Long-Term Users Who Feel Like They're Losing Progress"

**DA Opening:** "You're telling me a user hits #5 on the Seasonal Leaderboard in Q1, feels great, then on Q2 Day 1 they're back at zero. They'll feel robbed. Engagement cliff incoming. This is the same pattern that killed every seasonal battle pass system after the honeymoon period."

#### **Steelman Response: Permanent Rank Protection + Prestige System**

**Core Design Choice: Permanent Guild Rank Never Resets**

A Sage who reached 5,000 XP stays a Sage forever. Period. The seasonal leaderboard is **additive engagement, not destructive reset.**

**Comparison Model:**
- **Seasonal Leaderboard = Quarterly Tournament** (like Clash Royale, Apex Legends)
- **Permanent Rank = Career Level** (like your actual player level in those games)
- Game theory: Players who don't care about tournaments still progress their career level. Tournament enthusiasts get both. Nobody loses permanent progress.

**Additional Frustration Mitigation — Prestige Mechanics:**

1. **"Season Champion" Badges Are Permanent:** Even though the leaderboard resets, the badge "Q1 Spring Legend" stays on your profile forever. It says "I was #1 in Q1 2026." Cumulative display: "Q1 Champion | Q3 Champion" (shows you've won multiple seasons).

2. **Annual Hall of Fame:** Top 100 collectors get permanent "Hall of Fame" placement. They can't fall off. It's like Major League Baseball's record books — your achievement is historical.

3. **Multiplier Stacking:** A veteran player who was Q1 Champion gets a 1.2x XP multiplier in Q2 (psychological reward for past success) without needing to replay the same challenges. They feel momentum, not reset.

4. **"Legacy Collector" Status:** After 2 years at Grandmaster, you unlock "Legacy Collector" cosmetic (a special badge frame, custom emoji). It's permanent and says "this person has been here a while and is serious."

**Precedent (Games Industry):**
- **Overwatch Seasons:** Players' SR (seasonal rank) resets each season, but their account level persists. Most players report they feel motivated to climb SR again because they're not losing their account progression.
- **Magic: The Gathering Arena:** Seasonal rankings reset; deck history and collection don't. Players engage with seasonal ladder resets because rank is about "skill this season," not "cumulative progress."
- **Diablo 3:** Hardcore characters die (extreme reset). But ladder seasons reset without player rage because players have **permanent achievement categories** (cosmetics, dungeon records, build optimization).

**Real-World Test:** In S248 walkthrough, Patrick explicitly approved "Leaderboard paused for beta (code ships, reactivates post-beta)." No objection to the reset mechanic itself — the pause was just about scale (too few users for meaningful leaderboard).

**Risky Version vs. Safe Version:**
- **Risky (current spec):** Seasonal leaderboard resets Q1. Players ranked #1–100 compete fresh. Players ranked #101–500 get frustrated and churn.
- **Safe:** Add "Retirement Leaderboard" for players 40+, separate from main seasonal ladder. They still compete but among peer cohort. Requires A/B testing to justify.

**Board Confidence Signal:** Implement **Permanent Rank + Seasonal Leaderboard** in beta MVP. Monitor churn rates for players in positions #50–200 on Q1 leaderboard. If Q2 churn >15%, add prestige multiplier or retirement bracket. If churn <10%, proceed full-speed. No need to decide the mitigation strategy now — just commit to measuring it.

---

## 7. ARCHITECT PRE-FLIGHT: TOP 3 TECHNICAL CONCERNS + COMPLEXITY RATINGS

### Concern 1: Data Model Complexity — What New Tables/Fields Are Needed?

**Question:** "How much schema change is this? Can you fit it in one migration?"

#### **Analysis: Moderate Complexity (M)**

**New Tables Required:**

1. **`UserRank`** — tracks permanent rank progression
   ```
   UserRank {
     id PK
     userId FK → User
     rank ENUM (INITIATE, SCOUT, RANGER, SAGE, GRANDMASTER)
     totalGuildXP Int (cumulative, never resets)
     rankedAt Timestamp (when they hit this rank)
     achievedAtRank Text? (optional description: "reached after 200 purchases")
   }
   ```

2. **`SeasonalLeaderboard`** — quarterly reset leaderboard (new table, quarterly purge)
   ```
   SeasonalLeaderboard {
     id PK
     userId FK → User
     seasonId String (Q1_2026, Q2_2026, etc.)
     seasonalScore Int (reset Q1)
     seasonalRank Int (computed on read, 1–500)
     badgesEarned String[] (serialized: ["Spring_Legend", "Estate_Scout"])
     createdAt Timestamp
   }
   ```

3. **`GuildXPTransaction`** — audit log (optional, high-value for debugging)
   ```
   GuildXPTransaction {
     id PK
     userId FK → User
     amount Int (can be negative if claw-back)
     reason ENUM (PURCHASE, REFERRAL, VISIT, SPECIALTY, CHALLENGE, MENTOR)
     relatedId String? (FK to purchase/visit/challenge)
     createdAt Timestamp
   }
   ```

4. **`SeasonalChallenge`** — ephemeral challenge registry (new table, referenced by events)
   ```
   SeasonalChallenge {
     id PK
     seasonId String
     eventId String (e.g., "JAN_01_NEW_YEAR")
     challengeKey String (e.g., "attend_5_sales")
     name String
     description Text
     xpReward Int
     badgeId FK → Badge (if badge is unlocked)
     isActive Boolean
     startsAt Timestamp
     endsAt Timestamp
   }
   ```

5. **`UserSeasonalProgress`** — tracks challenge completion per user (optional, for optimization)
   ```
   UserSeasonalProgress {
     id PK
     userId FK → User
     challengeId FK → SeasonalChallenge
     progress Int (e.g., "3/5" sales attended)
     completed Boolean
     completedAt Timestamp?
   }
   ```

**Schema Modifications to Existing Tables:**

1. **`User`** — add 3 fields
   ```diff
   - Add: huntPassTier ENUM (INITIATE, SCOUT, RANGER, SAGE, GRANDMASTER) - denormalized cache
   - Add: totalGuildXP Int (denormalized cache of UserRank.totalGuildXP)
   - Add: seasonalBadges String[] (serialized array of earned seasonal badges)
   ```

2. **`Hunt Pass`** — add discount calculation logic (not a schema change, but business logic change in PricingService)

3. **`Badge`** — add isSeasonalBadge Boolean flag + seasonId String? to distinguish permanent vs. limited badges

**Total Schema Footprint:**
- **New Tables:** 5 (UserRank, SeasonalLeaderboard, GuildXPTransaction, SeasonalChallenge, UserSeasonalProgress)
- **Modified Tables:** 3 (User, Badge, HuntPass pricing table)
- **Migrations Required:** 2 (schema additions can be combined into single migration; separate migration for seed data if needed)
- **Estimated Complexity:** M (straightforward table design, no circular dependencies, no advanced normalization required)

**Risk Flag:** ⚠️ **Denormalization (totalGuildXP on User, huntPassTier on User)** — These caches must be kept in sync with UserRank. Recommend: (a) database triggers to auto-update on UserRank insert, OR (b) nightly batch job to refresh caches. Without this, rank display will lag actual progress. **Mitigation:** Always read from UserRank as source of truth in API; use User.totalGuildXP only for sorting/search optimization.

---

### Concern 2: XP Calculation — Where Does This Logic Live? How Does It Scale?

**Question:** "Is XP calculation synchronous (instant point on purchase) or asynchronous (nightly batch)? What's the perf implication?"

#### **Analysis: Medium-High Complexity (M-H)**

**Option A: Synchronous (Immediate Credit on Purchase)**
- **When:** XP is credited the moment a purchase is finalized (`POST /api/purchases` completes)
- **Where:** `notificationService.ts` or new `xpService.ts`
- **Code Pattern:**
  ```typescript
  // In purchaseController.ts after payment confirmed
  await xpService.awardXP({
    userId,
    amount: purchaseAmount * 1, // $1 = 1 XP
    reason: 'PURCHASE',
    relatedId: purchase.id
  });

  // awardXP() logic:
  // 1. Create GuildXPTransaction (audit log)
  // 2. Update User.totalGuildXP += amount
  // 3. Update UserRank rank if threshold crossed
  // 4. Check if any SeasonalChallenge progress incremented
  // 5. Emit event: "xp_awarded" for notifications/UI update
  ```
- **Pros:** Real-time feedback. User sees "+50 XP" badge immediately. Dopamine loop is instant.
- **Cons:** Adds ~50–100ms latency to purchase completion. Must handle race conditions (concurrent buys from same user). Requires transaction lock.
- **Scaling:** At 100 concurrent purchases/second, this becomes a bottleneck. Would need XP table sharding (shard by userId hash) or eventual consistency (write to queue, process in worker).

**Option B: Asynchronous (Eventual Credit, 5–60 Minute Delay)**
- **When:** XP is credited via scheduled task or message queue job
- **Where:** `XpAwardingWorker` (Node.js Bull queue or Lambda function)
- **Code Pattern:**
  ```typescript
  // In purchaseController.ts (fast path)
  await queue.add('award_xp', {
    userId,
    amount: purchaseAmount,
    reason: 'PURCHASE',
    relatedId: purchase.id
  });
  // Returns immediately; XP processing happens in background

  // In xpAwardingWorker.ts (runs every 5 min)
  const job = await queue.process('award_xp', async (job) => {
    const { userId, amount } = job.data;
    await xpService.awardXP(...); // same logic as sync
  });
  ```
- **Pros:** Zero impact on purchase latency. Handles scale trivially (workers auto-scale). Idempotent (safe to retry).
- **Cons:** User doesn't see "+50 XP" immediately; they see it on next page refresh or after 5 min. Feels slower. May hurt engagement.
- **Scaling:** Trivial. 100 purchases/second = 6,000 XP transactions/minute. One worker processes 1,000/second. No bottleneck.

**Recommendation: Hybrid Approach (Recommended for Production)**
- **Synchronous for PurchasesOnly** (critical engagement loop) — XP awarded immediately on purchase finalization.
- **Asynchronous for everything else** (visits, referrals, challenges) — XP awarded via background job. Lower engagement impact, so latency is acceptable.
- **Caching:** Use Redis to cache total XP for each user (TTL 5 min). On read, hit Redis first; on write, invalidate cache immediately.

**Scaling Estimate (assuming 10k DAU):**
- Purchases/day: ~100–200 (mature, engaged users buy 1–2x/week)
- Visits/day: ~500–1,000 (geolocation tracking, 5 XP per visit)
- Total XP transactions/day: ~600–1,200
- Peak traffic: ~10 transactions/second (midday)
- **Sync Queue:** Can handle 100+ TPS with single RDS instance
- **No sharding required until 10k TPS**

**Risk Flags:**
- ⚠️ **Referral XP Cheating:** Referral (50 XP) must be tied to actual first purchase from referred user. Without verification, users game it (create fake referral chains, farm XP). **Mitigation:** Verify referred user's payment method is unique (not previously used account); add fraud detection logic.
- ⚠️ **Visit XP Spoofing:** Geolocation can be faked (GPS spoof, VPN). 5 XP per visit is low-value enough that cheating isn't worth it, but worth monitoring. **Mitigation:** Flag accounts with >50 visits/day as suspicious.

**Data Flow Diagram:**
```
Purchase Finalized
  ↓
purchaseController.ts calls xpService.awardXP()
  ↓
GuildXPTransaction created (audit)
  ↓
User.totalGuildXP updated (atomic)
  ↓
Check UserRank thresholds
  ├─ Crossed 500 XP? → set rank = SCOUT, emit "rank_up" event
  ├─ Crossed 2k XP? → set rank = RANGER, emit "rank_up" event
  └─ Crossed 12k XP? → set rank = GRANDMASTER, emit "rank_up" event
  ↓
Emit "xp_awarded" event
  ├─ Notification system picks up
  ├─ WebSocket push to client (real-time UI update)
  └─ Log to analytics (engagement tracking)
```

---

### Concern 3: Event System — How Are Time-Limited Micro-Events Triggered & Expired?

**Question:** "19 micro-events per year, each with start/end dates and specific rules. How do you orchestrate this without manual intervention?"

#### **Analysis: Low-Medium Complexity (L-M)**

**Option A: Static Event Registry (Simplest)**
- **How:** Hardcode all 19 events in a `EVENTS.ts` file or database seed. Each event has `startsAt` and `endsAt` timestamps.
- **Triggering:** On every user action (purchase, visit, challenge), check: "Is this action happening within an active event window?" If yes, apply event XP multiplier.
- **Code Pattern:**
  ```typescript
  // events.ts
  const MICRO_EVENTS = [
    {
      id: 'JAN_01_NEW_YEAR',
      name: 'New Year, New Collections',
      startsAt: new Date('2026-01-01'),
      endsAt: new Date('2026-01-14'),
      xpMultiplier: 1.5,
      challengeKey: 'new_year_challenge',
      badge: 'fresh_start_collector'
    },
    // ... 18 more events
  ];

  // In xpService.awardXP()
  const activeEvent = MICRO_EVENTS.find(e =>
    now >= e.startsAt && now <= e.endsAt
  );
  if (activeEvent) {
    xpAmount *= activeEvent.xpMultiplier; // 50 XP becomes 75 XP during event
  }
  ```
- **Expiration:** On event end date, no code runs. Next user action after end date simply won't find a matching event.
- **Pros:** Dead simple. No scheduled tasks needed. No drift. Deterministic.
- **Cons:** Adding a new event requires code deploy. Events are frozen in stone once shipped.
- **Scaling:** ✓ Trivial. O(n) loop over 19 events, negligible perf cost.

**Option B: Dynamic Event Registry (Flexible)**
- **How:** Store events in database (SeasonalChallenge table). Add a `"list_active_events"` endpoint. Client calls it on page load to see current events.
- **Triggering:** Same as Option A (check active event on user action). Data comes from DB, not hardcoded.
- **Expiration:** Scheduled task runs every hour, flags `isActive = false` on events past their end date.
- **Code Pattern:**
  ```typescript
  // In scheduledTask.ts (runs hourly)
  const expiredEvents = await SeasonalChallenge.update(
    { endsAt: { $lt: new Date() }, isActive: true },
    { isActive: false }
  );
  if (expiredEvents.length > 0) {
    logger.info(`${expiredEvents.length} events expired`);
  }

  // In xpService.awardXP()
  const activeEvent = await SeasonalChallenge.findOne({
    isActive: true,
    startsAt: { $lte: new Date() },
    endsAt: { $gte: new Date() }
  });
  ```
- **Pros:** Events can be added/edited without deploy. Can pause/unpause events in real-time via admin panel.
- **Cons:** Requires database query on every XP award. Introduces latency. Must handle time-zone edge cases (when exactly does an event end in user's local tz vs. server tz?).
- **Scaling:** ⚠️ Potential bottleneck. Every purchase checks DB for active events. At scale, this is ~100 DB queries/second. Mitigable with Redis cache (TTL 5 min).

**Recommendation: Hybrid (Option A + Admin Override)**
- **Default:** Hardcode events in `EVENTS.ts` for deterministic, zero-latency execution.
- **Admin Panel:** Optional feature to disable/extend events manually (for emergencies or community feedback).
- **First Year:** Use static registry. If we want dynamic events by Year 2, easy migration.

**Expiration & Cleanup:**
- **Badges Earned During Event:** Remain on profile forever (no cleanup). Seasonal badges are permanent once earned.
- **Leaderboard:** Snapshot taken at event end date. Top 100 frozen in hall of fame. New seasonal leaderboard starts fresh at Q1 Day 1.
- **Stale Data:** Old event records can be archived to `_archive` schema yearly (no real-time cleanup needed).

**Real-Time UI Sync (Client Side):**
- **Event Countdown:** Client calls `GET /api/events/active` on app load. Returns list of active events + countdown timers.
- **WebSocket Broadcast:** When an event expires, server sends WebSocket message to all connected clients: `"event_expired": { "eventId": "OCT_01_SPOOKY" }`. Clients remove event badge/UI element.
- **Fallback:** If client is offline when event expires, they'll see stale event on refresh and quickly fetch fresh data.

**Complexity Rating Justification:**
- **Simple parts:** Checking event window (one comparison), applying XP multiplier (one multiplication).
- **Complex parts:** Timezone handling (use UTC everywhere, convert to local only on display), concurrent event overlaps (none by design, but validate in tests), leaderboard snapshotting (one-time SQL query per event).
- **Overall:** L-M because it's straightforward logic with few edge cases.

**Build vs. Defer Decision:**
- **MVP (Phase 1):** Ship static 4 seasonal expeditions + 8 core micro-events (Jan, May, Jul, Aug, Sep, Nov, Dec = 7 events + Black Friday). Total 12 events. Hardcoded registry.
- **Phase 2 (Post-Beta):** Expand to full 19 events. Add admin panel if there's demand.
- **Phase 3 (Year 2):** Optionally migrate to dynamic registry if marketing team wants to run one-off events.

---

## 8. RECOMMENDED PHASING: MVP FIRST, FULL EXPANSION IN SPRINTS

### Phase 1: Core Gamification (MVP) — **Target: 4–5 weeks**

**Scope:** Permanent ranks + seasonal expeditions + core integrations

**Deliverables:**
1. **Schema Migration** — UserRank, SeasonalLeaderboard, SeasonalChallenge tables. Modify User, Badge tables. (1 day)
2. **XP Service** — awardXP(), rankUp logic, sync on purchase + async on visit/challenge. (3 days)
3. **UI: Collector Passport Redesign** — Show permanent rank (Initiate → Grandmaster), seasonal leaderboard placement, earned badges. (5 days)
4. **UI: Hunt Pass Copy Update** — Update onboarding and pricing tiers to reference permanent rank system. (2 days)
5. **UI: Rank Rewards Display** — Show what each rank unlocks (e.g., Scout = 5% discount, Sage = 24h presale). (3 days)
6. **Seasonal Expeditions (4 Arcs):** Design + seed challenges for Spring/Summer/Fall/Winter. (5 days)
7. **Leaderboard Page** — Display top 100 for current season. (3 days)
8. **Notifications:** Trigger on rank-up, challenge completion, seasonal badge earned. (2 days)
9. **QA + Live Testing** — Full test matrix (all roles, all tiers, all rank thresholds). (3 days)

**Burn Down:** ~4–5 weeks, 2–3 dev + 1 QA

**Not Included (Phase 2):**
- Organizer Host Ranks
- Micro-event system (19 events)
- Sage/Grandmaster presale access (time-gated routing)
- Mystery boxes, daily spin wheel, appraisal tokens
- Admin event management UI

### Phase 2: Organizer Gamification + Micro-Events — **Target: 3–4 weeks (Post-Beta)**

**Scope:** Host Rank system + 16 micro-events + organizer-shopper interaction

**Deliverables:**
1. **Schema:** HostRank, HostReputation tables. Add hostRank field to Organizer. (1 day)
2. **Host Rank Calculation:** Score hosts by sale count, rating, repeat customers. Trigger rank upgrades. (3 days)
3. **Host Rewards Logic:** Fee discounts, search placement bumps, feature flags. (2 days)
4. **UI: Organizer Dashboard Host Rank Section** — Show current rank, progress to next rank, claimed rewards. (3 days)
5. **Micro-Events Registry:** Hardcoded event list (16 core + seasonal). Implement event detection in XP loop. (4 days)
6. **Seasonal Badge System:** Seed 8–12 event-specific badges. Link to challenges. (3 days)
7. **Event UI Components:** Event countdown, challenge tracker, leaderboard filter by event. (4 days)
8. **Sage/Grandmaster Presale Routing:** Time-gated `/api/sales/presale` endpoint with rank check. (2 days)
9. **Presale UI:** "Available in 24h as Sage member" messaging on sale cards. (2 days)
10. **QA:** Test micro-event triggering, presale access, host rank progression, edge cases (leap seconds, timezone boundaries). (4 days)

**Burn Down:** ~3–4 weeks, 2–3 dev + 1–2 QA

**Critical Dependency:** Must ship Phase 1 live before Phase 2 starts. Organizer rank requires shopper rank baseline to be proven.

### Phase 3: Mystery Mechanics + Advanced Features — **Target: 2–3 weeks (Q3 2026)**

**Scope:** Engagement-driving mechanics (mystery boxes, daily spin wheel, appraisal tokens, gifting)

**Deliverables:**
1. **Mystery Box Engine** — Variable-ratio schedule logic. Reward table (discount codes, badges, early access). (4 days)
2. **Daily Spin Wheel UI** — Animation, sound design, streak tracking. (3 days)
3. **Appraisal Token Marketplace** — Token purchase flow (Stripe), AI integration, result caching. (4 days)
4. **Gifting System** — Allow shoppers to "gift" collectable items to other collectors. (3 days)
5. **Social Sharing:** "Brag" shareable cards (leaderboard position, annual summary, rank-up announcement). (2 days)
6. **QA** — Test reward randomization (verify variable schedule is unpredictable), token economics, gifting edge cases. (3 days)

**Burn Down:** ~2–3 weeks, 2 dev + 1 QA

**Lock-In Criteria for Phase 3:** Phase 1 must show 15%+ engagement lift (active users engaging with rank system monthly). If lower, reconsider Phase 3.

---

## 9. SHIP SEQUENCE & DECISION GATES

### MVP Ship Gate (End of Phase 1)

**Board Sign-Off Required:** Confirm phase 1 is "board-ready" before dev starts

- [ ] Board reviews schema footprint (no surprises)
- [ ] Board reviews XP economics (does 1 point per $1 align with business model?)
- [ ] Board reviews rank rewards (do promised discounts/features cost too much to deliver?)
- [ ] Patrick confirms budget for live support costs (priority SLA for Ranger tier = staffing cost)

### Phase 1 Completion Gate

**Live Metrics to Measure Before Phase 2 Starts:**
- **Rank Penetration:** % of active users who've reached Scout (500 XP). Target: 25%+ within 3 months.
- **Engagement Lift:** DAU increase year-over-year (post-phase 1 vs. pre-phase 1). Target: 10%+.
- **Hunt Pass Conversion:** Do Scout+ shoppers subscribe to Hunt Pass at higher rate? Target: 3%+ conversion.
- **Churn:** Do high-rank players churn less? Target: Grandmaster churn 50% lower than Initiate.

**If Metrics Miss:**
- **Rank Penetration <10%:** Gamification narrative isn't resonating. Consider simpler badge system + defer ranks.
- **Engagement Lift <5%:** System isn't driving behavior change. Investigate friction (onboarding copy, reward clarity, leaderboard perceived achievability).
- **Hunt Pass Conversion <1.5%:** Rank discounts aren't driving monetization. Consider higher tiers (Ranger = 10% discount instead of 5%).

**If Metrics Hit:**
- Proceed to Phase 2 with confidence.

---

## 10. BOARD-READY SUMMARY TABLE

| **Dimension** | **MVP (Phase 1)** | **Full Spec (Phases 1–3)** | **Competitive Differentiation** |
|---|---|---|---|
| **Shopper Ranks** | 5 tiers (Initiate→Grandmaster) | 5 tiers + dual seasonal leaderboard | Permanent rank + seasonal reset (unique) |
| **Functional Rewards** | Hunt Pass discount + priority support | + Presale access + free annual Hunt Pass | Non-cosmetic, recurring, ecosystem-level |
| **Organizer Tiers** | None (Phase 2) | 4 tiers (Novice→Master) | Seller gamification + shopper-host interaction |
| **Seasonal Events** | 4 seasonal expeditions | 4 expeditions + 16 micro-events | Real-world behavioral tie-ins (tax refunds, holidays) |
| **XP Acquisition** | Purchases, visits, referrals | + Specialties, challenges, community | Multi-loop system (primary + secondary engagement) |
| **Leaderboard** | Quarterly reset (no permanent ladder) | Seasonal + "Hall of Fame" prestige | Reset + prestige = no veteran frustration |
| **Micro-Events** | None (Phase 1) | 19 events (1–3 per month) | Calendar-driven, market-aware |
| **Complexity** | Low (4 tables, sync XP) | Medium (5–6 tables, event system) | Managed via simplicity layers + opt-in depth |
| **Technical Risk** | Low | Low-Medium | Hybrid static/dynamic event registry |
| **Go-Live** | Week 4–5 | Week 8–12 | Phased derisk |
| **Est. Cost (Dev Days)** | ~35 days (~7 weeks, 2 dev FTE) | ~60 days (~12 weeks, 2 dev FTE) | Spread across Q2–Q3 2026 |

---

## 11. FINAL NARRATIVE FOR BOARD PRESENTATION

**Headline:** "The Collector's Guild: Permanent Achievement + Seasonal Engagement Framework"

**30-Second Pitch:**
FindA.Sale shoppers climb permanent Guild ranks (Initiate → Grandmaster) that unlock real rewards: discounts, priority support, exclusive presales. Every quarter, they compete on seasonal leaderboards without losing rank permanence. Organizers earn parallel Host Ranks based on quality and community contribution. The system is defensible by dual progression (no other secondary market platform combines permanent + seasonal), functional rewards (not just badges), and ecosystem coupling (shoppers unlock hosts' presales).

**Why It Works:**
1. **Veteran Engagement Fix:** Permanent rank stops the engagement cliff. Players feel progress even when seasons reset.
2. **Economics Alignment:** Rank discounts + priority support are real operational costs, not free cosmetics. Monetization is sustainable.
3. **Scale-Ready:** Works across all 5 sale types (estate, yard, auction, flea, consignment). Narrative is platform-agnostic.
4. **Competitive Moat:** eBay has permanent tiers (boring). Poshmark has prestige (limited reach). Starbucks has seasonal drinks (unrelated). FindA.Sale has the only permanent + seasonal dual system in secondary sales.

**Board Next Steps:**
1. Approve schema + MVP scope (Phase 1, 4–5 weeks)
2. Patrick sign-off on rank rewards economics (staffing cost for Ranger SLA, discount math)
3. Architect review of XP system and event orchestration (this document, section 7)
4. Post-MVP: Live metrics to gate Phase 2 (engagement lift, rank penetration, Hunt Pass conversion)

---

**Document Status:** Ready for Board Review
**Prepared:** 2026-03-23 (Session 259)
**Confidence Level:** High (foundation validated by D-003 core loop, competitive research integrated, technical risks identified and mitigated)
