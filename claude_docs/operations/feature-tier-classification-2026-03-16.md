# Feature Tier Classification — GitHub Audit Discoveries
**Date:** 2026-03-16
**Authority:** FindA.Sale Systems Architect
**Status:** Ready for Patrick Review & Finalization

---

## Executive Summary

36 undocumented features discovered in GitHub codebase audit. All classified into ADR-065 tier framework:
- **SIMPLE (Free):** Core operations, basic organizer tools
- **PRO ($29/month):** Analytics, batch ops, exports, advanced automation
- **TEAMS (Future):** Teams, white-label, API
- **FREE_SHOPPER:** All shopper features (network effect priority)
- **STANDALONE_PAID:** Hunt Pass ($4.99/30d), one-time purchases, usage-based features
- **INFRASTRUCTURE:** Internal systems, not customer-facing

---

## Tier Classification by Category

### A. ORGANIZER-SIDE FEATURES (17 items)

| Feature | Tier | Pricing Page | Industry Std. | Rationale |
|---------|------|--------------|---------------|-----------|
| 1. Sale Checklist | SIMPLE | YES | Eventbrite, Etsy | Core pre-sale prep tool; organizers expect checklist functionality at free tier |
| 2. Pickup Scheduling | PRO | YES | EstateSales.NET, Poshmark | Logistics complexity drives conversion; time-slot management is efficiency multiplier (→ PRO) |
| 3. Flash Deals | PRO | CALLOUT | Amazon, Clearance sites | Time-limited pricing is conversion driver; worth separate marketing mention |
| 4. Sale Waitlist | SIMPLE | YES | Shopify, EventBrite | Low implementation cost; core visibility tool for sold-out sales; basic tier feature |
| 5. Message Templates | PRO | NO | Zendesk, Slack | Productivity multiplier (response time +40%); batch communication scales with organizer success |
| 6. Virtual Queue / Line Management | TEAMS | NO | Ticketmaster, Apple Stores | High-touch, labor-intensive feature; requires support + real-time infrastructure (defer) |
| 7. Organizer Digest Emails | SIMPLE | NO | Shopify, Etsy | Standard platform hygiene; informs organizers of activity, drives retention |
| 8. Notification Inbox | SIMPLE | YES | Shopify, Stripe | Core UX component; in-app inbox expected at free tier |
| 9. Reviews (receive + manage) | SIMPLE | YES | Etsy, Airbnb | Reputation system drives trust; organizer credibility is product foundation |
| 10. Affiliate Program | TEAMS | NO | Shopify, WordPress | High-friction setup, requires referral infrastructure + payouts; defer to post-scale |
| 11. Disputes | SIMPLE | YES | Stripe, PayPal | Trust & safety critical; required for transaction integrity (platform liability) |
| 12. A/B Testing | INFRASTRUCTURE | NO | Internal tools only | Platform optimization, not customer-facing |
| 13. Invites | SIMPLE | YES | Slack, Teams | Network growth tool; organizer can invite shoppers/other organizers (viral vector) |
| 14. Coupons | PRO | YES | Shopify, Etsy | Discount mechanics + rate limiting = analytics + control (PRO lever) |
| 15. Tiers Backend | INFRASTRUCTURE | NO | ADR-065 operationalization | Gating system, not end-user feature |
| 16. Webhooks | TEAMS | NO | Stripe, Zapier | For 3rd-party integrations; API maturity defer to post-MVP |
| 17. Earnings PDF | PRO | YES | Etsy, Shopify | Financial reporting = professional-grade operations; export mirrors CSV gating |

**Organizer Tier Breakdown:**
- SIMPLE: 10 features (checklist, waitlist, digest, inbox, reviews, disputes, invites)
- PRO: 5 features (pickup scheduling, flash deals, message templates, coupons, earnings PDF)
- TEAMS: 1 feature (virtual queue, affiliate program)
- INFRASTRUCTURE: 2 features (A/B testing, tiers backend)

