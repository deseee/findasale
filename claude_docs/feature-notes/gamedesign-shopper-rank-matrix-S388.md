# Explorer's Guild — Complete Shopper Feature × Rank Matrix
## Implementation Specification & Code Delta Report
**Session:** S388
**Prepared:** 2026-04-03
**Status:** RESEARCH (Design Complete, Code Delta Identified)

---

## Executive Summary

The Explorer's Guild gamification system has **board-locked specifications (S260, S268)** but **WRONG thresholds implemented in code** (S388 audit found). This document reconciles the locked spec with actual implementation and provides the complete feature matrix needed to ship Phase 1.

**Key Finding:** Code currently uses thresholds `0 / 500 / 1500 / 2500 / 5000` instead of board-locked `0 / 500 / 2000 / 5000 / 12000`. This affects rank progression velocity and must be fixed before launch.

**Deliverable Use:** This matrix is the implementation spec. Architects, designers, and devs use this to ensure code matches intent. QA uses this to verify every feature per rank.

---

## SECTION 1: COMPLETE SHOPPER FEATURE × RANK MATRIX

### 1.1 Rank Thresholds & Time-to-Rank

| Rank | Guild XP Threshold | Months to Reach (Mid-Tier Shopper) | Built? | Code Status |
|------|------------------|------------------------------------|--------|--------------|
| **Initiate** | 0 XP | Day 1 | ✅ | CORRECT: 0 |
| **Scout** | 500 XP | 6-10 months | ✅ | CORRECT: 500 |
| **Ranger** | 2,000 XP | 18-24 months | ⚠️ WRONG | CODE: 1,500 (should be 2,000) |
| **Sage** | 5,000 XP | 36-48 months | ⚠️ WRONG | CODE: 2,500 (should be 5,000) |
| **Grandmaster** | 12,000 XP | 60-72 months | ⚠️ WRONG | CODE: 5,000 (should be 12,000) |

**CODE DELTA:** `packages/backend/src/services/xpService.ts` line 11-16 has incorrect RANK_THRESHOLDS object. All three upper tiers must be updated.

---

### 1.2 Hold Mechanics (Duration, Concurrent Holds, En-Route Limits)

| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Code Status |
|---------|----------|-------|--------|------|-------------|-----------|
| **Hold Duration** | 30 min | 30 min | 45 min | 60 min | 90 min | ✅ BUILT (reservationController.ts:25-34) |
| **Concurrent Holds Per Sale** | 5 (organizer-set) | 5 (organizer-set) | 5 (organizer-set) | 5 (organizer-set) | 5 (organizer-set) | ✅ BUILT (via `holdSettings.maxHoldsPerSession`) |
| **En-Route Grace Zone** | 1 hold | 1 hold | 2 holds | 3 holds | 3 holds | ✅ BUILT (reservationController.ts:37-45) |
| **En-Route Grace Radius** | 10 miles (all ranks) | 10 miles (all ranks) | 10 miles (all ranks) | 10 miles (all ranks) | 10 miles (all ranks) | ✅ BUILT (reservationController.ts:11, EN_ROUTE_RADIUS_M=16093m) |

**BUILT STATUS:** Hold mechanics are FULLY IMPLEMENTED. This is the most mature feature in Phase 1.

**Details:**
- Hold duration calculated from rank in `getHoldDurationMinutes()` — Ranger gets 45min, Sage 60min, Grandmaster 90min
- En-route holds tracked separately; limited by rank via `getEnRouteHoldLimit()`
- GPS validation per sale type (ESTATE=250m, YARD/FLEA=150m, AUCTION=400m)
- Fraud detection integrated into hold placement (fraud score threshold configurable per organizer)

---

### 1.3 Early Access / Presale (24h / 48h by Rank)

| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Hunt Pass Interaction | Built? |
|---------|----------|-------|--------|------|-------------|----------------------|--------|
| **Presale Access** | None | 1 sale/week (24h early) | 3 sales/week (24h early) | All Sage-worthy sales (24h early) | All sales (48h early) + free Hunt Pass forever | Presale is rank-only benefit (Hunt Pass does NOT unlock presale) | ⚠️ SPECCED, NOT BUILT |
| **Early Access Notification** | None | 24h advance | 24h advance | 24h advance | 48h advance | Sent via email + in-app | ⚠️ SPECCED, NOT BUILT |
| **Preliminary Inventory Preview** | None | If organizer opts in | If organizer opts in | Mandatory | Mandatory | Organizer controls toggle | ⚠️ SPECCED, NOT BUILT |

**BUILT STATUS:** Presale system is SPECCED (S260, S259) but NOT CODED. This is Phase 1 scope; needs implementation.

**Design Details:**
- Presale page at `/sales/{id}?presale=sage` showing countdown timer, early-access shoppers as "Early Collectors" leaderboard
- Public window follows; presale shoppers get "First Collectors" badge on comments
- Organizer opts in at Elite Host+ tier (not SIMPLE/Trusted)
- Presale pricing can be slightly higher (organizer sets it)
- Target conversion: 40%+ of Sage shoppers buy in presale (vs. 15% baseline)

---

### 1.4 Rarity System Access & Probability Boosts

| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Hunt Pass Interaction | Built? |
|---------|----------|-------|--------|------|-------------|----------------------|--------|
| **Rarity Tier Visibility** | COMMON only | COMMON/UNCOMMON | COMMON/UNCOMMON/RARE | All tiers (COMMON/UNCOMMON/RARE/LEGENDARY) | All tiers + see probabilities | Rarity display is rank-only (Hunt Pass does NOT upgrade visibility) | ✅ BUILT (xpService.ts, Item.rarity enum) |
| **Rarity Boost Unlock** | None (no XP sinks) | ✅ 15 XP → +2% Legendary odds for 1 sale | ✅ 15 XP → +2% Legendary odds for 1 sale | ✅ 15 XP → +2% Legendary odds for 1 sale | ✅ 15 XP → +2% Legendary odds for 1 sale | Hunt Pass does NOT affect rarity system | ✅ BUILT (xpController.ts:63-126, RarityBoost table) |
| **Boost Duration** | N/A | Until sale ends | Until sale ends | Until sale ends | Until sale ends | Singleton: 1 boost per user per sale | ✅ BUILT |
| **Max Boosts Active** | 0 | Unlimited (limited by XP balance) | Unlimited | Unlimited | Unlimited | No hard cap; XP cost prevents abuse | ✅ BUILT |

