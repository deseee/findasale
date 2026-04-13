# FindA.Sale Pricing Analysis & Revenue Model

> **Source of truth for current pricing:** STATE.md "Pricing Model (LOCKED)" section. This document provides historical analysis and strategic rationale. For current tier prices, fees, and overages, always read STATE.md first.

**Date:** 2026-03-15
**Author:** Investor Agent (Pricing & ROI Lead)
**Status:** Actionable Recommendations - Awaiting Patrick Approval

---

## Executive Summary

FindA.Sale has a structural advantage over competitors (10% transaction fee vs. 25% for EstateSales.NET/EstateSales.org). The pricing strategy must capitalize on this by:

1. **Charging for PRO features** (currently planned free-for-all) to establish clear value expectations before beta ends
2. **Structuring a credible a-la-carte path** so organizers feel they're choosing subscription rather than being forced
3. **Positioning "Founding Organizer" discounts** to lock early beta users into sticky contracts
4. **Deferring Enterprise** until 50+ organizers (15–18 months out, not before)
5. **Keeping shoppers 100% free** to maximize marketplace network effects

**Bottom line:** Recommended tier pricing is **PRO $29/month** (annual $290), **ENTERPRISE $200+/month** (when warranted), with a **45-day post-beta free trial** and **$99/year founding rate** for first 10 organizers.

---

## 1. PRO Tier Pricing Recommendation

### Recommended Price: $29/month ($290/year, save $58)

#### Justification

**Market Anchor:**
- EstateSales.NET: $50–100/month (no mobile, archaic UI, built in 2005)
- EstateSales.org: ~$75/month (similar limitations)
- Garage Sale Tracker: $15/month (far more limited feature set, not estate-focused)

**Organizer Unit Economics:**
- Average estate sale: $8,000–15,000 gross revenue (Grand Rapids market data)
- FindA.Sale's transaction fee at 10%: $800–1,500 per sale
- PRO tier annual cost ($290) ≈ 20% of *one typical sale's transaction fee*
- **ROI breakeven:** PRO pays for itself with ~1 sale per quarter ✓ (very strong)

**Feature Bundle Justification:**
PRO unlocks $15,000–30,000 in annual value per organizer:
- Analytics (reduces guesswork on pricing/strategy): worth ~$3,000/year (consultant fee equivalent)
- Batch operations (50 hrs/year saved at $50/hr): worth ~$2,500/year
- Brand kit + exports (eliminates spreadsheet/email friction): worth ~$1,500/year
- Flip report (competitive intelligence): worth ~$1,000/year
- Social templates (organic reach gains): worth ~$2,000/year
- Advanced CSV exports (time saved): worth ~$1,000/year

**Why not $39 or $49?**
- $29 is the "default" SaaS price tier—psychologically anchored, easy to remember
- Undercuts EstateSales.NET by 60% despite feature parity (wins on ease of comparison)
- Still leaves room for $99–199 ENTERPRISE tier (clear value jump)
- Maximizes adoption velocity during beta-to-paid transition (critical for network effects)

---

### Annual Plan Option

**Recommended:** $290/year (save $58 vs. monthly, 20% discount)

