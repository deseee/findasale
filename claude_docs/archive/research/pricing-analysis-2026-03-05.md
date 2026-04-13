# CC3: Pricing Model Analysis — FindA.Sale
*Generated 2026-03-05 | ⚡ Sync required: Patrick decides launch pricing*

---

## Executive Summary

FindA.Sale's current 5%/7% fee model is dramatically cheaper than primary competitors
and positions well for organizer acquisition. The main risk is low per-transaction revenue
at beta scale — a modest subscription tier or AI add-on can bridge that gap without
disrupting competitive positioning.

---

## 1. Competitor Fee Comparison

| Platform | Listing Fee | Per-Item Fee | % of GMV | Notes |
|----------|-------------|--------------|-----------|-------|
| EstateSales.net | $99/sale | $2.95/item | 13–20%+ effective | Fees not disclosed upfront; #1 organizer complaint |
| EstateSales.org | $50/sale | None listed | ~3–5% effective | Better value, weaker traffic |
| MaxSold | None | ~15–20% of GMV | 15–20% | All-online auction model; they handle photos |
| HiBid | Varies by host | Buyer premium 15–25% | Buyer-paid | Auction house model; premium paid by buyer |
| Facebook Marketplace | $0 | 5% selling fee ($0.40 min) | 5% | Algorithm blocks estate/auction terms |
| Craigslist | $0 | $0 | 0% | No safety, rampant scams, declining use |
| **FindA.Sale** | **$0** | **5% (fixed), 7% (auction)** | **5–7%** | **Organizer-paid, no upfront cost** |

**Key finding:** EstateSales.net costs organizers 13–20%+ of GMV at typical sale sizes.
FindA.Sale at 5% is 2–4× cheaper. This is the single strongest sales argument for beta recruitment.

---

## 2. Effective Rate Model — What Organizers Actually Pay

### Scenario A: Small Sale ($3,000 GMV, 150 items at avg $20)

| Platform | Fee | Organizer Nets |
|----------|-----|----------------|
| EstateSales.net | $99 + (150 × $2.95) = $541 | $2,459 (18.0% fee rate) |
| MaxSold | ~18% × $3,000 = $540 | $2,460 |
| **FindA.Sale (fixed)** | 5% × $3,000 = **$150** | **$2,850 (5.0% fee rate)** |
| **FindA.Sale (auction)** | 7% × $3,000 = **$210** | **$2,790 (7.0% fee rate)** |

**Organizer saves $391 vs EstateSales.net on a single $3,000 sale.**

### Scenario B: Medium Sale ($6,000 GMV, 300 items)

| Platform | Fee | Organizer Nets |
|----------|-----|----------------|
| EstateSales.net | $99 + (300 × $2.95) = $984 | $5,016 (16.4%) |
| MaxSold | ~18% × $6,000 = $1,080 | $4,920 |
| **FindA.Sale (fixed)** | 5% × $6,000 = **$300** | **$5,700 (5.0%)** |

**Organizer saves $684 vs EstateSales.net on a medium sale.**

### Scenario C: Large Sale ($12,000 GMV, 500+ items)

| Platform | Fee | Organizer Nets |
|----------|-----|----------------|
| EstateSales.net | $99 + (500 × $2.95) = $1,574 | $10,426 (13.1%) |
| **FindA.Sale (fixed)** | 5% × $12,000 = **$600** | **$11,400 (5.0%)** |

**Organizer saves $974 on a large sale.**

---

## 3. FindA.Sale Revenue & Break-Even Analysis

### Revenue Per Sale

| Sale Size | Fixed (5%) | Auction (7%) | Stripe Cost Est.* | Net to FindA.Sale |
|-----------|-----------|--------------|-------------------|-------------------|
| $2,000 | $100 | $140 | $60–80 | $20–80 |
| $4,000 | $200 | $280 | $120–160 | $40–160 |
| $8,000 | $400 | $560 | $240–320 | $80–320 |
| $15,000 | $750 | $1,050 | $450–600 | $150–600 |

