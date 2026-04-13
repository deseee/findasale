# FindA.Sale — Pricing & Tier Strategy Overview

**Status:** LOCKED — Session 207, Patrick approved
**Date:** 2026-03-19
**Sources:** Architect (feature-tier-matrix-2026-03-15.md), Investor (pricing-analysis-2026-03-15.md), Advisory Board (Go-to-Market + Risk subcommittees), Customer Champion, S207 Comprehensive Review

---

## The Model in One Sentence

FindA.Sale charges **platform fees that scale with value** (10% free tier, 8% paid tiers) plus optional **monthly subscriptions for power features**. Shoppers are always free. Overages are modest per-item costs. Auction buyer premium (5%) unlocks shopper monetization without friction.

---

## Organizer Platform Fees (LOCKED)

**Core principle:** "We earn when you earn" — simple binary fee structure.

| Tier | Monthly Subscription | Platform Fee | Overages | Rationale |
|------|---------------------|--------------|----------|-----------|
| **SIMPLE** (Free) | None | 10% per transaction | $0.10/item beyond 200/sale | Free users carry higher risk; fee reflects operational cost |
| **PRO** | $29/month or $290/year | 8% per transaction | $0.05/item beyond 500/sale | Committed users → lower risk → fee discount |
| **TEAMS** | $79/month or $790/year | 8% per transaction | $0.05/item (soft cap, negotiable) | Enterprise users → negligible risk → parity with PRO |

**Platform fee applies to:**
- Item sales (standard purchase + payment fee capture)
- Auction sales (buyer premium + item sale)
- Holds (if organizer charges hold deposit via POS)

**Platform fee does NOT apply to:**
- Donor items (organizers can list items at $0)
- Gift/giveaway items

---

## Tier Limits (Capacity + Features)

**Allocations per tier (hard limits except noted):**

| Metric | SIMPLE | PRO | TEAMS |
|--------|--------|-----|-------|
| Items per sale | 200 included, then $0.10/item | 500 included, then $0.05/item | 2,000 included, then $0.05/item (soft cap) |
| Photos per item | 5 photos included | 10 photos included | 15 photos included |
| Photos per month | 500 | 5,000 | 30,000 |
| AI tags per month | 100 | 2,000 | Unlimited (soft cap 5,000) |
| Concurrent active sales | 1–3 | Unlimited | Unlimited |
| Bulk operations | Capped at 10 items/operation | Up to 200 items/operation | Up to 500 items/operation |

---

## Shopper Monetization (LOCKED)

### Buyer Premium on Auction Items
- **5% buyer premium** on auction items ONLY (not standard purchases)
- Organizer-controlled: flag items as "auction" vs "standard"
- Splits 95% organizer / 5% platform
- Disclosed at checkout with clear label: "5% buyer premium applies to auction items"

### Hunt Pass ($4.99/30 days)
- **Status: PAUSED** until platform reaches 1,000+ daily active users with 30%+ repeat rate
- Offers: ad-free browsing, saved searches, curated digests, early access to high-demand sales
- Revisit trigger: 1,000 DAU + 30% repeat rate across 30 days

### Premium Shopper Tier
- **Status: DEFERRED to 2027 Q2**
- No announcement. No feature placeholder. No pre-announcement email.
- Rationale: network effects (more shoppers → more organizer value) worth more than shopper subscription revenue at current scale

---

## A-La-Carte Options (Post-Beta, Secondary Priority)

For organizers who don't want a monthly PRO subscription but want specific features for individual sales:

| Feature | Price | Notes |
|---------|-------|-------|
| Flip Report (single sale) | $9.99 | One-time purchase, per sale |
| CSV/JSON Export Bundle | $4.99 | One-time, 30-day access |
| Analytics Snapshot (single sale) | $7.99 | One-time report, no ongoing access |
| Brand Kit Setup | $14.99 one-time | Permanent brand profile, no subscription |
| OG Image Generator (per sale) | $4.99 | Dynamic branded cards for one sale |
| Social Templates (per sale) | $4.99 | Unlocks 3-tone × 2-platform templates for one sale |

**Strategic note:** Cumulative cost of 3 a-la-carte purchases ($30+) exceeds monthly PRO price ($29), intentionally nudging toward subscription. A-la-carte is a trial mechanism, not a primary revenue stream.

---

## Post-Beta Revenue Streams (Future, Not Beta)

**These launch AFTER beta closes and organizer base reaches stability (50+ organizers):**

### Featured Placement
- **Price:** $29.99 per 7-day featured sale listing
- **Placement:** Homepage carousel, email campaigns, map prominence, search boost
- **Transparency:** Clear "Promoted" or "Featured" label on all placements
- **Constraints:** Max 2 featured per organizer per week; prevents sale-list spam

### Affiliate Commissions (B2B Sales Channel)
- **Price:** 2–3% on referred organizers' first-year revenue
- **Mechanism:** Partner agencies (moving companies, estate attorneys, real estate agents) refer organizers → earn commission on subscription + transaction fees
- **Rationale:** Low-friction customer acquisition; validates PMF through partner feedback

