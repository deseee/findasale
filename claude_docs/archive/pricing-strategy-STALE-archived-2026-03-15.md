**ARCHIVED 2026-03-15 — STALE. Fee is 10% flat (locked Session 106). Do not reference.**

---

# Pricing Strategy

Fee model, competitive positioning, and monetization options for FindA.Sale.

## Current Model (Locked)

- **Fixed-price sales:** 5% platform fee
- **Auction sales:** 7% platform fee
- **Organizer cost:** 0% upfront listing fee (only pay on successful sales)
- **Source of truth:** BUSINESS_PLAN.md and locked decision in STATE.md

---

## Competitive Benchmark

FindA.Sale positions dramatically cheaper than primary competitors:

| Platform | Organizer Cost on $5K Sale | Effective % | Notes |
|----------|---------------------------|------------|-------|
| EstateSales.net | $99 + ($2.95 × 250 items) = $836 | 16.7% | #1 organizer complaint: upfront + per-item fees |
| MaxSold | ~18% × $5,000 = $900 | 18% | All-online auction |
| EstateSales.org | ~$50–150 | 3–5% | Weaker traffic but cheaper |
| **FindA.Sale (5%)** | **$250** | **5.0%** | **Organizer saves $586 vs EstateSales.net** |

**Key selling point:** 2–4× cheaper than market leader. This is the single strongest organizer acquisition message.

---

## Revenue Model & Break-Even

### Revenue Per Sale (after Stripe processing)

| Sale Size | At 5% | At 7% | Net (after ~2.9% Stripe) |
|-----------|-------|-------|--------------------------|
| $2,000 | $100 | $140 | $20–80 |
| $4,000 | $200 | $280 | $40–160 |
| $8,000 | $400 | $560 | $80–320 |
| $15,000 | $750 | $1,050 | $150–600 |

### Break-Even Analysis

Monthly operating costs at beta scale: ~$200–400/month (Railway, Neon, Cloudinary, misc).

| Monthly GMV | Revenue @ 5% | Covers Costs? |
|-------------|-------------|---------------|
| $5,000 | $250 | Marginal ✓ |
| $10,000 | $500 | Yes ✓ |
| $20,000 | $1,000 | Comfortable ✓ |

**Break-even:** 2–3 medium sales/month ($6,000–8,000 GMV each).

---

## Post-Beta Monetization Options

### Option A: Subscription Tiers (After Beta Growth)

| Tier | Monthly Fee | Platform % | Target |
|------|-------------|-----------|--------|
| Starter | $0 | 5% / 7% | Beta organizers, small ops |
| Growth | $39/mo | 3% / 5% | 4–10 sales/month |
| Pro | $99/mo | 2% / 3% | Power organizers, estate companies |

**Lever:** Growth tier pays for itself at $1,950+/month GMV. Introduces predictable MRR without disrupting organizer acquisition.

### Option B: A La Carte AI Tagging

Once AI tagging (CB path) is production-ready:

| Volume | Price | Cost Basis | Margin |
|--------|-------|-----------|--------|
| 1–50 items/month | Free | — | Adoption lever |
| 51–200 items/month | $0.05/item | ~$0.015 | ~66% |
| 200+ items/month | $0.03/item | ~$0.015 | ~66% |

**Note:** Google Vision API ~$1.50/1,000 images. Claude Haiku ~$0.25/1,000 items. Both cheap at scale.

### Option C: Buyer-Side Transaction Fee

Add small convenience fee (1–2%) on buyer checkout.

**Status:** Deferred to post-beta. Requires buyer satisfaction validation first.

---

## Messaging Framework

**Primary organizer message:**

> "EstateSales.net charges $99 upfront plus $2.95 per item before a single sale is made. On a typical $5,000 sale with 250 items, that's $836 off the top. FindA.Sale charges nothing to list and 5% only on what sells. Same $5,000 sale? $250. You keep $586 more."

This frames FindA.Sale's core advantage: **low friction, low cost, aligned incentives.**

---

## Decision Log

- **CC3 (session 85):** Pricing analysis complete. Recommended flat 5%/7% for beta. No upfront fees to maximize organizer acquisition.
- **STATUS:** Patrick confirms 5%/7% for beta launch. Post-beta monetization (subscription tiers, AI add-ons) deferred pending organizer cohort growth.

---

**Last Updated:** 2026-03-06
**Source:** pricing-analysis-2026-03-05.md (CC3), STATE.md (locked decisions)
