# FindA.Sale — Pricing & Tier Strategy Overview

**Status:** Draft — Awaiting Patrick approval on 6 key decisions below
**Date:** 2026-03-15 (Session 176)
**Sources:** Architect (feature-tier-matrix-2026-03-15.md), Investor (pricing-analysis-2026-03-15.md), Advisory Board (Go-to-Market + Risk subcommittees)

---

## The Model in One Sentence

FindA.Sale charges a **10% platform fee on every transaction** (unchanged across all tiers), plus an optional **monthly subscription for power features**. Shoppers are always free. Beta access is full-feature free.

---

## Organizer Tiers

### SIMPLE (Free)

The 19 core features every organizer gets at zero subscription cost:

- Sale creation, editing, publishing, archiving
- Item management (add/edit/delete/status)
- Rapidfire Camera Mode + AI tag suggestions
- Health score + condition grading
- Holds + configurable hold duration
- Stripe Terminal POS (multi-item, cash, 10% fee parity)
- Basic email reminders to shoppers
- Share Card Factory (OG social cards)
- Hype Meter (real-time activity counter)
- Entrance Pin location
- Neighborhood Heatmap
- Serendipity Search + category pages
- Near-Miss Nudges (gamification)
- Tag SEO pages (/tags/[slug])

**Intentional friction in SIMPLE (drives PRO conversion):**
- Limit to 1–3 concurrent active sales (not unlimited)
- Bulk operations capped at 10 items at a time
- No data exports (CSV/ZIP)
- No analytics or performance dashboard

---

### PRO (Recommended: $29/month or $290/year)

Everything in SIMPLE, plus:

