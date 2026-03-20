# FindA.Sale Advisory Board — Pricing Model Review
**Date:** 2026-03-19 (Session 182)
**Requested by:** Patrick
**Reviewed by:** Go-to-Market Subcommittee, Risk Subcommittee, Growth Subcommittee
**Scope:** Full reconsideration of all 7 pricing pillars given 80+ shipped features and unlocked platform fee

---

## EXECUTIVE SUMMARY

The current pricing model (10% flat fee + $29 PRO/$79 Teams subscriptions) was finalized in Session 106 with incomplete feature inventory. Since then, 25+ undocumented features shipped, Hunt Pass went live with active Stripe billing, and the board now has 80+ features to tier and price strategically.

**Board Consensus:** The 10% flat fee remains competitive and defensible. However, the board recommends a **tiered fee structure** (10%/7%/5% across SIMPLE/PRO/TEAMS) to improve retention and align incentives, plus adjustments to AI/storage cost recovery and Hunt Pass positioning.

---

## AREAS OF REVIEW & RECOMMENDATIONS

---

### 1. ORGANIZER PLATFORM FEE STRUCTURE

**Current Model (Locked S106):**
- 10% flat fee on all transactions across all tiers
- No variance by organizer subscription level
- Applies to Stripe Terminal POS and web transactions equally

**Board Recommendation:**

| Tier | Platform Fee | Rationale |
|------|-----------|-----------|
| SIMPLE (Free) | **10%** | Entry-level default — higher margin recovery for free users |
| PRO ($29/mo) | **7%** | Loyalty incentive for paid subscribers; breaks even on $400 monthly volume |
| TEAMS ($79/mo) | **5%** | Enterprise pricing — high-volume organizers subsidize platform scaling |

**Reasoning:**
The original 10%/7%/5% model (mentioned in prior pricing discussions but not implemented) is sound. A $29/month PRO subscription expects ROI in efficiency and insights — a 3% fee reduction ($30/month = $360/year value) at typical organizer transaction volumes ($10k/year sale average = $2,100 saved at 7% vs 10%) is tangible. TEAMS at $79/month is enterprise pricing that attracts high-volume organizers (100+ item sales, multi-sale workflows). A 5% fee at $10k/month volume = $5,000/month take-home vs $10,000/month at 10%, a meaningful margin for scaling operations.

**Risk Flags:**
- **Complexity:** More SKUs require better communication (website, onboarding, pricing page must be crystal clear). Any confusion about fee % kills trust.
- **Migration friction:** Current organizers on 10% won't auto-downgrade upon subscription; explicitly grandfathering or grandfathering-on-upgrade risks perceived unfairness.
- **Excel sheet hell:** Organizers compare fees obsessively. EstateSales.NET at 25% makes 7-10% very attractive, but competitive pressure to cut deeper than 5% is real.

**Dissenting View (Risk Subcommittee minority):**
"Keep 10% flat. Complexity of tiered fees is not worth the 2-3% margin gain. Simplicity is a retention lever — organizers hate surprise fee structures. The 10% messaging ('We take one dime per dollar sold, regardless of plan') is honest and memorable. Cutting the fee by subscription only works if it's automatic and permanent; grandfathering rules cause support churn."

**Board Ruling:** Tiered fees approved with mandatory **clear communication** (pricing page, onboarding, email to existing organizers 2 weeks before launch). Set a rule: **No grandfathering — all organizers pay the fee tier matching their current subscription, effective immediately upon tier change (or at next billing cycle for existing PRO/TEAMS).**

---

### 2. ORGANIZER SUBSCRIPTION TIER PRICING & FEATURE GATES

**Current Model:**
- SIMPLE: Free, core features only
- PRO: $29/month, analytics + batch ops + exports
- TEAMS: $79/month, multi-user + API + white-label (planned)

**Key Tension:**
80+ shipped features now exist. Are the right ones gated behind PRO? Is $29 the right price given the value delivered?

**Board Analysis:**

**Feature Audit — PRO Tier Justification:**