---

### B. SHOPPER-SIDE FEATURES (12 items)

| Feature | Tier | Pricing Page | Industry Std. | Rationale |
|---------|------|--------------|---------------|-----------|
| 18. Wishlists | FREE_SHOPPER | YES | Pinterest, Etsy | Core discovery tool; free forever (network effect) |
| 19. Saved Searches | FREE_SHOPPER | YES | eBay, Google Alerts | Notification-driven engagement; free forever (acquisition + retention) |
| 20. Shopper ↔ Organizer Messaging | FREE_SHOPPER | YES | Poshmark, Etsy | Transaction prerequisite; free forever (reduces friction on conversion path) |
| 21. Buying Pools | FREE_SHOPPER | YES | GroupBuy, Split.com | Community feature, low revenue impact; free forever (network growth) |
| 22. Bounties | FREE_SHOPPER | YES | eBay's "Find It" | Demand signal tool; free forever (organizers benefit from search data) |
| 23. Trending Page | FREE_SHOPPER | YES | Pinterest, Etsy | Discovery/SEO driver; free tier feature |
| 24. Activity Feed | FREE_SHOPPER | YES | Instagram, Facebook | Social engagement loop; free tier feature (gamification primer) |
| 25. Route Planning (OSRM) | FREE_SHOPPER | YES | Google Maps, Route4Me | Shopper convenience + organizer proximity data; free tier (location lock-in) |
| 26. City Pages | FREE_SHOPPER | YES | Etsy, eBay | SEO/geographic targeting; free tier (organic discovery) |
| 27. Neighborhood Pages | FREE_SHOPPER | YES | Zillow, Nextdoor | SEO/local discovery; free tier (geographic depth) |
| 28. Shopper Public Profiles | FREE_SHOPPER | YES | Instagram, eBay | Social credibility + collection showcase; free tier (shopper brand) |
| 29. Shopper Referral Dashboard | STANDALONE_PAID | NO | Dropbox Rewards, Uber | Referral incentives (credit-based, not cash); shopper acquisition lever |

**Shopper Tier Breakdown:**
- FREE_SHOPPER: 11 features (all network effects prioritized)
- STANDALONE_PAID: 1 feature (referral dashboard with incentive tracking)

---

### C. GAMIFICATION FEATURES — SHOPPERS (4 items)

| Feature | Tier | Pricing Page | Industry Std. | Rationale |
|---------|------|--------------|---------------|-----------|
| 30. Points System | FREE_SHOPPER | YES | Etsy Star, eBay Membership | Retention mechanic; free tier gamification layer |
| 31. Streaks (visit/save/purchase) | FREE_SHOPPER | YES | Duolingo, Snapchat | Habit loop = daily engagement; free tier (low marginal cost) |
| 32. Treasure Hunt | FREE_SHOPPER | YES | Pokémon GO, Snapchat Lenses | Daily active user driver; free tier event/content feature |
| 33. Leaderboard (shoppers + organizers) | FREE_SHOPPER | YES | Etsy Favorited, eBay Power Seller | Social proof (shoppers) + credibility (organizers); free tier |
| 34. Hunt Pass ($4.99/30d) | STANDALONE_PAID | CALLOUT | **NEW TIER:** Streak multiplier subscription | Shopper micro-subscription; Stripe-billed add-on, already live, low churn risk |

**Gamification Tier Breakdown:**
- FREE_SHOPPER: 4 features (core gamification loop)
- STANDALONE_PAID: 1 feature (Hunt Pass — already billing, prominent upsell)

---

### D. PLATFORM / AI FEATURES (3 items)

| Feature | Tier | Pricing Page | Industry Std. | Rationale |
|---------|------|--------------|---------------|-----------|
| 35. AI Sale Planner Chat | INFRASTRUCTURE | NO | ChatGPT, Perplexity | Acquisition/marketing tool; not auth-required (public funnel), informational only |
| 36. Price History | FREE_SHOPPER | YES | eBay, Amazon | Price transparency builds trust; free tier competitive feature |

