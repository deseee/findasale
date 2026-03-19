# Affiliate Program Research Report
**Date:** 2026-03-19
**Prepared by:** Innovation Agent
**Status:** Ready for Patrick Review

---

## Executive Summary

FindA.Sale has a **partially-built affiliate program** with backend routes and schema models already in place, but limited frontend integration and no clear revenue model or tier classification. The existing code supports **two distinct referral patterns:** creator/sale-specific affiliate links (CREATOR role) and organizer-to-organizer referral discounts. This report details what's built, what was originally envisioned, and proposes a phased approach to monetization that serves FindA.Sale's acquisition and retention goals.

---

## PART 1: WHAT EXISTS NOW

### Backend Infrastructure (Fully Built)

**Routes:**
- `GET /affiliate/click/:id` — Public route tracking clicks on affiliate links (no auth required)
- `POST /affiliate/generate` — Authenticated: CREATOR role only. Generates a unique affiliate link for a specific sale.
- `GET /affiliate/links` — Authenticated: CREATOR role. Returns list of affiliate links created by the user.
- `GET /affiliate/stats` — Authenticated: CREATOR role. Returns aggregate stats (total clicks, total conversions, total links).

**Schema Models (4 referral-related models):**

1. **AffiliateLink** — Sale-specific affiliate tracking
   - Tracks clicks and conversions per creator per sale
   - Composite unique key: `[userId, saleId]`
   - Fields: `clicks` (int), `conversions` (int), `createdAt`, `updatedAt`
   - Can link to `Purchase` records for conversion attribution

2. **Referral** — Generic user-to-user referral
   - One-to-one: referrer → referred user
   - Composite unique key: `[referrerId, referredUserId]`
   - No monetary fields (placeholder for future reward logic)

3. **OrganizerReferral** — Organizer-to-organizer referral discount program
   - Status tracking: `PENDING` or `CREDITED`
   - `creditAmount` field (in dollars, not cents) — **fee bypass incentive already implemented**
   - Composite unique key: `[referrerId, refereeId]`
   - `creditedAt` timestamp for tracking payout

4. **ReferralReward** — Transaction log for referral incentives
   - Tracks `rewardType` ("POINTS" or "CREDIT")
   - `rewardValue` (float), `awardedAt`, `redeemedAt`
   - Composite unique key: `[referrerId, referredUserId]`
   - Designed for shopper-to-shopper referral rewards

### Frontend Integration (Partial)

**Creator Dashboard** (`/creator/dashboard.tsx`):
- Full analytics tab: displays affiliate clicks, conversions, earnings
- Settings tab: Stripe connection status, payout management, notification preferences
- Creator tier system (Bronze → Silver → Gold progression with commission rate multipliers)
- Displays 10% commission rate hardcoded
- Referral activity table showing recent sign-ups
- Fetches from `/affiliate/stats` and `/referrals/dashboard` endpoints

**Affiliate Landing Page** (`/affiliate/[id].tsx`):
- Simple redirect page that captures affiliate link ID in `sessionStorage`
- Redirects to homepage, storing `affiliateRef` for downstream conversion tracking
- Currently minimal — just stores and redirects (no marketing/branding)

### User Role

- **CREATOR role** — Required to generate affiliate links and view stats
- Currently, only users with `role = 'CREATOR'` can access affiliate features
- **No existing CREATOR role assignment flow** — This is a gap

---

## PART 2: ORIGINAL VISION

Based on code structure and tier classification audit, the affiliate program was originally envisioned as:

1. **Multi-creator monetization layer** — Allow "super users" (possibly influencers, interior designers, estate sale agents) to generate earning potential by promoting individual sales

2. **Organic creator economy within the platform** — The CREATOR role suggests a two-tier user model: regular organizers vs. content creators who promote multiple sales and earn commissions

3. **Sales-specific attribution** — Rather than broad platform referrals, tie earnings to **specific sales** (likely high-value ones), creating incentive for creators to curate and promote hand-picked sales

4. **Tiered commissions** — The "Creator Tier" UI (Bronze → Silver → Gold) indicates plans for 3+ commission tiers with multipliers based on performance thresholds