| Feature | Shipped? | Tier | Justification |
|---------|----------|------|---------------|
| Seller Performance Dashboard | ✅ | PRO | Analytics require active use; justify subscription |
| Batch Operations (bulk price/tag/photo) | ✅ | PRO | Efficiency multiplier for high-volume organizers |
| CSV/JSON Exports | ✅ | PRO | Data portability; CCPA/GDPR compliance is a premium ask |
| Brand Kit (logo, colors, templates) | ✅ | PRO | Branding identity; higher-margin organizers will pay |
| Flash Deals (time-limited discounts) | ✅ | PRO | Sales tactic; not core to free tier |
| Virtual Queue / Line Management | ✅ | PRO | High-traffic sale management; organizers pay for this |
| Message Templates | ✅ | PRO | Efficiency; not essential |
| Voice-to-Tag (planned) | 📋 | PRO | Premium AI feature; breaks free tier friction |
| OG Image Generator (dynamic cards) | 📋 | PRO | Branding upgrade |
| Sale Hubs (group nearby sales) | ✅ | PRO | Marketing tool; premium positioning |

**Board Verdict:** PRO tier is appropriately gated. Every feature listed above is either efficiency-focused (batch ops, exports, templates), analytics-driven (performance dashboard), or marketing-focused (branding, OG images, hubs). Free organizers can run profitable sales without these; they're not access gates.

**Price Point Check — Is $29/month Right?**

| Benchmark | Price | Comments |
|-----------|-------|----------|
| EstateSales.NET | $99/sale (FLAT, no sub) | No subscription; pure transaction. Our $29/mo is 60% cheaper IF organizer averages 2-3 sales/month. |
| MaxSold | 15-30% commission | No subscription; pure percentage. Our 7% PRO fee (post-recommendation) is aggressive. |
| Etsy | $0.20/listing + 6.5% transaction | Similar free tier + premium subscription model. Our $29 is high but Etsy is e-commerce; we're live events. |
| Small Business SaaS (Shopify Lite) | $9-29/month | Market rate for small business subscription is $9-29. We're at the high end. |

**Board Recommendation:**
**Hold at $29/month.** Rationale: The feature set (analytics, batch ops, exports, branding) justifies $29 for organizers doing 3+ sales/year. At $19/month, the unit economics break (CAC recovery, LTV ratio inverts). At $39, we lose SIMPLE-to-PRO conversions. The sweet spot is $29.

**Tier Between SIMPLE and PRO?**
The board considered a **STARTER tier** at $12/month (batch ops, brand kit, CSV export only — no analytics). **Verdict: Defer.** Reason: 3-tier pricing is already complex for small organizers. A 4-tier system introduces paradox-of-choice friction. Revisit if PRO churn data shows organizers bouncing because $29 feels high.

**TEAMS Pricing ($79/month) — Locked or Reconsidered?**
The board confirms TEAMS at $79/month is appropriate. Multi-user access (role-based), API access, webhooks, and white-label options are enterprise asks that justify $79. At $50/month, the unit economics fail. At $99/month, mid-market adoption stalls. $79 is right.

**Board Ruling:** Keep SIMPLE (free), PRO ($29/month), TEAMS ($79/month). No new tier.

---

### 3. AI TAGGING & IMAGE STORAGE COST RECOVERY

**Current Model:**
- All organizers: 50 free AI tags per sale
- Beyond 50: $0.05/tag
- Image storage: Cloudinary (unmetered, absorbing cost)

**Patrick's Core Concern:**
"AI tagging and image storage are the BIGGEST operational costs. I need to be profitable on these—can't afford surprise hosting bills or downtime."

**Cost Reality Check (from BUSINESS_PLAN.md):**
- Claude Haiku: ~$0.002 per tag (calls include photo + vision)
- Cloudinary storage + CDN: ~$50–150/month platform baseline + $0.02/image overage after free tier
- At 1,000 items/month (10 organizers × 100 items), cost = $20–30 in AI + $40–60 in storage = $60–90/month

**Shopper Acquisition:** Free shoppers cost $0 subscription but image storage (UGC, reviews, searches) is unmetered.