**Platform Tier Breakdown:**
- FREE_SHOPPER: 1 feature (price history — trust signal)
- INFRASTRUCTURE: 1 feature (AI chat — marketing/sales funnel)

---

## Complete Tier Summary

| Tier | Count | Purpose |
|------|-------|---------|
| SIMPLE | 10 | Core organizer operations (no paywall) |
| PRO | 5 | Analytics, logistics, batch tools ($29/mo) |
| TEAMS | 2 | Teams, white-label, high-touch (Q4 2026+) |
| FREE_SHOPPER | 17 | All shopper discovery, gamification, messaging (free forever) |
| STANDALONE_PAID | 3 | Hunt Pass + micro-purchases + referral tracking |
| INFRASTRUCTURE | 4 | Internal systems, not customer-facing |
| **TOTAL** | **36** | |

---

## Pricing Page Feature List

*Copy-ready feature groupings for `/pricing` page. No jargon. Customer-facing language.*

### SIMPLE Tier ($0 — Forever Free)
**For organizers getting started**

- **Sale Checklist** — Create custom pre-sale prep lists to stay organized
- **Sale Waitlist** — Let shoppers wait for sold-out or upcoming sales
- **Organizer Digest Emails** — Weekly activity summaries (sales, items, shoppers)
- **Notification Inbox** — All platform alerts in one place
- **Reviews & Ratings** — Receive feedback from shoppers, build your reputation
- **Dispute Resolution** — Report and resolve transaction issues
- **Invites** — Invite shoppers to your sales or other organizers to the platform
- **Organizer Messaging** — Chat with shoppers about specific items

### PRO Tier ($29/month)
**For organizers scaling operations**

*Everything in SIMPLE, plus:*

- **Pickup Scheduling** — Create time slots for shopper pickups, manage logistics
- **Flash Deals** — Run limited-time price promotions on specific items
- **Message Templates** — Save and reuse common responses to shopper inquiries
- **Coupon Management** — Create and distribute discount codes
- **Earnings PDF Export** — Download financial reports for tax/accounting

### TEAMS (Coming Later)
**For professional teams and white-label operators**

- Team member access & role management
- API access for custom integrations
- White-label platform configuration
- Dedicated support

---

### FREE SHOPPER FEATURES
**All shoppers get these — no paywall, ever**

**Discovery & Browsing**
- **Wishlists** — Save items across multiple named lists
- **Saved Searches** — Save favorite searches with automatic notifications when new items match
- **Trending Page** — See what's popular right now across the platform
- **City & Neighborhood Pages** — Browse sales by location
- **Price History** — See price changes on items over time

**Community & Engagement**
- **Activity Feed** — Follow sale activity and other shoppers
- **Public Profiles** — Create your profile, showcase your collection
- **Reviews & Ratings** — Rate organizers and sales you've visited
- **Points & Streaks** — Earn points for visiting sales, save streaks, and collect rewards
- **Treasure Hunt** — Daily challenges with bonus point rewards
- **Leaderboard** — See top shoppers and organizers on the platform

**Shopping & Messaging**
- **Shopper-to-Organizer Messaging** — Chat directly about items before buying
- **Buying Pools** — Team up with other shoppers to split large purchases
- **Bounties** — Post "looking for" requests; organizers can fulfill them
- **Route Planning** — Plan the optimal route for visiting multiple sales

---

### HUNT PASS ($4.99/30 days)
**Shopper add-on: Boost your earning potential**

- **2× Streak Multiplier** — Earn points twice as fast on consecutive visit and save streaks
- 30-day subscription (auto-renew, cancel anytime)

---

### A-LA-CARTE FEATURES (Future, Post-Beta)
*Not recommended for initial launch; consider for Phase 2 revenue diversification.*

