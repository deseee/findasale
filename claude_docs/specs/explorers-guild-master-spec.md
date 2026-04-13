# Explorer's Guild Master Specification

**Date:** 2026-04-06
**Status:** LOCKED — Ready for implementation
**Revision:** 2 (financial audit corrections applied)
**Audience:** Architecture, development, QA, product

---

## Overview

Explorer's Guild is FindA.Sale's gamification system that converts secondary-sale shopping into a ranked progression experience. Players earn XP through purchases, visits, reviews, and social participation, climbing from Initiate (0 XP) to Grandmaster (12,000 XP). The system includes a premium Hunt Pass subscription ($4.99/month), seasonal challenges, cosmetic rewards, and the flagship Treasure Trails feature — curated multi-stop local experiences that combine sales with local discovery.

Core mechanics:
- Single XP currency (all actions earn the same pool)
- Rank-based unlock system with spending floors (cannot drop rank)
- Hunt Pass premium layer with 1.5x XP multiplier + early access
- Seasonal challenges (no separate Battle Pass SKU)
- Treasure Trails (organizer-created, local-discovery-focused)

---

## Rank System

### Thresholds (Board-Locked S388)

| Rank | XP Floor | Key Unlocks |
|------|----------|---|
| Initiate | 0 | Base features |
| Scout | 500 | 45-min holds, seasonal challenges (100 XP cost), cosmetic color unlock |
| Ranger | 2,000 | Custom username color, 60-min holds, guide publication |
| Sage | 5,000 | Custom frame badge, leaderboard visibility, Sage-tier perks |
| Grandmaster | 12,000 | Free Hunt Pass forever, infinite XP sinks, tier-locked cosmetics |

### Spending Floor Model

Formula: `spendableXP = currentXP - rankFloor[currentRank]`

- Players cannot spend XP below their rank's minimum threshold
- Prevents rank downgrade via spending
- Grandmaster exception: cannot tier-down, infinite spendable buffer

### Seasonal Reset (Board-Locked S260)

- **Schedule:** January 1, 00:00 UTC (annual)
- **Soft floor:** Maximum one-tier drop (Grandmaster → Sage); Initiate and Scout cannot drop
- **Hunt Pass members:** Bonus XP resets; tier progress persists

---

## XP Economy

### Complete Earning Table