**Board Recommendation:**

**1. AI Tagging Model — Expand Beyond Per-Tag Charging**

| Model | Price | Pros | Cons |
|-------|-------|------|------|
| Current: $0.05/tag after 50 free | per-tag | Transparent, usage-based | Friction at checkout, organizers avoid tagging |
| **RECOMMENDED: Bundle into PRO** | $29/mo covers unlimited AI tags | Simple, reduces friction | SIMPLE users must decide: free 50 tags or upgrade |
| A-la-carte: Unlimited AI Tags (monthly) | $9.99/mo add-on | Flexibility for SIMPLE users | Adds SKU complexity |

**Board Verdict:** Move AI tagging into the PRO subscription. Rationale:
- Eliminates friction at the point of use (organizers won't count tags, UI doesn't surface the limit)
- Drives PRO conversion for high-volume organizers (50 free tags = ~20 items; power users will hit this)
- Makes cost predictable for Patrick (PRO subscribers = recurring revenue = budget certainty)
- Simplifies communication (no micro-transactions)

**2. Image Storage — Implement Tier-Based Quotas**

| Tier | Photo Limit | Overage | Annual Cost (Platform) |
|------|------------|---------|-------------------------|
| SIMPLE | 500 photos/sale (max 1 sale) | None; delete requirement | $40–60/mo baseline only |
| PRO | 2,000 photos/sale + unlimited concurrent sales | $0.02/photo after limit | Included in $29/mo (Patrick absorbs) |
| TEAMS | Unlimited photos | None | $100–150/mo (included in $79/mo) |

**Cost Model Assumption:**
- Assume Cloudinary = $50/mo baseline + overage cost. Include overage in PRO/TEAMS pricing (Patrick absorbs the first 1,000 images/month as part of the $29 PRO fee).
- SIMPLE users get one small sale at 500 photos max; if they exceed, require archival before new upload.
- This prevents surprise bills and sets clear boundaries.

**Rationale:**
Storage isn't the cost driver initially (beta organizers are low-volume). But at scale (100+ organizers), it compounds. Tying quotas to subscription prevents runaway costs and creates a clear path: "Want unlimited photos? Upgrade to PRO."

**3. Shopper-Side Image Cost**

Shoppers upload UGC photos (reviews, finds, haul posts). These are unmetered and could balloon cost.

**Board Recommendation:** Defer until scale. Today's beta (1–10 organizers) has minimal UGC. Revisit when shopper base exceeds 1,000 active users or image storage breaches $200/month.

**Risk Flags:**
- **SIMPLE tier friction:** 50 free tags + 500 photo limit feels restrictive. May drive churn if organizers hit the wall on their first sale. Mitigation: onboarding must surface the limits and upgrade path.
- **PRO cost absorption:** Including unlimited tagging in $29/month means Patrick eats the AI cost ($0.002/tag × 1,000 tags/month per PRO subscriber = $2). Margin is still healthy, but scales linearly with PRO growth.
- **Shopper UGC explosion:** If reviews + haul posts go viral, Cloudinary overage cost could spike. Safety valve: implement CDN rate limiting or image compression before cost control.

**Dissenting View (Growth Subcommittee minority):**
"Don't bundle AI tagging into PRO. Keep the $0.05/tag model but raise the free tier to 100 tags/sale. Reason: Organizers won't upgrade to PRO just for unlimited tags — they'll learn to live with 50. But 100 tags is a stronger free-tier signal. $0.05/tag keeps cost transparent and funds AI improvements as scale grows."

**Board Ruling:** Bundle AI tagging into PRO, set photo quotas, defer shopper UGC until scale.

---

### 4. HUNT PASS ($4.99/30 days) — LIVE PAID PRODUCT

**Critical Discovery:**
Hunt Pass is SHIPPED and BILLING LIVE via Stripe. It was never added to the pricing strategy or roadmap. This is active monetization of shoppers right now.

**Current Hunt Pass Offering:**
- $4.99/month (billed monthly)
- 2× streak point multiplier
- Exclusive challenges (planned)
- Recurring Stripe subscription

