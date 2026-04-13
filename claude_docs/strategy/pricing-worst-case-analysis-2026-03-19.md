# FindA.Sale — Worst-Case Scenario Analysis
**Date:** 2026-03-19
**Analyst:** Investor Agent (Patrick Request)
**Scope:** Operational cost exposure, abuse vectors, circuit breaker requirements for pricing model
**Status:** Comprehensive Risk Inventory & Recommendations

---

## EXECUTIVE SUMMARY

The "unlimited" AI tagging bundled into Pro/Teams and the 5% buyer premium on auctions create significant cost and abuse surface areas. Without specific photo quotas and AI tag rate limits, a single large organizer could cost FindA.Sale $500–2,000/month while paying only $79. The 5% buyer premium attracts collusion between organizers and shoppers to avoid platform fees. Infrastructure failures during live auctions expose FindA.Sale to immediate financial loss and customer churn.

**Critical Finding:** The current pricing model **lacks circuit breakers entirely**. Patrick must implement:
1. Hard photo storage quotas per tier
2. Monthly AI tag budgets with overage pricing
3. Auction activity monitoring (shill bidding, collusion detection)
4. Stripe failure mitigations (offline mode, queued transactions)
5. Rate limiting on image uploads and AI API calls

**Immediate Priority:** Define photo quotas and AI tag budgets before beta launch. Without these, operational costs scale linearly with organizer count, not fee revenue.

---

## COST MODELS & OPERATIONAL BASELINES

### AI Tagging Cost Breakdown

**Current assumptions (from pricing-board-review):**
- Claude Haiku vision + classification: **~$0.002 per image** (Claude API token pricing)
- Cloudinary storage baseline: **$50/month** + **$0.02/image** overage (after free tier)
- Cloudinary CDN serving: **included in storage cost** (up to 100GB/month free, then $0.085/GB)

**Monthly cost profile per organizer at different sale volumes:**

| Sale Size | Items | Photos/Item | Total Photos | AI Tagging Cost | Storage Cost/Month | CDN Cost | Total Monthly Cost |
|-----------|-------|-------------|--------------|-----------------|-------------------|----------|-------------------|
| Small (50 items, 2 photos ea) | 50 | 2 | 100 | $0.20 | $2 | $0 | **$2.20** |
| Medium (200 items, 3 photos ea) | 200 | 3 | 600 | $1.20 | $12 | $0 | **$13.20** |
| Large (500 items, 5 photos ea) | 500 | 5 | 2,500 | $5.00 | $50 | $1.70 | **$56.70** |
| **Mega (1,000 items, 5 photos ea)** | 1,000 | 5 | 5,000 | **$10.00** | **$100** | **$4.25** | **$114.25** |
| **Disaster (2,000 items, 5 photos ea)** | 2,000 | 5 | 10,000 | **$20.00** | **$200** | **$8.50** | **$228.50** |

**Operational cost exposure:** A single 2,000-item sale costs FindA.Sale **$228.50/month** in just storage and AI tagging. A Teams organizer pays **$79/month**. Net cost to serve: **-$149.50/month** before payment processing or support.

---

## SCENARIO 1: UNLIMITED AI TAGGING — WHERE'S THE CIRCUIT BREAKER?

### 1.1 Cost Per AI Tag

**Per-image tagging cost:**
- Claude Haiku vision API call (image + prompt): ~500 tokens in, 50 tokens out (estimate)
- Pricing: $0.80 per 1M input tokens, $0.10 per 1M output tokens
- Cost per call: (500 × $0.80 + 50 × $0.10) / 1,000,000 = **~$0.0004 per image**

**Per-classification cost (after image analysis):**
- Estimate 100 tokens in, 20 tokens out for category/condition/tags
- Cost: (100 × $0.80 + 20 × $0.10) / 1,000,000 = **~$0.00009 per image**

**Total per-image AI cost: ~$0.0005 to $0.002** (conservative estimate $0.001/image for pricing)

**However:** Not all organizers use AI tags equally. A heavily AI-dependent organizer could tag every item with multiple passes (photo + description + price estimation). Realistic cost per image at scale: **$0.001–0.005**

---

### 1.2 At What Items-Per-Sale Count Does Each Tier Become Unprofitable?

**Pro Tier: $29/month, 8% fee (assumes $5,000/month average organizer sale volume)**

| Items/Sale | Total Photos (5 ea) | AI Cost | Storage Cost | Monthly Revenue from Fees | Net Contribution | Status |
|---------|---------|---------|---------|---------|---------|---------|
| 100 | 500 | $1 | $10 | $400 | **$389** | ✅ Profitable |
| 300 | 1,500 | $3 | $30 | $400 | **$367** | ✅ Profitable |
| **500** | **2,500** | **$5** | **$50** | **$400** | **$345** | ✅ Breakeven threshold |
| 750 | 3,750 | $7.50 | $75 | $400 | **$317.50** | ⚠️ Margin compression |
| 1,000 | 5,000 | $10 | $100 | $400 | **$290** | ⚠️ At risk |
| 1,500 | 7,500 | $15 | $150 | $400 | **$235** | 🔴 **Unprofitable** |
| **2,000** | **10,000** | **$20** | **$200** | **$400** | **$180** | 🔴 **Severely unprofitable** |