*Stripe Connect processing: ~2.9% + $0.30/transaction on the transfer amount. Actual cost depends on number of discrete transactions.*

### Break-Even — Monthly Operating Cost Target: ~$200–400/month
*(Railway backend + Neon DB + Cloudinary + misc services at beta scale)*

| Monthly GMV | Revenue @ 5% | Revenue @ 7% | Covers Costs? |
|-------------|-------------|-------------|---------------|
| $5,000 | $250 | $350 | Marginal ✓ |
| $10,000 | $500 | $700 | Yes ✓ |
| $20,000 | $1,000 | $1,400 | Comfortably ✓ |
| $50,000 | $2,500 | $3,500 | Growth stage ✓ |

**Break-even: ~2–3 medium sales/month ($6,000–8,000 GMV each).**

---

## 4. Pricing Strategy Options

### Option A: Keep Current Flat % (Recommended for Beta)
**5% fixed / 7% auction, no monthly fee**

Pros:
- Lowest organizer friction for beta recruitment
- Strongest competitive talking point ("we're 3× cheaper than EstateSales.net")
- No upfront cost → easy yes for first-time organizers
- Aligned with organizer success (we earn more when they sell more)

Cons:
- Revenue predictability depends on sale frequency
- Very low revenue at sub-$5,000 sales

### Option B: Freemium + Subscription Tier

| Tier | Monthly Fee | Platform % | Target |
|------|-------------|------------|--------|
| Starter | $0 | 5% / 7% | Beta organizers, small ops |
| Growth | $39/mo | 3% / 5% | 4–10 sales/month |
| Pro | $99/mo | 2% / 3% | Power organizers, estate companies |

Break-even on Growth tier: organizer needs $1,950+/month GMV for the sub to pay off vs Starter.
Break-even on Pro tier: organizer needs $4,950+/month GMV.

*This model adds predictable MRR but adds friction at beta. Revisit post-beta when repeat organizers are established.*

### Option C: A La Carte AI Tagging

Once CB path is live, offer AI tagging as an optional paid feature:

| Volume | Price | Notes |
|--------|-------|-------|
| Beta (any volume) | Free | Drive adoption, gather training data |
| 1–50 items/month | Free | Permanent free tier |
| 51–200 items/month | $0.05/item | ~$2.50–$10/month |
| 200+ items/month | $0.03/item | Volume discount |

*Google Vision API cost: ~$1.50/1,000 images. Claude Haiku: ~$0.25/1,000 items. Margin at $0.05/item: ~66%.*

### Option D: Buyer-Side Transaction Fee

Add a small buyer convenience fee (1–2%) on top of item price. Common in auction platforms.

Pros: doubles revenue per transaction, organizer sees no change
Cons: surprises buyers, may hurt conversion, requires ToS update
*Recommend: defer to post-beta once buyer satisfaction is established.*

---

## 5. Recommended Launch Pricing

**For beta (now → first 10 organizers):**
- Keep 5% / 7% flat rate
- No subscription fees
- AI tagging free (when CB path is live)
- Frame as: "FindA.Sale charges no listing fees. We earn 5% when you do."

**Post-beta milestone (10+ active organizers):**
- Introduce Growth tier ($39/month, 3%/5%) for power users who request it
- Keep Starter free tier permanently
- Introduce A la carte AI at $0.05/batch for Starter tier users

**⚡ Patrick decides:** Stay flat 5%/7% for beta launch? Yes/No. Introduce Growth tier in month 2? Yes/No.

---

## 6. Competitive Messaging

When pitching organizers, use this framing:

> "EstateSales.net charges $99 upfront plus $2.95 per item — before a single sale is made.
> On a typical $5,000 sale with 250 items, that's $836 off the top.
> FindA.Sale charges nothing to list and 5% only on what sells. Same $5,000 sale? $250.
> You keep $586 more."

This is the single most powerful organizer acquisition message available.

---

*Source: competitor-intel-2026-03-04.md, roadmap.md CC3. Next action: Patrick reviews and confirms beta pricing.*