| Action | XP | Cap | Account Gate | Notes |
|--------|-----|-----|---|-------|
| **Purchase ($1 spent)** | 1 | None | Any | Primary loop; stacks with bonuses |
| **Visit a sale** | 5 | 2/day, 150/mo | Any | Geolocation verified |
| **Hold completed** | 7 | None | Shopper | Stacks with purchase XP |
| **First purchase ever** | 50 | One-time | Shopper | Activation bonus |
| **Haul post published** | 10 | None | Any | Requires 2+ items + photo |
| **Haul 10+ likes** | 5 | 50/mo | Any | Once per haul |
| **Item photo quality** | 3 | 30/mo | Any | Encourages metadata |
| **Condition grade submission** | 5 | 50/mo | Any | Quality metadata |
| **Seller review (text)** | 8 | 30/mo | Shopper | 25+ char minimum |
| **Seller review + photo** | +3 | Stacks | Shopper | High-effort review |
| **Referral (friend purchase)** | 25 | None; flag >20/mo | Any | One-time per user |
| **Referral (new organizer)** | 50 | None | Shopper | Organizer account creation |
| **Referral (organizer 1st sale)** | 50 | One-time | Shopper | Completion bonus (100 XP total) |
| **Auction win** | 15–20 | 100/mo | Shopper | +0.5 per $100 item value |
| **Social share claim** | 10 | 200/mo | Any | Honor system |
| **Trail stop — FindA.Sale event** | 5 | None | Any | Standard visit XP; purchase stacks |
| **Trail stop — resale/antique** | 3 | +2 with photo | Any | Geolocation or QR verify |
| **Trail stop — POI (café, landmark)** | 2 | +2 with photo | Any | Geolocation; no purchase required |
| **Trail stop — partner business** | 4 | +2 with photo | Any | Listed partner; prioritized |
| **Trail completion bonus** | 40–80 | Per trail | Any | Scaled by stops (see Treasure Trails) |
| **Seasonal challenge (easy)** | 100 | 1x/season | Any | Attend 3 sales |
| **Seasonal challenge (medium)** | 200 | 1x/season | Any | Complete 3 specialties |
| **Seasonal challenge (hard)** | 300 | 1x/season | Any | 50 purchases in season |
| **Seasonal leaderboard top 10** | 500 | 1x/season | Any | Post-season award |
| **Collector passport specialty** | 25 | 200/yr (8 max) | Shopper | 3+ purchases per category |
| **Community mentor session** | 25 | 100/mo (4 max) | Any | Peer-reviewed Q&A |
| **Public collection guide** | 50 | One-time per guide | Any | High-effort content |
| **Community valuation** | 10 | 100/mo (10 max) | Any | Peer-reviewed |
| **7-day streak bonus** | 100 | Once/month | Any | Any action counts |
| **Streak multiplier (active week)** | 1.2x all earned | Stacks | Any | Weekly bonus; Hunt Pass exclusive for Freeze |
| **30-day active anniversary** | 250 | Once/month | Any | Resets each calendar month |
| **Virtual queue on-time** | 10 | 100/mo total | Any | Geolocation + app active |
| **Virtual queue early (+15m)** | 5 | Stacks | Any | Demonstrates planning |
| **Virtual queue 3-streak** | 20 | Once/mo | Any | 3+ on-time arrivals same month |
| **Newsletter signup** | 10 | One-time | Any | Onboarding |
| **Completed profile** | 25 | One-time | Any | Photo + bio + preferences |
| **Bounty fulfillment (org-posted)** | 25 | Supply-limited | Any | One per bounty |
| **Bounty fulfillment (seasonal)** | 50–200 | Per-bounty | Any | Monthly leaderboard |
| **[ORGANIZER] First sale posted** | 100 | One-time | Organizer | Activation bonus |
| **[ORGANIZER] Sale published** | 10 | None | Organizer | Each published sale |
| **[ORGANIZER] Shopper on-site signup** | 10 | No cap | Organizer | Fraud gate: XP posts after first purchase |
| **[ORGANIZER] Haul from your sale** | 3 | None | Organizer | UGC engagement reward |
| **[ORGANIZER] 5-star review received** | 10 | 100/mo | Organizer | Quality feedback signal |

---

## XP Sinks

| Sink | XP Cost | Benefit | Duration | Account Gate |
|------|---------|---|----------|-----------|
| **Rarity boost** | 15 | +2% Legendary odds | Until sale ends | Scout+ |
| **Hunt Pass discount** | 50 | $1 off ($4.99→$3.99) | One-time | Scout+ |
| **Custom username color** | 25 | Unlock custom color | Permanent | Ranger+ |
| **Custom frame badge** | 30 | Rare frame | Permanent | Sage+ |
| **Haul visibility boost** | 10 | Featured "Trending" | 7 days | Scout+ |
| **Bounty visibility boost** | 5 | Featured "Hot Bounties" | 7 days | Organizer Scout+ |
| **Seasonal challenge access** | 100 | Unlock season + cosmetics | 1 season | Scout+ non-subscribers |
| **Guide publication** | 30 | Publish hunting guide | Permanent | Ranger+ |
| **Coupon generation** | 50 | Create $1-off coupon (1-use) | 30 days | Organizer Trusted+ |
| **Early access boost** | 75 | Featured presale visibility | 1 week | Organizer Elite+ |
| **Listings extension** | 100 | +10 item listings | 1 month | Organizer Trusted+ |
| **Event sponsorship** | 150 | Flash sale / themed collection | 3 days | Organizer Elite+ |

---

## $ Ratio Table

| Mechanic | XP Cost | $ Value | Exchange Rate |
|----------|---------|---------|----------|
| **Hunt Pass discount** | 50 XP | $1 off | 0.02 $/XP (baseline) |
| **Rarity boost** | 15 XP | ~$2 EV | 0.13 $/XP (luxury tier) |
| **Coupon generation** | 50 XP | $1 coupon value | 0.02 $/XP |
| **Listings extension** | 100 XP | ~$2.99 tier savings | 0.03 $/XP |
| **Seasonal challenge access** | 100 XP | $4.99/mo Hunt Pass equiv | 0.05 $/XP |
| **Hunt Pass free** | 0 XP | $4.99/month forever | Priceless (Grandmaster perk) |

### A La Carte Pricing (Cash Alternative)

