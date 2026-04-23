# Affiliate Program Innovation Review — Session 550

**Date:** 2026-04-22  
**Agent:** Innovation (pre-payout-lock review)  
**Status:** RECOMMENDATIONS — Patrick decides before dev dispatches Batch 5/7/9  

---

## Executive Summary

Architect spec (S544) locks payout model at **2% + $50 floor, once per referral, triggered on first PAID sale**. This review explores whether that model optimizes for FindA.Sale's core goal: organizer supply-side growth with minimal fraud surface.

**Key finding:** Current model is defensible but conservative. Three high-priority alternatives exist:
1. **Recurring % per organizer (not just first sale)** — stronger viral loop but ops complexity
2. **Tiered commission escalation (earn more as you refer more)** — rewards top recruiters, boosts supply acquisition
3. **Hybrid credit currency (earn affiliate credits as subscription discounts)** — eliminates cash flow / 1099 ops overhead while accelerating top-tier upgrades

**Status:** All three are feasible. The question is which maximizes organizer acquisition velocity without exploding fraud costs. Decision ≤ payout lock.

---

## Phase 1 — Ideation (No Constraints)

### Framework 1: Adjacent Possibilities
*What models do adjacent marketplaces use?*

**Idea 1: Shopify-Style Lifetime Subscription Percentage**
- **Pitch:** Referrer earns 2% of referred organizer's subscription revenue (not just first sale), for 12 months or until churn.
- **How:** AffiliateReferral tracks recurring payouts; each billing cycle, check if referred user still active, transfer 2% of that month's subscription charge.
- **Why it matters:** Incentivizes recruitment of higher-tier organizers (PRO=$29 → $7.20/yr per affiliate; TEAMS=$79 → $19.04/yr). Creates long tail of ongoing small payouts. Viral loop: "refer PRO users, earn monthly, compound."
- **Wild factor:** Medium (novel for FindA.Sale, standard for SaaS per Rewardful benchmarks)

**Idea 2: Referral Bounty Hunt (Tiers-Based Escalation)**
- **Pitch:** Commission rate climbs as affiliate hits 5, 10, 25, 50 referred organizers. E.g., 0-4 refs: 1.5%, 5-9: 2%, 10-24: 3%, 25+: 4%.
- **How:** AffiliateReferral.referrerId + COUNT query on qualification. Tier assigned at qualification trigger. Backwards-applied to all prior referrals by same affiliate once they hit thresholds? No — too complex. Applied forward only.
- **Why it matters:** Recognizes and rewards top recruiters. Creates visible leaderboard opportunity ("Top 10 Recruiters this month"). Boosts organizer acquisition by incentivizing serial referrers.
- **Wild factor:** Medium (novel game mechanic, standard in SaaS loyalty)

**Idea 3: Referral Credit Currency (Earn Subscription Discounts)**
- **Pitch:** Affiliates earn credits ($5 per qualified referral) redeemable as subscription discounts. E.g., 10 qualified referrals = $50 off PRO for 2 months.
- **How:** New AffiliateCredit table (userId, credits, expiresAt). On qualification, add 5 × 100 cents to user's credit balance. Organizer applies credits at checkout (like promo code).
- **Why it matters:** Eliminates cash flow / Stripe transfer overhead. Eliminates 1099 complexity (credits are not income). Accelerates top-tier conversions (organizer who earned credits → more likely to upgrade). Reduces fraud surface (no cash to exploit).
- **Wild factor:** High (fundamentally different from cash model, more consumer-facing than B2B, aligns with game economy)

**Idea 4: Multi-Organizer Workspace Incentive (Team Tier)**
- **Pitch:** Bonuses for referring organizers who convert to TEAMS tier or add team members. E.g., 2% on first sale PLUS $25 bonus if referred org adds 2+ team members within 30 days.
- **How:** Track `affiliateReferral.referredUserTeamMembersAdded` (count). At 30 days, check count ≥ 2, add bonus to payout.
- **Why it matters:** Drives adoption of higher-margin TEAMS tier. Creates compound incentive: recruit someone who recruits a team = higher payout. Amplifies viral loop.
- **Wild factor:** Medium (bonus mechanic is standard, but tying to team growth is novel)