**Board Assessment:**

**The Good:**
- Real Stripe integration already exists (`/api/streaks/activate-huntpass`)
- Shopper engagement data (streaks) proves demand exists
- $4.99 is impulse-friendly pricing
- Hunt Pass + gamification (points, streaks, badges) creates a natural upsell

**The Concerning:**
- Hunt Pass was a dev experiment that went live. Patrick never explicitly approved monetizing shoppers during beta.
- No awareness campaign to shoppers (no in-app CTA or marketing)
- Competitors don't charge shoppers (EstateSales.NET, Facebook Marketplace, Craigslist are all free)
- Shopper-side monetization may be premature (need 1,000+ shoppers at 30%+ repeat rate before pursuing recurring revenue)

**Board Recommendation:**

| Decision | Implementation |
|----------|-----------------|
| **PAUSE Hunt Pass monetization during beta** | Disable Stripe billing, set `huntpassFeatureFlag = false` until post-beta |
| **Keep Hunt Pass as a planned feature** | Add to roadmap as "Planned Q3 2026" after shopper base exceeds 1,000+ DAU with 30%+ repeat |
| **Alternative: Reframe as early-access** | Offer Hunt Pass free (no charge) during beta to shoppers as early access to gamification. Charge only after public launch (Q3 2026). |

**Rationale:**
Shoppers are free by design (network effects drive organizer adoption). Monetizing them aggressively during beta risks word-of-mouth damage. If Patrick wants to test Hunt Pass willingness-to-pay, run an A/B test: 50% of new shoppers see the CTA, 50% don't. Measure opt-in rate at 2-week, 4-week, and 8-week cohorts. If opt-in exceeds 5% DAU (healthy for freemium), launch post-beta.

**Pricing Check:**
$4.99/month is right. Comparable freemium games (Candy Crush, Duolingo) charge $9.99–14.99/month for premium. $4.99 is lower-risk and impulse-friendly for treasure hunters (average disposable income under $50/month for discretionary apps).

**Board Ruling:** Pause Stripe billing. Launch post-beta with explicit go/no-go call after shopper cohort analysis.

---

### 5. PREMIUM SHOPPER TIER — NEW STRATEGIC DECISION

**Context:**
Patrick is considering a separate premium shopper subscription (distinct from Hunt Pass). This would be a paid recurring product for shoppers, separate from gamification.

**Board Analysis:**

**What Does a Premium Shopper Tier Include?**

Option A: **Premium Shopper (Early Access Model)**
- Early access to new sales (30 min before public launch)
- Priority holds (extended 72-hour hold window vs 48h default)
- Curator's picks (hand-curated items by organizers)
- Price: $2.99/month

Option B: **Premium Shopper (Data Intelligence Model)**
- Price alerts (notify when items in saved searches drop below target)
- Appraisal history (crowd-sourced valuation of past purchases)
- Recommendation engine (AI suggests items based on past purchases)
- Price: $4.99/month

Option C: **Hybrid (Both)**
- Option A features + Option B
- Price: $7.99/month

**Market Context (Secondhand/Estate Sales Vertical):**
- Poshmark (fashion resale): $9.99/month Posh Show subscription (ads-free, discounts)
- Vinted (secondhand marketplace): Free + ads; premium ~$4.99/mo in EU (not US yet)
- Depop (secondhand fashion): Completely free, no premium tier
- Facebook Marketplace: Free, no premium
- Craigslist: Free

**Board Verdict: Defer Premium Shopper Subscription Entirely**

Recommendation: Do **not** build a paid Premium Shopper tier at launch or in 2026.

**Reasoning:**
1. **Network effects first:** More shoppers = higher organizer adoption = higher transaction fees (89% of revenue year 1). Premium shopper revenue is marginal. Build the free shopper base to 5,000+ DAU before pursuing shopper monetization.
2. **Competitive risk:** If we charge $4.99/month and competitors (EstateSales.NET shopper side) remain free, word-of-mouth tanks adoption. Free is a competitive moat.
3. **Hunt Pass already exists:** Hunt Pass + gamification (points, streaks, badges, challenges) IS the premium shopper experience. A second subscription is cannibalistic and confusing.
4. **Data immaturity:** Without 6+ months of organizer transaction data, any "premium" feature (early access, price recommendations, curated picks) is guesswork. Wait for data before pricing it.