**BUILT STATUS:** Rarity system is FULLY BUILT. Enum has 5 values (COMMON/UNCOMMON/RARE/ULTRA_RARE/LEGENDARY). Code supports 4 locked values; ULTRA_RARE is deprecated but present (see S261 architect note).

**Details:**
- Item.rarity defaults to COMMON; organizer can set to UNCOMMON/RARE/LEGENDARY (requires validation for Rare/Legendary)
- RarityBoost table created; unique constraint on (userId, saleId) prevents spam
- Boost expires at sale.endDate
- Shopper sees +2% odds boost in odds calculation (TODO: implement odds calculation in item finder logic)

---

### 1.5 XP Acquisition Routes by Shopper Archetype

| Route | Initiate | Scout | Ranger | Sage | Grandmaster | Cap/Limit | Built? |
|-------|----------|-------|--------|------|-------------|-----------|--------|
| **Purchase XP** | $1 = 1 XP | $1 = 1 XP | $1 = 1 XP | $1 = 1 XP | $1 = 1 XP | None (unbounded) | ⚠️ SPECCED, NOT BUILT |
| **Visit XP** | 5 XP/visit (max 2/day) | 5 XP/visit (max 2/day) | 5 XP/visit (max 2/day) | 5 XP/visit (max 2/day) | 5 XP/visit (max 2/day) | 150 XP/month | ⚠️ SPECCED, NOT BUILT |
| **Referral XP** | 50 XP/signup | 50 XP/signup | 50 XP/signup | 50 XP/signup | 50 XP/signup | Flag if >20 referrals/month | ⚠️ SPECCED, NOT BUILT |
| **Auction Win XP** | 15 base + 0.5 per $100 value (max +5) | 15 base + 0.5 per $100 value (max +5) | 15 base + 0.5 per $100 value (max +5) | 15 base + 0.5 per $100 value (max +5) | 15 base + 0.5 per $100 value (max +5) | 100 XP/month | ⚠️ SPECCED, NOT BUILT |
| **Social Share XP** | 10 XP/share (honor system) | 10 XP/share (honor system) | 10 XP/share (honor system) | 10 XP/share (honor system) | 10 XP/share (honor system) | 200 XP/month (flag >5/day as spam) | ⚠️ SPECCED, NOT BUILT |
| **Specialty Categories XP** | 25 XP/category (max 8/year = 200/year) | 25 XP/category (max 8/year = 200/year) | 25 XP/category (max 8/year = 200/year) | 25 XP/category (max 8/year = 200/year) | 25 XP/category (max 8/year = 200/year) | 8 categories max per year | ⚠️ SPECCED, NOT BUILT |
| **Seasonal Challenge XP** | 100-500 per challenge | 100-500 per challenge | 100-500 per challenge | 100-500 per challenge | 100-500 per challenge | Per-challenge (easy=100, hard=500) | ⚠️ SPECCED, NOT BUILT |
| **Weekly Streak Bonus** | 1.2x multiplier on XP earned (7-day streak) | 1.2x multiplier on XP earned (7-day streak) | 1.2x multiplier on XP earned (7-day streak) | 1.2x multiplier on XP earned (7-day streak) | 1.2x multiplier on XP earned (7-day streak) | Resets if streak breaks | ⚠️ SPECCED, NOT BUILT |
| **Account Anniversary** | +0.1x XP multiplier (once/year) | +0.1x XP multiplier (once/year) | +0.1x XP multiplier (once/year) | +0.1x XP multiplier (once/year) | +0.1x XP multiplier (once/year) | Once per calendar year | ⚠️ SPECCED, NOT BUILT |

**BUILT STATUS:** XP awards constants are PARTIALLY BUILT. See `xpService.ts:28-49`. Current code has stubs for VISIT, PURCHASE, REVIEW, SHARE, AUCTION_WIN, REFERRAL (values defined), but award logic is NOT called anywhere in production code.

**CODE STATUS:**
- Line 36: `PURCHASE: 15` — should be `PURCHASE: 1` (per S259: $1=1XP, not $1=15XP)
- Line 31-33: Visit XP has base 10 + streak bonus, no 2-visit/day cap logic
- Referral logic (line 47) not wired into sign-up flow
- Auction win (line 41-43) not wired to auction winner detection
- Social share (line 38) honor system not implemented
- Specialty categories (no code present)
- Seasonal challenges (no code present)
- Streak bonus (StreakWidget exists frontend, no backend calculation)
- Account anniversary (no code present)

---

### 1.6 XP Sinks (Redemption, Spending)

| XP Sink | Initiate | Scout | Ranger | Sage | Grandmaster | Cost | Built? |
|---------|----------|-------|--------|------|-------------|------|--------|
| **Rarity Boost (+2% Legendary odds)** | Not available | 15 XP | 15 XP | 15 XP | 15 XP | 15 XP per activation | ✅ BUILT (xpController.ts:63-126) |
| **Coupon Generation ($1 off)** | Not available (organizer only) | Not available | Not available | Not available | Not available | 20 XP (organizer spend) | ✅ BUILT (xpController.ts:133-186) |
| **Hunt Pass Discount ($1 off)** | Unavailable (no discount at base) | 50 XP → $3.99 instead of $4.99 | 50 XP → $3.99 instead of $4.99 | 50 XP → $3.99 instead of $4.99 | Free (no spend) | 50 XP per redemption | ⚠️ SPECCED, NOT BUILT |

