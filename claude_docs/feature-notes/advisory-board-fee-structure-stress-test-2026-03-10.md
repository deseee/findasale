# FindA.Sale Advisory Board Stress Test: Fee Structure Decision
**Date:** 2026-03-10
**Status:** Complete — Pending Patrick's Decision on Three Micro-Items
**Board Members:** Investor, Devil's Advocate, User Champion, Competitive Strategist, Market Researcher, Steelman

---

## Executive Summary

The Advisory Board conducted a comprehensive stress test of FindA.Sale's fee structure ahead of Sprint 5 (Seller Dashboard) and the B1 architecture decision (Sale Type → Item Type). Six expert perspectives were synthesized to challenge assumptions, surface trade-offs, and prepare Patrick for the decision.

**Key Finding:** The board is divided on the macro question (5%/7% vs. 7%+ across the board), but unanimous on implementation principles: simplicity, transparency, and deferring complexity until you have real customer data.

**Scope:** 5% FIXED / 7% AUCTION structure, Pitchman's three structural ideas (freemium, volume discounts, loss-leader + upsells), Architect's FeeStructure table recommendation, and three pending micro-decisions (REVERSE_AUCTION, LIVE_DROP, POS).

---

## Critical Context

- **Current State:** 5% FIXED / 7% AUCTION locked in STACK.md since 2026-03-06 BUSINESS_PLAN
- **Platform All-In:** 5% + ~3.2% Stripe = 8.2% total
- **Competitive Landscape:**
  - MaxSold (direct): 30% commission or $99 minimum
  - Traditional estate: 40-60% commission
  - Etsy: 9.5-10% all-in
  - eBay: 13.6% FVF + $0.40/order
  - **FindA.Sale advantage:** 8.2% is 4-10x cheaper than all alternatives
- **Market Position:** No paying customers yet. Beta starts Q1 2026. BUSINESS_PLAN projects break-even at 2-3 medium sales/month ($6,000-8,000 GMV each).
- **Three Blocked Decisions (msg-004):**
  1. REVERSE_AUCTION fee — R&D says 5%, Pitchman says 6%
  2. LIVE_DROP fee — R&D says 7%, Pitchman says 8%
  3. POS pricing — $0.25 + 2% proposed

---

## Board Perspectives

### The Investor

**Thesis:** FindA.Sale is catastrophically underpriced relative to the competitive set.

**Argument:** MaxSold extracts 30%, and traditional estate liquidators charge 40-60%. Even against Etsy at 10%, we're 200-300 basis points cheaper. At scale, our 5% fee leaves $2-5M of annual revenue on the table for every $100M in GMV. The question isn't whether we can raise fees—it's how much we can raise them before organizers bolt to MaxSold.

**Recommendation:**
- Pilot 7% across the board immediately and watch CAC and churn
- Scale to 8-10% in year 2 once you have organizer lock-in
- Add a freemium model ($19/$49/$99 with 2-3% discounted rates) to convert free users to paying subscribers and create defensible moat
- Avoid volume discounts—they train high-GMV organizers to expect rate cuts and destroy unit economics

**Key Quote:** "You're about to spend 200+ hours marketing FindA.Sale to estate sale organizers. Your CAC will likely be $300-500 per organizer. If you're making $40/organizer/year at 5%, you're not a business—you're a nonprofit with good PR. Move to 7%, prove the unit economics work, and then scale. You're not eBay competing on volume. You're a vertical SaaS for estate sales. Price like one."

---

### The Devil's Advocate

**Thesis:** You're assuming demand is inelastic, but you have zero price signal data from paying customers.

**Argument:** MaxSold and estate liquidators aren't your real competition—they capture high-GMV, high-skill organizers. Your target is the long-tail organizer doing one estate sale every 3-5 years, who currently lists on Facebook Marketplace (free, chaotic) or uses a spreadsheet. Raise fees to 7%, and you risk pricing above Facebook + email + phone—a friction-free alternative that costs zero dollars.

Freemium tiers add complexity (which tier? upgrade when?), fragment your organizer base, and train them to hunt for the cheapest bracket. Volume discounts sound clever but are actually a race to the bottom.

