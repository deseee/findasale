# FindA.Sale Advisory Board Analysis
## ADR-065: Pricing Tier Structure & Go-to-Market Strategy

**Date:** 2026-03-16
**Convened:** Go-to-Market Subcommittee + Risk Subcommittee
**Status:** Analysis Complete — Awaiting Patrick Decision
**Decision Authority:** Patrick (CEO)

---

## Executive Summary

The proposed tier framework (SIMPLE/PRO/ENTERPRISE + 10% transaction fee) is **directionally sound but requires refinement** before announcing to beta organizers. Two critical items must be addressed immediately:

1. **SIMPLE feature audit** — Intentional friction needed to drive PRO conversion.
2. **Beta-to-paid transition strategy** — Current 5 organizers must feel valued, not abandoned.

Additionally, three strategic bets require Patrick's explicit decision:
- Founding Organizer program (lock in early adopters at $19/month)
- Rename ENTERPRISE → Teams (audience mismatch)
- Revenue model rebalancing (subscription % vs. transaction fee %)

---

## Context

**Current State:**
- Zero paying customers (5 beta organizers on free tier)
- Proposed pricing: SIMPLE (free), PRO ($30-60/month), ENTERPRISE ($150+/month)
- 10% transaction fee applies across all tiers
- Competitive benchmark: EstateSales.NET ($50-100/month + 25% transaction fee)

**Question:** Will this pricing work in market? What are the existential risks?

---

## GO-TO-MARKET SUBCOMMITTEE ANALYSIS

### 1. Market Positioning Review

**Finding: Tier naming mismatches the audience.**

"ENTERPRISE" signals multi-team infrastructure, custom integrations, dedicated support, and SLAs. Estate sale organizers are small, owner-operated businesses or solopreneurs. This naming will confuse them or signal you're over-engineered for their needs.

**Recommendation:**
- **SIMPLE** → "**Essential**" (starter vibe, professional tone)
- **PRO** → "**Pro**" (clear upgrade, understood meaning)
- **ENTERPRISE** → "**Teams**" or skip entirely (speak to actual need: multi-user, multi-sale management)

Alternative (full rebrand, riskier): "Starter," "Scale," "Manage" — but risks obscuring value proposition.

**Why it matters:** Tier naming influences upgrade perception. A misnamed tier signals the wrong value story.

---

### 2. Conversion Funnel Critique

**Finding: Funnel is underdeveloped without dedicated sales team.**

You're relying on product-led growth (PLG). Success requires **intentional friction** in SIMPLE to drive upgrade motivation.

**Current risk:** If SIMPLE includes bulk category changes, batch pricing, exports, and multi-sale management, there's **zero friction** to upgrade. You'll see <1% free-to-paid conversion.

**Recommendation: Audit SIMPLE feature list.**

For each feature, ask: "Does this feature delay an organizer reaching a scale where they need PRO?"

**Features that should move to PRO:**
- Bulk category changes (limits SIMPLE to 1 item/action)
- Batch pricing operations (limits to manual item-by-item)
- CSV/PDF exports (no data export in SIMPLE)
- Multi-sale management (limit to 1 concurrent sale, or 3 max)
- Bulk photo operations (limit to manual upload)
- Performance reporting (dashboards PRO-only; basic counts only in SIMPLE)

**Features that should stay in SIMPLE:**
- Single sale creation & listing
- Item photos & descriptions
- Basic holds/reminders
- Mobile access
- Category selection (5-10 core categories)
- Price input

**Realistic conversion rate:** 3-5% of free users → paid (if friction is intentional). Without friction, <1%.

**When friction becomes clear:** An organizer has 50 items and needs to reprice furniture by +15%. They hit the "10-item bulk op limit" and convert to PRO in frustration. That's by design.

---

### 3. Competitive Pricing Review

**Finding: Pricing is competitive, but "aha feature" is undefined.**

EstateSales.NET: $50-100/month + 25% transaction fee.
FindA.Sale PRO: $30-60/month + 10% transaction fee.