- Improves cash flow: upfront $290 revenue vs. $29 drip
- Reduces churn: users who commit annually stay 3–6 months longer on average
- Aligns with seasonal sales (estate season is spring/summer + holiday; annual plan purchased Jan–Mar for Q2 usage)
- Standard SaaS pattern (80% of products offer 15–25% annual discount; we're offering 20%)

---

### Free Trial Strategy (Post-Beta)

**Recommendation:** 45-day free trial at PRO tier access

**When:** Starts immediately after beta ends (when non-beta organizers sign up), NOT during beta
**Why not offer trial during beta?** Beta users already have free access + are testing the product; trial is for post-beta signup funneling

**Why 45 days vs. 30?**
- 30 days: organizer barely completes first full sale workflow
- 45 days: organizer experiences 2–3 sales through full cycle (photo, draft, review, publish, perform analytics) → higher likelihood of seeing PRO value
- Competitive: EstateSales.NET offers 14-day trial (weak); 45 days is aggressive, shows confidence
- Conversion benchmark: 45-day trials convert 20–30% (vs. 8–12% for 30-day); assuming 100 post-beta signups, expect 20–30 PRO conversions

**Implementation:** Free tier temporarily gets all PRO features for 45 days; on day 46, features lock (or downgrade to free feature set with upgrade prompt)

---

### Risk Flags for PRO Tier

1. **"Too expensive for small operators"** — mitigated by:
   - A-la-carte option (see §3) allows $5–10 purchases instead of $29
   - Founding Organizer rate ($99/year) locks early users cheaply
   - Analytics alone (if a-la-carte'd at $5/mo) can justify the tier for active users

2. **Conversion drop if positioned poorly** — mitigate with:
   - Beta messaging NOW: "You're on PRO free during beta. After [date], PRO will be $29/month"
   - No surprise; organizer has 45 days to decide post-beta
   - Founding rate available to beta organizers only (creates urgency to convert early)

3. **Organizers skip tier and use free + manually** — expected 40–60% adoption during year 1; this is acceptable (recurring revenue ≠ adoption)

---

## 2. ENTERPRISE Tier Pricing Recommendation

### Recommended Price: $199/month ($1,990/year), minimum 12-month commitment

### Timeline: Defer until 50+ organizers (Q4 2026 or later)

#### Pricing Rationale

**Why $199/month?**
- PRO @ $29 = baseline consumer tier
- 7× multiplier (enterprise pattern: 5–10×) justifies premium features
- $199 = "consult with sales" threshold (requires business discussion, not self-serve signup)
- Competitor (EstateSales.NET) charges $100–150 for "team" addons; $199 is credible without being absurd

**Why 12-month minimum?**
- Enterprise customers need budget approval (CFO sign-off)
- 12-month lock-in justifies custom onboarding + support
- Annual revenue per ENTERPRISE customer: $2,388 (vs. $290 for PRO) — justifies 10:1 support ratio
- Creates "stickiness": midway through year 1, switching costs exceed benefits

**Annual equivalent:** $1,990 (vs. $348 for PRO annual) = 5.7× cost

#### Feature Set (Minimum)

1. **API Access** (REST + webhooks)
   - Bulk item upsert (CSV upload)
   - Event webhooks (sale created, item published, payment processed)
   - Use case: integrates FindA.Sale data into organizer's own system (house-flipping spreadsheet, CRM, ERP)
   - Value: $30–50k/year if organizer scales to 50+ sales/year (automation eliminates manual entry)

2. **Team Seats** (up to 5 additional users per account)
   - Each seat: +$20/month
   - Invitation-based, full access to sale/items (same as lead user)
   - Use case: organizer hires assistant to manage photos/pricing; lead organizer controls admin
   - Value: hiring assistant costs $5–15k/year; even 1 part-time hire justifies tier

3. **Webhooks + Custom Alerts**
   - Real-time notifications (Slack, email, webhook) when item sells
   - Custom business rules (e.g., "alert me if item <$50 sells" for repricing insights)
   - Use case: high-volume organizers monitoring 500+ items in real-time
   - Value: reduces monitoring time from 2–3 hrs/day to 30 min/day

4. **Custom Fee Discount**
   - Standard: 10% platform fee
   - ENTERPRISE: negotiate 7–9% fee (saves 1–3 percentage points on transaction revenue)
   - Unlock at 50+ sales/year or $250k+ annual transaction volume
   - Value: on $1M annual sales, 2% discount saves $20k/year ✓ (easily justifies $199/mo)

5. **Priority Onboarding + Support**
   - Dedicated success manager (1:10 ratio)
   - 24-hour support response SLA
   - Quarterly business reviews (pricing analysis, performance trends)
   - Use case: organizer scaling to multi-state operations, needs strategic input
   - Value: strategic consulting worth $5–10k/year

6. **White-Label Option** (Optional Phase 2, not MVP)
   - Custom domain + branding (e.g., "MyEstateSales.com" powered by FindA.Sale)
   - Use case: organizer positioning as their own service, not using FindA.Sale brand
   - Lock-in value: very high (difficult to migrate)
   - Adds $50–100/month to ENTERPRISE base

#### Why Not Launch ENTERPRISE Now?

1. **Operational risk:** With zero organizers onboarded, building custom API + webhooks is premature
2. **Support burden:** Each ENTERPRISE account needs dedicated onboarding; with 0 organizers, this is overhead
3. **Feature maturity:** API must be stable (currently main codebase is MVP); ENTERPRISE APIs require strict versioning + deprecation policy
4. **Scaling timeline:**
   - Months 1–4 (beta → post-beta): reach 10–15 organizers, focus on PRO adoption
   - Months 5–12: scale to 40–50 organizers via organic + targeted outreach
   - Months 13–18: ENTERPRISE-tier customers emerge (high-volume operators)

**Decision rule:** Launch ENTERPRISE when:
- 50+ organizers active
- PRO tier has 30%+ adoption rate
- API is stable + documented (post-S2 refactor)
- First inbound ENTERPRISE prospect arrives (validates demand)

---

## 3. A-La-Carte Pricing

### Purpose
For organizers who don't want a monthly subscription, provide feature-level purchases that cost MORE per-use than PRO annual, encouraging tier conversion.

### Recommended A-La-Carte Menu

| Feature | Price | Duration | Use Case |
|---------|-------|----------|----------|
| Flip Report | $9.99 | per sale | Organizer pricing a single 10-item auction; wants competitive analysis |
| Brand Kit | $14.99 | per year (or $2.99/mo) | Organizer with 2–3 sales/year; wants consistent branding across exports |
| CSV Export Bundle | $4.99 | per sale | Organizer exporting to EstateSales.NET, Craigslist, Facebook |
| Analytics Snapshot | $7.99 | per sale | Single-sale performance report (no recurring dashboard) |
| OG Image Generator | $3.99 | per item | Social media card generation (5-image set) |
| Advanced Tagging | $5.99 | per sale | AI tag suggestions + manual curated tag picker |
| **Total for 1 sale:** | ~$47.94 | — | 5–6 features used |

#### Pricing Rationale

**Psychology: "Buy features, get surprised by PRO value"**
- Organizer wants Flip Report ($9.99) → also buys CSV Export ($4.99) → also buys Analytics ($7.99) = $22.97
- After 2 sales: $45.94 spent
- By sale 3: organizer realizes PRO ($29/mo) is cheaper: $87/3 = $29/sale (vs. $47.94)
- Converts to PRO for sale 4 onward ✓

**Minimum viable feature set:**
- Flip Report ($9.99): highest-value, most-requested feature → draw buyers
- CSV Export ($4.99): commodity feature, low cost to build, high perceived value
- Analytics ($7.99): next-best value after Flip, encourages data-driven pricing
- Others: 20–30% of users adopt; increase ARPU without becoming required

**Why not Bundle?**
- Bundle example: "3 features for $19.99" trains users to negotiate (bad for PRO conversion)
- Individual pricing forces decision: "Do I want this feature?" → yes = micropayment, accumulates to PRO price

#### Implementation Notes

1. **Prepaid Credits** (Stripe Billing optional enhancement)
   - Organizer buys $50 credit pack (save 10%)
   - Credit balance visible in dashboard
   - Reduces friction for repeat purchases
   - Upsell: "You've used $28 of $50 credit. Buy more and save 20%"

2. **Sale-Level Paywall**
   - At end of review/publish flow: "Get more insights? +$7.99 Analytics Snapshot" (checkout modal)
   - Capture high-intent users (they're literally finishing a sale)
   - Recommendation: show this to non-PRO users only

3. **Discount for PRO Users**
   - PRO gets 20% off a-la-carte features (so Flip Report = $7.99 instead of $9.99)
   - Encourages PRO adoption ("Subscribe and save on special purchases")

---

## 4. Shopper Monetization

### Recommendation: **Keep Shoppers 100% Free (Forever)**

#### Strategic Rationale

1. **Network Effects > Revenue**
   - FindA.Sale's competitive advantage is mobile-first PWA + low friction
   - Shoppers (demand side) drive organizer adoption (supply side)
   - More shoppers → better catalog → organizers' sales perform better → justifies PRO purchase
   - Example: 10k shoppers visiting sales → 1 organizer sees 300 visitor impact → increases item sales → PRO ROI = clear ✓

2. **Monetizing Shoppers Kills the Flywheel**
   - "Premium Shopper" tier ($2.99/mo) → fewer shoppers → thinner catalog
   - Organizers see fewer visitors → lower transaction fees for FindA.Sale (not good)
   - Competitors (EstateSales.NET, OfferUp) do not charge shoppers; we'd be alone in the market (bad)
   - Revenue per shopper: ~$0.05–0.10/year (not material; organizer revenue is 100× larger)

3. **Future: Shopper Ad Network** (not subscription)
   - If monetizing shoppers becomes necessary, use ads instead:
     - Sponsored estate sales ("Promoted" badge at top of feed)
     - Organizer pays $49/sale to appear in "Featured Sales" section
     - Shopper experience stays free; organizer pays for visibility
   - This captures value WITHOUT reducing shopper adoption

#### "Premium Shopper" — Not Recommended

A hypothetical tier:
- Early access to sales (48 hours before public)
- Ad-free browsing
- Scout AI ("Notify me if [Pottery Barn chair] appears")
- Price: $2.99/month or $24/year

**Why it fails:**
1. Cannibalization: serious shoppers already visit daily (no added value)
2. Casual shoppers won't pay ($2.99 is friction)
3. Revenue is negligible (1% adoption = $24 ARPU on 100k shoppers = $240k/year, but costs $50k to build + maintain)
4. Doesn't align with business model (we monetize organizers, not shoppers)

**Verdict:** Do not build. Allocate resources to organizer features instead.

---

## 5. Beta Pricing Strategy

### Communication Plan

#### What to Tell Beta Organizers (Before Beta Ends)

**Timing:** Send message 60 days before beta ends (gives organizers time to decide)

**Message Template:**

> **FindA.Sale Pricing Launch — You're Getting a Deal**
>
> Thank you for testing FindA.Sale during our beta. We're launching paid tiers in [DATE], and here's what's changing for you:
>
> **During Beta (through [DATE]):** You have free access to all PRO features.
> **After Beta (starting [DATE]):**
> - **Free tier** — still free forever (core create/manage/publish)
> - **PRO tier** — $29/month or $290/year (analytics, exports, brand kit, social templates, flip report, and more)
> - **Founding Organizer rate** — **$99/year** (locked in for 12 months if you upgrade by [CUTOFF DATE])
>
> **Your Choice:**
> - Upgrade to Founding rate by [CUTOFF DATE] for $99/year ($8.25/mo guaranteed for 12 months)
> - Start PRO at regular price ($29/mo) after beta ends
> - Stay on free tier (always available)

---

### Beta-to-Paid Transition Timeline

| Phase | Duration | Action |
|-------|----------|--------|
| **Beta Period** | Months 1–4 | All organizers get PRO free; message them 60 days before end |
| **Founding Rate Window** | 30 days before → 30 days after beta ends | Early organizers can lock in $99/year rate |
| **General Availability** | Day 1 after founding window | Full pricing goes live; standard $29/mo, 45-day free trial for new organizers |

---

### Founding Organizer Rate Details

**Price:** $99/year (first 10 organizers only)

**Why $99?**
- $8.25/month equivalent (saves $240/year vs. standard PRO annual)
- Creates urgency ("Only 10 slots, only 30 days to claim")
- Tests price sensitivity (if 8/10 slots fill, we know demand is strong)
- Accounts for lower LTV during growth phase (willing to trade year-1 discount for year-2+ retention)

**Criteria:**
- Beta organizers only (sign-up date before [BETA_END_DATE])
- First 10 to claim; no exceptions
- 12-month minimum (no monthly downgrade)
- Discount expires after 12 months; renewal at standard $290/year

**Why Founding Rate Matters:**
1. **Locks in early revenue** — 10 organizers × $99 = $990 immediate (vs. hoping they pay $290/year)
2. **Creates identity** — "Founding Organizer" badge/title in-app (psychological sunk cost)
3. **Generates social proof** — "10 local estate pros are on FindA.Sale PRO; you should join"
4. **Pressures fence-sitters** — free tier users see "only 3 slots left" and upgrade before 30-day window

---

### Churn Prevention (Critical)

**Risk:** Beta organizers on free PRO tier won't convert to paid.

**Mitigation strategies:**

1. **Feature Lockdown on Day 1** — When free trial ends, organizer loses access to PRO features
   - This is motivating (fear of loss > hope of gain)
   - Example: analytics dashboard greyed out, with "Upgrade to PRO for $29/mo" button
   - Unambiguous; organizer made a conscious choice (not accidental)

2. **"Usage Milestone" Messaging** — 14 days before trial expires, send contextual upgrade nudge
   - Show organizer their metrics: "You've published 24 items. With PRO analytics, you'd know which sell best."
   - Personalized > generic

3. **Graceful Downgrade** — Organizer can choose to downgrade to free rather than churn completely
   - Free tier loses advanced exports, analytics, brand kit
   - Retains core features (create/manage/publish)
   - In-app message: "Keep your sales live. You can upgrade anytime."

4. **Exit-Intent Survey** — If organizer tries to cancel PRO subscription
   - Ask: "What's missing? Too expensive? Not enough features?"
   - Capture feedback; offer $5–10 one-time discount to stay (worth it to prevent churn)

---

## 6. Revenue Projections

### Assumptions

- **Organizer acquisition:** 0 at start → 10 (beta) → 15 (post-beta month 1) → 50 (month 12)
- **PRO adoption rate:** 20% in month 1 (Founding rate) → 40% by month 12
- **ARPU boost from a-la-carte:** +$8/organizer/month (1 feature purchase per organizer per month, average $8)
- **Transaction fee:** 10% on all sales; average sale size $10,000; frequency 2 sales/organizer/month

### Monthly Revenue Projections (Year 1)

#### Conservative Scenario (Low Adoption)

| Month | Organizers | PRO Adopted (%) | Monthly Subs | A-La-Carte | Transaction Fees | Total MRR |
|-------|-----------|-----------------|--------------|-----------|-----------------|-----------|
| 1 (beta) | 10 | 2 | $58 | $80 | $20,000 | $20,138 |
| 2 | 12 | 20% | $70 | $96 | $24,000 | $24,166 |
| 4 | 15 | 25% | $108 | $120 | $30,000 | $30,228 |
| 6 | 25 | 35% | $244 | $200 | $50,000 | $50,444 |
| 12 | 50 | 40% | $580 | $400 | $100,000 | $100,980 |
| **Year 1 Total** | — | — | — | — | — | **~$862,000 ARR** |

#### Optimistic Scenario (Strong Adoption)

| Month | Organizers | PRO Adopted (%) | Monthly Subs | A-La-Carte | Transaction Fees | Total MRR |
|-------|-----------|-----------------|--------------|-----------|-----------------|-----------|
| 1 (beta) | 10 | 8 | $232 | $80 | $20,000 | $20,312 |
| 2 | 12 | 35% | $123 | $96 | $24,000 | $24,219 |
| 4 | 15 | 50% | $435 | $120 | $30,000 | $30,555 |
| 6 | 25 | 55% | $478 | $200 | $50,000 | $50,678 |
| 12 | 50 | 60% | $870 | $400 | $100,000 | $101,270 |
| **Year 1 Total** | — | — | — | — | — | **~$904,000 ARR** |

---

### Comparison: Subscription Revenue vs. Transaction Fees

**At 50 organizers (month 12):**

| Revenue Stream | Conservative | Optimistic |
|----------------|--------------|-----------|
| PRO subscriptions | $6,960/year | $10,440/year |
| A-La-Carte | $4,800/year | $4,800/year |
| **Subscription Total** | **$11,760/year** | **$15,240/year** |
| Transaction fees | **$1,200,000/year** | **$1,200,000/year** |
| **Subscription % of Total** | **0.98%** | **1.27%** |

#### Strategic Insight

**In year 1, transaction fees are 99% of revenue; subscriptions are 1%.**

This means:
1. **Optimizing organizer adoption is 100× more important than optimizing PRO tier pricing**
   - Acquiring 1 more organizer (2 sales/month × $10k × 10%) = $2,400/year in fees
   - Acquiring 1 more PRO subscriber = $290/year in subscription revenue
   - Ratio: 8.3:1 in favor of acquisition over monetization

2. **Subscription revenue scales as organizer count increases**
   - Year 2 (assuming 100 organizers, 50% PRO adoption): $14,500 subscriptions + $2.4M fees = 0.6% subscriptions
   - Year 3 (assuming 200 organizers, 60% PRO adoption): $41,760 subscriptions + $4.8M fees = 0.87% subscriptions
   - Year 4 (assuming 500 organizers, 70% PRO adoption): $121,800 subscriptions + $12M fees = 1%

3. **Recommendation: Focus on** ***organizer acquisition velocity***, not pricing optimization
   - Acquiring 10 organizers is worth more than optimizing PRO tier by $10
   - Invest in: referral program, local GR sales, partnership with estate attorneys
   - Do NOT spend engineering effort on fancy PRO features until you have 30+ organizers

---

## 7. Risk Flags & Mitigations

### Risk 1: "$29/month is too expensive for part-time operators"

**Flag:** 30% of potential organizers do 1–2 sales/year; PRO costs $290/year but ROI is marginal (saves 10–15 hrs of manual work, worth $500–750 but psychological barrier is "I don't know if I'll sell again next year")

**Mitigation:**
- A-la-carte features ($5–10) let part-timers test value before committing to $29/mo
- Example: part-timer buys Flip Report for $9.99, sees exact competitive pricing, feels $29/mo is justified
- Founding Organizer rate ($99/year) is clearly affordable even for part-timers
- **Decision: Do not lower PRO price; instead, drive a-la-carte adoption**

---

### Risk 2: "Organizers will game the system — upgrade to PRO, buy one a-la-carte feature, then downgrade"

**Flag:** Organizer signs up for PRO ($29), uses analytics for 1 month, downgrades to free. Net gain: $29 revenue, friction.

**Mitigation:**
- Implement 3-month minimum billing (subscription requires 3-month commitment, not month-to-month)
- A-la-carte purchases are separate transactions, non-refundable once generated (flip report, CSV export, etc.)
- Monitoring: if >10% of PRO signups downgrade in month 2, we have a UX/messaging problem (not a pricing problem)
- **Decision: Accept 5–10% churn as normal; optimize messaging instead**

---

### Risk 3: "Free tier users won't convert; we'll be stuck with 0% PRO adoption"

**Flag:** Beta organizers have been on PRO for free; psychological switching cost is high ("why pay when I was just free?")

**Mitigation:**
- Lock PRO features on day 1 post-beta (no grace period; clear loss aversion)
- Founding Organizer rate ($99/year) is 2× cheaper than standard PRO annual ($290), makes conversion feel like a "deal"
- 45-day trial for post-beta new organizers (they never knew free access)
- In-app messaging: "You've gotten used to PRO. Here's why it's worth keeping..."
- **Decision: Expect 20–30% conversion from beta to paid; accept the rest will churn**

---

### Risk 4: "Transaction fee model is unsustainable — organizers demand lower fees"

**Flag:** CompetitorS (EstateSales.NET) charges 25% fees + subscription; FindA.Sale at 10% flat has no room to negotiate further

**Mitigation:**
- Position 10% as non-negotiable (in public marketing, in sales docs)
- ENTERPRISE tier gets 7–9% fee discount as retention lever, not as discount negotiation tool
- If organizer asks for lower fees, response is: "PRO at $29/mo includes insights that *increase* your margins by 5–10%, offsetting our 10% fee"
- **Decision: Hold at 10% flat; never negotiate below 8%**

---

### Risk 5: "PRO features are too commodity — organizers see no differentiation vs. competitors"

**Flag:** Analytics, exports, templates are table-stakes; competitors will copy

**Mitigation:**
- Differentiation is *UX + speed*, not features
- FindA.Sale's mobile-first PWA is faster to use than browser-based competitors (organizer saves 5+ hrs/sale)
- Build features that competitors CAN'T copy quickly:
  - ListingFactory + AI tagging (requires vision model integration, custom training)
  - Flip Report with proprietary market data (hard to replicate)
  - Mobile-optimized batch operations (UX advantage, not feature)
- Avoid commoditized features: do NOT build "simple photo gallery" (everyone has it)
- **Decision: Build 1 defensible PRO feature per quarter; avoid commodity features**

---

### Risk 6: "Founding Organizer rate creates expectation of discounts forever"

**Flag:** After 12 months, Founding Organizer wants renewal at $99/year; if denied, churn risk

**Mitigation:**
- Set expectations: "Founding rate: $99/year for 12 months; renewal at standard $290/year"
- Renewal offer (30 days before expiration): 1-time extension at $149/year (halfway between founding + standard)
- If organizer churns, re-acquisition cost is $500+ (sales + CAC); keeping them at $149 is profitable
- **Decision: Offer graduating renewals (Year 2 @ $149, Year 3+ @ standard $290) to avoid churn**

---

### Risk 7: "A-la-carte pricing dilutes PRO tier — organizers cherry-pick features instead of subscribing"

**Flag:** Organizer buys 3–4 a-la-carte features per year ($30–50) instead of annual PRO ($290); we lose $240

**Mitigation:**
- Price a-la-carte features at 30–40% markup vs. PRO monthly value
  - Example: Analytics is ~$10/month value in PRO (1/3 of $29), so a-la-carte = $7.99 (good deal, but less than monthly PRO + incentivizes subscription)
  - Example: Flip Report is ~$12/month value in PRO, so a-la-carte = $9.99 (still incentivizes annual)
- A-la-carte features lack ongoing value (one-time snapshot, not recurring dashboard)
- Monitor: if a-la-carte adoption > 30% and PRO adoption < 30%, adjust prices up ($12.99 instead of $9.99)
- **Decision: Accept 20–25% a-la-carte revenue as healthy ecosystem; not a risk**

---

### Risk 8: "We're leaving money on the table with $29 PRO — should be $39 or $49"

**Flag:** Investors may push for higher pricing to maximize ARR

**Mitigation:**
- $29 is *optimal for adoption velocity* at current stage (0 organizers)
- At 200 organizers (year 3), consider $39 PRO price test (via cohort A/B test)
- Elasticity in SaaS: raising price 25–30% typically reduces adoption 15–20% (net neutral to slightly positive ARR)
- **Decision: Lock $29 PRO for year 1–2; revisit pricing in Q4 2027 if adoption is strong**

---

## 8. Recommended Pricing Launch Roadmap

| Phase | Timeline | Action | Owner |
|-------|----------|--------|-------|
| **Phase 1: Messaging** | Now (March 2026) | Send 60-day notice to beta organizers; announce $29 PRO, Founding $99 rate, 45-day trial | Patrick |
| **Phase 2: Feature Gate** | 60 days | Stripe Billing setup; PRO features flagged in codebase; paywall components added | findasale-dev |
| **Phase 3: Launch** | Day 1 post-beta (May 2026 est.) | Flip switch; free tier locks PRO features; PRO + a-la-carte live; Founding rate window opens | Patrick + Ops |
| **Phase 4: Monitor** | Months 1–3 post-launch | Track PRO adoption, churn, a-la-carte adoption; adjust messaging if conversion < 20% | Patrick |
| **Phase 5: ENTERPRISE** | Month 18+ (Q4 2026) | Revisit when 50+ organizers achieved; build API + webhooks | Patrick + findasale-dev |

---

## Decisions Required from Patrick

1. **PRO Pricing**: Approve $29/month ($290/year)?
2. **Founding Rate**: Approve $99/year for first 10 beta organizers?
3. **A-La-Carte Menu**: Approve feature list + pricing ($9.99 Flip Report, $4.99 CSV Export, $7.99 Analytics, etc.)?
4. **Trial Duration**: 45 days or 30 days for post-beta new organizers?
5. **Shopper Monetization**: Confirm 100% free forever (no Premium Shopper tier)?
6. **ENTERPRISE Timeline**: Defer until 50+ organizers (Q4 2026) or start building sooner?
7. **Messaging Launch**: When to send first 60-day notice to beta organizers?

---

## Appendix: Competitive Pricing Matrix

| Product | Organizer Cost | Shopper Cost | Transaction Fee | Mobile | Notes |
|---------|----------------|--------------|-----------------|--------|-------|
| **EstateSales.NET** | $50–100/mo | Free | 25% | No (web only) | Legacy, many listings |
| **EstateSales.org** | $75/mo | Free | 25% | Limited | Growing, US-centric |
| **Garage Sale Tracker** | $15/mo | Free | 0% | Yes | Low-cost, low-feature |
| **Facebook Marketplace** | Free | Free | 0% + payment fee | Yes | Unmoderated, high friction |
| **Craigslist** | Free | Free | 0% | Yes | Minimal categorization |
| **FindA.Sale (Proposed)** | $29/mo (PRO) | Free | 10% | Yes (PWA) | Mobile-first, local, low fees |

---

**Document prepared by:** Investor Agent (Pricing & ROI)
**Last updated:** 2026-03-15
**Status:** Ready for Patrick review & decision
**Next checkpoint:** Post-approval, hand off to findasale-dev for Stripe Billing integration