| Item | $ Price |
|------|---------|
| Hunt Pass discount | $1.99 |
| Bounty post (organizer) | $1.99 |
| Haul boost | $0.99 |
| Bounty boost (shopper) | $0.99 |
| Listings extension | $2.99 |
| Early access boost | $3.99 |

---

## Hunt Pass

**Price:** $4.99/month (locked)

**Inclusions:**
- 1.5x XP multiplier on all earned actions
- 6-hour early access to flash deals (Sage+ get 24h advance notice)
- Seasonal challenges + exclusive cosmetics
- Cosmetic frame (platform badge)
- Streak Freeze (prevent one missed day from breaking streak)
- Trail suggestions + early access to featured trails

**Tier Perks:** Grandmaster subscribers receive Hunt Pass free forever, survives tier drops (S260 decision)

**Non-subscriber Seasonal Access:** Free users can unlock seasonal challenges by spending 100 XP OR upgrading to Hunt Pass. No separate $9.99 seasonal product.

---

## Seasonal System

**Structure:**
- 4 seasons per year (calendar-based: Q1, Q2, Q3, Q4)
- Challenges: easy (100 XP), medium (200 XP), hard (300 XP) — one-time each per season
- Top 10 finishers: 500 XP bonus award (post-season)
- Hunt Pass subscribers: auto-enrolled in seasonal challenges (no extra cost)

**Battle Pass Note:** Seasonal Battle Pass eliminated as separate SKU per S406 Rev 2. Seasonal content folded into Hunt Pass; 100 XP earn-path for free users provides conversion moment without hard paywall.

---

## Treasure Trails

### Definition

A Treasure Trail is a **curated multi-stop local experience anchored by a FindA.Sale event**. Trails combine estate sales, resale shops, antique dealers, cafés, landmarks, and other local POIs into a guided outing. Trails do NOT require multiple FindA.Sale sales to be valid — a single sale surrounded by local discovery stops is complete.

### Stop Types & XP

| Stop Type | Check-In XP | Photo Bonus | Notes |
|---|---|---|---|
| FindA.Sale event | 5 | Purchase XP stacks | Full transaction XP awarded |
| Resale/antique shop | 3 | +2 to Loot Legend | Geolocation or QR verify |
| Local POI (café, landmark, park) | 2 | +2 to Loot Legend | Geolocation; no purchase required |
| Platform-listed partner | 4 | +2 to Loot Legend | Prioritized in trail builder |

### Completion Bonus (Scaled by Trail Length)

| Trail Length | Completion Bonus | Notes |
|---|---|---|
| 3 stops (minimum) | 40 XP | All stops required |
| 4 stops | 50 XP | 7-day window from first check-in |
| 5 stops | 60 XP | Can spread across multiple outings |
| 6 stops | 70 XP | 1 completion bonus per trail per user |
| 7 stops (maximum) | 80 XP | Per-stop XP earned immediately on check-in |

**Rules:**
- Partial completion: per-stop XP always earned immediately; completion bonus requires all stops checked in
- 7-day window: from first check-in to last stop completion
- Max 1 completion bonus per trail per user (no re-farming)

### Trail Creation & Curation

**Creator:** Organizer-anchored at launch (Phase 2: community trails)

**Process:**
1. Organizer creates trail anchored to their sale
2. Adds nearby stops via Google Places API search + manual lat/lng entry
3. Designates stop type (resale shop, café, landmark, partner)
4. Adds organizer note ("Hidden gem", "Great coffee") for each stop
5. Trail goes into editorial review (1–2 day SLA)
6. Organizer can request "featured" flag for platform curation
7. Featured trails surface by recency, saves, and completions

**Curation Model:** Open creation (no paywall, no rank gate) → editorial review → featured discovery. No algorithm until 50+ organizers and 500+ trails.

### Organizer & Shopper Rewards

**Organizer:** +15 XP per unique shopper completion (no monthly cap; 1x/user/trail is natural ceiling)

**Shopper:** Per-stop XP + completion bonus (40–80 XP based on length)

### Hunt Pass Trail Perks

- Trail suggestions (curated recommendations in dashboard)
- Early access to featured trails (24h before public)
- Own trails prioritized in discovery (not creation-gated)

### Location Data & Verification