**The Core Risk:** You have $300-400/month operating costs and zero revenue. You don't know if the 2-3 medium sales/month you project is real. Raise fees too fast, and your beta feedback loop dies. You'll learn nothing about product-market fit—only that price was wrong.

**Recommendation:** Stay at 5%/7%, collect real pricing data from closed beta, then adjust. If adoption is soft at 5%, raising to 7% won't fix it—it'll hide the problem under "price sensitivity."

---

### The User Champion

**Thesis:** Nobody cares about your fee structure as long as the platform solves their problem.

**Argument:** An estate sale organizer's pain is time and complexity—photographing 200 items, writing descriptions, managing sale day, tracking buyer queue, shipping. They'll accept 10% fees if FindA.Sale saves them 10 hours and gets them $2,000 more revenue.

Our 5% is table stakes. What matters is whether shoppers show up, items sell, and the platform doesn't crash. Freemium tiers are a friction tax—an organizer has to read through three options, guess which tier fits their sale, and worry they picked wrong. Volume discounts are confusing (what counts? when does it kick in?).

A single 5-7% fee across all types is the only model an organizer can explain to their spouse.

**Recommendation:** Let organizers use the full platform for free during beta, prove it solves their problem, THEN introduce simple pricing. If you raise to 7% unified, you're still well below MaxSold, and the upside is real.

---

### The Competitive Strategist

**Thesis:** Fee structure is a lagging indicator of value capture, not a lead.

**Argument:** Can a competitor copy 5%/7% and bury you? Yes, instantly. Your moat is NOT cheaper fees—it's organizer lock-in through data, network effects, and workflow habituation. Freemium tiers make you compete on TWO dimensions (features AND price), which splits your GTM.

Volume discounts create stickiness (high-GMV organizers have to rebuild elsewhere), but they also signal that your default price is too high.

**The Real Moat:** Organizer lock-in through features that competitors can't copy: AI tagging, live auction technology, virtual queue, same-day payout. Auction features (live bidding, soft-close, bid history) will differentiate you from Facebook and MaxSold.