5. **Organizer-to-organizer network effect** — The `OrganizerReferral` model with `creditAmount` (fee discount) suggests a parallel program where existing organizers refer new organizers, offering fee waivers as incentive (already documented in schema as "Feature #11: Referral discount")

6. **Stripe Connect payouts** — The creator dashboard checks Stripe account status and Stripe connection UI, indicating intent for direct payouts to creators' bank accounts (not credits/points)

### Why Classified as TEAMS Tier

From the tier classification doc:
> "High-friction setup, requires referral infrastructure + payouts; defer to post-scale"

The program was deferred because:
- Needs Stripe Connect integration (not trivial, requires KYC verification)
- Requires fraud detection (click farms, fake conversions)
- Support burden (payout disputes, commission clarity)
- Low ROI in early beta (too few creators and sales to matter)

---

## PART 3: INNOVATION PROPOSALS

The affiliate program represents a **significant untapped lever for estate sale community growth**. Here are 5 proposals that align with FindA.Sale's core mission (reduce organizer manual work, build network effects):

### Proposal 1: Free Referral Badges (SIMPLE Tier) — Immediate Launch

**What:** Lightweight, zero-friction referral tracking for organizers (not just creators). No payouts, no Stripe required.

**How:**
- Remove the CREATOR role gating; allow all ORGANIZER users to generate referral links for their own sales
- Display **"X people joined via your invite"** badge on organizer profile
- Track referrals in new `OrganizerInviteTracker` model: `[organizerId, inviteeId, inviteType, acceptedAt]`
- Show simple referral leaderboard on city/neighborhood pages: "Top organizers by referrals this month"

**Why it works:**
- Organizers already want reputation and social proof (reviews, public profiles exist)
- Zero implementation cost (no Stripe, no payouts, no KYC)
- Taps into competitive/status motive: "Jane is #3 organizer in Grand Rapids by referrals"
- Can be gamified: "Refer 5 organizers, unlock blue badge"

**Estate sale angle:**
- Encourages word-of-mouth among professional estate liquidators
- Professional credibility: "Referred by [Trusted Organizer Name]" carries weight in this industry

**Roadmap:** S180–S182 (3 weeks)

---

### Proposal 2: Commission-Based Creator Program (PRO/TEAMS Tier) — Phase 2

**What:** Monetize the existing CREATOR role; launch with careful controls and support.

**How:**
- Enable CREATOR role only for invited, vetted users (e.g., interior designers, estate liquidators with 50+ followers)
- Fixed commission structure: **10% of platform fee** on any purchase attributed to creator's affiliate link
  - Example: Organizer sets 10% platform fee; shopper buys via creator link; creator earns 1% (10% of 10%)
  - Caps creator earnings at reasonable level while keeping organizer incentives aligned
- Stripe Connect onboarding in creator dashboard (already partially built)
- Monthly payout minimum: $50 (reduces payout friction)
- Real-time earnings dashboard (already built)

**Why it works:**
- Taps existing professional network: estate agents, designers, experienced shoppers who want side income
- Low commission rate keeps organizers happy (1% is negligible vs. 10% platform fee)
- Existing infrastructure (Stripe, dashboard UI, creator tier system) is 80% done
- Natural upgrade path: "You've referred 20 organizers, become a Creator Partner"

**Estate sale angle:**
- Estate liquidators can promote sales in their network + earn
- Interior design communities can "curate" vintage finds for their clients
- Creates professional credibility tier distinct from casual users

**Roadmap:** S185–S195 (11 weeks, including Stripe Connect edge cases, fraud detection)
**Tier gate:** PRO or TEAMS (requires high touch setup)

---

### Proposal 3: Loyalty Passport Integration (FREE_SHOPPER) — Phase 2

**What:** Integrate referrals into gamified loyalty system; reward shoppers for inviting others.

**How:**
- Add "Inviter" badge to Loyalty Passport: "Brought X friends to the hunt"
- Shopper earns **2× points on the referred shopper's first purchase** (both shopper and referrer benefit)
- Referral link in shopper profile: "Join my hunt with code SARAH_2024"
- Leaderboard: "Top inviters this month" (drives repeat invites)
- Unlock "Ambassador" tier at Loyalty Passport level 3+ (10+ referrals): 5% discount on Hunt Pass