**Search:** Google Places API for nearby POI discovery ($200/mo hard cap)
**Fallback:** Organizers can manually add stops by lat/lng + name if Places unavailable
**Check-In Verification:**
- FindA.Sale events use existing geofenced check-in
- Non-sale stops use GPS radius (~100m) + optional photo verification
- Organizers can customize radius per sale in `OrganizerHoldSettings`

---

## Schema Models

### New Models (6 total)

**TreasureTrail** — Trail metadata, type (DISCOVERY/ROUTE), completion stats
- `id`, `organizerId`, `saleId`
- `name`, `description`, `heroImageUrl`
- `type`, `minStopsRequired`, `maxStops`, `windowDays`
- `isActive`, `isFeatured`, `isPublic`, `shareToken`
- `viewCount`, `completionCount`, `avgRating`
- Relations: `stops`, `checkIns`, `completions`, `ratings`

**TrailStop** — Individual stop (sale, shop, POI, partner)
- `id`, `trailId`
- `stopType`, `stopName`, `stopDescription`, `address`
- `latitude`, `longitude`
- `saleId` (if SALE type), `googlePlaceId` (if non-sale)
- `baseXp`, `photoXpBonus`, `order`
- `organizer_note`
- Relations: `checkIns`, `photos`

**TrailCheckIn** — User check-in at a stop
- `id`, `trailId`, `stopId`, `userId`
- `latitude`, `longitude`
- `baseXpAwarded`, `photoXpAwarded`
- `photoId` (link to TrailPhoto if posted)
- `checkedInAt`
- Unique: `(trailId, stopId, userId)`