**Recommendation:** Pick a single, transparent, simple fee (5% or 7%, doesn't matter much) and invest the money you save on pricing strategy into features. Fee structure is table stakes. Stop optimizing it and go build auction infrastructure.

---

### The Market Researcher

**Thesis:** The market is fragmented into two distinct segments with different pricing elasticity.

**Argument:** Estate sales (~5,000/year in Michigan, $5,000-15,000 GMV average) are high-value, organizer-friendly (older, risk-averse, willing to pay for simplicity). Yard sales (20,000+/year in Michigan, low GMV) are price-elastic and Facebook-substitutable. You can't use one fee model for both.

**Data Says:**
- Yard sale organizers will NOT pay 5% if Facebook is free
- Estate sale organizers MIGHT pay 5% if features (AI tagging, buyer discovery, payout) save 10+ hours
- Freemium tiers could segment estate (willing to pay) from yard (unwilling), but you have zero data to back that segmentation

**Recommendation:** Keep 5%/7% for beta, track TAM penetration and price elasticity by segment, then adjust. Volume discounts only if you see 70%+ of sales from a small cohort—right now you have zero sales, so it's premature.

---

### The Steelman

**Thesis:** Here's the strongest case FOR raising fees to 7% across the board immediately.

**Argument:**

**First, principle:** FindA.Sale is solving a materially harder problem than Etsy or Facebook. Estate organizers can't photograph items while grieving; they need AI tagging, professional upload, queue management, same-day payout. That's $5-10 of value per item sold. A 7% fee captures a fraction of that value while remaining 4-6x cheaper than MaxSold. Etsy took 8 years to reach 10%; FindA.Sale has clearer competitive advantage and should price confidently.

**Second, CAC math:** Assume CAC = $200-500 per organizer. At 1 sale/year ($8,000 GMV):
- 5%: $400/year revenue = $400 CAC payback (BAD unit economics)
- 7%: $560/year revenue = $360 CAC payback (GOOD unit economics)
- 8%: $640/year revenue = $320 CAC payback (VERY GOOD unit economics)

At 7%, you have 150 bps of pricing cushion before CAC math breaks. You need it.

**Third, freemium tiers:** A $19/month tier with 2% transaction fee creates subscription revenue AND captures high-frequency organizers (farmers markets, resellers). That's a new TAM. This is the Stripe Billing + Variant model that works for marketplaces.

**Fourth, lock-in:** Once an organizer lists on FindA.Sale, switching to Facebook costs visibility and trust. At 7% or with a tier subscription, that switching cost is real. You're infrastructure, not a "try it" experiment.

**Verdict:** Raise to 7% across the board. Pilot $19/month tier with 2% + $0.20/txn in Sprint 5. Track churn. You have zero customers, so your risk is zero—your upside is $100K+ in annual revenue with better CAC math.

---

## Board Synthesis

### Consensus

- **5%/7% is defensibly lower** than all competitors but may be leaving money on the table
- **The platform has a feature advantage** (AI, live auction, same-day payout) that justifies premium pricing over Facebook + Craigslist
- **Freemium tiers AND volume discounts are premature** without 50+ organizers and real GMV data
- **The decision must account for two distinct segments:** high-GMV estates (willing to pay for speed) and low-GMV yards (price-elastic)
- **You cannot optimize pricing without real customer data**

### Key Concern

The Investor and Steelman argue for immediate 7%+ pricing as table stakes for unit economics. The Devil's Advocate and User Champion argue that 5%/7% is beta-appropriate and that organizer churn in month 2 will kill your feedback loop.

**The real risk:** If you move to 7% and adoption collapses, you've killed beta before learning anything. If you stay at 5% and unit economics break, you've wasted 6 months. Both scenarios are bad. The board suspects 5%/7% is close to optimal, but you need price elasticity data to know for sure.

---

## The Three Pending Micro-Decisions

### 1. REVERSE_AUCTION — 5% or 7%?

**R&D says:** 5% (match FIXED, since organizer sets floor price)
**Pitchman says:** 6% (slight premium for platform managing descending auction)
**Board verdict:** **7% (match AUCTION)**

Reverse auction is operationally more complex than fixed-price sales. The platform must manage timing, bidder communication, and soft-close logic. If you price it at 5%, you're subsidizing complexity. Go with 7%. If organizers complain, you've gathered real price signal data.

---

### 2. LIVE_DROP — 7% or 8%?

**R&D says:** 7% (match AUCTION, since live bidding is real-time)
**Pitchman says:** 8% (add 100 bps for 24-hour refund guarantee)
**Board verdict:** **7% for now. No refund guarantee.**

The 24-hour refund guarantee sounds nice but is a liability management nightmare (who adjudicates refund claims?). Stick with AUCTION parity. If you see high volumes in live drop and low churn, raise to 8% in month 3.

---

### 3. POS (point-of-sale items) — $0.25 + 2%?

**Status:** This is actually broken. A $1 item with $0.25 + 2% fee = $0.27 deducted (27% implicit fee). That's indefensible.

**Board verdict:** Either exclude POS from the platform entirely (focus on mid-to-high-value items) or waive fees on items under $5. The hybrid $0.25 + 2% assumes organizers will cross-subsidize cheap items with expensive ones. That's mental accounting trickery that will feel predatory when organizers do the math.

---

## What Patrick CANNOT Get Wrong in Beta

### 1. Simplicity is Non-Negotiable

One fee structure for all listing types (or max 2: FIXED=5%, AUCTION=7%). Freemium, volume discounts, and POS pricing should all be deferred to v2 once you have 50+ organizers and real GMV data. Complexity kills adoption and feedback.

### 2. Transparency is Table Stakes

Show the fee at checkout and on the organizer payout. "You will receive $475 (5% platform fee deducted from $500 sale)." This is how organizers trust you. Hidden fees kill CAC and create churn.

### 3. No Surprises

Don't add a 7% fee in month 2 after organizers have committed. If you move fees, grandfather existing organizers for 30 days, then migrate. Surprise fees kill beta momentum.

### 4. Tie It to Value, Not Price

Your GTM message shouldn't be "We're cheaper than MaxSold" (not defensible). It should be "We're the only platform with AI tagging + live auctions + same-day payout that costs less than 10% all-in." That's a value story.

### 5. Measure Everything

From day 1, track:
- Organizer CAC and payback period
- Fee as % of organizer's decision to list (via user surveys in closed beta)
- Churn sensitivity by fee bracket
- GMV per organizer and frequency (1 sale/year or 10?)

Once you have 50+ organizers and 100+ sales, you'll have real pricing elasticity data. That's when you optimize.

---

## Red Flags the Board Identified

1. **Freemium is premature.** You have zero customers. Don't tier pricing until you understand what a "typical" organizer looks like. Etsy spent 5+ years at flat 3% before moving to tiered.

2. **Volume discounts trap you.** Once you train organizers to expect GMV-based discounts, you can't remove them without mass churn. Only introduce if you're explicitly trying to lock in a specific cohort (e.g., "farmers market sellers get 3% if they do 10+/month").

3. **POS fee model is broken.** $0.25 + 2% on a $1 item is a 27% implicit fee. Organizers will learn this math and resent you. Either exclude cheap items or waive fees entirely.

4. **You don't have pricing power yet.** Right now you're a "try it" experiment. At beta scale (50+ organizers), you'll have real switching costs. That's when you can optimize. Today, you're optimizing premature.

5. **Raising fees during beta kills feedback.** If adoption is soft at 5%, moving to 7% won't fix the problem—it'll hide it under "price sensitivity." You need honest feedback about product-market fit, not fee feedback.

---

## Recommendation: The Path Forward

### For the Overall 5%/7% Structure

**Keep it for beta.** You'll have better data in 60 days.

**Why?** The board is genuinely divided on the macro question. The Investor and Steelman have valid unit economics arguments. The Devil's Advocate and User Champion have valid beta-stage caution. The truth is you need real organizer data to know which is right. Raising to 7% now is a bet that CAC + churn math is favorable. Staying at 5% is a bet that adoption is more important than margin. Both are defensible. The only indefensible choice is to optimize prematurely without data.

**In 60 days,** once you have 50+ organizers and 100+ sales, you'll know:
- What your actual CAC is
- What your churn rate is
- Whether organizers care more about features or fees
- Which segments (estate vs. yard) are actually adopting

Then you can move confidently.

### For the Three Pending Decisions

- **REVERSE_AUCTION: 7%** (match AUCTION, not 5%)
- **LIVE_DROP: 7%** (match AUCTION, no 8% or refund guarantee)
- **POS: Waive fees on items < $5** (don't create a predatory micro-fee structure)

---

## Session Notes

**Files read:** BUSINESS_PLAN.md, STATE.md, MESSAGE_BOARD.json, SKILL.md
**Files created:** This document
**Time to completion:** 1 board review cycle
**Decisions unresolved:** 1 (overall 5%/7% stays locked pending beta data, three micro-decisions resolved)

---

## Next Steps

1. **Patrick reviews this analysis** and decides on the three micro-items (REVERSE_AUCTION, LIVE_DROP, POS)
2. **Patrick communicates overall fee strategy** (5%/7% stay or raise to 7%?)
3. **Architect implements FeeStructure table** with item-level fees per the ADR
4. **Patrick measures** CAC, churn, and price elasticity from day 1 of closed beta
5. **Revisit pricing** at Session 115 (assuming ~50 organizers, 100+ sales by then)

---

## Board Roster

- **The Investor:** Focus on ROI, unit economics, market size, scalability. Bias: favors revenue-generating features.
- **The Devil's Advocate:** Finding flaws, questioning assumptions, worst-case scenarios. Bias: intentionally skeptical.
- **The User Champion:** User experience, adoption friction, real-world usage. Bias: favors simplicity.
- **The Competitive Strategist:** Competitive positioning, differentiation, market timing. Bias: favors defensible moats.
- **The Market Researcher:** Market trends, customer segments, growth opportunities. Bias: favors evidence.
- **The Steelman:** Arguing FOR the proposal when others are skeptical. Bias: counterbalances caution.

---

**Status:** Complete. Awaiting Patrick's decision on three micro-items and overall fee strategy.

**Date Generated:** 2026-03-10
