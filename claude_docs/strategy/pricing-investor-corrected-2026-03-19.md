# FindA.Sale Pricing Model — Investor Analysis (CORRECTED)
**Date:** 2026-03-19 (Corrected Session)
**Analyst:** Investor Agent
**Request Source:** Patrick / Corrected Pricing Review (Teams fee corrected from 5% to 8%)
**Status:** Financial Validation Complete — CORRECTED

---

## EXECUTIVE SUMMARY

**CORRECTION APPLIED:** The previous analysis incorrectly modeled Teams at 5% fee. The correct model is **8% for both Pro and Teams** (the fee reduction is flat 2% for ANY paid tier). This correction significantly improves FindA.Sale's unit economics.

**Bottom Line:** The corrected tiered model (10%/8%/8% instead of 10%/8%/5%) maintains financial viability while **eliminating the "value trap" problem** for TEAMS organizers. FindA.Sale now retains more revenue from high-volume organizers, while organizers still save 2% in fees.

---

## DELIVERABLE 1: CORRECTED SCENARIO ANALYSIS

### Scenario 1: Small Organizer (1 sale/month, $3K GMV, 20% auction)

**Assumptions:**
- GMV per sale: $3,000
- Auction GMV (20% of total): $600
- Standard sale GMV (80% of total): $2,400
- Monthly activity: 1 sale/month

#### SIMPLE Tier (Free, 10% fee on all sales)
```
Standard sale fee (80%):     $2,400 × 10% = $240
Auction fee base (20%):       $600 × 10% = $60
Auction buyer premium (5%):   $600 × 5%  = $30
─────────────────────────────────────────────────
FindA.Sale monthly revenue:               $330
Organizer monthly take-home:              $2,670

Annual revenue to FindA.Sale:             $3,960
Organizer annual payout:                  $32,040
```

#### PRO Tier ($29/mo, 8% fee on all sales)
```
Monthly subscription:                     $29
Standard sale fee (80%):     $2,400 × 8% = $192
Auction fee base (20%):       $600 × 8%  = $48
Auction buyer premium (5%):   $600 × 5%  = $30
─────────────────────────────────────────────────
FindA.Sale monthly revenue:               $299
Organizer monthly take-home:              $2,671

Annual revenue to FindA.Sale:             $3,588 (subscription $348 + platform fees $3,240)
Organizer annual payout:                  $32,052

COMPARISON TO SIMPLE:
- Small organizer LOSES $12/year switching to PRO (fees down $240, but pays $348 subscription)
- FindA.Sale LOSES $372/year per organizer (from $3,960 → $3,588)
```

#### TEAMS Tier ($79/mo, 8% fee — CORRECTED)
```
Monthly subscription:                     $79
Standard sale fee (80%):     $2,400 × 8% = $192
Auction fee base (20%):       $600 × 8%  = $48
Auction buyer premium (5%):   $600 × 5%  = $30
─────────────────────────────────────────────────
FindA.Sale monthly revenue:               $349
Organizer monthly take-home:              $2,671

Annual revenue to FindA.Sale:             $4,188 (subscription $948 + platform fees $3,240)
Organizer annual payout:                  $32,052

COMPARISON TO SIMPLE:
- Small organizer LOSES $12/year on net (no fee savings difference vs PRO since fee is same)
- FindA.Sale GAINS $228/year per organizer (from $3,960 → $4,188) — SIGNIFICANT IMPROVEMENT
```

**Verdict:** At small scale, TEAMS is purely a feature/compliance play. Organizers pay $950/year extra for multi-user access, API, and webhooks. FindA.Sale gains revenue vs. SIMPLE due to the 8% fee (same as PRO) plus higher subscription. This is healthy — it correctly segments the market.

---

### Scenario 2: Medium Organizer (2 sales/month, $8K GMV, 30% auction)

**Assumptions:**
- GMV per sale: $4,000
- Monthly GMV: $8,000 (2 sales × $4K)
- Auction GMV (30% of total): $2,400
- Standard sale GMV (70% of total): $5,600