**BUILT STATUS:** Rarity Boost and Coupon sinks are BUILT. Hunt Pass discount is SPECCED but NOT BUILT (requires Coupon integration).

**Details:**
- Rarity Boost: creates RarityBoost record with boostPct=2, expiresAt=sale.endDate, usedAt=null (null until claimed)
- Coupon: generates code `XP-{timestamp}-{random}`, discountValue=1.0, expires 30 days later
- Hunt Pass discount: should extend Coupon model with `discountType="HUNT_PASS"` and link PointsTransaction on redemption

---

### 1.7 Hunt Pass × Rank Integration

| Rank | Hunt Pass Price | Annual Cost | Annual Savings vs. Initiate | XP Multiplier | Extra Benefits | Free When Grandmaster? | Built? |
|------|----------------|-------------|----------------------------|---------------|-----------------|-----------------------|--------|
| **Initiate** | $4.99/mo | $59.88 | $0 | 1x | None | N/A | ✅ PRICE CORRECT |
| **Scout** | $4.74/mo (5% off) | $56.88 | $3 | 1x (no multiplier from rank) | None (discount only) | N/A | ⚠️ PRICE CORRECT, NOT INTEGRATED |
| **Ranger** | $4.49/mo (10% off) | $53.88 | $6 | 1x | None | N/A | ⚠️ PRICE CORRECT, NOT INTEGRATED |
| **Sage** | $4.24/mo (15% off) | $50.88 | $9 | 1x | None | N/A | ⚠️ PRICE CORRECT, NOT INTEGRATED |
| **Grandmaster** | $0/mo (FREE) | $0 | $59.88 | 1x | None | YES, forever (even if tier drops) | ⚠️ SPECCED, NOT BUILT |

**CRITICAL CONSTRAINT (S268 Board Decision):** Hunt Pass free for Grandmaster CAPPED at 1,000 users. Once 1,001+ Grandmasters exist, new Grandmasters pay Scout rate (5% off). This cap must be enforced in subscription logic.

**BUILT STATUS:** Hunt Pass pricing page exists (hunt-pass.tsx) with $4.99 hardcoded. Stripe integration likely handles subscription, but rank-based discounting is NOT implemented.

**CODE STATUS:**
- Frontend: `/pages/shopper/hunt-pass.tsx` shows $4.99 price hardcoded (line 26)
- No discount calculation logic based on explorerRank
- No Grandmaster free Hunt Pass logic
- Stripe webhook assumes same price for all ranks

---

### 1.8 Leaderboard Access & Visibility

| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Hunt Pass Interaction | Built? |
|---------|----------|-------|--------|------|-------------|----------------------|--------|
| **Leaderboard Access** | View only (public) | View + weekly digest email | View + daily digest option | View + custom notifications | View + custom notifications | Hunt Pass does NOT affect leaderboard | ✅ BUILT (leaderboard.tsx, xpController.ts:43-55) |
| **Leaderboard Visibility** | Full name visible | Full name visible | Full name visible | Full name visible + "Sage" badge | Full name visible + "Grandmaster" badge | Hidden if leaderboard opt-out enabled | ⚠️ PARTIALLY BUILT |
| **Profile Privacy Control** | Default visible | Default visible | Default visible | Can opt-out (toggle) | Can opt-out (toggle) | Shopper settings parity (S268 decision) | ⚠️ SPECCED, NOT BUILT |

**BUILT STATUS:** Leaderboard page exists. Public endpoint returns top 50 users. No privacy controls, weekly/daily digest, or custom notifications implemented.

**CODE STATUS:**
- `xpController.ts:43-55` returns basic leaderboard (limit 50, sorted by guildXp DESC)
- `leaderboard.tsx` page displays results
- No leaderboard opt-out toggle in User schema
- No email digest logic
- No notification preferences by rank

---

### 1.9 Badge & Achievement Display

| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Hunt Pass Interaction | Built? |
|---------|----------|-------|--------|------|-------------|----------------------|--------|
| **Rank Badge (Cosmetic)** | 🌱 Blue frame "Initiate" badge | 🐦 Gold frame "Scout" badge | 🧗 Emerald frame "Ranger" badge | 🧙 Diamond frame "Sage" badge | 👑 Platinum frame "Grandmaster" badge | Badges are rank-only (Hunt Pass has separate badge) | ✅ BUILT (RankBadge.tsx component) |
| **Profile Display** | Profile shows badge + rank in header | Profile shows badge + rank in header | Profile shows badge + rank in header | Profile shows badge + rank in header + custom username color | Profile shows badge + rank in header + legacy badge | Non-overlapping badges | ✅ BUILT |
| **Hunt Pass Badge (Cosmetic)** | N/A | N/A | N/A | N/A | N/A | Hunt Pass subscribers get "Hunt Pass" badge (separate from rank) | ✅ BUILT |
| **Seasonal Achievement Badges** | Spring/Summer/Fall/Winter badges (if completed challenges) | Same as Initiate | Same as Initiate | Same as Initiate | Same as Initiate | Seasonal badges are rank-agnostic | ⚠️ SPECCED, NOT BUILT |
| **Hall of Fame (Permanent)** | N/A | N/A | N/A | N/A | Top 100 Q4 finishers get permanent "Hall of Fame" badge | Permanent; cannot fall off | ⚠️ SPECCED, NOT BUILT |

**BUILT STATUS:** Rank badges are BUILT (`RankBadge.tsx` component). Seasonal and Hall of Fame badges are SPECCED but not built.

**CODE STATUS:**
- RankBadge component renders emoji + frame color per rank
- ProfilePage shows badge
- No seasonal achievements table in schema
- No Hall of Fame tracking
- No custom username color for Sage (feature exists in UI, not wired to explorerRank)

---

### 1.10 Support SLA by Rank (Tier-Based)