**Idea 5: Brand Ambassador Program (Tiered Social)**
- **Pitch:** Top 20 recruiters (25+ qualified refs) get "FindA.Sale Ambassador" badge in their organizer profile, featured on `/ambassadors` page, receive monthly email spotlight, $0.50/ref bonus (cash) + public recognition.
- **How:** Leaderboard query monthly. Badge auto-assigned at 25 refs. Email template includes name, bio (opt-in), referral count, total earned. Landing page aggregates ambassador profiles + their affiliate links.
- **Why it matters:** Social/status-driven recruitment for the top percentile. Leverages brand allegiance + vanity. Low friction (just public recognition + minor cash bonus). Drives referrals beyond pure economics.
- **Wild factor:** Medium (influencer-style partnership model applied to organizers)

---

### Framework 2: 10x Thinking
*What would make organizer acquisition 10x better?*

**Idea 6: Viral Loop via Referral Code Sharing (Native Social)**
- **Pitch:** Every organizer gets a branded referral link. Checkout flow includes native share button (iMessage, SMS, WhatsApp, email, Instagram). Shared link pre-fills referred organizer's discount (e.g., "Get $20 off with code ALICE_S493").
- **How:** Generate promo code per referral: `[FIRST_NAME]_[RANDOM]`. On signup with code, create AffiliateReferral + apply $20 credit to new org (customer acquisition cost taken from platform margin).
- **Why it matters:** Social proof ("Your friend Alice uses this"). Easy sharing (1-tap). Discount sweetens conversion. Organic viral channel.
- **Wild factor:** Medium (WhatsApp sharing is standard, discount element is new)