**Why it works:**
- Shopper network growth (your primary acquisition vector)
- Aligns with points system (already live), requires no new payment infrastructure
- Gamification angle: "Get 5 friends to 100 points, unlock exclusive discount"
- Drives Hunt Pass upsell: "Invite friends, earn points, unlock cheaper subscription"

**Estate sale angle:**
- Shoppers naturally network within communities (antique collector groups, estate sale meetups)
- Word-of-mouth from trusted friend carries high conversion weight

**Roadmap:** S190–S200 (11 weeks, pending Loyalty Passport finalization)
**Tier gate:** FREE_SHOPPER (no paywall)

---

### Proposal 4: Cross-Promotion Network (PRO Tier) — Phase 2

**What:** Organizers refer each other; in exchange, one organizer features the other's sale on their profile.

**How:**
- Expand `OrganizerReferral` to include "featured sale" reciprocal link
- Organizer A invites Organizer B; if B signs up, A gets "Featured Partner" badge + B's next sale promoted on A's profile for 30 days
- Replaces the current fee-discount model with **mutual credibility**
- Track "cross-referral conversions": "How many shoppers viewed B's sale via A's profile?"
- PRO organizers unlock 5 featured partners; SIMPLE limited to 2

**Why it works:**
- Professional network effect: established organizers want to be associated with high-quality peers
- Solves a major estate sale industry pain: isolation. Most estate liquidators work solo; this creates peer network.
- No payouts needed (credibility ≈ value)
- Drives PRO conversion: "Get 5 featured partners (PRO exclusive)"

**Estate sale angle:**
- Estate sale industry is relationship-based; cross-promotions build trust
- Example: "Large estate in Eastown? Refer your furniture specialist friend, get featured on her profile"
- Naturally attracts professional networks (liquidators, appraisers, auction houses)

**Roadmap:** S195–S210 (16 weeks, new schema, new UI)
**Tier gate:** PRO feature (drives conversion)

---

### Proposal 5: Revenue Share Model (TEAMS Tier) — Phase 3 (Post-Scale)

**What:** Full affiliate payouts, tiered commission structure, partner portal.

**How:**
- Launch only when you have 50+ active creators and 200+ monthly referred organizers
- Commission tiers:
  - **Tier 1** (0–50 lifetime referrals): 5% of platform fee on referred organizer's sales
  - **Tier 2** (50–200 referrals): 7.5% of platform fee
  - **Tier 3** (200+ referrals): 10% of platform fee + dedicated partner manager
- Monthly payout via Stripe (minimum $25)
- Partner portal with marketing materials, monthly reports, fraud detection dashboard
- Fraud controls: IP deduplication, device fingerprinting, manual review >$500 payout

**Why it works:**
- Estate liquidators can build sustainable side business ("I make $2k/month referring sales")
- Scales your acquisition: every creator becomes unpaid salesperson
- Professional tier (Partner Manager) creates stickiness and support leverage

**Estate sale angle:**
- Creates licensed "estate sale affiliate network" (marketed as "FindA.Sale Pro Network")
- Positions FindA.Sale as infrastructure for professional liquidators

**Roadmap:** S230+ (Post-beta; requires franchise-like legal review, partner agreements)
**Tier gate:** TEAMS (requires high-touch support)

---

## PART 4: STRATEGIC RECOMMENDATION

### Phased Launch Strategy

**Phase 1 (S180–S182): Free Referral Badges**
**Effort:** Low
**Risk:** Minimal
**Impact:** Quick win, tests referral mechanics, builds momentum for organizer network

- Launch for all organizers (remove CREATOR role gating for this feature)
- Simple leaderboard on city pages
- Zero Stripe integration
- **Go/no-go:** If >30% of organizers generate referral links within 3 months, proceed to Phase 2

**Phase 2 (S185–S210): Hybrid Model (Creator Program + Loyalty Integration + Cross-Promotion)**
**Effort:** Medium
**Risk:** Moderate (Stripe integration, payout fraud)
**Impact:** Dual network growth (shoppers + creators) + organizer stickiness

- Creator Program: Invite 10–20 beta creators (interior designers, experienced liquidators)
- Loyalty Passport: Integrate referral bonuses into gamification
- Cross-Promotion: Launch "featured partners" feature in organizer profiles
- **Go/no-go:** If creator program >$5k/month in earnings and Stripe integrations are reliable, proceed to Phase 3