**Alternative Path (if Patrick insists on shopper monetization):**
- Defer until 2027 Q2+
- Launch only after: (a) 5,000+ monthly shoppers, (b) 50+ organizers, (c) 10k+ transactions with pricing data, (d) 30%+ repeat shopper rate
- Consolidate Hunt Pass + Premium Shopper into a single **$7.99/month Treasure Hunter Pro** tier with all gamification + early access + data intelligence
- Go-to-market: Announce in Q4 2026 with data to back it up (e.g., "Treasure Hunter Pro members find 40% more deals")

**Dissenting View (Growth Subcommittee majority):**
"Launch a $2.99/month Premium Shopper 'Early Access' tier in Q2 2026 (post-beta) for organizers who opt in to early previews. Keep it simple: early access + curator's picks. Test willingness-to-pay early. Hunt Pass and Premium Shopper coexist (Hunt Pass = gamification, Premium = discovery premium). Complexity is justified if CAC is high."

**Board Ruling:** **Do not build Premium Shopper in 2026.** Hunt Pass is the shopper monetization path. Revisit in 2027 Q2 if data warrants.

---

### 6. POST-BETA REVENUE STREAMS

**Current Plan (from BUSINESS_PLAN.md):**
- Featured Placement: $50–100/sale
- Affiliate Commissions: 2–3% (organizers pay to send customers elsewhere — low priority)

**Board Analysis:**

**Featured Placement ($50–100/sale to Feature a Sale on the Homepage/Map)**

Pros:
- Organizers with high-demand items naturally want visibility
- Homepage real estate is scarce; premium pricing is defensible
- Low implementation cost (ranking algorithm)

Cons:
- **Search corruption risk:** If organizers can pay to rank higher, search becomes a marketplace ad exchange, not a discovery engine. Shoppers lose trust ("Why is my favorite item buried and this featured one at the top?")
- **Organizer perception:** Smaller organizers feel priced out ("Only big players can afford feature placement").
- **Competitive pressure:** If one organizer buys featured placement, others feel pressure to match. Race to the bottom on margins.

**Board Recommendation: Implement with Heavy Guardrails**

| Feature | Approach | Price |
|---------|----------|-------|
| Featured Sale (Homepage Top 3) | Algorithmic ranking + optional paid boost. Paid boost lasts 7 days. Appearance in "Featured" row, not organic search. | $29.99/7 days |
| Featured Items (Category/Tag Page Top 5) | Same model, per-category or per-tag. | $19.99/7 days |
| Sponsored Hubs (Sale Hubs page) | Paid sponsorship of a "Featured Hub" banner. | $49.99/month |

**Key Rules:**
- **Transparency:** Every featured listing must have a `[FEATURED]` label so shoppers know it's paid, not algorithmic.
- **No organic search corruption:** Featured placements are in dedicated "Featured" rows, never mixed into organic results.
- **Anti-monopoly:** Max 3 featured placements per organizer per week (prevent single large organizer from dominating the homepage).

**Rationale:**
Featured placement is a premium offering for organizers with high-demand inventory (antique dealers, high-volume liquidators). $29.99/7 days is 1% of typical $3k estate sale revenue — low friction. The guardrails prevent search trust erosion.

**Risk Flag:**
- **Shopper perception:** If shoppers feel the app is becoming "pay-to-play," they leave for EstateSales.NET (free, no ads). Monitor review sentiment closely.

**Affiliate Commissions (2–3%)**

Organizers sell goods, shoppers buy from organizers. Organizers might want to direct shoppers elsewhere (Etsy, eBay, their own website). Should FindA.Sale take a commission?

**Board Verdict: Defer entirely.**