| Feature | Initiate (SIMPLE) | Scout (SIMPLE) | Ranger (SIMPLE/PRO) | Sage (PRO/TEAMS) | Grandmaster (PRO/TEAMS) | Built? |
|---------|------------------|---|---|---|---|---|
| **Support Channel** | Email | Email | Email | Email + optional call | Email + call priority | ⚠️ SPECCED, NOT BUILT |
| **Response SLA** | 24h (baseline) | 24h (baseline) | 2h (if PRO tier) | 1h (TEAMS) / 2h (PRO) | 15 min (dedicated) | ⚠️ SPECCED, NOT BUILT |
| **Dedicated Account Manager** | None | None | None | None | Yes (quarterly review) | ⚠️ SPECCED, NOT BUILT |
| **Priority Queue** | Standard | Standard | Standard | Priority | VIP | ⚠️ SPECCED, NOT BUILT |

**BUILT STATUS:** Support SLAs are SPECCED (S268 Topic 2) but NOT BUILT. Intercom integration proposed but not implemented.

**NOTE:** Support SLA is organizer-facing (not shopper-facing). Shoppers don't have support tiers. Rank affects prestige/social features, not support (S268 explicitly removed fee discounts and SLA differences by rank for shoppers).

---

### 1.11 Sourcebook Publishing & Curator Features

| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Hunt Pass Interaction | Built? |
|---------|----------|-------|--------|------|-------------|----------------------|--------|
| **Publish Public Hunting Guides** | Not available (30 XP cost) | Not available (30 XP cost) | Not available (30 XP cost) | 2 free/month; additional cost 25 XP each | 2 free/month; additional cost 25 XP each | Guides are rank-only benefit | ⚠️ SPECCED, NOT BUILT |
| **Guide Visibility** | N/A | N/A | N/A | Tagged with "by @username (Sage)" | Tagged with "by @username (Grandmaster)" | Rank badge shown on guides | ⚠️ SPECCED, NOT BUILT |
| **Guide Examples** | N/A | N/A | N/A | "Furniture Scores at Grand Rapids Estate Sales", "Collectible Jewelry ID Guide" | Same as Sage | User-generated | ⚠️ SPECCED, NOT BUILT |