### AI Tagging Premium
- **Audience:** SIMPLE-tier heavy users (50+ items/month)
- **Price:** $4.99/month for unlimited AI tags (beyond monthly 100-tag alloc)
- **PRO/TEAMS:** Already bundled (unlimited tags built in)
- **Rationale:** Monetize power users without alienating casual organizers

### B2B Data Products
- **Status: DEFERRED** (see `claude_docs/strategy/b2b-b2e-b2c-innovation-broad-2026-03-19.md`)
- **Future scope:** Aggregated secondhand market intelligence, valuation API licensing, category trend reports
- **Revisit trigger:** 200+ organizers across 5+ metro areas; anonymized data volume sufficient for meaningful insights
- **Revenue model:** $99–$999/month per data product; target: appraisers, insurers, retailers, municipal planners

---

## Beta Pricing Strategy (NOW through ~Q2 2026)

**During beta:** All organizers get full PRO access free. No gates, no limits. This maximizes feature usage data and avoids bait-and-switch perception.

**60 days before beta ends (target: mid-May 2026):** Announce to all beta organizers:
> "You've been on PRO free during beta. When beta ends on [DATE], the standard plan is $29/month for PRO. As a founding organizer, you can [continue to standard rates / get early-bird rate]."

### Founding Organizer Program: Not Being Pursued
No special rates. Beta testers get full PRO access during beta period. At beta end, standard pricing ($29/mo PRO, $79/mo TEAMS) applies to all organizers.

### Day 1 of Paid Tiers
- Feature lockdown for SIMPLE users (loss aversion drives conversion)
- New sign-ups get 7-day free PRO trial (approved)

---

## Revenue Model at Scale

| Organizers | Monthly Sub Revenue (100% PRO) | Annual Transaction Fee Revenue (est.) |
|------------|-----------------------------|-----------------------------------------|
| 10 organizers (post-beta) | $290/mo | ~$72k/year |
| 50 organizers | $1,450/mo | ~$360k/year |
| 200 organizers | $5,800/mo | ~$1.44M/year |
| 500 organizers | $14,500/mo | ~$3.6M/year |

**Key insight (Investor):** Transaction fees will be 89%+ of revenue for the first 18 months. Subscription revenue is a retention signal and a stabilizer—not the primary growth lever. **Organizer acquisition velocity matters more than subscription pricing optimization at this stage.**

---

## Tier Features (Summary)

### SIMPLE (Free)
19 core features, no subscription cost:
- Sale creation, editing, publishing, archiving
- Item management + AI tag suggestions (100/month)
- Rapidfire Camera Mode
- Health score + condition grading
- Holds + configurable hold duration
- Stripe Terminal POS (10% fee parity)
- Basic email reminders
- Share Card Factory
- Hype Meter (real-time activity counter)
- Entrance Pin location
- Neighborhood Heatmap
- Serendipity Search
- Near-Miss Nudges (gamification)
- Tag SEO pages

**Intentional friction (drives PRO conversion):**
- 1–3 concurrent active sales max
- Bulk operations capped at 10 items
- No data exports
- No analytics dashboard

---

### PRO ($29/month or $290/year)
Everything in SIMPLE, plus:

**Analytics & Intelligence:**
- Seller Performance Dashboard
- Organizer Insights (cross-sale totals)
- Payout Transparency Dashboard
- Flip Report (#41) — post-sale PDF

**Batch Operations & Efficiency:**
- Full Batch Operations Toolkit (up to 200 items)
- Unlimited concurrent active sales
- Holds-Only Item View

**Branding & Export:**
- Brand Kit (businessName, logo, colors)
- CSV/JSON/Text listing exports
- Open Data Export (ZIP, CCPA/GDPR)
- Social Templates (3 tones × 2 platforms)

---

### TEAMS ($79/month or $790/year)
Everything in PRO, plus:

- Multi-user team access (role-based: admin/editor/viewer)
- API access with OAuth2 auth
- Webhooks (new-sale, item-sold, hold-expired)
- White-label option (custom domain)
- Priority support SLA
- Dedicated account manager

---

## What to Tell Beta Testers

> "You're on FindA.Sale PRO free during beta. All features are unlocked so you can explore everything and give us honest feedback. When beta ends [TARGET DATE], the standard plan is $29/month for PRO. We'll give you 60 days' notice before any features change."

---

## Supporting Documents

- **Full feature tier matrix:** `claude_docs/feature-notes/feature-tier-matrix-2026-03-15.md`
- **Full pricing analysis:** `claude_docs/operations/pricing-analysis-2026-03-15.md`
- **Advisory Board analysis:** `claude_docs/strategic/advisory-board-adr-065-pricing-analysis-2026-03-16.md`
- **B2B/B2E/B2C Innovation Strategy:** `claude_docs/strategy/b2b-b2e-b2c-innovation-broad-2026-03-19.md`
- **Photo Storage Strategy:** `claude_docs/strategy/photo-storage-strategy-2026-03-19.md`

---

*This document is the authoritative pricing reference for FindA.Sale. Updated 2026-03-19, Session 207.*