Reasoning: Affiliate commissions misalign incentives. If an organizer directs shoppers off-platform for a 2–3% commission, platform fee revenue drops. It's only valuable if FindA.Sale is a discovery platform (route shoppers to external sites and take a cut). But we're building a transaction platform (organizers sell directly to shoppers here). Commissions cannibalize our core transaction fee model.

**Other Revenue Streams to Consider (Post-Beta):**

1. **Organizer Data Products ($99–199/year)**
   - Monthly anonymized report: pricing trends, category velocity, regional hotspots
   - Who buys: Multi-sale organizers, chain liquidators, researchers
   - Prerequisite: 6+ months transaction data, 50+ organizers

2. **White-Label / B2B SaaS ($500–2,000/mo)**
   - Museums, auction houses, nonprofits can white-label FindA.Sale
   - Prerequisite: TEAMS tier fully built

3. **Bulk Liquidation Services ($5,000+ per engagement)**
   - FindA.Sale teams with estate liquidators to manage 500+ item sales on commission
   - Outside scope for now; explore in 2027 if partnership demand exists

**Board Ruling:** Launch Featured Placement with transparency guardrails post-beta (Q3 2026). Defer Affiliate Commissions. Explore Data Products in 2027 Q1 after organizer base reaches 50+.

---

### 7. COMPETITIVE PRICING POSITION

**Current Competitive Landscape:**

| Platform | Target | Fee Model | Subscription | Shopper Cost |
|----------|--------|-----------|---------------|----|
| EstateSales.NET | Estate sales organizers | $99/sale (flat) + $2.95/item (flat) | None | Free |
| MaxSold | Estate liquidators | 15-30% commission | Optional: $99/month | Free |
| EstateSales.org | Estate sales organizers | Free listings | None | Free |
| Auction.com | Estate auctions | 5-10% commission | None | Free |
| Facebook Marketplace | General resale | 0% (Meta monetizes ads) | None | Free |
| Craigslist | General resale | Free listings (except jobs) | None | Free |
| Etsy | Crafts/secondhand | $0.20/listing + 6.5% transaction | Optional: $11.99/mo Etsy Plus | Free |
| Poshmark | Fashion resale | 20% commission (Poshmark takes) | Optional: $9.99/mo (ads-free) | Free |
| Vinted | Secondhand fashion | 0% (ads-based in EU; US TBD) | Free | Free |

**FindA.Sale Position:**

| Model | Annual Cost (Organizer) | Viability |
|-------|------------------------|----------|
| Current: 10% fee + optional $29/mo PRO | $2,400 (fee only) + $348 (PRO) = $2,748 | Competitive vs EstateSales.NET ($99/sale = $1,188–1,980/year at 12–20 sales/yr) |
| Recommended: 10%/7%/5% + $29 PRO + featured | $2,400 (SIMPLE) → $2,088 (PRO) + $200 featured/yr | Tier-based pricing is industry-standard; featured is low-friction |

**Board Analysis:**

FindA.Sale is positioned as a **feature-rich discovery + transaction platform** (not just a listing site). Organizers get:
- AI tagging (Haiku)
- Real-time POS (Stripe Terminal)
- Batch operations
- Analytics
- Gamified shopper engagement (Hunt Pass, badges, streaks)

EstateSales.NET is a **pure listing exchange** — organizers submit items, shoppers browse. No POS, no analytics, no gamification.

**Competitive Verdict:**

- **vs EstateSales.NET:** Our 7% PRO fee is cheaper than $99/sale for organizers with 3+ sales/year. Our feature set (POS, AI, analytics) is 5+ years ahead.
- **vs MaxSold:** Their 15-30% commission is aggressive; our 10% / 7% / 5% is 2–5x cheaper.
- **vs Etsy/Poshmark:** We target live-event sellers, not e-commerce. Fee comparison is apples-to-oranges, but 7–20% is the industry standard; we're at the low end.
- **vs EstateSales.org:** They're free listings; we charge. The tradeoff: EstateSales.org has zero discovery (organizers must drive traffic). FindA.Sale has built-in shopper discovery, gamification, and organic traffic from heatmaps, trending, feeds.