#### SIMPLE Tier (10% fee)
```
Standard sale fee (70%):     $5,600 × 10% = $560
Auction fee base (30%):      $2,400 × 10% = $240
Auction buyer premium (5%):  $2,400 × 5%  = $120
─────────────────────────────────────────────────
FindA.Sale monthly revenue:                $920
Organizer monthly take-home:               $7,080

Annual revenue to FindA.Sale:              $11,040
Organizer annual payout:                   $84,960
```

#### PRO Tier ($29/mo, 8% fee)
```
Monthly subscription:                      $29
Standard sale fee (70%):     $5,600 × 8% = $448
Auction fee base (30%):      $2,400 × 8% = $192
Auction buyer premium (5%):  $2,400 × 5% = $120
─────────────────────────────────────────────────
FindA.Sale monthly revenue:                $789
Organizer monthly take-home:               $7,211

Annual revenue to FindA.Sale:              $9,468 (subscription $348 + platform fees $9,120)
Organizer annual payout:                   $85,332

COMPARISON TO SIMPLE:
- Medium organizer GAINS $372/year on fees but PAYS $348 subscription = NET GAIN of $24/year
- FindA.Sale LOSES $1,572/year per organizer (from $11,040 → $9,468) — RED FLAG
```

#### TEAMS Tier ($79/mo, 8% fee — CORRECTED)
```
Monthly subscription:                      $79
Standard sale fee (70%):     $5,600 × 8% = $448
Auction fee base (30%):      $2,400 × 8% = $192
Auction buyer premium (5%):  $2,400 × 5% = $120
─────────────────────────────────────────────────
FindA.Sale monthly revenue:                $839
Organizer monthly take-home:               $7,161

Annual revenue to FindA.Sale:              $10,068 (subscription $948 + platform fees $9,120)
Organizer annual payout:                   $85,932

COMPARISON TO SIMPLE:
- Medium organizer GAINS $372/year on fees but PAYS $948 subscription = NET LOSS of $576/year
- FindA.Sale LOSES $972/year per organizer (from $11,040 → $10,068) — IMPROVEMENT vs old 5% model ($3,252 loss)
```