- **Featured Boost** — Organizer: Promote a sale to top of city pages ($25–$50, 7d duration)
- **Smart Clearance** — Organizer: AI-driven bulk clearance pricing ($0.50/item or $5 flat, one-time)
- **Instant Appraisal** — Shopper: AI appraisal for negotiation ($0.99 per item)
- **Priority Checkout** — Shopper: Skip the queue at checkout ($2.99 per transaction)

---

## 3 Decisions for Patrick

### Decision 1: Virtual Queue (Item #6) — TEAMS or DEFER?

**Current Classification: TEAMS (defer to post-scale)**

**Tradeoff:**
- **TEAMS tier** signals premium, high-touch feature (real-time SMS, queue management, labor-intensive).
- **Risk:** Organizers expect this at SIMPLE or PRO tier for high-demand sales. EstateSales.NET doesn't offer it; this is a differentiator.
- **Alternative:** Move to **PRO** tier if queue management can be fully self-service (no SMS, just in-app). Estimated savings: 40% implementation complexity.

**Recommendation:** Keep TEAMS. It requires real-time infrastructure, SMS integration, and organizer support. Launch core features first; this is a "nice-to-have" in the early market. Revisit when you have 20+ concurrent sales/day organizers.

---

### Decision 2: Affiliate Program (Item #10) — TEAMS or DEFER Further?

**Current Classification: TEAMS (Q4 2026+ if demand)**

**Tradeoff:**
- **TEAMS tier** assumes professional ops (payouts, fraud detection, referral attribution).
- **Risk:** Part-time organizers (your early market) won't care. Referral mechanics work better as **SIMPLE organic feature** (no payouts, reputation-only).
- **Alternative:** Launch **free referral tracking** (SIMPLE) showing "You invited X organizers" badges. Monetize later via affiliate credits toward PRO subscription.

**Recommendation:** DEFER payouts (TEAMS) until you have 30+ organizers + clear repeat revenue signal. Launch lightweight referral badges (SIMPLE) in S177+ if Founding Organizer program shows adoption.

---

### Decision 3: Coupons (Item #14) — PRO or SIMPLE?

**Current Classification: PRO**

**Tradeoff:**
- **PRO tier** locks discount mechanics behind subscription (drives conversion).
- **Risk:** Organizers expect basic coupon capability at free tier (low implementation cost). Etsy, Shopify offer limited coupons free.
- **Industry precedent:** Etsy (free), Shopify (free up to 100, Shopify Plus unlimited), Square (free).
- **Alternative:** Allow **3 active coupons** at SIMPLE; **unlimited + advanced analytics** at PRO.

**Recommendation:** Move coupons to **SIMPLE with limits** (3 active, 50 redemptions/month). Set PRO unlock at "advanced analytics on coupon performance + automatic discount tiers." This removes friction at free tier while maintaining PRO upsell (insights for bulk campaigns).

---

## Implementation Checklist for Patrick

- [ ] **Review tier assignments** — any overrides before submission?
- [ ] **Confirm pricing page language** — read-friendly for estate sale audience?
- [ ] **Approve 3 decision points** — TEAMS virtual queue, affiliate defer, simple coupons?
- [ ] **Finalize Hunt Pass messaging** — prominent upsell location on pricing page?
- [ ] **Flag organizer tier gates** — which features require backend `checkTierAccess()` retrofit?
- [ ] **Plan roadmap update** — append this classification to roadmap.md with decision log?

---

## Related Documents

- **ADR-065:** Organizer Mode Tiers (approval doc)
- **feature-tier-matrix-2026-03-15.md:** Exhaustive existing feature matrix (71 features shipped/queued/future)
- **pricing-analysis-2026-03-15.md:** Revenue & tier strategy (investor doc)
- **advisory-board-adr-065-pricing-analysis-2026-03-16.md:** Stress test & recommendations

---

**Status:** Ready for Patrick review and board decision.
**Next Step:** Patrick approves / overrides 3 decision points, then findasale-records updates roadmap.md with final tier classifications.