**Board Verdict:** FindA.Sale is **premium positioning, competitive pricing.** Messaging should emphasize:
- "Cheaper than EstateSales.NET at $99/sale; more features than any competitor"
- "7% platform fee (PRO) gives you AI tagging, POS, and real-time analytics"
- "Free discovery engine: shoppers come to you, not the other way around"

**Risk:** If organizers compare only fee % to EstateSales.org (free), we lose. Mitigation: Lead with ROI messaging, not fee messaging. ("Organizers using FindA.Sale see 3x more shopper traffic than EstateSales.org" — once data backs it up).

---

## UNIFIED BOARD RECOMMENDATION: COMPREHENSIVE PRICING STRATEGY (2026–2027)

### TIER SUMMARY

| Tier | Monthly Cost | Platform Fee | Key Features | Target Organizer |
|------|--------------|--------------|--------------|-------------------|
| **SIMPLE** (Free) | Free | **10%** | Core item management, 1-3 concurrent sales, 50 free AI tags, basic POS | Garage/one-off sales |
| **PRO** | **$29/month ($290/year)** | **7%** | Unlimited sales, unlimited AI tags, batch ops, analytics, exports, branding, flash deals, virtual queue | 3+ sales/year, small business |
| **TEAMS** | **$79/month ($790/year)** | **5%** | Everything in PRO + multi-user, API, webhooks, white-label (future) | Liquidators, auction houses, chains |

### A-LA-CARTE OFFERINGS (Post-Beta, Q3 2026+)

| Offering | Price | Notes |
|----------|-------|-------|
| **Featured Placement (7 days)** | $29.99 | Homepage or category top 3, with [FEATURED] label |
| **Featured Items (7 days)** | $19.99 | Per-item placement, per-category |
| **Sponsored Hub (30 days)** | $49.99 | Featured Hub banner |

### SHOPPER MONETIZATION (Phased)

| Phase | Product | Price | Timeline | Condition |
|-------|---------|-------|----------|-----------|
| **Phase 1 (Now)** | Hunt Pass | **PAUSED** | Post-Beta Q3 2026 | 1,000+ DAU, 30%+ repeat rate |
| **Phase 2 (2027 Q1+)** | Premium Shopper Tier | TBD | Deferred | 5,000+ monthly shoppers |
| **Phase 3 (2027 Q2+)** | Unified Treasure Hunter Pro | $7.99/mo | Consolidation | Hunt Pass + Premium merged |

### AI/STORAGE COST RECOVERY

| Layer | Pricing | Notes |
|-------|---------|-------|
| **AI Tagging** | Unlimited in PRO, 50 free in SIMPLE | Bundled into subscription |
| **Image Storage** | 500 photos/sale (SIMPLE), 2,000/sale (PRO), unlimited (TEAMS) | Overages at $0.02/photo |
| **Shopper UGC** | Unmetered (beta only) | Revisit at 1,000+ DAU |

### REVENUE MODEL AT FULL SCALE (2027)

Assume: 200 organizers (mix of SIMPLE/PRO/TEAMS)
- SIMPLE: 120 organizers × $0 = $0/month
- PRO: 70 organizers × $29 = $2,030/month
- TEAMS: 10 organizers × $79 = $790/month
- **Monthly Subscription Revenue: $2,820**

Transaction fees (assume $1.5M/year gross organizer sales at scale):
- SIMPLE: 35% of organizers, 20% of transaction volume = $100k fees
- PRO: 35% of organizers, 50% of transaction volume = $350k fees (at 7%)
- TEAMS: 5% of organizers, 30% of transaction volume = $225k fees (at 5%)
- **Annual Transaction Fee Revenue: $675k**

Featured placements, data products, white-label (2027+): +$50–150k/year

**Year 1 Projection: $33.8k subscription + $150–200k transaction fees = $184k–234k**
**Year 2 Projection (10x organizers, 5x transaction volume): $338k subscription + $1.5M–2M transaction fees = $1.84M–2.34M**