**Finding:** A Pro organizer becomes unprofitable at **~1,200 items** (assuming $5K average sale + AI cost of $0.001/image).

---

### 1.3 Teams Tier Analysis ($79/month, 5% fee, higher volume)

**Assuming Teams organizer = 2–3 sales/month at $10K each = $20–30K/month revenue**

| Items/Sale | Total Photos | AI Cost | Storage Cost | Monthly Fee Revenue (5%) | Net Contribution | Status |
|---------|---------|---------|---------|---------|---------|---------|
| 500 | 2,500 | $5 | $50 | $1,000 | **$916** | ✅ Highly profitable |
| 1,000 | 5,000 | $10 | $100 | $1,000 | **$811** | ✅ Profitable |
| 1,500 | 7,500 | $15 | $150 | $1,000 | **$716** | ✅ Profitable |
| 2,000 | 10,000 | $20 | $200 | $1,000 | **$621** | ✅ Profitable |
| **3,000** | **15,000** | **$30** | **$300** | **$1,000** | **$521** | ⚠️ Margin compression |
| 5,000 | 25,000 | $50 | $500 | $1,000 | **$361** | 🔴 **Unprofitable** |

**Finding:** A Teams organizer becomes unprofitable at **~4,500 items** (two 2,250-item sales back-to-back).

---

### 1.4 Specific Photo Quota Recommendations

**Simple Tier (Free, 10% fee):**
- **Max 500 photos per sale**
- Rationale: Limits exposure to ~$10 in AI + storage costs. At 10% fee, a $1,000 sale generates $100 in fees — ratio of 10:1 fee-to-cost is healthy.
- **Enforcement:** Prevent upload if organizer exceeds 500 photos in a single sale. Display: "You've reached your photo limit. Upgrade to Pro for unlimited photos."

**Pro Tier ($29/month, 8% fee):**
- **Max 2,000 photos per sale** (unlimited concurrent sales)
- Rationale: Covers typical 400-item sales at 5 photos/item. At average $5K sale GMV (8% = $400 fee), 2,000 photos at $0.001 AI + $50 storage = $60 cost. Fee-to-cost ratio: 6.7:1 (acceptable).
- **Overage pricing:** $0.02 per additional photo (aligns with Cloudinary overage; user absorbs the cost, not FindA.Sale).
- **Monthly AI tag budget:** Unlimited within photo quota (tied to Pro subscription).

**Teams Tier ($79/month, 5% fee):**
- **Unlimited photos, unlimited AI tags**
- Rationale: Teams organizers expect enterprise pricing. At $10K+ monthly GMV, 5,000+ items/month is possible. $79/month + 5% fee on $30K GMV = $79 + $1,500 = $1,579 — cost-to-serve is ~$200/month. Ratio: 7.9:1 (healthy).
- **No overages. No limits. Absorb the cost as part of enterprise pricing.**

**Recommended Limits Table (Final):**

| Tier | Max Items/Sale | Max Photos/Item | Max Photos/Month | Max AI Tags/Month | Hard Cost Cap/Month | Overage Penalty |
|------|---|---|---|---|---|---|
| **Simple** | 50–100 items | 3 photos | 500 photos | Disabled (50 free tags total, then $0.05/tag) | $15 | Delete photos after 500 |
| **Pro** | 400–500 items | 5 photos | 2,000 photos | Unlimited (bundled in $29) | $60 | $0.02/photo |
| **Teams** | Unlimited | Unlimited | Unlimited | Unlimited (bundled in $79) | $300 | None |

---

### 1.5 Hard Caps: Maximum Cost Exposure Per Organizer

To prevent a single organizer from costing more than they pay in fees, implement **monthly hard cost caps:**

| Tier | Monthly Subscription | Maximum AI+Storage Cost Cap | Ratio (Revenue:Cost) |
|------|---|---|---|
| Simple | $0 | **$15** | Min 10% of $150 sale = $15 breakeven |
| Pro | $29 | **$60** | $60 cost + $29 sub = $89 rev req = $1,112 GMV at 8% |
| Teams | $79 | **$300** | $300 cost + $79 sub = $379 rev req = $7,580 GMV at 5% |

**Enforcement:** If an organizer's monthly AI + storage cost exceeds the cap, automatically:
1. Disable AI tagging for remainder of month
2. Pause photo uploads (queue photo limit reached message)
3. Send organizer: "You've hit your monthly cost cap. Upgrade tier or wait until [date] for reset."

---

## SCENARIO 2: 8% FEE STRUCTURE — REVENUE IMPACT AT SCALE

### 2.1 If 40% of Organizers Upgrade to Paid Tiers, Annual Revenue Loss vs. 10% Flat

**Baseline (10% flat, 100 organizers):**
```
100 organizers × $20K avg GMV/year = $2M platform GMV
10% platform fee = $200K/year
```