**Analytics & Intelligence**
- Seller Performance Dashboard (per-sale revenue, conversion, sell-through rate)
- Organizer Insights (lifetime cross-sale totals)
- Payout Transparency Dashboard (item-level fee breakdown)
- Flip Report (#41) — post-sale PDF: "what sold, what didn't, what to reprice next time"

**Batch Operations & Efficiency**
- Full Batch Operations Toolkit (bulk price/status/category/tag/photo, up to 200 items)
- Holds-Only Item View (batch release/extend/markSold, grouped by buyer, hold timers)
- Unlimited concurrent active sales

**Branding & Export**
- Brand Kit (businessName, logo, colors, social links — propagates to templates/exports)
- Cloudinary watermark on all exported photos
- CSV/JSON/Text listing exports (all items + sales + purchases)
- Open Data Export (ZIP download for CCPA/GDPR compliance)
- Social Templates (3 tones × 2 platforms)

**Upcoming PRO features (planned):**
- Voice-to-Tag (#42)
- OG Image Generator (dynamic branded cards) (#43)
- Sale Hubs (#40 — group nearby sales)
- Post Performance Analytics — UTM tracking on social templates (#18)
- Command Center Dashboard (#68) — multi-sale power view

---

### TEAMS ($79/month)

**Recommendation from Architect + Board: Ships as features are built. No deferral.**

Teams tier will include everything in PRO plus:
- Multi-user team access (role-based: admin/editor/viewer)
- API access with OAuth2 auth, rate limiting, versioning
- Webhooks (new-sale, item-sold, hold-expired events)
- White-label option (custom domain, brand removal)
- Platform fee discount (7–9% vs 10% standard)
- Priority support SLA
- Dedicated account manager

**Pricing:** $79/month or $790/year (locked).

---

## Shopper Tiers

**Recommendation: Keep shoppers 100% free indefinitely.**

All shopper features — discovery, search, map, item detail, holds, wishlist, calendar, Weekly Treasure Digest, sale reminders — remain free. Network effects (more shoppers → more organizer value → more organizer adoption) are worth more than any Premium Shopper subscription revenue.

**PREMIUM_SHOPPER (defer entirely):** Don't build or announce a paid shopper tier. Reassess only if beta shows 1,000+ shoppers with 30%+ repeat visit rate.

Future shopper monetization path (if needed): organizer-sponsored "featured sale" ads — not a shopper subscription.

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

**Strategic note:** The cumulative cost of 3 a-la-carte purchases ($30+) exceeds the monthly PRO price ($29), intentionally nudging toward subscription. A-la-carte is a trial mechanism, not a primary revenue stream.

---

## Beta Pricing Strategy

**During beta (now through ~Q2 2026):** All organizers get full PRO access free. No gates, no limits. This maximizes feature usage data and avoids bait-and-switch perception.

**60 days before beta ends:** Announce to all beta organizers: "You've been on PRO free during beta. When beta ends on [DATE], the standard plan is $29/month. As a founding organizer, you can lock in a special rate."

**Founding Organizer Program: Not Being Pursued**

No founding organizer program. Beta testers get full PRO access during beta period. At beta end, standard pricing ($29/mo PRO, $79/mo Teams) applies to all organizers.

**Day 1 of paid tier:** Feature lockdown for SIMPLE users (loss aversion drives conversion). New sign-ups get 7-day free PRO trial (approved).

---

## Revenue Model at Scale

| Organizers | Monthly Sub Revenue | Annual Transaction Fee Revenue (est.) |
|------------|--------------------|-----------------------------------------|
| 10 organizers (post-beta) | $290/mo (if all PRO) | ~$72k/year |
| 50 organizers | $1,450/mo | ~$360k/year |
| 200 organizers | $5,800/mo | ~$1.44M/year |

**Key insight (Investor):** Transaction fees will be 89%+ of revenue for the first 18 months. Subscription revenue is a retention signal and a stabilizer — not the primary growth lever. **Organizer acquisition velocity matters more than subscription pricing optimization at this stage.**

---

## Open Questions / Key Tensions

**1. Fee model inversion (Advisory Board contrarian bet):**
Current: 10% transaction fee + $29/month PRO subscription
Proposed alternative: $20/month (all organizers, no SIMPLE/PRO split) + 12–15% transaction fee
Risk board's argument: simpler pricing, more honest ("we take a cut of your success"), eliminates double-dipping perception.
Counter-argument: Higher fee % hurts high-volume organizers; current 10% is a competitive advantage vs. EstateSales.NET's 25%.

**2. Founding Organizer rate: $99/year vs. $19/month locked:**
Investor recommends $99/year (one-time, locked 12 months) — maximizes immediate cash.
Go-to-Market subcommittee recommends $19/month locked forever for first 25 — maximizes long-term loyalty.
Both create urgency, different risk profiles.

**3. SIMPLE tier friction level:**
How aggressively do we limit SIMPLE? If too generous, nobody upgrades. If too restrictive, we lose organizers to competitors before they see value.
Recommended middle ground: Unlimited sales, unlimited items — but no analytics, no exports, no batch ops, no brand kit.

---

## Locked Tier Decisions

**Status: All decisions finalized by Patrick (Session 177+)**

1. ✅ **PRO price: $29/month or $290/year** (Investor recommendation — 60% below EstateSales.NET)

2. ✅ **Tier naming locked: SIMPLE / PRO / TEAMS** (All references to ENTERPRISE are now retired. Estate sale organizers are small businesses — Teams is the right fit.)

3. ✅ **No Founding Organizer program.** Beta testers get full PRO access during beta period. Standard pricing applies at beta end.

4. ✅ **Teams tier ships as features are built.** No deferral to Q4 2026. Teams features launch on schedule.

5. ✅ **Fee model: Stay the course.** Keep 10% platform fee (unchanged across all tiers) + optional $29/month PRO subscription.

6. ✅ **SIMPLE tier friction limits enforced at launch:**
   - Cap at 1–3 concurrent active sales
   - Bulk operations capped at 10 items
   - No exports
   - No analytics

---

## What to Tell Beta Testers

The beta communication is:

> "You're on FindA.Sale PRO free during beta. All features are unlocked so you can explore everything and give us honest feedback. When beta ends [TARGET DATE], the standard plan is $29/month for PRO. We'll give you 60 days' notice before any features change."

This sets expectations clearly. Beta testers get a preview of all PRO features at no cost; standard pricing applies at beta end.

---

## Supporting Documents

- **Full feature tier matrix:** `claude_docs/feature-notes/feature-tier-matrix-2026-03-15.md` (550+ lines, every feature classified)
- **Full pricing analysis:** `claude_docs/operations/pricing-analysis-2026-03-15.md` (ROI models, projections, risk flags)
- **Advisory Board analysis:** `claude_docs/strategic/advisory-board-adr-065-pricing-analysis-2026-03-16.md` (Go-to-Market + Risk subcommittee findings)

---

*This document is a living strategy brief. Update after Patrick makes decisions on the 6 items above. Next action: dispatch findasale-dev for #65 Organizer Mode Tiers implementation once tier matrix is approved.*