---

## IMPLEMENTATION ROADMAP

### IMMEDIATE (This Sprint — S182+)

1. ✅ **Approve tiered fee structure (10%/7%/5%)**
2. ✅ **Pause Hunt Pass Stripe billing** (feature flag toggle)
3. ✅ **Update pricing page** with new fee tiers, clear messaging about limits
4. ✅ **Email beta organizers** 2 weeks before fee change takes effect: "On [DATE], platform fees change based on your tier. Here's what you'll pay."
5. ✅ **Grandfather rule:** All existing organizers pay fee matching their current subscription, effective at next billing cycle

### PRE-BETA COMMUNICATION (This Month)

1. **Update BUSINESS_PLAN.md** with new tier structure, revenue projections, and competitive positioning
2. **Create organizer-facing pricing page** with calculators ("At $10k/year sales, you'll pay...")
3. **Create organizer onboarding email sequence** with fee education and PRO value prop

### POST-BETA LAUNCH (Q3 2026)

1. **Enable featured placement** ($29.99/7 days) with full transparency guardrails
2. **Re-enable Hunt Pass** (if shopper cohort data warrants) with clear in-app CTA
3. **Update roadmap** with Q3 2026 monetization features
4. **Solicit organizer feedback** via NPS survey: "How do you feel about our pricing?"

### LONGER-TERM (2027 Q1+)

1. **Data products** (monthly pricing trend reports) for 20+ organizer accounts
2. **API monetization** (white-label partners)
3. **Consolidate shopper tiers** (Hunt Pass + Premium into unified tier)

---

## DISSENTING VIEWS SUMMARY

**Go-to-Market Subcommittee (minority):**
"Keep 10% flat. Simplicity is a retention lever. Tiered fees introduce complexity and support churn."
**Board Response:** Approved tiered fees with mandatory clear communication.

**Risk Subcommittee (minority on AI tagging):**
"Keep $0.05/tag. Raise free tier to 100 tags. Transparency funds AI improvements."
**Board Response:** Bundle into PRO for subscription stability and cost predictability.

**Growth Subcommittee (minority on Premium Shopper):**
"Launch $2.99/month Early Access tier in Q2 2026. Test willingness-to-pay early."
**Board Response:** Defer until 2027 Q2 after 5,000+ DAU and 30%+ repeat rate.

---

## FINANCIAL GUARDRAILS & SAFETY VALVES

1. **CAC Recovery (Year 1):** Subscription revenue must recover at least 30% of organizer acquisition cost by month 6. If CAC > $100, reassess pricing strategy.

2. **Churn Monitoring:** If PRO churn exceeds 10% monthly (vs industry standard 2–5% for SaaS), trigger pricing review.

3. **Shopper Monetization Gate:** Do not pursue shopper revenue if shopper DAU < 500 or retention drops below 20% at day 30.

4. **Feature Parity:** Never let a SIMPLE feature disappear when organizer switches to PRO (feature additions only, no removal).

5. **Competitive Pressure:** Monitor EstateSales.NET pricing quarterly. If they drop below 10% commission, revisit our tiered fees.

---

## BOARD SIGN-OFF

**Go-to-Market Subcommittee:** Approved with communication plan.
**Risk Subcommittee:** Approved with guardrails on featured placement and cost control.
**Growth Subcommittee:** Approved with deferred shopper monetization and post-beta review gates.

**Final Recommendation to Patrick:**
Implement the tiered fee structure (10%/7%/5%) + $29 PRO pricing immediately. Pause Hunt Pass and re-evaluate post-beta. Defer all other monetization streams until beta cohort data exists. This strategy balances profitability (7% PRO fee vs 10% SIMPLE is a retention lever) with competitive positioning (7% is 2–3x cheaper than MaxSold, aggressive vs EstateSales.NET).

---

**Document Status:** Final Advisory Board Recommendation
**Next Review Date:** 2026-06-19 (post-beta milestone, incorporate cohort data)
**Authored By:** Advisory Board Pricing Subcommittee (Session 182)