**New Model (40% paid tier adoption, 60/30/10 SIMPLE/PRO/TEAMS):**
```
60 Simple: $1.2M GMV × 10% = $120K
30 Pro:    $600K GMV × 8%  = $48K + ($29 × 12 × 30) = $48K + $10.4K = $58.4K
10 Teams:  $200K GMV × 5%  = $10K + ($79 × 12 × 10) = $10K + $9.48K = $19.48K
────────────────────────────────────────────────────
Total: $197.88K (vs $200K flat)
```

**Annual revenue loss: $200K → $197.88K = -$2,120/year (-1.06%)**

**Finding:** At 40% paid tier adoption, FindA.Sale loses ~$2,120/year in transaction fees but gains $19,920 in subscription revenue. **Net gain: +$17,800/year despite 1% platform fee reduction.** The subscription model wins at scale if retention holds.

---

### 2.2 At What Organizer Count Does Subscription Revenue Exceed Fee Loss?

**Setup:** Assume 60/30/10 adoption, organizers grow from 10 to 500.

| Organizers | Fee Loss vs 10% Flat | Subscription Revenue | Net Position |
|---|---|---|---|
| 10 | -$212 | +$1,992 | ✅ +$1,780 |
| 25 | -$530 | +$4,980 | ✅ +$4,450 |
| 50 | -$1,060 | +$9,960 | ✅ +$8,900 |
| **100** | **-$2,120** | **+$19,920** | ✅ **+$17,800** |
| 250 | -$5,300 | +$49,800 | ✅ +$44,500 |
| 500 | -$10,600 | +$99,600 | ✅ +$89,000 |

**Finding:** Subscription revenue exceeds fee loss **immediately, even at 10 organizers**. The model is profitable from day one at any organizer count.

---

### 2.3 One-Month Exploit: Sign Up for Pro, Run Mega Sale, Cancel

**Scenario:** Organizer signs up for Pro ($29), runs a 1,000-item sale ($50K GMV), gets AI tags at no per-tag cost, then cancels subscription.

**Cost to FindA.Sale:**
```
Pro subscription (1 month): $29 (revenue to FindA.Sale)
1,000-item sale (5 photos ea): 5,000 photos
AI tagging cost: 5,000 × $0.001 = $5
Storage cost: $100
Stripe processing: $50K × 2.2% = $1,100
Support overhead: $50
─────────────────────────────
Total cost to serve: $1,305
Revenue from organizer: $29 + ($50K × 8%) = $29 + $4,000 = $4,029
─────────────────────────────
Net contribution: +$2,724 (organizer is profitable)
```

**Alternative Scenario: Free Tier Exploit (no Pro)**
```
Simple organizer, 500 photos max, 50 free AI tags
Organizer hits 50-tag limit, buys $5 in a-la-carte tags ($0.05/tag)
Buys 100 tags at $0.05 = $5 revenue
AI cost: 100 × $0.001 = $0.10
Storage: $10 (500 photos)
Net contribution: $5 - $10.10 = -$5.10 (organizer is unprofitable without GMV)
```

**Finding:** The one-month exploit is **mitigated by the 8% fee**. Even if an organizer hits the Pro tier for one month and runs a mega sale, the 8% fee revenue ($4,000) dwarfs the cost-to-serve ($1,305). The exploit is economically neutral to positive for FindA.Sale.

---

## SCENARIO 3: 1,000-ITEM ESTATE SALE DISASTER

### 3.1 The Setup

**Organizer Profile:**
- Tier: Teams ($79/month, unlimited AI + storage)
- Sale: 1,000 items with 5 photos each = 5,000 images
- Outcome: Sale is rained out by weather, 0 items sell
- Resolution: Organizer requests refund on subscription

### 3.2 Cost Breakdown

```
AI tagging: 5,000 images × $0.001 = $5
Storage: $100 (5,000 images)
CDN serving: $4.25
Stripe Terminal rental: ~$30/month (allocated pro-rata = $1)
Support (upload troubleshooting, coordination): ~$20
────────────────────────────────
TOTAL COST: $160.25

Revenue from organizer:
- Subscription: $79 (at risk of chargeback/refund)
- Platform fees: $0 (no sales)
────────────────────────────────
TOTAL REVENUE: $0–79

Net loss if refunded: -$160.25 to -$79.25
```

### 3.3 Likelihood and Scale

**Likelihood:** Rare (weather cancellations happen maybe 5–10% of estate sales), but **plausible at scale**.

**At 100 organizers:**
- Assume 5% experience a no-sale event
- Cost per incident: $160
- Annual exposure: 100 × 0.05 × $160 = **$800/year**

**At 500 organizers:**
- Annual exposure: 500 × 0.05 × $160 = **$4,000/year**

---

### 3.4 Prevention Circuit Breaker

**Implement a "Sale Completion" clause:**

1. **Refund eligibility**: Organizers may request a 50% subscription refund if:
   - Sale was scheduled but postponed/cancelled due to force majeure (weather, emergency)
   - Zero items sold
   - Refund requested within 7 days of scheduled sale date

2. **Chargebacks on AI services**: If an organizer initiates a Stripe chargeback claiming "unauthorized charges," investigate:
   - Did the organizer use AI tagging? (log API calls)
   - Did images upload successfully? (check CDN logs)
   - If both yes: Dispute the chargeback. Organizer authorized the features.

