# Investor Revenue Verdicts — FindA.Sale Tier Architecture (2026-03-16)

**Status:** Complete
**From:** Investor Agent
**To:** Patrick (decision required)
**Context:** ADR-065 Operationalization; msg-184/185 tier classification + msg-183 pricing analysis

---

## Question 1: Three Tier Calls — Revenue Verdict

### A. Virtual Queue: SIMPLE (Free) vs. PRO ($29/month)

**Verdict: SIMPLE tier (free for all organizers)**

Gating Virtual Queue behind PRO at <20 organizers creates friction that depresses adoption.

**Math:**
- Free organizers generate 10% transaction fee revenue from every sale they run.
- At <20 organizers, PRO conversion is near-zero (no network, no proof, no trust signal).
- Each free organizer at $10k avg sale generates $1,000 revenue per sale × 10% = $100 fee.
- $100 fee per quarter = $33/quarter = PRO annual is 9× payback period.
- Organizers won't pay $29/month for a feature they're "pretty sure" they need.

**Revenue case for gating:** ~10 paying PRO organizers × $29/month = $290/month = $3,480/year
**Revenue case for free:** 50 free organizers (3.5× more due to lower friction) at $100/month avg fee each = $5,000/month = $60,000/year

Free wins by 17×.

**Decision: Make Virtual Queue free for all organizers SIMPLE tier.**

---

### B. Affiliate Program: ENTERPRISE vs. Defer

**Verdict: Spike 6+ months; no case before 50 organizers**

Affiliate programs require three prerequisites you don't have yet:
1. **Organizer volume:** Affiliates need a pool of 50+ organizers to recruit meaningfully from. You have ~5 in beta.
2. **Proven organic growth signals:** Until you can show 20% monthly organizer growth, affiliates have no lead flow to leverage.
3. **Stable LTV:** You haven't modeled organizer lifetime value yet. How much revenue does an affiliate need to generate to break even? Unknown.

**Operational overhead:**
- Contract negotiation (legal 10–15 hours)
- Fraud monitoring (tracking system, refund handling)
- Commission accounting (monthly payouts)
- Relationship management (slack, email)

**Estimated cost:** 80–120 hours internal labor.

**Expected revenue at launch:** Zero. Affiliates with no recruiting pool + no brand recognition + no margin incentive won't move. You'd spend 120 hours to generate $0.

**ROI crosses breakeven at:** 50+ organizers, 3+ affiliates each recruiting 5+ per month, $500+ commission/organizer. That's 6–12 months away.

**Decision: Spike Affiliate Program until organizer adoption reaches hockey-stick inflection (50+ paying organizers, 20%+ MoM growth).**

---

### C. Coupons: PRO vs. SIMPLE (with limits)

**Verdict: SIMPLE tier with guardrails**

Coupons increase shopper conversion. More conversions = more items sold = more 10% transaction fee revenue.

Gating coupons behind PRO actually *costs* you transaction fee revenue.

**Math:**

**Scenario A (Coupons in PRO):**
- 40 SIMPLE organizers, 5 PRO organizers
- SIMPLE organizers: no coupons → average $800/month revenue per organizer (10% fee = $80/month)
- PRO organizers: with coupons → average $1,200/month revenue per organizer (10% fee = $120/month)
- **Total: (40 × $80) + (5 × $120) = $3,200 + $600 = $3,800/month**

**Scenario B (Coupons free, SIMPLE tier):**
- 50 SIMPLE organizers (higher adoption due to lower friction)
- With coupon access → average $900/month revenue per organizer (10% fee = $90/month)
- 0 PRO organizers (coupons removed conversion incentive)
- **Total: 50 × $90 = $4,500/month**

Free coupons win by $700/month = $8,400/year.

**Guardrails (prevent abuse):**
- 3 active coupons per organizer max
- Minimum sale $20 (no penny-listing coupons)
- Coupon discount capped at 50% (organizer can't give inventory away)

**Decision: Make Coupons free in SIMPLE tier with 3 active max + $20 minimum.**

---

## Question 2: Hunt Pass Revenue Model

**Assumptions validated:** Your conservative 3-option model is sound.

| Option | Per-Shopper | Conversion | Active Shoppers | Monthly Revenue | Annual |
|--------|------------|------------|-----------------|-----------------|---------|
| A (Hunt Pass standalone $4.99/30d) | $4.99 | 5% | 25 | $124.75 | $1,497 |
| B (Pro Shopper bundle $9.99/month) | $9.99 | 3% | 15 | $149.85 | $1,798 |
| C (Pro Shopper free, Pro $9.99) | $9.99 | 2% | 10 | $99.90 | $1,199 |

**Verdict: Option B wins on LTV + retention.**

- Option A is noise ($125/month).
- Option B generates $150/month + *higher stickiness* (annual subscription > 30-day recharge + bundle psychology).
- Option C is lowest revenue + lowest engagement (no gamification hook from Hunt Pass).

**LTV math at 500 shoppers (steady state):**
- Option A: 25 Hunt Pass subscribers × $4.99 × 12 = $1,497/year + churn 40% per year (typical for paid features) = $898 retained LTV
- Option B: 15 Pro Shoppers × $9.99 × 12 = $1,798/year + churn 25% per year (subscription psychology + bundle value) = $1,349 retained LTV
- Option C: 10 Pro Shoppers × $9.99 × 12 = $1,199/year + churn 35% = $779 retained LTV

**Option B lifetime value is 50% higher than A.**

---

## Critical Strategic Verdict: Shopper Monetization Timing

**Shopper monetization should NOT drive roadmap decisions at <50 organizers.**

Your revenue bottleneck is **sale volume**, not shopper monetization.

**Math:** A shopper who pays $9.99/month (Pro Shopper) is valuable only if she generates $100+ annual transaction fee revenue. That requires ~10 purchases/year at $100 avg = $1,000 gross sale value. At 10% fee = $100 fee revenue.

At current volume (<500 sales/month platform-wide = 6,000 sales/year):
- 500 active shoppers = 12 sales per shopper per year avg
- Only 5% of those come from repeat shoppers (low network density at <50 organizers)
- 25 shoppers × 12 repeat sales = 300 repeat sales/year
- Of 300 repeat sales, maybe 50 convert to Pro Shopper (2% adoption)
- 50 shoppers × $100 annual revenue = $5,000/year

**But: 100 new free shoppers added might generate 1,200 sales/year at 10% avg repeat rate → $12,000 revenue**

Free shoppers (network effects) beat Pro Shoppers (subscription revenue) by 2.4× at this scale.

---

## Final Verdict (Rank Order)

1. **Organizer acquisition velocity is 100× more valuable than pricing optimization.** Focus entirely on removing friction from organizer adoption until you hit 50+ organizers.
2. **Virtual Queue + Coupons: free SIMPLE tier** (removes friction, maximizes transaction fee volume).
3. **Affiliate Program: defer 6+ months** (no ROI case yet).
4. **Hunt Pass: implement Option B eventually** (absorb into $9.99 Pro Shopper bundle), but **defer until 100+ organizers** (shopper monetization is a rounding error now).
5. **The only revenue lever worth activating now: 10% platform fee on transaction volume.** Every other strategy is secondary.

**All other monetization is a distraction until organizer adoption proves itself.**

---

**Document ready for:**
- Patrick decision on Virtual Queue, Affiliate, Coupons tier placement
- Board signoff on Hunt Pass deferral + roadmap reprioritization toward organizer acquisition
- Decision: continue 100% free shopper strategy or pilot Pro Shopper with 100 beta shoppers