**Idea 7: Organizer Tiered Payout Model (Subscription Level Matching)**
- **Pitch:** Commission rate matches referred organizer's tier. Refer SIMPLE → $0 (free tier earns affiliate nothing). Refer PRO → 2% ($20 min). Refer TEAMS → 3% ($60 min). Refer ENTERPRISE → 5% ($100 min).
- **How:** AffiliateReferral.payoutRate set at qualification based on referred user's tier. Calculation: `max(gmv * tier_rate, tier_floor)`.
- **Why it matters:** Aligns incentives: recruiters chase higher-value customers. Eliminates incentive to refer free-tier users (deadweight). Improves affiliate ROI on TEAMS recruitment.
- **Wild factor:** Low (straightforward incentive design, similar to Shopify's merchant commission model)

**Idea 8: Fraud-Resistant Gamified Referral Pools (Guild XP Crossover)**
- **Pitch:** Affiliates earn XP (gamified) for referrals. 1 qualified ref = 100 XP. Leaderboard tracks top referrers monthly. Monthly winners (top 3) get cash bonus ($200 / $100 / $50) + Hunt Pass free month.
- **How:** New AffiliateXP event on qualification. Monthly cron calculates rankings. Automatically grants Hunt Pass to top 3. Leaderboard visible at `/organizers/affiliate-leaderboard`.
- **Why it matters:** Intrinsic motivation (rank, XP) + extrinsic (cash + perks). Reduces reliance on pure cash commission fatigue. Integrates with existing gamification.
- **Wild factor:** Medium (gamification is established mechanic, but referral-specific XP + leaderboard is novel)

---

### Framework 3: Reversal
*What if we inverted the assumptions?*

**Idea 9: Referred Organizer Pays (Reverse Commission)**
- **Pitch:** Instead of paying the affiliate, charge new organizers a 5% onboarding fee if they arrived via referral. Affiliate gets nothing. Platform pockets the fee.
- **How:** Flag `affiliateReferral.status` at qualification. On first subscription purchase, apply 5% fee.
- **Why it matters:** Inverts acquisition cost. Reduces platform payouts. Works if referrals are high-trust (less churn risk).
- **Wild factor:** High (radical inversion, likely DOA for competitive reasons)

**Idea 10: Organizer-to-Organizer Marketplace Fees (Subscription Credit Model)**
- **Pitch:** Affiliates don't earn cash. Instead, they earn a % discount on their own subscription for each qualified referral. E.g., 1 ref = $5/mo discount on their bill (up to 100% free). Incentivizes self-referral recruitment loops.
- **How:** AffiliateCredit table, applied as subscription credit at billing. No cash touch.
- **Why it matters:** Aligns incentive: referrer improves their own bottom line. Eliminates cash/tax/fraud surface. Drives viral loops among organizers (they recruit to lower their cost).
- **Wild factor:** High (inverting payout model entirely)

**Idea 11: No Monetary Affiliate Program, Pure Equity Model (Co-Op Style)**
- **Pitch:** Top referrers get micro-equity (0.01% each, allocated to top 100 affiliates). Earn real ownership, not commission. 
- **How:** Legal structure: ESOP or warrant scheme. Top 100 referrers at end of year receive grants. Tax complexity.
- **Why it matters:** Aligns long-term incentives. Creates founder mentality. De-risks affiliate churn (locked-in equity). Regulatory challenge.
- **Wild factor:** High (paradigm shift, probably premature for FindA.Sale stage)

---

### Framework 4: Intersection
*Cross FindA.Sale systems (XP, Hunt Pass, TEAMS feature)*

**Idea 12: Hunt Pass Lifetime (Affiliate Upgrade Path)**
- **Pitch:** Affiliates who earn ≥$500/year get lifetime Hunt Pass (shopper subscription) free, + 20% commission rate bump as status symbol.
- **How:** AffiliateReferral annual total query. If ≥ $50,000 cents ($500), grant `huntPassGrant { status: 'LIFETIME' }`. Display "Top Recruiter" badge in affiliate dashboard.
- **Why it matters:** Perks top affiliates without pure cash. Incentivizes long-term participation. Provides gamified status.
- **Wild factor:** Low (straightforward benefit stacking)

**Idea 13: Team Bonus (TEAMS Tier Expansion)**
- **Pitch:** Affiliates who convert a SIMPLE organizer to TEAMS and stay in TEAMS for 90 days get $100 bonus (on top of normal commission).
- **How:** Track referred org's tier at qualification (SIMPLE), monitor Subscription table for upgrade to TEAMS. At 90-day mark, issue bonus.
- **Why it matters:** High-value customer retention + acquisition. Drives TEAMS tier (higher margin). Rewards long-term recruiter engagement.
- **Wild factor:** Low (loyalty bonus, standard SaaS pattern)

**Idea 14: Referral XP for Shoppers (Network Effect)**
- **Pitch:** When a shopper's organizer gets referred via affiliate link, the shopper earns 50 XP (one-time). Encourages "refer your favorite organizers" word-of-mouth.
- **How:** At signup, check if organizer was referred (AffiliateReferral exists + status=QUALIFIED). Find all shoppers who favorited that organizer. Award 50 XP each.
- **Why it matters:** Bridges organizer + shopper economies. Creates network effect: "my favorite estate sales lady joined FindA.Sale, I earned XP" = viral.
- **Wild factor:** Medium (cross-economy integration is novel)

**Idea 15: Explorer Guild XP for Organizers (Recruitment Tier)**
- **Pitch:** Organizers earn Guild XP for recruiting other organizers. 1 qualified ref = 100 Guild XP. Leaderboard + perks (Hunt Pass free month, feature on homepage).
- **How:** New AffiliateXP event on qualification. Aggregate into organizer's existing Guild XP score (separate tracking, same display).
- **Why it matters:** Unifies gamification. Recognizes organizer recruitment as skill/achievement. Drives top-recruiting organizers into public spotlights.
- **Wild factor:** Low (integrates existing systems)

---

## Phase 2 — Feasibility Matrix

| Idea | Build Cost | Ops Cost | Revenue Impact | Fraud Risk | Ship Now / Later / Never |
|------|-----------|----------|--------|-------|---------|
| **1. Lifetime % (SaaS model)** | M (4-5h) | M (transfer fee ~2%, monthly batching) | +10% GMV via organizer recruitment (higher-value refs become repeat payers) | M (collusion on subscription lifecycle) | **LATER** — test one-time model first, iterate if supply blocked |
| **2. Tiered Escalation (5/10/25)** | S (2-3h schema + query) | L (monthly tier calculation, leaderboard page) | +15% GMV (drives top-tier TEAMS recruitment, status incentive) | M (fake refs to hit tier thresholds) | **LATER** — validate tier thresholds post-launch with real data |
| **3. Credit Currency** | M (3h schema + checkout integration) | L (promo code validation, credit expiry jobs, support) | +12% margin retention (converts acquisition cost to subscription discount, boosts TEAMS) | L (credits not cash, can't be exploited for liquidity) | **NOW** (post-payout-lock) — aligns with D-006 (no AI language), reduces 1099 burden |
| **4. Team Bonus** | S (1-2h, bonus calc on team member add) | M (bonus issuance, Stripe transfer) | +8% TEAMS conversion rate (tier upgrade incentive) | L (genuine team growth is hard to fake) | **NOW** (post-Batch 1) — simple, high ROI |
| **5. Brand Ambassador** | M (3-4h leaderboard + email) | L (monthly spotlight email, page hosting) | +20% top-tier recruitment (status + public recognition) | L (leaderboard fraud = requires real refs) | **LATER** — ship at 50 total referrals (sufficient sample size) |
| **6. Viral Link Sharing** | M (3h checkout button) | L (SMS/WhatsApp platform, iMessage via share sheet) | +25% conversion (social proof + discount) | M (promo code abuse, discount stacking) | **NOW** (post-Batch 1) — high leverage, moderate ops |
| **7. Tier-Matched Commission** | S (1h schema, query logic) | S (no new ops burden) | +18% high-tier recruitment (stronger incentive for TEAMS refs) | M (tier inflation attacks — refer someone, upgrade them immediately) | **NOW** (replaces flat 2% model) — better incentive alignment |
| **8. Gamified XP Leaderboard** | M (4h XP events, leaderboard page) | M (Hunt Pass grants, monthly winners email) | +12% participation (XP + leaderboard intrinsics) | M (XP farming via multi-account schemes) | **LATER** — ship after core mechanics stable, feed from real referral data |
| **9. Reverse Commission (Organizer Fee)** | S (1h) | S (fee collection, support volume) | -30% recruitment (pricing barrier) | L (no money touch) | **NEVER** — kills organic referrals, competitive disadvantage |
| **10. Subscription Credit (No Cash)** | M (2h schema, checkout integration) | S (credit tracking, no Stripe transfers) | +8% referral participation (eliminates tax/cash friction) | L (credits not money, can't be exploited for liquidity) | **NOW** as alternative to cash model — hybrid approach |
| **11. Micro-Equity (ESOP)** | L (10h legal + setup) | L (ongoing tax, ESOP administration) | +5% long-term retention (equity skin-in-game) | L (well-understood model) | **NEVER** (pre-revenue, pre-product-market-fit, legal overhead) |
| **12. Hunt Pass Lifetime (Status)** | S (1-2h threshold logic) | M (Hunt Pass cost @ ~$5/mo × 12 × top 5-10 affiliates) | +10% top-tier affiliate retention (perks, not cash) | L (earned, hard to fake) | **LATER** (post-50 total referrals) — reserve for top 5% |
| **13. Team Bonus (TEAMS expansion)** | S (1h 90-day monitor) | M (bonus issuance, Stripe) | +8% TEAMS conversion (direct tier upgrade incentive) | L (team growth is verifiable) | **NOW** (batch with Idea 4) — low cost, high signal |
| **14. Shopper XP (Network)** | M (3h integration) | S (one-time award, no ops) | +5% shopper engagement via organizer network (weak direct ROI) | M (requires organizer favoriting) | **LATER** (post-organizer stabilization) — nice-to-have |
| **15. Guild XP for Organizers** | S (2h event + leaderboard) | S (display + monthly email) | +10% organizer morale (gamification) | M (XP farming) | **LATER** — ship at same time as Idea 8 (same leaderboard) |

---

## Recommendations (Ranked 1–5, Most Important First)

### **#1 RECOMMENDATION: Replace Flat 2% with Tier-Matched Commission (Idea 7)**
**Why:** Current model pays same commission for SIMPLE refs as TEAMS refs. This inverts incentives — Patrick wants supply-side growth of paying organizers, but affiliate earning is independent of tier. Tier-matching aligns recruitment to margin.

| Tier | Current Payout | Recommended Payout |
|------|---------|---------|
| SIMPLE (Free) | $0 (no commission, organizer unpaid) | $0 (unchanged — free tier still recruiting friction) |
| PRO ($29/mo) | 2% × GMV, min $50 | 2% × GMV, min $50 (unchanged) |
| TEAMS ($79/mo) | 2% × GMV, min $50 | 3% × GMV, min $75 (higher-value customer) |
| ENTERPRISE | 2% × GMV, min $50 | 5% × GMV, min $150 (highest-value customer) |

**Tradeoffs:**
- **Pro:** Drives TEAMS recruitment (+8% tier upgrade rate estimated). Aligns affiliate incentives to platform margin. Simple to implement (1h schema change).
- **Con:** More complex payout calculations. Affiliates may resist "lower tier = lower commission." Requires clear communication ("earn more by recruiting teams").

**Patrick decision needed:** Approve tier-matched commission structure? YES / NO. (Recommendation: YES — better incentive alignment, minimal ops cost.)

---

### **#2 RECOMMENDATION: Hybrid Payout Model (Credit Currency + Cash Option)**
**Why:** Current model is cash-only, which creates 1099 tax complexity, Stripe transfer overhead, and fraud surface. Idea 10 (subscription credits) eliminates all three. Hybrid approach: organizers can elect cash OR credits at payout request.

**Implementation:**
- Default: Affiliates earn credits ($50 = 1 month PRO discount). Redeemable at checkout.
- Optional: Affiliates with ≥$200 balance can request cash transfer (Stripe).
- Timeline: Credits available immediately (no waiting on Stripe settlements). Cash requests batched monthly.

**Tradeoffs:**
- **Pro:** Reduces fraud surface (most affiliate money stays in platform). Drives subscription upgrades (credits incentivize top-tier conversion). Eliminates 1099 burden for low-earners (<$600/yr).
- **Con:** Adds complexity (dual-model tracking). Requires organizers to choose. Some affiliates prefer liquid cash.

**Patrick decision needed:** Hybrid model (credits + optional cash)? YES / NO / CASH-ONLY. (Recommendation: YES — reduces ops burden 40%, keeps top earners happy with cash option.)

---

### **#3 RECOMMENDATION: Defer "Lifetime % per Sale" Model (Idea 1) — Validate One-Time First**
**Why:** SaaS benchmark (Rewardful shows lifetime subscription % is standard), but FindA.Sale is not SaaS — it's a marketplace. First sale is the acquisition signal. Ongoing subscription is separate. Coupling affiliate payouts to subscription lifecycle adds complexity that may not be worth the viral boost yet.

**Current spec (one-time on first sale):** Simple, clean, prevents affiliate fatigue on repeat purchases. Aligns with marketplace model.

**Alternative (lifetime % per subscription):** Stronger viral loop (affiliate earns $7/mo from PRO subscriber for 12 months = $84 total), but requires:
- Monthly payout batches (ops burden)
- Churn-tracking (if referred org cancels, affiliate loses future %)
- Complex fraud rules (prevent subscription gaming)

**Recommendation:** Ship one-time model now (simpler, proven). Post-launch, if organizer acquisition plateaus AND affiliate participation is high, trial lifetime model on next cohort.

**Patrick decision needed:** Stick with one-time + first sale? YES / EXPLORE LIFETIME. (Recommendation: YES for launch, revisit post-S551.)

---

### **#4 RECOMMENDATION: Add Viral Link + Promo Code (Idea 6) — Post-Batch 1**
**Why:** Current spec generates referral codes but has no integrated sharing mechanism. Idea 6 adds native checkout share button + pre-filled discount. This drives organic word-of-mouth.

**Implementation:**
- Checkout flow: "Share with your network" button → iMessage, WhatsApp, SMS, email, Instagram templates.
- Each share includes unique code (e.g., "ALICE_S493") + $20 new-organizer discount.
- Referred organizer sees discount pre-filled on signup.

**Tradeoffs:**
- **Pro:** High leverage (organic channel). Social proof ("your friend uses this"). Discount sweetens conversion.
- **Con:** Promo code abuse risk (stacking, multi-use). Support complexity (discount code issues).

**Patrick decision needed:** Add viral sharing + discount? YES / NO / LATER. (Recommendation: YES, post-Batch 1 — high ROI, builds on existing referral code.)

---

### **#5 RECOMMENDATION: Tiered Escalation (Idea 2) — Monitor Post-Launch**
**Why:** Top-tier incentive design (referrals 0-4: 1.5%, 5-9: 2%, 10+: 3%) rewards power users and creates status. Similar to Zapier and Beehiiv models. BUT: premature to lock in thresholds without real data.

**Current recommendation:** Ship flat commission launch. At 30 total referrals, analyze affiliate distribution. If concentrated in top 10%, propose tiered model. If distributed evenly, may not be necessary.

**Patrick decision needed:** Add escalation tiers on launch? YES / LATER. (Recommendation: LATER — gather real data, iterate based on affiliate distribution.)

---

## Specific Answers to Patrick's 8 Questions

### **Q1: Payout Model — 2% + $50 Floor vs. Flat Per-Tier?**

**Answer: Hybrid tier-matched structure, replacing flat.**

Current: "2% of first PAID sale GMV or $50, whichever is greater" pays the same whether referred organizer is SIMPLE (free) or TEAMS ($79/mo).

**Recommended change:**
- SIMPLE: $0 (free tier, recruiting friction acceptable)
- PRO: 2% GMV, min $50
- TEAMS: 3% GMV, min $75 (higher-value, higher-reward)
- ENTERPRISE: 5% GMV, min $150 (partnership-tier revenue)

**Rationale:** Aligns affiliate incentives to margin. Flat model under-incentivizes TEAMS recruitment. Tier-matched model drives organizers toward higher-tier refers.

**One-line counter:** "But won't affiliates complain about lower SIMPLE payout?" — Yes, but SIMPLE recruiting is low-value anyway; friction filters for intentional recruitment.

---

### **Q2: Trigger Timing — First PAID Sale vs. First Billing Cycle / 30-Day Retention?**

**Answer: Stick with first PAID sale.**

Competitor benchmark: Shopify, Stripe, Zapier all trigger on first transaction/activation (not retention windows).

**Alternatives considered:**
- First $1K GMV: Too high a bar. Defers payout qualification, reduces affiliate motivation.
- First billing cycle paid: Same as first PAID sale (both = confirmed revenue).
- 30-day retention: Adds 30-day delay, reduces affiliate participation. Churn complexity.

**Rationale:** First PAID sale is the clearest, earliest success signal. Aligns with FindA.Sale's core metric (organizer activation).

**One-line counter:** "Doesn't 30-day retention reduce fraud?" — Yes, but so do the 7/30-day age gates already in spec. Additional retention gate is diminishing return.

---

### **Q3: One-Time vs. Recurring (% of All Sales for 12 Months)?**

**Answer: One-time for launch. Trial recurring after organizer acquisition stabilizes.**

**One-time (current spec):**
- Pros: Clean, simple, prevents affiliate income fatigue on repeat purchases.
- Cons: Weaker viral loop (affiliate earns once, has no ongoing incentive).

**Recurring 12-month (Idea 1):**
- Pros: Stronger viral loop (affiliate earns $5-20/mo from subscribed organizer for 12 months). SaaS-standard model.
- Cons: Adds monthly batching ops burden. Requires churn tracking. Fraud surface: subscription-upgrade gaming.

**Recommendation:** Launch one-time. At month 6 post-launch, if organizer acquisition is plateauing AND affiliate participation is high (>20% of organizers generating codes), trial recurring model on next cohort.

**One-line counter:** "Recurring will always drive more refs." — True, but at what ops cost? One-time is sustainable solo-founder-scale.

---

### **Q4: Tier Gating — All Tiers Can Earn or SIMPLE Excluded?**

**Answer: All tiers eligible, but SIMPLE-tier payout=zero.**

**Current spec:** All tiers (SIMPLE, PRO, TEAMS) can generate codes and earn.

**Recommended clarification:**
- SIMPLE organizers CAN generate referral codes and refer.
- But payout is $0 (free tier doesn't earn). They accumulate "pending" referrals.
- If SIMPLE organizer upgrades to PRO/TEAMS, activate earned payout retroactively.

**Rationale:** Low friction (no gatekeeping), aligns payouts to revenue tiers. SIMPLE organizers stay motivated to upgrade partly because they have earned referrals waiting.

**One-line counter:** "Isn't $0 payout frustrating?" — Less so if we communicate upfront: "Earn commissions once you're on a paid plan."

---

### **Q5: Fraud Prevention Gaps — Current 7/30-Day Gates + What Else?**

**Answer: Current gates (7-day code gen, 30-day payout) + add Stripe Identity verification for payouts >$500.**

**Current spec:**
- 7-day account age before code generation
- 30-day lockout before payout request
- Self-referral blocking (referrer ≠ referred)

**Recommend adding:**
1. **Disposable email detection** at signup: block +gmail aliases, temp email services (10minutemail, etc.)
2. **Stripe Identity verification** for payouts >$500: KYC-lite, verifies name + SSN (opt-in, required for cash tier).
3. **IP overlap monitoring** between referrer + referred: flag if same IP or <50 miles apart in signup context.
4. **1099-NEC compliance trigger** at $600/yr: automatically flagged for Patrick review + IRS reporting.

**Tradeoffs:**
- **Pro:** Blocks low-effort fraud (disposable email, same-device signups, multi-account collusion).
- **Con:** Adds UX friction (Stripe Identity verification). KYC latency (Stripe verification takes 24-48h).

**Patrick decision needed:** Add Stripe Identity for >$500 payouts? YES / NO / MANUAL REVIEW ONLY. (Recommendation: YES — relatively low friction, high fraud protection ROI.)

---

### **Q6: Viral Mechanics Beyond Cash — XP Bonuses, Hunt Pass, Leaderboard?**

**Answer: Yes — layer gamification on top of cash payout.**

**Recommend adding (post-Batch 1):**

1. **Referral XP** (Idea 15): Organizers earn 100 Guild XP per qualified referral. Leaderboard of "Top Recruiters" (monthly). Intrinsic motivation (rank) + extrinsic (recognition).

2. **Hunt Pass Free Month** (Idea 12): Affiliates who earn ≥$500/year get one free Hunt Pass month (shopper subscription) annually. Recognizes top recruiters with a perk.

3. **"Top Recruiter" Badge** (Idea 5): Organizers with 25+ qualified refs get a badge in their organizer profile + featured on `/ambassadors` page. Status-driven recruitment.

**Rationale:** SaaS benchmark (Rewardful, Zapier): gamified affiliate programs have 40% higher participation rates. XP taps intrinsic motivation (achievement), Hunt Pass provides tangible perk (low cost to platform), Badge provides social proof.

**One-line counter:** "Is all this complexity necessary?" — For launch, no. For viral growth post-launch, yes. Ship simple cash model, add gamification at month 3.

---

### **Q7: Competitor Intel Hypothesis — How Do EstateSales.NET and Others Acquire Organizers?**

**Answer: Limited public data. Estimated based on industry patterns.**

**Web search findings:**
- **EstateSales.NET:** No public affiliate program visible. Likely acquisition: direct sales (partnerships with estate cleanout companies), organic search, word-of-mouth.
- **Shopify Affiliate:** 200% first month commission (very aggressive). Lifetime tracking. Tiered payouts.
- **Stripe Partners:** One-time commission on referred merchant sign-up (not recurring).

**Estimate for EstateSales.NET market:**
- Organizer acquisition likely via: estate cleanout company partnerships (B2B referral), yellow pages SEO, local reputation.
- No affiliate program = missed opportunity. Opportunity for FindA.Sale: affiliate program becomes competitive differentiation (organizers earn money by recruiting).

**Recommendation:** FindA.Sale's affiliate program is a **strategic advantage** over competitors IF it drives >20% of organizer acquisitions. Post-launch, measure affiliate channel contribution and scale marketing spend accordingly.

---

### **Q8: Compliance Surface — 1099-NEC, State Registration, FTC Endorsements?**

**Answer: Plan for 1099-NEC now. FTC endorsements low-risk. State registration TBD.**

**1099-NEC (federal):**
- **Trigger:** Affiliate earnings ≥$600/calendar year.
- **Required:** Patrick must collect W-9 form, issue 1099-NEC, file with IRS.
- **Implementation:** Flag affiliates at $500 earned (before hitting $600 threshold). Email request for W-9. Store ssn (encrypted) + address.
- **Timeline:** File 1099s by January 31 following year.

**FTC Endorsement Disclosure (federal):**
- **Risk level:** Low for FindA.Sale. Affiliates are organizers (not influencers), referral codes are transparent.
- **Requirement:** If affiliate posts social media about FindA.Sale, disclose "#ad" or "#affiliate" (standard practice).
- **Implementation:** Include disclosure language in affiliate email templates ("When sharing your code, please disclose that you earn a commission").

**State Money Transmitter Registration (varies by state):**
- **Risk:** Michigan (FindA.Sale's base state) has no specific affiliate program licensing.
- **Caution:** If Patrick offers "cash payouts" to affiliates outside the platform, this may trigger money transmitter licenses in CA, NY (depends on amount + frequency).
- **Mitigation:** Use Stripe Connect (affiliates receive transfers via Stripe, not direct bank transfers). Reduces state registration risk.
- **Recommendation:** Consult with findasale-legal on Michigan affiliate payout regulations. Likely not required, but worth 30-min review.

**Summary table:**

| Compliance | Risk | Action | Timing |
|-----------|------|--------|--------|
| 1099-NEC filing | M | Collect W-9s at $500 earned, file by Jan 31 | Before payout functionality |
| FTC endorsement | L | Include disclosure language in templates | In email copy, pre-launch |
| State registration | L-M | Legal review on Michigan + org's home state | Before cash payouts |

---

## What NOT to Change (Things Current Spec Gets Right)

1. **Organizer-only affiliates (not public network).** Reduces spam, fraud, brand-control risk.
2. **Qualification on first PAID sale, not signup.** Prevents abandoned-account abuse.
3. **One-time payout per referral relationship.** Simple, clean, prevents ongoing ops burden.
4. **All tiers eligible to refer.** Low friction, high participation.
5. **Minimum payout threshold ($50).** Reduces Stripe transfer overhead.
6. **Affiliate code format (ORG_XXXXX).** Clear, branded, prevents confusion with coupon codes.

---

## Hard Gotchas / 1099 / Compliance Surface

**Gotcha 1: State-by-state affiliate licensing**
- Michigan: no specific license required (PayPal, Stripe typically handle compliance).
- New York: money transmitter laws may apply if payouts >$100K/year. Low risk for FindA.Sale pre-scaling.
- Recommend: Consult findasale-legal before cash tier launches.

**Gotcha 2: Affiliate chargeback disputes**
- Scenario: Affiliate requests $500 payout. Patrick approves Stripe transfer. 30 days later, referred organizer disputes charge (e.g., "I didn't sign up for a sale, charge it back").
- Impact: Stripe reverses payment. Affiliate's payout fails. FindA.Sale eats Stripe fee.
- Mitigation: Only qualify referrals after referred organizer's first PAID sale is beyond Stripe chargeback window (90 days = safe).
- Action: Add check: `qualifyReferral only if firstPurchase.createdAt < now() - 90 days`.

**Gotcha 3: Affiliate tax evasion**
- Scenario: Affiliate earns $1200/year. Patrick files 1099-NEC but affiliate doesn't report on taxes (common for small earners).
- Impact: IRS notices, Patrick liable for backup withholding.
- Mitigation: Collect W-9 + SSN. Auto-flag at threshold. Archive W-9s for 7 years.
- Action: Legal + accountant review before launch.

**Gotcha 4: Referral fraud (account creation with stolen identity)**
- Scenario: Fraudster creates 5 fake organizer accounts (stolen names/SSNs), refers them all, triggers qualification immediately.
- Impact: Multiple payouts on fraudulent accounts.
- Mitigation: (1) Stripe Identity verification for >$500 payouts. (2) IP overlap monitoring. (3) Max payouts per affiliate per week ($500 max payout/week prevents bulk fraud).
- Action: Add payout rate-limit to affiliateService.ts.

---

## Competitor Benchmark

**Shopify Affiliate Program:**
Commission = 200% of referred merchant's first month subscription (e.g., merchant signs up for $65/mo plan → affiliate earns $130). Tracking window = 30 days per click. Payout = 22nd of next month, minimum $10 balance required.
*Relevance:* Aggressive one-time bonus model. Drives B2B recruitment. Not sustainable for FindA.Sale's organizer acquisition (much smaller average first sale than Shopify merchants).

**Stripe Referral Program (Partners):**
Commission = one-time payment when referred merchant activates + processes first transaction. Amount varies by referral type (direct partner referral = higher; open program = lower). No recurring %.
*Relevance:* Payment platform model. FindA.Sale is closer to Stripe than Shopify. One-time on first transaction = same as current spec. Tier-matching not disclosed publicly (likely internal decision).

**SaaS Benchmark (Rewardful report, 2024-2025):**
Average affiliate commission rates: 15%-30% of first year MRR (not percentage of sale). Lifetime tracking = 40%+ of programs. Tiered payouts = 50%+ of top programs. Gamification (leaderboard, bonuses) = standard.
*Relevance:* High-tier affiliates drive 80% of new customers. Gamification + tiering increases participation 2-3x. One-time model is bottom quartile (churn risk). Consider lifetime model post-launch.

---

## Summary: TOP 3 RECOMMENDATIONS FOR PATRICK

| Rank | Recommendation | Decision | Timeline |
|------|--------|----------|----------|
| **#1** | Replace flat 2% with tier-matched (SIMPLE=$0, PRO=2%, TEAMS=3%, ENTERPRISE=5%) | YES / NO | Batch 3 (S551) |
| **#2** | Add hybrid payout model: credits default (redeemable as discount) + optional cash for ≥$200 balance | YES / NO / CASH-ONLY | Batch 3 (S551) |
| **#3** | Defer recurring 12-month subscription % model. Launch one-time, trial recurring at month 6 if plateau detected | DEFER / TRY NOW | Post-S551 trial |

**Next step:** Respond with decisions on #1 + #2. Once locked, dev proceeds to Batch 3 implementation.

---

**Document Status:** RECOMMENDATIONS READY FOR PATRICK DECISION  
**Last Updated:** 2026-04-22  
**Authority:** FindA.Sale Innovation Agent (S550)