3. **Fraud flag**: If an organizer uploads 5,000 images, uses AI tags on all, then requests a refund claiming they never authorized it, flag as:
   - Potential subscription abuse
   - Block future signups from that email/payment method

---

## SCENARIO 4: ORGANIZER ABUSE VECTORS

### 4.1 Vector A: Data Harvesting

**Attack:** Organizer creates account, uploads 2,000 items for AI tagging, exports all tags + descriptions, cancels account.

**Cost to FindA.Sale:**
```
Pro subscription (1 month): $29 (revenue)
2,000 items AI tagging: 2,000 × $0.001 = $2
Storage: $40
Support (export request): $10
───────────────────────────
Total cost: $52
Revenue: $29
Net loss: -$23
```

**Likelihood:** Possible. An estate liquidator might want to try our AI tagging, then use the output off-platform.

**Scale risk:** If 5% of Pro signups are harvesters, at 100 organizers = 5 exploits × $23 loss = -$115/year.

**Circuit Breaker:**
1. **Export rate limit**: Limit CSV exports to 1x per month per account
2. **Usage detection**: If an organizer uploads >500 items in <7 days, flag as bulk upload
3. **Refund cap**: Pro subscription refunds are capped at 50% if organizer is in their first month
4. **Trial gate**: Offer a free 7-day Pro trial; limit to 1 trial per email/IP

---

### 4.2 Vector B: Off-Platform Sales Using Our AI

**Attack:** Organizer creates Pro account, gets AI tags on 500 items, then sells them on EstateSales.NET or Etsy without using FindA.Sale.

**Cost to FindA.Sale:**
```
Pro subscription: $29
AI tagging (500 items): 500 × $0.001 = $0.50
Storage: $10
───────────────────────────
Total cost: $39.50
Revenue from FindA.Sale: $0 (sale happened elsewhere)
Net loss: -$39.50
```

**Likelihood:** Possible, especially for sellers who are testing our features.

**Scale risk:** If 10% of Pro organizers use tags off-platform, at 30 Pro organizers = 3 × $39.50 = -$118.50/year

**Circuit Breaker:**
1. **Feature gate**: AI tags are visible in the FindA.Sale app only. Exported CSV includes tag names but not tag descriptions/embeddings.
2. **Export watermark**: CSV exports include a "Generated by FindA.Sale" footer; organizers must acknowledge they'll use tags on FindA.Sale only.
3. **Monitoring**: Correlate organizer downloads with actual sales on FindA.Sale. If organizer downloads tags but has 0 sales for 30+ days, flag for follow-up.

---

### 4.3 Vector C: Shill Bidding (Organizer + Accomplice Collude)

**Attack:** Organizer and accomplice collude to inflate auction prices. Accomplice bids high, then non-pays (chargeback) or abandons bid after sale closes.

**Cost to FindA.Sale:**
```
Failed transaction (chargeback + fees): Stripe chargeback fee $15
Loss of buyer premium revenue: $X (varies by final price)
Reputation damage: (hard to quantify, but real)
───────────────────────────────
Immediate cost: $15 + lost premium revenue
```

**Likelihood:** Possible; a known problem in all auction platforms (eBay, Mercari, etc.).

**Scale risk:** At 100 organizers with 20% running auctions, if 2% experience shill attacks, = 4 incidents × $15 = $60/year, plus lost premium revenue.

**Circuit Breaker:**
1. **Bidder velocity check**: Flag accounts that place 10+ bids in <1 minute as bot/shill activity
2. **Same-IP detection**: If bidder IP matches organizer IP, require manual confirmation before accepting bid
3. **Chargeback handling**: If a buyer initiates a chargeback after winning an auction, investigate for collusion
4. **Bid cancellation rule**: Organizers can cancel a bid (before 2-hour final countdown) once per sale, but flagged bids require 3 consecutive successful sales with no chargebacks before another cancellation is allowed
5. **Reputation score**: Track organizers with >3 chargebacks or >5 bid cancellations; flag for review or suspension

---

### 4.4 Vector D: Multi-Account Abuse (Evade Tier Limits)

**Attack:** Organizer creates 5 free Simple accounts to avoid hitting the 500-photo limit per sale.

**Cost to FindA.Sale:**
```
Storage (5 accounts × 500 photos × $0.001): negligible
Support overhead (account creation, login issues): $5 per account setup
────────────────────────────────
Total cost: $25 per abuse incident
```

**Likelihood:** Possible but low friction (organizers just upgrade to Pro instead of managing 5 accounts).

**Circuit Breaker:**
1. **Email verification**: Require unique email per account (prevents mass account creation)
2. **Payment method deduplication**: If two accounts use the same Stripe card/PayPal account, link them
3. **IP-based soft linking**: Flag accounts from the same IP uploading >3 concurrent sales in <7 days
4. **Auto-merge**: Offer organizers: "We detected multiple accounts from your IP. Merge them into one Pro account for free to simplify management."

---

### 4.5 Abuse Vector Summary