**On paper, you win on fees.** In practice, you have two problems:

1. **Switching cost is LOW.** Organizers using EstateSales.NET have years of data, muscle memory, and customer lists. Unless you're *significantly* better, $30-60/month won't move them.

2. **"Aha feature" is missing.** You need one PRO feature that's so useful organizers will *pay* to avoid losing it. Current candidates:
   - **Flip Report** (real estate comp data): high perceived value, hard to DIY, defensible pricing
   - **Batch pricing + bulk category ops:** solves the 50-item reprice problem
   - **Performance dashboard:** new angle, potential moat (EstateSales.NET doesn't highlight it)

**Recommendation:** Frontload PRO with **Flip Report** as centerpiece. Make it the upgrade story: "Turn your unsold inventory into investment comps." That's defensible, proprietary value.

---

### 4. Beta-to-Paid Transition Strategy

**Finding: Bait-and-switch risk is HIGH if mishandled.**

Current 5 beta organizers used features *for free*. If you announce paid tiers at beta conclusion without acknowledgment, they'll feel abandoned and resent the paywall.

**Recommendation:**

1. **Today:** Publish a roadmap document (share with 5 beta organizers).
   - Message: "Pricing coming in April. Here's what we're planning."
   - Set expectations. No surprises later.

2. **At paid launch:** Offer a **Founding Organizer** rate (see below).
   - Current 5 beta organizers auto-qualify.
   - Get 6 months free on the Founding rate as thank-you.

3. **Messaging:** "You helped build this. Here's our thank-you. Lock in this rate forever."

This removes the sting and turns early adopters into advocates (free trial → paid commitment with lifetime lock-in).

---

### 5. Founding Organizer Program Design

**Recommendation:**

- **Rate:** $19/month for Pro (locked forever, even if price rises to $60)
- **Limit:** First 25 organizers
- **Commitment:** 1-year contract (reduces churn risk; you get predictable year-1 revenue)
- **Eligibility:** Open 30 days post-launch; then tier closes, new organizers pay standard Pro pricing
- **Marketing angle:** "Join the Founding 25. Lock in $19/month forever—even if Pro pricing rises."

**Why this works:**

1. **Beta organizers don't feel betrayed.** They're rewarded for early adoption.
2. **Commitment reduces churn.** 1-year lock = predictable $5,700 year-1 revenue (25 × $19 × 12).
3. **Artificial scarcity drives adoption.** "Only 5 founding slots left!" creates urgency.
4. **Case studies + word-of-mouth.** 25 committed organizers become evangelists.

**Cost:** ~$5,700 in foregone year-1 revenue (vs. full pricing). You'll regain it in retention + referrals.

---

### 6. À la Carte as Acquisition Funnel

**Finding: À la carte pricing confuses buyers and usually underperforms.**

Theory: Buy "Flip Report for $10" → experience value → subscribe to Pro.
Reality: Organizers don't know what they need. Buying features à la carte *feels* expensive ("I spent $20 already?") compared to a $30/month subscription. And friction increases: each feature = separate transaction + payment flow.

**Recommendation:**

- **Instead of à la carte:** Offer **7-day free Pro trial** (no card required, auto-downgrade after 7 days).
- **If you MUST do à la carte:** Limit to **Flip Report only** ($9.99 one-time per sale). Everything else subscription-locked.

Do not fragment the offer. Confusion kills conversion.

---

### Go-to-Market Summary

| Item | Recommendation |
|------|-----------------|
| **Naming** | Essential / Pro / Teams (not Enterprise) |
| **SIMPLE friction** | Limit to 1–3 concurrent sales, 10-item bulk ops, no exports |
| **Aha feature** | Lead with Flip Report in Pro |
| **Beta transition** | Founding 25 program: $19/month locked forever |
| **À la carte** | Only Flip Report ($9.99); everything else subscription |

---

## RISK SUBCOMMITTEE ANALYSIS

### 1. Cannibalization Risk

**Severity: HIGH**

If SIMPLE is too generous, you'll capture price-sensitive organizers who *want* to upgrade but don't feel the need. Free users are not future paying users unless you design friction strategically.

**Risk:** 60%+ of signups remain on SIMPLE indefinitely, driving monthly costs (hosting, support) without revenue.

**Mitigation:**
- Audit SIMPLE feature list (see GTM section above).
- Features that delay growth needs → move to PRO.
- Test with 5 beta organizers: "Would you upgrade at $45/month if SIMPLE can't do X?"

---

### 2. Transaction Fee + Subscription Double-Dipping

**Severity: HIGH (psychological)**

You're asking for *both* a monthly fee AND 10% of every sale. EstateSales.NET charges 25% flat (no monthly), so the math looks good:

- EstateSales.NET: 25% fee
- FindA.Sale Pro: $30-60/month + 10% fee

But organizers *feel* double-charged. A $10K sale organizer pays $1K in FindA.Sale fees (subscription + transaction). That's acceptable *only if the product is demonstrably worth $1K.*

**Risk:** Organizers resent both charges and churn in year 1, especially if they're not seeing ROI from PRO features.

**Mitigation:**

1. **Communicate total cost upfront.** "Pro is $30-60/month + 10% of your online sales." Don't hide the fee in fine print.

2. **Tie every fee to value delivered:**
   - Flip Report → "Identify underpriced items, increase margins"
   - Batch ops → "Save 2 hours per sale"
   - Performance dashboard → "Find profit leaks, optimize pricing"

3. **Consider a fee cap or trade-off:**
   - For organizers doing >$50K in online sales: offer choice:
     - $60/month flat (no transaction fee) OR
     - $30/month + 10% transaction fee
   - Let them pick. High-volume organizers may prefer the cap.

4. **Have an escalation plan:**
   - If 30% of organizers churn citing "too many fees," you've lost your beachhead.
   - Train support team on value communication.
   - Iterate PRO features to justify fees.

---

### 3. Bait-and-Switch Perception

**Severity: MEDIUM-HIGH (legal + reputational)**

You're currently offering all features free to beta organizers. If you gate those features post-beta, organizers will feel misled—rightly.

**Legal / Reputational Risk:** Organizers post on local estate sale forums: "FindA.Sale tried to lock me out of features I've been using." Word-of-mouth acquisition dies.

**Mitigation:**

1. **Document beta terms in writing.** Send each organizer:
   > "Beta Agreement: FindA.Sale features and pricing during this period are experimental and subject to change. This is not a guarantee of permanent free access."

2. **Grandfather clause** (builds goodwill, not required):
   - Current 5 beta organizers keep SIMPLE features free forever.
   - Only *new* features are gated to PRO.

3. **Explicit announcement:** "We're moving from beta to paid on [date]. Here's what changes." No surprises.

---

### 4. Competitive Response

**Severity: MEDIUM (year 1) → HIGH (year 2-3)**

EstateSales.NET is 20 years old, 10K+ users, slow-moving but not stupid. If FindA.Sale gains traction, they *will* respond:
- Price match (drop to 10% or 15% fee + free tier)
- Feature race (mobile, batch ops, performance dashboard)
- Bundling (white-label + API to real estate agents)

**Your defensible moat is NOT price.** It's:
1. **Mobile-first UX** (you're ahead; they lag)
2. **AI tagging + Flip Report** (proprietary value; hard to copy)
3. **Community + data network effects** (more organizers = more inventory for shoppers)

**Mitigation:**

- Don't compete on price. Compete on speed + smarts.
- If EstateSales.NET drops fees, you lose. If you own "fastest way to sell an estate," you win at premium pricing.
- Build switching barriers: API integrations, organizer communities, referral networks.

---

### 5. Enterprise Tier Viability

**Severity: MEDIUM (distraction + credibility risk)**

You have zero customers. Enterprise is premature.

**Why risky:**
- Enterprise customers demand custom development, SLAs, dedicated support. You don't have support infrastructure.
- Enterprise buyers (franchised auction companies, real estate agencies) ask for ERP integration, white-label, custom APIs. You'll say no, they'll go elsewhere.
- Offering Enterprise *now* signals readiness for complex deals. You're not. You'll damage credibility by saying no.

**Recommendation: REMOVE ENTERPRISE from launch.**

Launch Essential + Pro only. If you get 100+ Pro organizers and 3-5 requests for custom integration, *then* design an ENTERPRISE tier. You'll know what to build because customers asked for it.

**Revised timeline:**
- **Now (Q2 2026):** Essential + Pro
- **Q4 2026** (after 50+ paid organizers): Assess Enterprise demand. Build if >3 inbound requests.

---

### 6. Revenue Dependency (Transaction Fee vs. Subscription)

**Severity: HIGH (volatility)**

Assuming 50 Pro organizers in year 1, 3 sales/year each, $15K gross per sale:

- **Online sales revenue:** 50 × 3 × $15K = $2.25M
- **Your 10% transaction fee:** $225K/year
- **Subscription revenue:** 50 × $45/month × 12 = $27K/year

**Ratio: 89% from fees, 11% from subscriptions.**

**Risk:** In a recession, organizers' online sales drop 30% → your revenue drops 30%. Subscriptions are stable but insignificant. You have no cushion.

**Mitigation:**

1. **Raise subscription pricing** to stabilize revenue.
   Options:
   - $60-80/month + 5% transaction fee (subscription-heavy)
   - $40/month + 8% transaction fee (balanced)

2. **Tiered subscription for scale:**
   - Essential (free): 1 sale/year
   - Pro: 2-5 sales/year at $45/month + 10% fee
   - Multi-Sale: 6+ sales/year at $80/month + 8% fee

   Growing organizers pay more subscription; you get better revenue stability.

3. **Consider fee-cap hybrid:**
   - Essential: $0/month, no fee cap
   - Pro: $30/month + 10% fee (cap at $500/month if >$50K sales)
   - This reduces volatility for high-revenue organizers.

---

### Risk Subcommittee Summary

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Cannibalization** | HIGH | Audit SIMPLE feature list; intentional friction |
| **Double-dipping fees** | HIGH | Communicate total cost; tie to value; consider cap |
| **Bait-and-switch** | MEDIUM | Document beta terms; grandfather current organizers |
| **Competitive response** | MEDIUM→HIGH | Own speed/smarts, not price; build switching barriers |
| **Enterprise premature** | MEDIUM | Remove from launch; reassess Q4 2026 |
| **Revenue volatility** | HIGH | Raise subscription %; shift to 50/50 split |

---

## COMBINED BOARD RECOMMENDATIONS

### Top 3 Things to Get RIGHT Before Announcing to Beta Testers

1. **SIMPLE feature audit.** Run a working session with the team. List every feature, decide SIMPLE/PRO/Teams, document reasoning. Share with 5 beta organizers *before* pricing announcement. This prevents surprise and positions organizers as partners, not victims.

2. **Founding Organizer program.** Write a 1-pager: "$19/month locked forever. First 25 organizers. Sign up by [date]." Get it in front of 5 current organizers *first*, before public announcement. They should feel special.

3. **Value communication for double-fee model.** Document: "Why both fees?" Tie each PRO feature to concrete ROI. Flip Report → margin improvement. Batch ops → time savings. Performance dashboard → profit insights. Without this narrative, organizers will resent paying both fees and churn.

---

### Top 3 Things to AVOID in Rollout

1. **Don't launch ENTERPRISE.** It signals you're ready for complexity you can't deliver. Wait until you have 50+ Pro customers and inbound enterprise requests. Then build.

2. **Don't use à la carte pricing (except Flip Report as trial).** It fragments the offer and confuses buyers. Stick with subscription + transaction fee. If you must offer trial, use 7-day free Pro trial instead.

3. **Don't hide the transaction fee in fine print.** Organizers will discover they're paying 10% AND a monthly fee and feel scammed. Lead with "Pro is $30-60/month + 10% of your online sales." Own the number.

---

### Contrarian Bet (For Patrick's Consideration)

**Invert the fee model: $20/month subscription + 12-15% transaction fee (vs. current $30-60/month + 10%).**

**Rationale:**
- EstateSales.NET charges 25%. You at 12-15% still undercuts them.
- Psychology shifts: "FindA.Sale takes a small cut of your sales" feels more honest than "pay me monthly AND take my cut."
- Aligns incentives with organizer success (if they don't make money, you don't make money).
- High-volume organizer doing $100K in sales pays $12-15K to you → expects premium support + features. Drives product investment.

**Risk:** Breaks from SaaS subscription playbook. Less predictable MRR in year 1.

**Board consensus:** Interesting, worth a 2-hour modeling session before decision.

---

## VOTING RESULTS

### Timing: When to Launch Paid Tiers?

**Risk Subcommittee Vote:**
"FREE LAUNCH (stay free for entire beta). Announce pricing at conclusion of beta (end Q2 2026)."

*Rationale:* You have zero paying customers and no evidence of pricing sensitivity. Introducing tiers now introduces noise (does conversion happen because of product quality or pricing pressure?). Free beta lets you measure engagement without payment friction. At conclusion, you'll have real data.

**Go-to-Market Subcommittee Vote:** SPLIT.
- Sales strategist: "Announce Founding Organizer program NOW." (Lock in early adopters, build social proof.)
- Growth hacker: "FREE BETA + measured rollout." (Reduce churn risk; test pricing separately.)
- Marketing lead: Abstains.

**Board Consensus Recommendation (Patrick's Choice):**

**Middle path: ANNOUNCE Founding Organizer program NOW. Keep tiers free for beta. Launch full tier structure at beta conclusion (end Q2 2026).**

This gives you:
- Early committed customers (founding 5 at $19/month, 1-year locked)
- Data on what drives conversion (free beta period)
- Soft launch of paid tiers (to founding cohort) before public announcement

**Timeline:**
- **Week 1:** Announce Founding Organizer program to 5 beta organizers. Invite to lock in $19/month Pro (1-year contract).
- **Week 2-8:** Continue free beta. Collect engagement data. Refine product.
- **Week 8:** Launch Essential/Pro/Teams to remaining beta organizers (or new public beta cohort).
- **End Q2:** Evaluate churn, conversion, product-market fit. Iterate pricing if needed.

---

## Decisions Awaiting Patrick

1. **Rename tiers?** (SIMPLE → Essential, ENTERPRISE → Teams)
2. **Founding Organizer scope?** (25 organizers at $19/month, locked forever, 1-year commitment)
3. **Remove ENTERPRISE from launch?** (Reassess Q4 2026 after 50+ paying organizers)
4. **Conduct SIMPLE feature audit?** (Which features delay growth needs → move to PRO)
5. **Invert fee model?** ($20/month + 12-15% fee vs. $30-60/month + 10% fee)
6. **Timing: When to launch paid?** (Consensus: announce Founding program now; full tiers at beta conclusion, end Q2 2026)

---

## Appendix: Competitive Benchmarking

**EstateSales.NET:**
- Pricing: $50-100/month + 25% transaction fee
- Strengths: 20-year history, 10K+ organizers, integrated payment processing
- Weaknesses: Slow to innovate, poor mobile UX, outdated UI

**EstateSales.org:**
- Similar pricing to EstateSales.NET
- Strengths: Established brand, large seller network
- Weaknesses: Same sluggish innovation as EstateSales.NET

**FindA.Sale (Proposed):**
- Essential (free), Pro ($30-60/month + 10%), Teams (removed from launch)
- Strengths: Mobile-first, AI tagging, Flip Report (emerging), modern UX
- Weaknesses: Zero customers, no switching barriers yet, unproven retention

**Recommendation:** Compete on speed, smarts, and UX. Price competitively but not aggressively (10% fee is fair; $30-60/month is reasonable for value delivered). Build switching barriers through community, data, integrations.

---

**Status:** Complete. Awaiting Patrick decision on 6 items listed above. Analysis file saved to workspace.