**TrailPhoto** — Photos posted at non-sale stops
- `id`, `checkInId`, `stopId`, `userId`
- `cloudinaryUrl`, `cloudinaryId`
- `postedToFeed`, `likeCount`, `commentCount`
- Shared to Loot Legend feed (user's collection + optional public)

**TrailCompletion** — Denormalized completion record
- `id`, `trailId`, `userId`
- `completionBonusXp`, `totalXpEarned`, `stopCountCompleted`, `photoCountPosted`
- `firstCheckInAt`, `completedAt`, `daysToComplete`
- `rating`, `review`
- Unique: `(trailId, userId)`

**TrailRating** — Shopper ratings of trails post-completion
- `id`, `trailId`, `userId`
- `rating`, `review`
- Unique: `(trailId, userId)`

### Model Relations (Additions to User & Sale)

**User:**
- `trails: TreasureTrail[]` — trails created by organizer
- `trailCheckIns: TrailCheckIn[]` — shopper check-ins
- `trailPhotos: TrailPhoto[]` — shopper photos
- `trailCompletions: TrailCompletion[]` — shopper completions
- `trailRatings: TrailRating[]` — shopper ratings

**Sale:**
- `trails: TreasureTrail[]` — trails anchored to this sale
- `trailStops: TrailStop[]` — stops that reference this sale

---

## API Contracts (Backend Endpoints)

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/trails` | POST | Create new trail (organizer) | Organizer JWT |
| `/trails/:id` | GET | Trail details + stops + stats | Public |
| `/trails/:id` | PUT | Update trail (organizer) | Organizer JWT |
| `/trails/:id/search-nearby` | POST | Google Places API search for nearby stops | Organizer JWT |
| `/trails/:id/stops` | POST | Add stop to trail | Organizer JWT |
| `/trails/:id/stops/:stopId` | DELETE | Remove stop from trail | Organizer JWT |
| `/trails/:id/check-in` | POST | Check-in at trail stop | User JWT |
| `/trails/:id/complete` | POST | Mark trail as completed (award bonus) | User JWT |
| `/trails/:id/rate` | POST | Rate trail post-completion | User JWT |
| `/trails/:id/photo` | POST | Upload photo at stop (Cloudinary) | User JWT |
| `/trails/featured` | GET | List featured trails (curated) | Public |
| `/trails/organizer/:orgId` | GET | Organizer's trails | Public |
| `/users/:userId/trail-completions` | GET | User's completed trails | User JWT |
| `/xp/trail-transactions` | GET | Trail XP audit log (admin) | Admin JWT |

---

## Shopping Companion Framing

The Shopping Companion is a proactive system that **initiates contact** based on user preferences, rank, and context. It differs from a loyalty card because it has *agency* — it helps you find deals, prepare for sales, and celebrate wins.

### Mode 1: Pre-Sale (3–24 hours before)

**Rank-aware match alert:** 12 hours before sale; shopper favorited 5+ items
Message: "Ready to find gems? [Organizer]'s sale opens tomorrow at 9 AM. We found 5 items matching your style. Arrive 15 min early for 2x XP bonus on purchases within the first hour."

**Streak reminder:** Hunt Pass exclusive; shopper has 4-day streak and matching sale available
Message: "One more to hit 5! [Organizer]'s opening tomorrow — complete your 5-day streak and unlock +15 bonus XP."

**XP gap to next rank:** Shopper 40 XP away from next rank; sale likely provides it
Message: "You're 40 XP away from Ranger! [Organizer]'s sale has 8 items in your favorite categories. Opens tomorrow at 9 AM."

### Mode 2: During-Sale (Real-time)

**Badge availability indicator:** Shopper is 3 items away from earning collector badge
Message: "3 more vintage clocks to earn Collector badge + 20 XP"

**Item momentum signal:** Item has 15+ people viewing it or 8+ likes in 10 minutes
Message: "15 people viewing this right now" or "Popular: 8 likes in the last 10 min"

### Mode 3: Post-Sale (After purchase/visit)

**Haul suggestion:** User purchased items; suggest haul post with XP incentive
Message: "Share your haul! 10 XP for posting, +5 if it gets 10+ likes."

**Review invitation:** Item purchased; invite review with photo bonus
Message: "Rate your [Item]! 8 XP for a review, +3 if you include a photo."

---

## Implementation Order

1. **Schema & Migration** — Create 6 new models; add User/Sale relations; test migration
2. **XP Service Extensions** — Add trail-related transaction types; verify rank floor enforcement
3. **Places Service** — Implement `PlacesService` (Google API wrapper); Redis caching (1h TTL)
4. **Trail Backend** — Controllers for create/update/delete/search; check-in verification; completion logic
5. **Trail Frontend** — Trail builder UI (organizer); trail discovery (shopper); check-in map component; completion modal
6. **Organizer Trail Builder** — Organizer-facing UI for creating/editing trails; Places search integration

---

## Locked Decisions

| Decision | XP Impact | Session | Notes |
|---|---|---|---|
| Single XP currency (no org-XP) | Simplification | S406 | All actions earn same pool; sinks gated by account type |
| Treasure Trail definition | Core mechanic | S406 | Multi-stop local experience; not required to have multiple sales |
| Completion bonus scaling (40–80 XP) | Balanced progression | S406 | 3-stop minimum; 7-stop maximum; all stops required |
| Organizer signup cap removed | No monthly cap | S406 | Fraud gate: first-purchase requirement |
| Purchase XP ($1 = 1 XP) | Validated via audit | S406 | No cap; stacks with bonuses |
| Hold XP (completed only) | Prevents farming | S406 | +7 XP for pickup/purchase; stacks with purchase |
| Virtual queue on-time bonus | Geolocation-verified | S406 | +10 XP; +5 bonus if 15+ min early; 3-streak=+20 once/month |
| Bounty system (org + seasonal) | Two-track model | S406 | Org-posted: 25 XP reward; seasonal: 50–200 XP; community-voted |
| Seasonal Battle Pass eliminated | No separate SKU | S406 Rev 2 | Seasonal content in Hunt Pass; 100 XP earn-path for free users |
| Rank floor enforcement | Cannot drop rank via spending | S260 | Prevents rank-farming reversals |
| Hunt Pass free for Grandmaster | Priceless perk | S260 | Survives tier drops; no expiration |
| Seasonal reset soft floor | Max 1-tier drop | S260 | Initiate/Scout: no drop; Grandmaster: down to Sage |
| Streak multiplier (1.2x) | Weekly, not daily | S259 | Resets if user skips full week; Hunt Pass Freeze exclusive |

---

## Quality Gates

**Schema:** All 6 models created, indexed, and related. User/Sale relations added.
**API:** All endpoints respond with correct status codes; authentication enforced; XP transactions logged.
**XP Service:** Trail transaction types registered; rank floor enforced in spend logic.
**Places API:** Cost tracking enabled; Redis cache validates; fallback manual entry works.
**UI:** Trail builder creates/publishes; check-in map displays; completion bonus awarded and visible.
**QA:** End-to-end trail creation → shopper check-in → completion bonus verified; photo upload works; leaderboard updates.

---

**Status:** LOCKED — Ready for architecture sign-off and dev dispatch.