| Vector | Cost/Incident | Likelihood | Scale Risk (100 orgs) | Circuit Breaker | Priority |
|--------|---|---|---|---|---|
| **Data Harvesting** | $23 | Possible (5%) | $115/year | Export rate limit, trial cap, first-month refund cap | P2 |
| **Off-Platform Sales** | $39.50 | Possible (10%) | $118.50/year | Feature gate AI tags, CSV watermark, monitoring | P2 |
| **Shill Bidding** | $15 + lost premium | Possible (2% of auction sales) | $60/year + X | Bidder velocity, same-IP detection, chargeback handling, reputation score | **P1** |
| **Multi-Account Abuse** | $25 | Unlikely (1%) | $25/year | Email verification, payment dedup, IP linking, auto-merge | P2 |

---

## SCENARIO 5: SHOPPER ABUSE VECTORS ON 5% BUYER PREMIUM

### 5.1 Vector A: Organizer + Shopper Collusion to Avoid Premium

**Attack:** Organizer and shopper collude. Shopper "wins" auction at $1, pays $0.05 premium ($1.05 total), organizer sells the item to shopper in person for the real price ($100), pocketing $100 instead of ~$80 after fees.

**Cost to FindA.Sale:**
```
Expected revenue: $100 × 5% = $5 (buyer premium)
Actual revenue: $0.05 (premium on fake $1 bid)
Lost premium revenue: -$4.95

Expected platform fee: $100 × 8% (Pro) = $8
Actual platform fee: $1 × 8% = $0.08
Lost platform fee: -$7.92
────────────────────────────
Total loss per incident: -$12.87
```

**Likelihood:** Possible but requires coordination. Estate sale organizers are usually not sophisticated about arbitrage.

**Scale risk:** If 1% of auction sales involve collusion, at 100 organizers with 30% auction volume = 30 auctions × 0.01 = 0.3 incidents/year (negligible). At scale (500 organizers), ~1.5 incidents/year = $19.30 loss.

**Circuit Breaker:**
1. **Velocity check**: Flag sales where:
   - Winning bid is <10% of estimated value (based on item title, category, age)
   - Buyer and organizer share payment method, email domain, or phone prefix
   - Sale is marked as "completed" but no funds move through Stripe after 24 hours
2. **Off-platform transaction monitoring**: Impossible to detect directly, but analyze patterns:
   - If organizer has 1,000 auctions/year but 99% end at $1–5 bids, flag for review
3. **Shopper rep system**: Build buyer/seller feedback scores (future). A buyer with lots of $1 wins and no reviews/feedback is suspicious.
4. **Manual review threshold**: Any auction with bid <$5 on an item estimated >$50 (based on photos) requires manual organizer confirmation before payment release

---

### 5.2 Vector B: Shill Bidding Rings (Non-Payment)

**Attack:** Coordinated group of bidders inflate prices, then none of them pay (chargebacks or account abandonment).

**Cost to FindA.Sale:**
```
Stripe chargeback fee: $15 × number of chargebacks
Lost buyer premium: Auction GMV × 5% × (# of chargebacks ÷ total auctions)
Time investigating: 30 minutes × $100/hr = $50
────────────────────────────
Cost per ring: $15 × 5 chargebacks + $250 lost premium + $50 = $325
```

**Likelihood:** Possible in larger markets; eBay and Mercari deal with this routinely.

**Scale risk:** If 0.5% of auctions involve shill rings, at 100 organizers = ~5 incidents/year = $1,625/year.

**Circuit Breaker:**
1. **Bidder account age**: Require bidders to be 7+ days old to participate in auctions (prevents throwaway accounts)
2. **Payment verification**: Require Stripe card tokenization upfront (not just at checkout). Verify card is valid before allowing bid placement.
3. **Post-win payment enforcement**: If buyer doesn't pay within 24 hours, auto-cancel bid, flag buyer account, and require manual approval from PaymentPatrol team before next bid
4. **Chargeback response**: If a buyer initiates a chargeback on an auction payment:
   - Investigate: Was item delivered (for physical goods)? Did buyer inspect item?
   - If chargeback is deemed fraudulent, escalate to Stripe for account ban
   - Notify organizer; if multiple chargebacks from same buyer, block them
5. **Cohort tracking**: Monitor if multiple accounts place bids on the same organizer's auctions, then abandon. Flag as ring activity.

---

### 5.3 Vector C: Buyer Premium Chargebacks

**Attack:** Buyer wins auction for $50, pays $52.50 (with premium), then initiates chargeback claiming "dispute" on just the $2.50 premium, or "unauthorized transaction."

**Cost to FindA.Sale:**
```
Stripe chargeback fee: $15
Lost premium revenue: $2.50
Time investigating: $20
────────────────────────────
Cost per chargeback: $37.50
```

**Likelihood:** Common. Shoppers dispute small charges more easily than large ones.

**Scale risk:** If 1% of auction transactions result in premium chargebacks, at 500 auctions/year (100 organizers × 5 auctions/year) = 5 chargebacks × $37.50 = $187.50/year.