**Phase 3 (S230+): Revenue Share (Professional Affiliate Network)**
**Effort:** High
**Risk:** High (legal, fraud, support cost)
**Impact:** Sustainable acquisition channel, builds marketplace moat

- Only launch if Phases 1 & 2 show strong organic adoption
- Full tiered commissions, dedicated partner support, brand-new legal agreements
- Position as "estate sale industry infrastructure"

### Why This Sequence Works

1. **Phase 1 tests demand with zero cost** — If organizers don't use referral links, Phases 2–3 are moot.
2. **Phase 2 captures early enthusiasts** — The 10–20 creators willing to go through Stripe signup are your highest-intent users; they'll give you feedback on commission structure.
3. **Phase 3 scales only if phases 1–2 prove the model** — Avoids building an expensive payout infrastructure for a feature nobody uses.

### Key Metrics to Track

- **Phase 1 KPI:** % of organizers generating ≥1 referral link
- **Phase 2 KPI:** Creator signup rate (target: 20% of invited users), avg. creator earnings, creator retention (do they generate links monthly?)
- **Phase 3 KPI:** Creator-referred organizer LTV vs. baseline organizer LTV (should be 20%+ higher)

---

## PART 5: IMPLEMENTATION QUICK-START

### Immediate Next Steps for Patrick

**Decision 1: Phase 1 Scope**
- [ ] Approve free referral badges launch (yes/no/modify)
- [ ] Decide: remove CREATOR role gating for Phase 1, or keep role-based?

**Decision 2: Phase 2 Timing**
- [ ] When should Phase 2 (Creator Program) begin? (S185 = mid-May; S195 = early June)
- [ ] Which estates sale professional networks will you beta invite? (e.g., Michigan estate liquidators association)

**Decision 3: Phase 1 UI/UX**
- [ ] Where should referral badge appear? (Organizer profile top? Leaderboard as separate page?)
- [ ] Simple leaderboard (top 10 this month) or full directory with filters?

### Delegation to Subagents

Once Phase 1 is approved:
- `findasale-dev`: Build free referral badges (remove CREATOR gating, add leaderboard UI, schema update)
- `findasale-frontend`: Create City Pages leaderboard widget
- Timeline: 3 weeks to launch

For Phase 2 (when ready):
- `findasale-dev`: Stripe Connect integration refinements, payout processing, fraud detection
- `findasale-ui`: Creator tier progression UI (Bronze → Silver → Gold)
- Timeline: 11 weeks

---

## Related Documents

- **feature-tier-classification-2026-03-16.md** — Original TEAMS tier classification
- **complete-feature-inventory-2026-03-15.md** — Full audit showing affiliate + creator code already exists
- **STACK.md** — Current tech stack (Stripe, PostgreSQL, Next.js)
- **schema.prisma** — Full data models

---

## Appendix: Existing Affiliate Schema Reference

```
model AffiliateLink {
  id           String     @id @default(cuid())
  userId       String     // Creator ID
  saleId       String     // Sale being promoted
  clicks       Int        @default(0)
  conversions  Int        @default(0)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  user         User       @relation(fields: [userId], references: [id])
  sale         Sale       @relation(fields: [saleId], references: [id])
  purchases    Purchase[] // Can link conversions to purchases

  @@unique([userId, saleId])
}

model OrganizerReferral {
  id           String    @id @default(cuid())
  referrerId   String    // Org A
  refereeId    String    @unique // Org B
  status       String    @default("PENDING")
  creditAmount Float?    // Fee discount in dollars
  createdAt    DateTime  @default(now())
  creditedAt   DateTime?

  @@unique([referrerId, refereeId])
}

model ReferralReward {
  id            String   @id @default(cuid())
  referrerId    String   // User A
  referredUserId String  // User B
  rewardType    String   // "POINTS" | "CREDIT"
  rewardValue   Float
  awardedAt     DateTime @default(now())
  redeemedAt    DateTime?

  @@unique([referrerId, referredUserId])
}
```

---

**Status:** Ready for Patrick Review & Decision
**Next Step:** Patrick approves Phase 1, then dispatch subagents for implementation