**Verdict:** The 8% correction eliminates the "value trap." TEAMS now loses only $972 vs $3,252 with the old 5% model. Medium organizers are still unprofitable on a fee basis (they shouldn't upgrade for fees alone — they should upgrade for features: multi-user, API, webhooks). This is correct market segmentation.

---

### Scenario 3: Large Organizer (4 sales/month, $20K GMV, 40% auction)

**Assumptions:**
- GMV per sale: $5,000
- Monthly GMV: $20,000 (4 sales × $5K)
- Auction GMV (40% of total): $8,000
- Standard sale GMV (60% of total): $12,000

#### SIMPLE Tier (10% fee)
```
Standard sale fee (60%):     $12,000 × 10% = $1,200
Auction fee base (40%):      $8,000 × 10% = $800
Auction buyer premium (5%):  $8,000 × 5%  = $400
─────────────────────────────────────────────────
FindA.Sale monthly revenue:                $2,400
Organizer monthly take-home:               $17,600

Annual revenue to FindA.Sale:              $28,800
Organizer annual payout:                   $211,200
```

#### PRO Tier ($29/mo, 8% fee)
```
Monthly subscription:                      $29
Standard sale fee (60%):     $12,000 × 8% = $960
Auction fee base (40%):      $8,000 × 8%  = $640
Auction buyer premium (5%):  $8,000 × 5%  = $400
─────────────────────────────────────────────────
FindA.Sale monthly revenue:                $2,029
Organizer monthly take-home:               $17,971

Annual revenue to FindA.Sale:              $24,348 (subscription $348 + platform fees $24,000)
Organizer annual payout:                   $215,652

COMPARISON TO SIMPLE:
- Large organizer GAINS $2,400/year on fees but PAYS $348 subscription = NET GAIN of $2,052/year
- FindA.Sale LOSES $4,452/year per organizer (from $28,800 → $24,348) — CRITICAL
```

#### TEAMS Tier ($79/mo, 8% fee — CORRECTED)
```
Monthly subscription:                      $79
Standard sale fee (60%):     $12,000 × 8% = $960
Auction fee base (40%):      $8,000 × 8%  = $640
Auction buyer premium (5%):  $8,000 × 5%  = $400
─────────────────────────────────────────────────
FindA.Sale monthly revenue:                $2,079
Organizer monthly take-home:               $17,921

Annual revenue to FindA.Sale:              $24,948 (subscription $948 + platform fees $24,000)
Organizer annual payout:                   $215,052

COMPARISON TO SIMPLE:
- Large organizer GAINS $2,400/year on fees but PAYS $948 subscription = NET GAIN of $1,452/year
- FindA.Sale LOSES $3,852/year per organizer (from $28,800 → $24,948) — IMPROVEMENT vs old 5% model ($11,052 loss)
```

**Verdict:** The 8% correction is transformative for large organizers. TEAMS now costs only $3,852/year vs $11,052 with the old 5% model. High-volume organizers remain feature-driven buyers (API access, multi-user management, webhooks), but FindA.Sale retains far more revenue. The incentive structure now favors TEAMS adoption for the RIGHT reasons (features, not just fees).

---

## KEY FINANCIAL QUESTIONS ANSWERED

### 1. At What GMV Does PRO Pay for Itself (Organizer Breakeven)?

```
Organizer savings = (Fee reduction × GMV)
$348 = (0.10 - 0.08) × Annual GMV
$348 = 0.02 × Annual GMV
Annual GMV breakeven = $348 ÷ 0.02 = $17,400

Monthly GMV breakeven = $17,400 ÷ 12 = $1,450/month
```

**Answer:** At $1,450/month GMV (~$5K per sale, 3 sales/month), the organizer breaks even on the PRO subscription. Below that, SIMPLE is cheaper. Above that, PRO saves money.

---

### 2. At What GMV Does TEAMS Pay for Itself (Organizer Breakeven)?

```
Organizer savings = (Fee reduction × GMV)
$948 = (0.10 - 0.08) × Annual GMV
$948 = 0.02 × Annual GMV
Annual GMV breakeven = $948 ÷ 0.02 = $47,400

Monthly GMV breakeven = $47,400 ÷ 12 = $3,950/month
```

**Answer:** At $3,950/month GMV (~$5K per sale, 8 sales/month), the organizer breaks even on TEAMS subscription. However, TEAMS is positioned as a **multi-user/API/enterprise product**, not a fee-optimization play. The breakeven analysis undersells its value proposition.

---

### 3. Revenue Impact: Moving from 10% Flat to Tiered (10%/8%/8%)

**Assumption:** 60% SIMPLE, 30% PRO, 10% TEAMS organizer distribution.

**Baseline (10% flat across all tiers):**
```
100 organizers, $2M annual GMV ($20K per organizer)

SIMPLE (60 orgs): $20,000 × 60 × 0.10 = $120,000
PRO (30 orgs):    $20,000 × 30 × 0.10 = $60,000 (no subscription revenue)
TEAMS (10 orgs):  $20,000 × 10 × 0.10 = $20,000
────────────────────────────────────────────────────
Total platform fees: $200,000
Subscription revenue: $0
TOTAL: $200,000/year
```

**New Model (10%/8%/8% with subscriptions):**
```
100 organizers, same $2M annual GMV

SIMPLE (60 orgs):  $20,000 × 60 × 0.10 = $120,000 (no subscription)
PRO (30 orgs):     $20,000 × 30 × 0.08 = $48,000 (platform fees)
                   $29 × 12 × 30       = $10,440 (subscription)
TEAMS (10 orgs):   $20,000 × 10 × 0.08 = $16,000 (platform fees) — CORRECTED from $10,000
                   $79 × 12 × 10       = $9,480 (subscription)
────────────────────────────────────────────────────
Total platform fees: $184,000 (was $178,000 with 5% Teams)
Total subscription:  $19,920
TOTAL: $203,920/year (was $197,920 with 5% Teams)
```

**Revenue Delta vs Flat 10%:**
```
$203,920 - $200,000 = +$3,920/year (+1.96% gain)
```

**CRITICAL FINDING:** The corrected 8%/8% model is now **revenue-positive**. FindA.Sale gains ~$3,920/year per 100 organizers compared to a flat 10% model, instead of losing $2,080. This is a swing of **+$6,000/year** per 100 organizers.

---

### 4. Revenue Contribution of 5% Auction Buyer Premium

**Assumption:**
- 100 organizers, $2M annual GMV
- 25% of all sales are auctions (typical for estate sales)
- $500K annual auction GMV across platform

**Auction Revenue Calculation:**
```
Auction GMV: $500,000/year
Buyer premium: 5%
Platform revenue from auctions: $500,000 × 0.05 = $25,000/year
```

**Per-Organizer Contribution (if evenly distributed):**
```
$25,000 ÷ 100 organizers = $250/year per organizer (average)
```

**As % of Total Revenue:**
```
Platform fees (tiered): $184,000
Auction buyer premium: $25,000
Subscription revenue:  $19,920
─────────────────────────────────
Total revenue: $228,920/year

Auction premium as % of total: $25,000 ÷ $228,920 = 10.9%
```

**Answer:** The 5% auction buyer premium contributes approximately **11% of total platform revenue**. This is material and defensible (buyers, not sellers, pay the premium). The premium is justified.

---

### 5. Blended Take Rate Across Platform (60% SIMPLE, 30% PRO, 10% TEAMS)

**Scenario:** 100 organizers, $2M annual GMV, 25% auctions.

```
SIMPLE organizers (60):
  - GMV: $1,200,000 (60% of total)
  - Platform fee: $1,200,000 × 0.10 = $120,000
  - Auction buyer premium: $300,000 (25% of $1.2M) × 0.05 = $15,000
  - Subscription: $0
  - Total revenue: $135,000
  - Per-organizer annual revenue: $2,250

PRO organizers (30):
  - GMV: $600,000 (30% of total)
  - Platform fee: $600,000 × 0.08 = $48,000
  - Auction buyer premium: $150,000 (25% of $600K) × 0.05 = $7,500
  - Subscription: $29 × 12 × 30 = $10,440
  - Total revenue: $65,940
  - Per-organizer annual revenue: $2,198

TEAMS organizers (10):
  - GMV: $200,000 (10% of total)
  - Platform fee: $200,000 × 0.08 = $16,000 (CORRECTED from $10,000)
  - Auction buyer premium: $50,000 (25% of $200K) × 0.05 = $2,500
  - Subscription: $79 × 12 × 10 = $9,480
  - Total revenue: $27,980 (was $21,980 with 5% Teams)
  - Per-organizer annual revenue: $2,798
```

**Blended Take Rate Calculation:**
```
Total platform fees: $120,000 + $48,000 + $16,000 = $184,000
Total auction premiums: $15,000 + $7,500 + $2,500 = $25,000
Total subscriptions: $10,440 + $9,480 = $19,920
───────────────────────────────────────────────────
Total revenue: $228,920
Total GMV: $2,000,000

Blended take rate: $228,920 ÷ $2,000,000 = 11.45%

Breakdown:
- Platform fees: 9.2% of GMV
- Auction buyer premium: 1.25% of GMV (only applies to auction GMV)
- Subscription: 1.0% of GMV (annualized)
```

**Answer:** The corrected model delivers a **blended take rate of 11.45%**, up from the previous 11.15% (due to 8% Teams fee instead of 5%). This is competitive:
- vs EstateSales.NET ($99/sale + $2.95/item): ~25–35% effective take rate
- vs MaxSold (15–30% commission): 15–30%
- vs our corrected fee: 11.45% (competitive, defensible)

---

### 6. Comparison: 10% Flat vs Corrected 10%/8%/8% Model

**Per 100 Organizers:**

| Metric | 10% Flat | 10%/8%/8% (CORRECTED) | Delta | % Change |
|--------|----------|----------------------|-------|----------|
| Platform Fees | $200,000 | $184,000 | -$16,000 | -8% |
| Subscription Revenue | $0 | $19,920 | +$19,920 | N/A |
| Auction Buyer Premium | $25,000 | $25,000 | $0 | 0% |
| **TOTAL REVENUE** | **$225,000** | **$228,920** | **+$3,920** | **+1.74%** |
| Blended Take Rate | 11.25% | 11.45% | +0.2% | +1.8% |

**Key Finding:** The corrected 8%/8% model is now **revenue-additive**. FindA.Sale gains $3,920/year per 100 organizers, not loses $2,080.

---

## DELIVERABLE 2: OVERAGE PRICING MODEL

### Design Principles

1. **Create a natural upgrade inflection point** where overages become more expensive than upgrading to the next tier
2. **Make overages expensive enough to incentivize upgrading**, but fair enough to be transparent
3. **Apply overages to items only** (not photos or AI tags initially — those scale differently and require their own logic)
4. **Enforce via soft warnings first, then hard limits**

### Recommended Overage Model

#### Simple Tier Overages (Free → Pro)

**Free Tier Limits:**
- 100 items/sale (raised from current to reflect market feedback)
- 500 photos total per sale (3 photos × ~167 items; can go up to 5 per item)
- 50 AI tags/month free

**Overage Pricing:**
- Items beyond 100: **$0.10/item**
- Photos beyond 500: $0.02/photo (aligns with Cloudinary overage cost to us)
- AI tags beyond 50: **$0.05/tag**

**Economics:**
```
Small organizer with 150-item sale (50 items over limit):
- Overage cost: 50 × $0.10 = $5
- Organizer must decide: Pay $5 overage OR upgrade to Pro ($29/month)

If organizer does 4 sales/month at 150 items each:
- Monthly overage cost: 4 × 50 × $0.10 = $20
- Annual overage cost: $240
- Pro subscription cost: $348/year
- Organizer breaks even at ~$348 ÷ $0.10 = 3,480 overage items/year = ~870 items/quarter

At that point, Pro becomes obviously cheaper.
```

**Upgrade Inflection:** When an organizer pays ≥$25/month in overages (250 items/month), Pro ($29/month) becomes cheaper. This is clean.

---

#### Pro Tier Overages (Pro → Teams)

**Pro Tier Limits:**
- 400 items/sale (unlimited concurrent sales)
- 2,000 photos/sale
- Unlimited AI tags (bundled)

**Overage Pricing:**
- Items beyond 400/sale: **$0.05/item**
- Photos beyond 2,000/sale: $0.02/photo

**Economics:**
```
Medium organizer with two 600-item sales/month (200 items over × 2 = 400 total):
- Overage cost: 400 × $0.05 = $20/month = $240/year
- Pro subscription: $348/year
- Teams subscription: $948/year
- Premium for Teams: $948 - $348 = $600/year

If organizer is paying $240/year in overages, Pro is already the right choice.
If organizer needs Teams features (multi-user, API, webhooks), they justify the additional $600/year.

So overages don't directly create a "Pro → Teams" inflection; Teams is feature-driven.
```

**Upgrade Inflection:** When an organizer pays ≥$50/month in Pro overages, they're running 1,000+ items/month. At that scale, Teams ($79/month vs $29/month + overages) becomes economically comparable. Plus Teams includes multi-user access, which high-volume organizers need.

---

#### Teams Tier Overages

**Teams Tier Limits:**
- Unlimited items/sale
- Unlimited photos/sale
- Unlimited AI tags

**Overage Pricing:** None (absorbed in $79/month subscription)

**Rationale:** Teams is enterprise pricing. At Teams scale, FindA.Sale's cost-to-serve is ~$200–300/month. The $79 subscription + 8% fee on $10K+ monthly GMV keeps the ratio healthy. No per-item charges.

---

### Application to Other Features

**Photos:**
- All tiers share the same $0.02/photo overage (Cloudinary's actual cost to us)
- This is transparent and fair; we pass through the actual cost
- Applies to free, pro, and teams (though Teams has unlimited bundled)

**AI Tags:**
- Simple: 50 free tags/month, then $0.05/tag
- Pro: Unlimited (bundled)
- Teams: Unlimited (bundled)

**Rationale:** AI tags are our highest-margin feature. By bundling unlimited tags into Pro ($29/month), we incentivize upgrading. At Pro subscription price, the incremental AI tag cost is negligible (~$0.0005 per tag at scale, so we margin 95%+).

---

## DELIVERABLE 3: CORRECTED LIMITS TABLE & STRATEGIC QUESTIONS

### Recommended Limits Table (Final)

| Tier | Max items/sale (included) | Overage rate | Max photos/item | Max photos/month (included) | Photo overage | Max AI tags/month (included) | AI tag overage | Monthly subscription | Platform fee |
|------|---|---|---|---|---|---|---|---|---|
| **Simple** | 100 items | $0.10/item | 3 photos | 500 photos | $0.02/photo | 50 tags | $0.05/tag | Free | 10% |
| **Pro** | 400 items | $0.05/item | 5 photos | 2,000 photos | $0.02/photo | Unlimited | N/A | $29 | 8% |
| **Teams** | Unlimited | N/A | Unlimited | Unlimited | N/A | Unlimited | N/A | $79 | 8% |

---

### Strategic Questions — ANSWERED

#### 1. At what GMV does upgrading to Pro pay for itself (with 8% for both Pro and Teams)?

```
Fee savings at Pro: 2% of GMV per year
Pro subscription cost: $348/year

Breakeven GMV: $348 ÷ 0.02 = $17,400/year
Monthly breakeven: $1,450/month
```

**Answer:** At **$1,450/month GMV** (~3 sales/month at $5K each), upgrading to Pro pays for itself through fee savings alone. For organizers below this threshold, Pro is only justified by feature value (analytics, batch operations, exports), not economics.

---

#### 2. Since Pro and Teams both pay 8%, what's the financial incentive for Teams over Pro? Is this okay?

**Fee Perspective:**
- Pro: 8% fee
- Teams: 8% fee
- **Fee incentive: Zero (identical)**

**Subscription Perspective:**
- Pro: $29/month = $348/year
- Teams: $79/month = $948/year
- **Additional cost: $600/year**

**Feature Perspective (the real incentive):**
- Pro: Single user, batch exports, analytics, reports
- Teams: Multi-user accounts, API access, webhooks, white-label support, role-based access control

**Financial Incentive for Teams:** There is **intentionally none on fees alone**. Teams is positioned purely for feature value:
- Multi-user teams need concurrent access (estate sale coordination teams, corporate liquidators)
- API users need programmatic access and webhooks
- High-volume operations need role-based access control and audit logs

**Is this okay?** **Yes, and this is correct.** The tiered model should segment by:
1. **SIMPLE:** One-off or low-volume organizers (no fee savings needed)
2. **PRO:** Regular organizers who reach $1,450+/month GMV and value analytics/features
3. **TEAMS:** Multi-user teams and API users who need features, not just fee savings

If Teams had a lower fee (like the old 5% model), it would cannibalize PRO adoption for the wrong reason (fee arbitrage, not feature adoption). The 8% fee eliminates that trap and creates a **feature-driven market**.

**Recommendation:** When marketing Teams, emphasize:
- "Teams pricing is $79/month. The fee is the same as Pro (8%) because we want you to choose based on features, not fees. Add team members, grant API access, and run at scale."

---

#### 3. Blended take rate assuming 60% Simple, 30% Pro, 10% Teams

Already calculated above:

```
Simple (60): $1.2M × 10% = $120K fees + $0 sub = $120K
Pro (30):    $600K × 8% = $48K fees + $10,440 sub = $58,440
Teams (10):  $200K × 8% = $16K fees + $9,480 sub = $25,480

Total: $203,920 (platform fees $184K + subscriptions $19,920 + auction premium $25K)
GMV: $2M

Blended take rate: $203,920 ÷ $2,000,000 = 10.196%
```

**Breakdown:**
- Platform fees (weighted average): 9.2% of GMV
- Auction buyer premium: 1.25% of GMV
- Subscription: ~1.0% of GMV
- **Total: ~11.45%**

---

#### 4. What's the revenue delta between 10% flat and the new 10%/8%/8% model?

**Per 100 organizers at 60/30/10 distribution:**

| Model | Platform Fees | Subscriptions | Auction Premium | Total | Delta |
|-------|---------------|---------------|-----------------|-------|-------|
| **10% Flat** | $200,000 | $0 | $25,000 | $225,000 | Baseline |
| **10%/8%/8% (CORRECTED)** | $184,000 | $19,920 | $25,000 | $228,920 | +$3,920 |
| **10%/8%/5% (OLD ERROR)** | $178,000 | $19,920 | $25,000 | $222,920 | -$2,080 |

**Key Findings:**
1. The **corrected 8%/8% model gains +$3,920/year** vs flat 10%
2. The **old 5% model lost -$2,080/year** vs flat 10%
3. **Correction impact: +$6,000/year swing** per 100 organizers
4. At 500 organizers (platform scale): **+$30,000/year swing**

**Answer:** The corrected model is **$3,920/year revenue-positive** per 100 organizers. The old 5% Teams fee was a value trap; the corrected 8% eliminates it while maintaining market segmentation.

---

## PROFITABILITY & RISK ASSESSMENT

### Pro Organizers: Net Contribution Analysis (Corrected)

**Scenario: Pro organizer at $4K/month GMV ($48K/year)**

```
FindA.Sale monthly revenue from fees: $4,000 × 0.08 = $320
Subscription: $29
Total monthly revenue: $349

Payment processing cost: $4,000 × 2.2% = $88
Support & infrastructure: $15
Total monthly cost: $103

Net contribution: $349 - $103 = $246/month ($2,952/year)
```

---

### Teams Organizers: Net Contribution Analysis (Corrected)

**Scenario: Teams organizer at $10K/month GMV ($120K/year)**

```
FindA.Sale monthly revenue from fees: $10,000 × 0.08 = $800 (CORRECTED from $500 at 5%)
Subscription: $79
Total monthly revenue: $879

Payment processing cost: $10,000 × 2.2% = $220
Support & infrastructure: $20 (slightly higher for multi-user)
Total monthly cost: $240

Net contribution: $879 - $240 = $639/month ($7,668/year) (was $339/month with 5% fee)
```

**Correction Impact:** Teams organizers now contribute **$7,668/year** instead of $4,068/year. That's a **+$3,600/year improvement** per Teams organizer.

---

### Summary: Profitability Across Tiers

| Tier | GMV Example | Monthly Revenue | Monthly Cost | Net/Month | Annual Contribution | vs Simple (same GMV) |
|------|---|---|---|---|---|---|
| **Simple** | $4,000 | $400 | $103 | **$297** | $3,564 | Baseline |
| **Pro** | $4,000 | $349 | $103 | **$246** | $2,952 | -$612 (-17%) |
| **Simple** | $10,000 | $1,000 | $220 | **$780** | $9,360 | Baseline |
| **Teams (CORRECTED)** | $10,000 | $879 | $240 | **$639** | $7,668 | -$1,692 (-18%) |
| **Teams (OLD 5%)** | $10,000 | $579 | $240 | $339 | $4,068 | -$5,292 (-56%) |

**Critical Finding:** The 8% correction reduces the net contribution loss for Teams from 56% to 18%. This is a **massive improvement** in unit economics.

---

## CONCLUSION

### Key Takeaways

1. **The corrected 8%/8% model is revenue-positive** — FindA.Sale gains ~$3,920/year per 100 organizers vs a flat 10% model.

2. **The upgrade incentives are now clean:**
   - Simple → Pro: At $1,450/month GMV, fee savings pay for the subscription. Features (analytics, batch ops) drive adoption below that.
   - Pro → Teams: At $3,950+/month GMV or multi-user needs, Teams becomes economical. Features (API, multi-user, webhooks) drive adoption.

3. **The overage model works:**
   - Simple overages at $0.10/item force an upgrade to Pro at ~$25/month in charges.
   - Pro overages at $0.05/item scale fairly.
   - Teams has no overages (enterprise pricing).

4. **Blended take rate is 11.45%** — competitive, defensible, and sustainable.

5. **The 5% Teams fee was a mistake.** The corrected 8% fee improves Teams unit economics by +$3,600/year per organizer and eliminates the "value trap" problem.

### Recommended Positioning (GO-TO-MARKET)

- **Simple:** "Free forever for small sales. 100 items per sale, 50 AI tags per month."
- **Pro:** "For organizers scaling beyond 100 items/sale. Unlimited AI tags, analytics, batch operations. Starts paying for itself at 3+ sales/month."
- **Teams:** "For multi-user teams and liquidators. API access, webhooks, multi-seat management, and white-label support."

**No organizer should choose Pro or Teams for fee optimization alone.** They choose for features. The 8% fee (same as Pro) removes the fee-arbitrage pressure and ensures market segmentation works correctly.

---

**Document Status:** Investor Analysis Complete (Corrected)
**Next Review Date:** 2026-06-19 (post-beta, cohort analysis)
**Recommendations for Handoff:** Implement the corrected 8%/8% fee model immediately. Update pricing page and positioning. No changes to overall strategy recommended — the correction actually improves financial viability.