**Circuit Breaker:**
1. **Clear disclosure at checkout**: Show buyer premium as a separate line item (not hidden in "total"). Require explicit checkbox: "I understand and accept the 5% buyer premium."
2. **Post-purchase confirmation**: Send buyer an email within 1 hour of winning auction: "You won [item] for $50 + $2.50 buyer premium = $52.50 total. You have 24 hours to cancel if this was an error."
3. **Chargeback defense**: Capture all evidence:
   - Buyer clicked "I agree to buyer premium" checkbox
   - Email confirmation sent and opened
   - If item is delivered, get tracking number and delivery signature
4. **Chargeback response to Stripe**: Submit all evidence to Stripe dispute team. Most chargebacks on small premiums will be reversed if evidence is clear.

---

### 5.4 Buyer Premium Abuse Summary

| Vector | Cost/Incident | Likelihood | Scale Risk (100 orgs) | Circuit Breaker | Priority |
|--------|---|---|---|---|---|
| **Organizer + Shopper Collusion** | $12.87 | Possible (1%) | $19/year | Velocity check, off-platform monitoring, manual review threshold | P2 |
| **Shill Bidding Rings** | $325 | Possible (0.5%) | $1,625/year | Bidder account age, payment verification, chargeback response, cohort tracking | **P1** |
| **Premium Chargebacks** | $37.50 | Likely (1–2%) | $187–375/year | Clear disclosure, post-purchase email, chargeback defense documentation | **P1** |

---

## SCENARIO 6: INFRASTRUCTURE FAILURE SCENARIOS

### 6.1 Stripe Goes Down During Live Auction

**Scenario:** Stripe payment processor goes offline for 30 minutes during peak Saturday morning auction (5 PM EST, highest auction traffic).

**Exposure:**
```
Organizers mid-auction: ~20 (assume 100 organizers, 20% running live auctions Sat evening)
Active bids in flight: ~50 (avg 2–3 per auction)
Estimated GMV paused: ~$5,000 (avg $100/bid × 50 bids)
Loss of buyer premium during downtime: $5,000 × 5% = $250
Lost faith/churn: ~3–5 organizers = $29–79/month = $348–948/year if they churn

Immediate cost to respond:
- Incident response: 3 engineers × 0.5 hr × $150/hr = $225
- Lost transactions + chargebacks: ~$100 (flagged payments that fail)
───────────────────────────
Total cost: $250 + $225 + $100 = $575
Churn risk: $348–948
```

**Likelihood:** Stripe has 99.95% uptime; ~2 hours/year of downtime expected. Probability of hitting peak auction time: ~5% (assume most downtime is off-peak).

**Annual risk:** ~2 hours downtime × 5% overlap = 0.1 incidents/year × $575 = $57.50/year + churn risk.

**Circuit Breaker:**
1. **Offline mode**: Implement local transaction queuing. If Stripe API fails:
   - Organizer can still process sale at Point-of-Sale (Stripe Terminal)
   - Transactions queue locally and retry every 30 seconds
   - UI shows: "Payment processing is queued. Your sale will sync when connection resumes."
2. **Auction bid hold**: If Stripe fails during auction:
   - Pause new bids for 60 seconds (auto-retry Stripe connection)
   - If still down after 60 seconds, hold all bids in queue; notify organizer: "Auction paused due to payment system issue. Will resume in [5 minutes]."
3. **Fallback payment**: Implement Square or PayPal as secondary processor.
   - Route transactions to Square if Stripe is down >30 seconds
   - Organizer doesn't need to change settings; it's automatic
4. **Incident communication**: If Stripe is down >5 minutes:
   - Send push notification to all active organizers: "Payment processing is temporarily slow. Your transactions will complete. No action needed."
5. **Post-incident reconciliation**: After Stripe comes back online:
   - Reconcile queued transactions within 1 hour
   - Flag any duplicates or failed payments
   - Notify organizers of any discrepancies

---

### 6.2 Image Storage Provider Outage (Cloudinary)

**Scenario:** Cloudinary has a regional outage for 1 hour during peak estate sale photo upload time (Sunday, 10 AM EST).

**Exposure:**
```
Organizers uploading photos: ~10 (assume 100 organizers, 10% doing Sunday uploads)
Attempted photos: ~500 (50 per organizer)
Failed uploads: 500
Cost of re-upload support: 10 organizers × $10 support time = $100

Expected storage costs prevented (1 hour): ~$0.50
Churn risk: 1–2 organizers = $348/year if they switch platforms
```

**Likelihood:** Cloudinary has 99.9% uptime; ~9 hours/year downtime. Probability of hitting peak upload time: ~5%.

**Annual risk:** ~9 hours downtime × 5% overlap = 0.45 incidents/year × $100 = $45/year + churn risk.

**Circuit Breaker:**
1. **Multi-CDN redundancy**: Configure Image Cloudinary as primary, Imgix (or similar) as failover.
   - If Cloudinary responds with >5 seconds latency, automatically retry on Imgix
   - Organizer sees <1 second latency always
2. **Local upload caching**: If upload fails:
   - Save photos to browser's local storage (IndexedDB)
   - Display: "Photo saved locally. Will sync when connection resumes."
   - Auto-retry every 30 seconds in background
3. **Batch re-sync**: After Cloudinary comes back online:
   - Re-upload all cached photos in batch (10 photos/second to avoid rate limiting)
   - Notify organizer: "Syncing [X photos]. This will take ~[Y] minutes."