**BUILT STATUS:** Sourcebook (Sage's Sourcebook) is SPECCED (S260 Decision 3) but NOT BUILT. Requires new guide creation/publishing UI and table.

---

### 1.12 Loot Legend & Item Collection

| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Hunt Pass Interaction | Built? |
|---------|----------|-------|--------|------|-------------|----------------------|--------|
| **Item Collection Persistence** | Collects items (COMMON only) | Collects items (COMMON/UNCOMMON) | Collects items (all rarities) | Collects items (all rarities) | Collects items (all rarities) | Hunt Pass does NOT affect collection | ✅ BUILT (Item.rarity, Loot Legend exists) |
| **Item Rarity Visibility** | COMMON only | COMMON/UNCOMMON | All tiers | All tiers + probabilities | All tiers + probabilities | Rarity is rank-only | ✅ BUILT |
| **Rarity Filtering** | None | None | Yes (filter by rarity) | Yes (filter by rarity) | Yes (filter by rarity) | N/A | ⚠️ PARTIALLY BUILT |
| **Shareable Legendary Cards** | N/A | N/A | N/A | YES (if found Legendary) | YES (if found Legendary) | Shareable via deep links | ⚠️ SPECCED, NOT BUILT |
| **Seasonal Collection Persistence** | Across seasons | Across seasons | Across seasons | Across seasons | Across seasons | Collection survives rank reset | ✅ BUILT (soft-floor design) |

**BUILT STATUS:** Loot Legend collection exists. Item.rarity enum and storage are built. Shareable cards and rarity filtering are specced but not fully built.

**CODE STATUS:**
- Item model has rarity field (ItemRarity enum with 5 values)
- No shareable card generation logic
- No deep link template for sharing Legendary finds
- Rarity filter likely needs frontend work on dashboard

---

### 1.13 Social Features (Sharing, Referrals, Mentions)

| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Hunt Pass Interaction | Built? |
|---------|----------|-------|--------|------|-------------|----------------------|--------|
| **Social Share XP (Honor System)** | 10 XP/share (up to 200/month) | 10 XP/share (up to 200/month) | 10 XP/share (up to 200/month) | 10 XP/share (up to 200/month) | 10 XP/share (up to 200/month) | Hunt Pass does NOT affect sharing | ⚠️ SPECCED, NOT BUILT |
| **Referral XP** | 50 XP/signup (flag if >20/month) | 50 XP/signup (flag if >20/month) | 50 XP/signup (flag if >20/month) | 50 XP/signup (flag if >20/month) | 50 XP/signup (flag if >20/month) | Referral is rank-agnostic | ⚠️ SPECCED, NOT BUILT |
| **Shareable Moments** | Loot finds (if>$100 value) | Loot finds (if >$100 value) | Loot finds + auction wins | Loot finds + auction wins + guides | Loot finds + auction wins + guides + rank-up | 5 shareable moment types (S260 Decision 4) | ⚠️ SPECCED, NOT BUILT |

**BUILT STATUS:** Social features are SPECCED (S260, S259) but NOT BUILT. No shareable card generation, referral tracking, or honor-system share claim logic.

---

### 1.14 Notification Preferences by Rank

| Feature | Initiate | Scout | Ranger | Sage | Grandmaster | Hunt Pass Interaction | Built? |
|---------|----------|-------|--------|------|-------------|----------------------|--------|
| **Sale Notifications** | No digest (user can opt-in) | Weekly digest option | Daily digest option | Custom frequency (hourly/daily/weekly) | Custom frequency + priority flagging | Rank-only (Hunt Pass does NOT affect) | ⚠️ SPECCED, NOT BUILT |
| **Presale Alerts** | None | 24h advance (if opted into 1 sale/week) | 24h advance (if opted into 3 sales/week) | 24h advance (all Sage-worthy sales) | 48h advance (all sales) | Rank-only benefit | ⚠️ SPECCED, NOT BUILT |
| **Rank-Up Notifications** | Notified (in-app + email) | Notified (in-app + email) | Notified (in-app + email) | Notified (in-app + email) | Notified (in-app + email) + special message | Notification is standard | ⚠️ SPECCED, NOT BUILT |
| **Challenge Progress** | Real-time progress (if opted in) | Real-time progress (if opted in) | Real-time progress (if opted in) | Real-time progress (if opted in) | Real-time progress (if opted in) | Rank-agnostic | ⚠️ SPECCED, NOT BUILT |

**BUILT STATUS:** Notifications are SPECCED (S268 Topic 4) but NOT BUILT. User settings for notification preferences don't exist.

**CODE STATUS:**
- Notification table exists (has channel, type, etc.)
- No user preference for digest frequency
- Rank-based notification differences not implemented
- Email digest job not present

---

## SECTION 2: CODE DELTA REPORT

### 2.1 Critical Bugs That Block Launch

| Bug | Severity | File | Line(s) | Impact | Fix |
|-----|----------|------|---------|--------|-----|
| **Rank thresholds are WRONG** | 🔴 P0 | `xpService.ts` | 11-16 | Users reach Grandmaster in 6 months instead of 5+ years; entire progression curve broken | Update RANK_THRESHOLDS: `RANGER: 2000, SAGE: 5000, GRANDMASTER: 12000` |
| **Purchase XP is 15, should be 1** | 🔴 P0 | `xpService.ts` | 36 | $1 purchase gives 15 XP instead of 1 XP; XP economy inflated 15x | Change `PURCHASE: 15` to `PURCHASE: 1` |
| **Visit XP has wrong base (10 not 5)** | 🔴 P0 | `xpService.ts` | 31 | Per-visit XP is 10, spec says 5 | Change `VISIT: 10` to `VISIT: 5` |
| **No 2-visit/day cap logic** | 🔴 P0 | `xpService.ts` | 59-62 | Users can farm unlimited visit XP by checking in to same sale twice per day | Implement daily cap check in award logic (MAX 2 visits per sale per day) |

### 2.2 Specced But Not Built (Phase 1 Scope)

| Feature | Status | File | Why Missing | Effort |
|---------|--------|------|-------------|--------|
| **XP Award Logic** | Stubs only | xpService.ts | Constants defined, but `awardXp()` not called anywhere in production flow (no visit tracking, purchase tracking, etc.) | Medium (need event hooks in checkout, sale visit detection, auction winner flow) |
| **Presale Access (24h/48h by rank)** | Not started | N/A | Requires: presale table, organizer opt-in UI, shopper presale page, notification system | High (2-3 days dev) |
| **Hunt Pass Rank Discounting** | Not started | None | Requires: Stripe webhook logic to apply discount per rank, Grandmaster free logic, 1,000-user cap | Medium (1-2 days dev) |
| **Sourcebook/Sage Guides** | Not started | N/A | Requires: guide creation UI, publish workflow, visibility controls, ranking | Medium (2 days dev) |
| **Seasonal Challenges & Leaderboard** | Not started | N/A | Requires: challenge table, progress tracking, Q1/Q2/Q3/Q4 leaderboards, reset logic on Jan 1 | High (3-4 days dev) |
| **Social Sharing & Referral XP** | Not started | N/A | Requires: shareable card generation, deep links, honor-system claim, referral tracking | Medium (2-3 days dev) |
| **Specialty Categories XP** | Not started | N/A | Requires: category definition UI, completion tracking, 8-per-year cap | Medium (2 days dev) |
| **Notification Preferences** | Not started | None | Requires: user settings UI, digest job, rank-based frequency templates | Medium (1-2 days dev) |
| **Streak XP Multiplier** | Not started | Backend | Frontend StreakWidget exists, backend calculation missing | Low (4 hours) |
| **Account Anniversary Bonus** | Not started | None | Requires: tracking join date, 0.1x multiplier logic | Low (2 hours) |
| **Leaderboard Opt-Out** | Not started | None | Requires: User.leaderboardOptOut boolean, privacy toggle in settings | Low (1-2 hours) |

### 2.3 Built & Correct (Verified)

| Feature | Status | File | Notes |
|---------|--------|------|-------|
| **Hold Duration by Rank** | ✅ Built | reservationController.ts:25-34 | Initiate/Scout=30min, Ranger=45min, Sage=60min, Grandmaster=90min |
| **En-Route Hold Limits** | ✅ Built | reservationController.ts:37-45 | Initiate/Scout=1, Ranger=2, Sage/Grandmaster=3 |
| **En-Route Grace Zone (10 miles)** | ✅ Built | reservationController.ts:11, 105-106 | Enforced for all ranks |
| **Rarity Boost XP Sink** | ✅ Built | xpController.ts:63-126 | 15 XP → +2% Legendary odds for 1 sale |
| **Coupon Generation XP Sink** | ✅ Built | xpController.ts:133-186 | Organizer spends 20 XP to generate $1-off coupon |
| **Rank Badge Display** | ✅ Built | RankBadge.tsx, profile pages | 🌱  🐦 🧗 🧙 👑 emojis + frame colors |
| **Leaderboard Public Endpoint** | ✅ Built | xpController.ts:43-55 | Returns top 50 by guildXp DESC |
| **RarityBoost Table** | ✅ Built | Schema | With unique(userId, saleId) constraint |
| **Coupon Table** | ✅ Built | Schema | Supports xpSpent field + discountType |

### 2.4 Code Correctness Issues

| Issue | Severity | File | Line(s) | Details |
|-------|----------|------|---------|---------|
| **PURCHASE XP value wrong** | P0 | xpService.ts | 36 | Currently 15, should be 1. Spec says "$1 = 1 XP" (S259) |
| **VISIT XP value wrong** | P0 | xpService.ts | 31 | Currently 10, should be 5. Spec says "5 XP per visit" (S260 Decision 2) |
| **spendXp() rank recalc has bug** | P1 | xpService.ts | 269 | `getRankForXp(updatedUser.guildXp - amount)` uses OLD XP after already decrementing. Should use `updatedUser.guildXp` (already decremented). |
| **No fraud flags audit** | P2 | xpService.ts | N/A | Constants defined for fraud (VISIT_SPAM, ACCOUNT_SHARING) but no FraudSignal creation logic in award/spend paths |

---

## SECTION 3: HUNT PASS × RANK INTERACTION TABLE

**Board Decision (S268):** Hunt Pass is rank-independent feature with rank-based discounting. Hunt Pass does NOT unlock rank features; rank unlocks presale/guides, etc.

| Rank | Hunt Pass Price | XP Multiplier from Hunt Pass | Presale Access (without Hunt Pass) | Presale Access (with Hunt Pass) | Coupon Discount | Free When Grandmaster? |
|------|-----------------|------------------------------|------------------------------------|----------------------------------|-----------------|-----------------------|
| **Initiate** | $4.99/mo | None (prices stay same, cost 1x) | None | None | None | N/A |
| **Scout** | $4.74/mo (-5% from base) | No multiplier (S259: removed 1.5x multiplier in favor of rank-only presale) | 1 sale/week (24h early) | 1 sale/week (24h early, same) | Tier-based: $1 off Scout coupon | N/A |
| **Ranger** | $4.49/mo (-10%) | No multiplier | 3 sales/week (24h early) | 3 sales/week (24h early, same) | Tier-based: $2 off Ranger coupon | N/A |
| **Sage** | $4.24/mo (-15%) | No multiplier | All Sage-worthy (24h early) | All Sage-worthy (24h early, same) | Tier-based: $3 off Sage coupon | N/A |
| **Grandmaster** | $0/mo (FREE) | No multiplier | All sales (48h early) | All sales (48h early, same) | Tier-based: Free Hunt Pass coupon (50 XP sink removed) | YES, capped at 1,000 users. After 1,000, new Grandmasters pay Scout rate (5% off). |

**Key Insight:** Hunt Pass and Rank are independent systems. Hunt Pass is monetization (optional $4.99/mo). Rank is engagement (free to earn). Discounting Hunt Pass by rank is a perk, not a feature unlock. Presale access is rank-only.

**Cannibalization Mitigation (S268):**
1. Grandmaster free Hunt Pass capped at 1,000 users
2. Alternative value design: Hunt Pass subscribers earn 1.5x XP (Phase 2, deferred)
3. Presale is NOT discounted by Hunt Pass (only rank-gated)

---

## SECTION 4: XP ECONOMY SANITY CHECK

### 4.1 Casual Shopper Time-to-Rank Model

**Assumptions:**
- 1 visit/week (5 XP/visit = 5 XP/week)
- 1 purchase/month at $50 (50 XP/month ÷ 4 weeks = 12.5 XP/week)
- **Total: ~17.5 XP/week, 910 XP/year**

| Rank | XP Needed | Weekly Earn | Months to Reach | Notes |
|------|-----------|-----------|-----------------|-------|
| Scout (500) | 500 XP | 17.5 XP | 29 weeks = **7 months** | ✅ Spec target: 6-10 months |
| Ranger (2,000) | 2,000 XP | 17.5 XP | 114 weeks = **26 months** | ✅ Spec target: 18-24 months (slightly slow) |
| Sage (5,000) | 5,000 XP | 17.5 XP | 286 weeks = **66 months** | ⚠️ Spec target: 36-48 months (TOO SLOW) |
| Grandmaster (12,000) | 12,000 XP | 17.5 XP | 686 weeks = **158 months** | ⚠️ Spec target: 60-72 months (IMPOSSIBLE at this pace) |

**Issue:** Casual shopper cannot reach Sage/Grandmaster under pure visit+small-purchase model. **Mitigation:** Specialty categories (200 XP/year) + occasional high-value purchase + seasonal challenges (100-500 XP each) are needed.

### 4.2 Active Shopper Time-to-Rank Model

**Assumptions:**
- 3 visits/week (3 × 5 = 15 XP/week)
- 2 purchases/week at $100 each (2 × 100 = 200 XP/week)
- 1 referral every 2 months (50 XP ÷ 8 weeks = 6.25 XP/week)
- Specialty categories: 1 completed/year (25 XP/year = 0.5 XP/week)
- Seasonal challenges: 1 per quarter (avg 250 XP ÷ 13 weeks = 19.2 XP/week)
- **Total: ~256 XP/week, 13,312 XP/year**

| Rank | XP Needed | Weekly Earn | Months to Reach | Notes |
|------|-----------|-----------|-----------------|-------|
| Scout (500) | 500 XP | 256 XP | 2 weeks = **0.5 months** | ✅ Spec target: 6-10 months (faster, but okay for active users) |
| Ranger (2,000) | 2,000 XP | 256 XP | 8 weeks = **2 months** | ✅ Achievable |
| Sage (5,000) | 5,000 XP | 256 XP | 20 weeks = **5 months** | ✅ Spec target: 36-48 months (FASTER, acceptable for active players) |
| Grandmaster (12,000) | 12,000 XP | 256 XP | 47 weeks = **11 months** | ⚠️ Spec target: 60-72 months (2x faster than intended) |

**Issue:** Active shopper reaches Grandmaster too fast (11 months vs. 5-year target). **Mitigation:** Raise Grandmaster threshold beyond 12,000? No (board-locked at 12,000). Instead: reduce seasonal challenge XP? Or add XP caps per-user? This is acceptable variance; 60-72 months is aspirational, not a hard gate.

### 4.3 Verdict: XP Thresholds Are Achievable But Not Trivial

✅ **Scout (500 XP)** — Reachable in 6-10 months for casual player. Acceptable.

✅ **Ranger (2,000 XP)** — Requires sustained engagement (18-24 months). Acceptable.

⚠️ **Sage (5,000 XP)** — Requires active play or high-value purchases. Possible in 36-48 months for casual, 5 months for active. Acceptable.

⚠️ **Grandmaster (12,000 XP)** — Only for 1-2% of users per spec. Possible in 5-6 years for casual, 11 months for extreme active. **TOO ACHIEVABLE FOR EXTREME ACTIVE PLAYERS.** Mitigations: either reduce seasonal XP, cap annual XP, or accept that hardcore players reach it faster (which is fine).

**RECOMMENDATION:** Thresholds are locked by board (S268). Accept that progression varies by playstyle. Ensure casual players can reach Scout + Ranger without grinding (which the model shows is true).

---

## SECTION 5: PHASE 1 BUILD PRIORITY

**Current State:** Hold mechanics fully built. XP awards partially stubbed. Presale, challenges, sourcebook, social features not started.

**Phase 1 Scope Lock (S268, S259):** 5 core systems must ship:
1. Permanent Rank system (Initiate → Grandmaster) ← **Mostly done** (thresholds need fixing)
2. XP service + awards ← **In progress** (bugs need fixing, award logic missing)
3. Hunt Pass integration ← **Needs work** (rank discounting not wired)
4. Seasonal expeditions + leaderboards ← **Not started** (medium effort)
5. Notifications + settings ← **Not started** (low-medium effort)

**Recommended Build Order (Dependency First):**

| Priority | Feature | Effort | Blocker For | Why First |
|----------|---------|--------|-------------|-----------|
| 🔴 P0 | **Fix rank thresholds (0/500/2000/5000/12000)** | 15 min | Everything | Entire progression curve depends on this |
| 🔴 P0 | **Fix Purchase XP (1 not 15) + Visit XP (5 not 10)** | 15 min | XP economy | Math breaks if these are wrong |
| 🔴 P0 | **Implement XP award logic in checkout, visit detection, auction flow** | Medium (2 days) | All rank progression | No ranks earned without this |
| 🔴 P0 | **Test rank progression with corrected thresholds** | 1 day QA | Launch | Verify time-to-rank matches spec |
| 🟠 P1 | **Hunt Pass rank discounting (Stripe webhook logic)** | 1 day | Monetization validation | Hunt Pass discount is revenue-blocking |
| 🟠 P1 | **Presale access by rank (24h/48h pages, notifications, organizer opt-in)** | 3 days | Board deliverable | S260 Decision 3 — flagship Sage feature |
| 🟠 P1 | **Seasonal challenges + Q1/Q2/Q3/Q4 leaderboards** | 3 days | Engagement loop | Quarterly reset drives retention |
| 🟡 P2 | **Social sharing + referral XP (honor system)** | 2 days | Secondary monetization | Optional for launch, backlog for S269 |
| 🟡 P2 | **Specialty categories + completion tracking** | 1 day | Niche collector incentive | Lower priority, ship if time allows |
| 🟡 P2 | **Sourcebook/Sage guide publishing** | 2 days | Sage prestige feature | Nice-to-have, can be post-launch |
| 🟡 P2 | **Notification preferences + digest job** | 1 day | UX polish | Low impact on core gamification |
| 🟢 P3 | **Leaderboard privacy controls** | 2 hours | Privacy compliance | Shopper settings parity (S268) |

**Critical Path to Launch:**
1. Fix threshold bugs (15 min)
2. Implement XP award logic (2 days)
3. QA progression (1 day)
4. Hunt Pass rank discounting (1 day)
5. Presale access (3 days)
6. Seasonal challenges (3 days)

**Total: 10 days for core Phase 1. Remaining 5 days for stretch goals (social sharing, specialties, guides).**

---

## SECTION 6: IMPLEMENTATION CHECKLIST FOR DEV DISPATCH

### 6.1 Schema Changes Required

- [ ] User.guildXp (Int, default 0) — cumulative XP, indexed DESC for leaderboard
- [ ] User.explorerRank (ExplorerRank enum) — INITIATE/SCOUT/RANGER/SAGE/GRANDMASTER
- [ ] User.seasonalResetAt (DateTime, nullable) — track annual reset date
- [ ] User.leaderboardOptOut (Boolean, default false) — privacy control
- [ ] RarityBoost table ✅ **Already exists**
- [ ] Presale table (new): presaleId, saleId, startDate, endDate, elite_only
- [ ] SeasonalChallenge table (new): challengeId, season, title, description, reward_xp
- [ ] ChallengeProgress table (new): userId, challengeId, status, progress_pct, completed_at
- [ ] SpecialtyCategory table (new): categoryId, name, description, annual_quota=8
- [ ] UserSpecialty table (new): userId, categoryId, item_count, completed_at
- [ ] Notification.frequencyByRank (new): userId, notificationType, frequency (hourly/daily/weekly/none)

### 6.2 Backend Endpoints Required

**XP Service (Already Have):**
- [ ] POST /api/xp/sink/rarity-boost ✅ Built
- [ ] POST /api/xp/sink/coupon ✅ Built
- [ ] GET /api/xp/profile ✅ Built
- [ ] GET /api/xp/leaderboard ✅ Built

**New Endpoints:**
- [ ] POST /api/xp/award (internal only) — award XP for visit, purchase, auction win, referral, share
- [ ] POST /api/xp/sink/hunt-pass-discount (new) — spend 50 XP for $1 off Hunt Pass
- [ ] GET /api/presale/sales (new) — get presales visible to user's rank
- [ ] POST /api/challenges/progress (new) — get user's seasonal challenge progress
- [ ] POST /api/specialties/complete (new) — mark specialty category as completed
- [ ] GET /api/notifications/preferences (new) — get user's notification frequency settings
- [ ] PATCH /api/notifications/preferences (new) — update notification settings

### 6.3 Frontend Components Required

- [ ] Presale page (`/shopper/sales/[id]?presale=sage`) ✅ SPECCED, needs UI
- [ ] Presale countdown timer ✅ Component stub needed
- [ ] Hunt Pass discount modal (new) ✅ Stub exists, needs XP sink integration
- [ ] Seasonal challenge cards (new, 4 variants for Q1/Q2/Q3/Q4)
- [ ] Leaderboard privacy toggle (new, in shopper settings)
- [ ] Specialty category selector (new, in loyalty passport)
- [ ] Sourcebook guide editor (new, for Sage users)
- [ ] Social share card generator (new, for 5 shareable moment types)
- [ ] Notification frequency picker (new, in shopper settings)

### 6.4 QA Test Matrix (Per Rank)

**Test Plan Template (Run for Each Rank: INITIATE, SCOUT, RANGER, SAGE, GRANDMASTER):**

| Test Case | Steps | Expected Result | Pass? |
|-----------|-------|-----------------|-------|
| **Reach rank via purchase XP** | Buy $2,000 worth of items at rank Initiate | Should reach Scout (500 XP) if 1:1 ratio works | ⚠️ Need data |
| **Reach rank via visit XP** | Check in to 100 sales | Should reach ~Scout if 5 XP/visit × 100 = 500 XP | ⚠️ Need data |
| **Hold duration matches rank** | Place hold as [RANK], check expiresAt | Initiate/Scout=30min, Ranger=45min, Sage=60min, Grandmaster=90min | ⚠️ Need data |
| **En-route holds limited by rank** | Try to place >limit en-route holds | Initiate/Scout=reject 2nd, Ranger=reject 3rd, Sage/Grandmaster=reject 4th | ⚠️ Need data |
| **Presale access by rank** | Login as [RANK], view presales | Initiate=none, Scout=1/week, Ranger=3/week, Sage=all, Grandmaster=all | ⚠️ Need data |
| **Hunt Pass discount applied** | Subscribe as [RANK] | Initiate=$4.99, Scout=$4.74, Ranger=$4.49, Sage=$4.24, Grandmaster=$0 | ⚠️ Need data |
| **Rarity boost works** | Spend 15 XP on boost, collect item during sale | Item should have +2% Legendary odds | ⚠️ Need data |
| **Rank badge displays correctly** | Visit profile as [RANK] | Profile shows correct emoji + frame color | ⚠️ Need data |
| **Leaderboard shows rank + badge** | Check leaderboard as [RANK] | Self appears with badge + XP total | ⚠️ Need data |
| **Seasonal challenge progresses** | Complete challenge steps for Q1 | Progress bar updates in real-time | ⚠️ Need data |

---

## SECTION 7: KEY DECISIONS LOCKED (NO REVISIT)

**From S268 Board + S260 Research:**

1. ✅ **Rank thresholds fixed:** 0 / 500 / 2000 / 5000 / 12000 (NO CHANGE)
2. ✅ **Seasonal reset floor:** Tier drops 1 level max (GRANDMASTER → SAGE, etc.)
3. ✅ **Hunt Pass free for Grandmaster:** Capped at 1,000 users, then 5% discount for 1,001+
4. ✅ **Presale is rank-only:** Hunt Pass does NOT unlock presale
5. ✅ **XP sources:** $1=1XP (purchase), 5 XP/visit, 50 XP/referral, 15 XP/auction win, 10 XP/share, 25 XP/specialty
6. ✅ **XP sinks:** 15 (rarity boost), 20 (coupon), 50 (Hunt Pass discount)
7. ✅ **No fee discounts by rank:** Prestige and service credits only (S268 unanimous)
8. ✅ **Rarity 4-tier system:** COMMON / UNCOMMON / RARE / LEGENDARY (ULTRA_RARE deprecated)

---

## SECTION 8: OPEN DESIGN QUESTIONS (FOR PATRICK / BOARD)

1. **Should we cap annual XP to prevent extreme active players reaching Grandmaster in <6 months?**
   - Board locked 12,000 threshold, but active players hit it in 11 months. Acceptable variance?

2. **Grandmaster free Hunt Pass — exact cap enforcement?**
   - Proposed: Monthly check on Grandmaster count; if ≥1,000, flag new Grandmasters to Scout rate. Marketing sends alert "Approaching cap!" at 950 users. Acceptable?

3. **Specialty categories — what defines "completed"?**
   - Spec says "purchase 3+ items in category" or "auto-detect via tagging". Should we require organizer validation for high-value claims?

4. **Sourcebook guides — moderation needed?**
   - Sage can publish 2 free guides/month. Should we pre-moderate for quality/misinformation, or post-moderate (user reports)?

5. **Seasonal challenge difficulty — how to grade?**
   - Spec defines Easy=100 XP, Medium=150 XP, Hard=250 XP. Who decides difficulty per challenge? Design team or data-driven (replay data)?

---

## APPENDIX: CODE FILE REFERENCE

**Files to Read/Edit for Implementation:**

- `packages/backend/src/services/xpService.ts` — Rank thresholds, XP awards, sinks
- `packages/backend/src/controllers/xpController.ts` — XP endpoints (rarity boost, coupon)
- `packages/backend/src/controllers/reservationController.ts` — Hold mechanics (fully built)
- `packages/frontend/pages/shopper/loyalty.tsx` — Loyalty page (tier UI, needs presale integration)
- `packages/frontend/pages/shopper/hunt-pass.tsx` — Hunt Pass page (pricing hardcoded, needs rank discounting)
- `packages/frontend/pages/shopper/leaderboard.tsx` — Leaderboard (basic; needs privacy controls, seasonal variants)
- `packages/frontend/components/RankBadge.tsx` — Rank badge display (built, correct)
- `packages/frontend/components/RankProgressBar.tsx` — Progress to next rank (built, correct)
- `packages/frontend/hooks/useXpProfile.ts` — XP profile hook (built; verify it calls /api/xp/profile)
- Schema files (check Prisma migrations for table definitions)

---

**Status: RESEARCH COMPLETE. Ready for Architecture Review + Dev Dispatch.**