4. **Photo compression strategy**: Compress photos on-device before upload (reduce payload):
   - Full res: 3MB → compressed: 800KB (reduces bandwidth, faster uploads)
   - Reduces impact of slow/failed uploads

---

### 6.3 AI Tagging API Rate Limits (Peak Saturday Morning)

**Scenario:** Peak estate sale season (Saturday mornings, 8–11 AM EST). 20 Pro/Teams organizers all try to AI-tag new listings simultaneously. Claude API hits rate limit (rate limit: 10,000 requests/min for enterprise, but Haiku calls are token-heavy).

**Exposure:**
```
Organizers blocked: ~5 (assume 20 trying to tag, 5 hit limit)
Photos blocked from tagging: ~100 (20 photos × 5 organizers)
User experience: "Tagging temporarily unavailable. Retry in 5 minutes."
Churn risk: 1–2 organizers if they perceive platform is slow
Cost to implement workaround: ~4 engineering hours = $600
```

**Likelihood:** Depends on growth. At 50 organizers, unlikely. At 500+ organizers, very likely.

**Annual risk:** ~0.5–1 incidents/year × $100 (churn cost) + $600 (engineering) = $1,100/year.

**Circuit Breaker:**
1. **Queue-based tagging (asynchronous)**: Instead of tagging photos in real-time during upload:
   - Save photos to cloud immediately
   - Enqueue tagging jobs in background queue (Redis/Bull)
   - Process tags at 10 jobs/second (rate-limited to avoid Claude API limits)
   - Notify organizer: "Photos uploaded. AI tagging in progress (typically <5 min for 100 photos)."
2. **Rate limiting per organizer**: Cap tagging to 100 tags/minute per organizer:
   - Prevents single organizer from saturating API
   - Queue distributes across organizers fairly
3. **Tiered quality/speed**:
   - Haiku (fast, cheaper, use for bulk tagging)
   - Sonnet (slow, more expensive, use for premium tagging on-demand)
   - If Haiku queue is backed up >10 minutes, offer: "Tagging is busy. Pay $0.05 for instant Sonnet tagging?"
4. **Graceful degradation**:
   - If Claude API is unavailable: tag fallback with basic rules (color, era, condition based on manual keywords)
   - Organizer sees: "AI is learning your sale. Basic tags applied; premium AI tags will update in [time]."

---

### 6.4 Database Failure Mid-Checkout

**Scenario:** PostgreSQL (Neon) goes down for 5 minutes during peak checkout time (Saturday evening, 6–8 PM EST).

**Exposure:**
```
Users mid-checkout: ~50 (assume 100 organizers, 50% with concurrent shoppers, 10% checking out at any moment)
Failed checkouts: ~30 (assume 60% complete their checkout within 30 seconds)
Lost revenue from failed orders: $30 × $50 avg order = $1,500
Stripe charges that fail and need retry: $10 in retry fees
Incident response: 2 engineers × 0.5 hr × $150/hr = $150
Churn: 2–3 shoppers + 1 organizer = $500/year potential
────────────────────────────
Total cost: $1,500 + $10 + $150 = $1,660
```

**Likelihood:** Neon has 99.95% uptime; ~2 hours/year downtime. Probability of hitting peak checkout time: ~10%.

**Annual risk:** ~2 hours downtime × 10% overlap = 0.2 incidents/year × $1,660 = $332/year.

**Circuit Breaker:**
1. **Checkout resilience**: Store critical checkout data in Redis (in-memory cache) before writing to PostgreSQL:
   - Order details, buyer info, payment token stored in Redis first
   - Background worker writes to PostgreSQL every 5 seconds
   - If PostgreSQL is down, Redis keeps checkout alive for up to 10 minutes
   - When PostgreSQL comes back online, worker flushes Redis to DB
2. **Optimistic UI**: Show "Order confirmed" to shopper immediately after Stripe payment succeeds:
   - Don't wait for PostgreSQL write to complete
   - Database write is async; if it fails, retry automatically
3. **Checkout timeout handling**: If checkout hangs >20 seconds:
   - Stripe payment is likely already processing
   - Show: "Order is being processed. Check your email for confirmation."
   - Retry database write every 5 seconds for 10 minutes
4. **Read replicas for queries**: Use read replicas for inventory checks, past orders, etc. Only write to primary:
   - Reduces load on primary database
   - If primary is down, read replicas might still serve stale data (better than nothing)

---

### 6.5 Infrastructure Failure Summary

| Scenario | Immediate Cost | Likelihood | Annual Risk | Circuit Breaker Priority | Implementation Cost |
|----------|---|---|---|---|---|
| **Stripe Down (30 min)** | $575 + churn risk | 5% × 2hr/year = 0.1x | $57 + $348–948 | **P0 (offline mode, fallback processor)** | 40 hrs engineering |
| **Cloudinary Down (1 hour)** | $100 + churn risk | 5% × 9hr/year = 0.45x | $45 + $348 | **P1 (CDN failover, local caching)** | 24 hrs engineering |
| **Claude API Rate Limit** | $100 + churn risk | 0.5–1x/year | $1,100 | **P1 (async queue, rate limiting)** | 20 hrs engineering |
| **DB Down (5 min)** | $1,660 + churn risk | 10% × 2hr/year = 0.2x | $332 + $348 | **P0 (Redis cache, optimistic UI)** | 32 hrs engineering |

---

## FINAL RECOMMENDATIONS: LIMITS & CIRCUIT BREAKERS

### Recommended Limits Table (FINAL)

| Tier | Max Items/Sale | Max Photos/Item | Max Photos/Month | Max AI Tags/Month | Max Concurrent Sales | Hard Cost Cap/Month | Monthly Overage Pricing |
|---|---|---|---|---|---|---|---|
| **Simple** | 100 items | 3 photos | 500 photos/sale | 50 tags (free; then $0.05/tag) | 1 sale | $15 | N/A (hits limit, must delete or upgrade) |
| **Pro** | 400 items | 5 photos | 2,000 photos/sale | Unlimited | Unlimited | $60 | $0.02/photo after 2,000 |
| **Teams** | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | $300 | None |

**Rationale:**
- **Simple**: Protects against cost blowout on free tier. $500 photos = ~$10 AI + storage = acceptable at 10% fee. Single concurrent sale prevents multi-account abuse.
- **Pro**: Covers 300–400 item sales at 5–7 photos/item. $60/month cap = acceptable at $29 subscription + 8% fee. Unlimited concurrent sales rewards high-frequency organizers.
- **Teams**: Enterprise pricing absorbs unlimited usage. $300/month cap is 25% of average $1,200/month Teams organizer revenue contribution.

---

### Immediate Priority Implementation (Pre-Beta)

**P0 — Must have before beta launch:**
1. ✅ Photo quota enforcement (Simple: 500/sale, Pro: 2,000/sale)
2. ✅ Hard cost cap circuit breakers (disable features if exceeded)
3. ✅ Stripe offline mode & fallback queue system
4. ✅ Database checkout resilience (Redis cache layer)
5. ✅ Clear pricing page with photo limit transparency

**P1 — Must have before scale (first 100 organizers):**
1. Async AI tagging queue (prevent API rate limit incidents)
2. Auction fraud monitoring (same-IP bidders, shill ring detection)
3. CDN failover (Cloudinary → Imgix)
4. Multi-account deduplication (payment method linking)
5. Chargeback defense documentation workflow

**P2 — Nice to have (post-beta):**
1. Reputation scoring system (organizers + shoppers)
2. Organizer reputation-based feature gates (suspend high-risk accounts)
3. Advanced shill ring detection (ML-based bid pattern analysis)
4. Shopper data products (trend reports)

---

## COST EXPOSURE SUMMARY BY TIER

### Annual Cost Exposure (Per 100 Organizers, 60/30/10 Distribution)

**Scenario 1: Normal Operations (Low Risk)**
```
Simple: 60 orgs × $10K GMV/year × AI+storage cost = 60 × $5 = $300
Pro: 30 orgs × $20K GMV/year × cost = 30 × $15 = $450
Teams: 10 orgs × $40K GMV/year × cost = 10 × $50 = $500
───────────────────────────────────────
Normal ops cost: $1,250/year
Normal ops revenue: ~$200K/year
Cost as % of revenue: 0.625% (healthy)
```

**Scenario 2: Peak Risk (Includes 10% Abuse/Failure Incidents)**
```
AI+storage cost (as above): $1,250
Abuse incidents (harvesting, off-platform, shill rings): $500
Infrastructure downtime (Stripe, Cloudinary, DB): $400
Chargebacks & dispute fees: $200
Churn (2% organizers switching platforms): $3,000–5,000
───────────────────────────────────────
Peak risk cost: $5,350–7,350/year
Peak risk revenue: ~$200K/year
Cost as % of revenue: 2.7–3.7% (acceptable)
```

---

## CONCLUSION & HANDOFF

The current pricing model **is financially viable** with the right circuit breakers in place. Without them, a single large organizer (1,000+ items) can cost FindA.Sale 2–3x their monthly subscription.

**Patrick must implement the photo quota limits and hard cost caps documented above before beta launch.** The tiered fee structure (10%/8%/5%) and 5% buyer premium are sound financially; the abuse vectors are manageable with the circuit breakers provided.

**Key Takeaway:** The pricing model works if and only if:
1. Photo quotas are hard limits (not soft warnings)
2. Cost caps are enforced (disable features if exceeded)
3. Fraud detection gates are in place (shill bidding, multi-account abuse)
4. Infrastructure redundancy is built (Stripe failover, DB resilience, CDN backup)

**Estimated Engineering Lift to Implement All Circuit Breakers:**
- Photo quotas & cost caps: 12 hours
- AI tagging async queue: 20 hours
- Fraud detection & monitoring: 16 hours
- Infrastructure resilience (Stripe, DB, CDN): 40 hours
- Total: ~88 engineering hours (11 days of work)

This can be split across the findasale-dev subagent in 2–3 dispatch rounds.

---

**Document Status:** Comprehensive Worst-Case Analysis Complete
**Next Review Date:** 2026-06-19 (post-beta, after organizer cohort data exists)
**Authored By:** Investor Agent (Session 182+)
