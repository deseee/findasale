# Developer Handoff Checklist — Gamification Phase 1 (S259)

**Prepared for:** findasale-dev skill
**Scope:** Phase 1 MVP (4–5 weeks, 2–3 dev FTE + 1 QA FTE)
**Authority:** gamification-revised-spec-S259.md

---

## PRE-DEV SIGN-OFF (1 day)

Before you start coding, confirm the following are locked:

### Patrick's Five Tension Decisions (REQUIRED)
- [ ] Grandmaster free Hunt Pass capped at 1,000 users (Y/N)
- [ ] Seasonal leaderboard strict reset; accept ~10% veteran churn risk (Y/N)
- [ ] Visit XP stays at 5/visit with 100/month cap (Y/N)
- [ ] Sage presale deferred to Phase 2; scope to Elite+ hosts (Y/N)
- [ ] Defend organizer fee discount veto initially (Y/N)

### Board Locked Decisions (CONFIRMED)
- [ ] Rebrand "Collector's Guild" → "Explorer's Guild" (✅ Locked)
- [ ] Five shopper tiers (Initiate→Grandmaster) (✅ Locked)
- [ ] Four seasonal expeditions (Q1–Q4) (✅ Locked)
- [ ] Eight Phase 1 micro-events (not 16+) (✅ Locked)
- [ ] Organizer rewards prestige + services only (NO fee discounts) (✅ Locked)
- [ ] Phase 1 = shopper track only; Phase 2 = organizer track (✅ Locked)

### Architecture Approval (REQUIRED)
- [ ] Architect reviews schema footprint (5 new tables, 3 modified) — Section 10 of spec
- [ ] Architect approves XP calculation design (sync/async hybrid)
- [ ] Architect confirms event orchestration (static registry vs. dynamic DB)

### QA Scope Confirmation (REQUIRED)
- [ ] QA confirms test matrix (all roles, all tiers, all rank thresholds, all seasons)
- [ ] QA confirms Edge Cases: leaderboard resets, concurrent rank-ups, timezone boundaries

---

## PHASE 1 DELIVERABLES (WEEK-BY-WEEK BREAKDOWN)

### Week 1: Schema & Core Service (5 days)

**Deliverables:**
- [ ] Prisma migration: Create 5 new tables (UserRank, SeasonalLeaderboard, GuildXPTransaction, SeasonalChallenge, UserSeasonalProgress)
- [ ] Prisma migration: Modify User (add huntPassTier, totalGuildXP, seasonalBadges), Badge (add isSeasonalBadge, seasonId), HuntPass pricing logic
- [ ] `XpService` singleton with core methods:
  - `awardXP(userId, amount, reason, relatedId)` — atomic update to UserRank + GuildXPTransaction + User cache
  - `rankUp(userId, newRank)` — promotion logic, emit "rank_up" event
  - `checkRankThreshold(totalXP)` — return rank (INITIATE, SCOUT, RANGER, SAGE, GRANDMASTER)
- [ ] Redis cache layer: User.totalGuildXP (TTL 5 min, invalidate on write)
- [ ] Unit tests: XP calculation, rank threshold crossing, race condition handling

**Acceptance Criteria:**
- [ ] `awardXP()` is idempotent (can be called twice with same data, no double-award)
- [ ] Rank promotion triggers "rank_up" event (picked up by notifications system)
- [ ] Cache invalidation happens immediately on XP write
- [ ] All tests pass; no race conditions on concurrent purchases from same user

---

### Week 2: Hunt Pass Integration & XP Sources (5 days)

**Deliverables:**
- [ ] PricingService: Apply XP-based Hunt Pass discount
  - Scout (500 XP): $4.74/mo (5% off)
  - Ranger (2k XP): $4.49/mo (10% off)
  - Sage (5k XP): $4.24/mo (15% off)
  - Grandmaster (12k XP): $0/mo (FREE, capped at 1,000 users)
- [ ] XP award endpoints for all six sources:
  - **Purchase XP:** Post-purchase hook in `purchaseController.ts`, sync call to `awardXP()`, +$1 spent = +1 XP
  - **Visit XP:** POST `/api/visits/verify` (geolocation), async call to Bull queue, +5 XP (max 2/day)
  - **Referral XP:** POST `/api/referrals/claim`, verify referred user's first purchase, +50 XP (one-time, referrer only)
  - **Specialty XP:** POST `/api/passport/specialty/complete`, +25 XP per category (max 8/year)
  - **Challenge XP:** Triggered by seasonal challenges (see Week 3)
  - **Community XP:** POST `/api/community/action`, peer-review gate, +10–50 XP (max 200/month)
- [ ] Streak multiplier logic: 1.2x XP on consecutive active days; 7-day bonus 100 XP; 30-day bonus 250 XP
- [ ] Unit tests: Discount calculations, XP source isolation, cap enforcement

**Acceptance Criteria:**
- [ ] Hunt Pass discount updates in real-time when user reaches new rank
- [ ] All six XP sources award correctly and are independently testable
- [ ] Referral verification prevents gaming (fraud detection for fake referral chains)
- [ ] Streak logic handles time-zone edge cases (midnight crossover)

---

### Week 3: Collector Passport Redesign & Seasonal Expeditions (6 days)

**Deliverables:**
- [ ] Collector Passport component rewrite:
  - Display permanent rank (Initiate, Scout, Ranger, Sage, Grandmaster) with progress bar to next tier
  - Show current season + seasonal leaderboard position (if ranked)
  - Display earned badges: permanent badges + seasonal badges (separate tabs)
  - Show specialties completed (max 8)
  - Show favorite hosts (organizers user has purchased from 3+ times)
- [ ] `SeasonalChallenge` seeding: Create 3–4 challenges per season (12 total)
  - Q1 Spring: "Spring Treasure Hunt" (10 items, 3 types), "Renewal Streak" (7 days), "Community Garden" (5 gardening items)
  - Q2 Summer: "Region Hopper" (5 regions), "Travel Curator" (5 travel items), "Seller Connection" (5 same organizer)
  - Q3 Fall: "Specialty Mastery" (3 categories × 200 XP), "Collection Quest" (white whale), "Holiday Prepper" (10 gift items)
  - Q4 Winter: "Gift Guide Curator" (7 items), "Year-End Reflection" (50 purchases), "Grandmaster Gathering" (event attendance)
- [ ] Challenge progress tracking: `UserSeasonalProgress` updates on purchase, visit, specialty completion
- [ ] Leaderboard page: Top 100 current season, sortable by score, seasonal badges displayed
- [ ] Seasonal badge seed data: 3–4 badges per season

**Acceptance Criteria:**
- [ ] Passport shows permanent rank + seasonal position in same view
- [ ] Challenge progress updates in real-time (user sees progress bar)
- [ ] Leaderboard refreshes hourly (or on demand)
- [ ] Seasonal badges are visually distinct from permanent badges

---

### Week 4: Notifications & Hunt Pass Copy (4 days)

**Deliverables:**
- [ ] Notification system hooks:
  - "rank_up" event: "Congratulations! You've reached Ranger." (+ reward preview)
  - "challenge_complete" event: "You've completed [Challenge Name]! +150 XP."
  - "seasonal_badge_earned" event: "You've unlocked the [Badge Name] seasonal badge!"
  - "presale_available" event: "A Sage presale is available in 24h. Wishlist now." (Phase 2 prep, don't ship in Phase 1)
- [ ] Hunt Pass copy/UX updates:
  - Marketing page: "Unlock rank discounts. Every rank brings savings." Link to Explorer's Guild page.
  - Onboarding: "Guild XP is earned with every purchase. Reach Scout (500 XP) for 5% Hunt Pass discount."
  - Pricing page: Show rank discounts side-by-side (Initiate $4.99, Scout $4.74, etc.)
- [ ] Rank rewards display: Show each rank's unlock preview (what Scout gets, what Ranger gets, etc.)
- [ ] Email templates: Rank-up announcement email template (sent on rank promotion)

**Acceptance Criteria:**
- [ ] Notifications are customizable (user can opt out per notification type)
- [ ] Email templates render correctly across clients
- [ ] Hunt Pass pricing page is A/B testable (for future optimizations)

---

### Week 5: QA & Launch Prep (5 days)

**Deliverables:**
- [ ] Comprehensive test matrix (see QA section below)
- [ ] Live data cleanup: Backfill `User.totalGuildXP` + `User.huntPassTier` for existing users (based on purchase history)
- [ ] Database verification: Run integrity checks (UserRank exists for all active users, no orphaned SeasonalLeaderboard entries)
- [ ] Feature flags: Gate Phase 2 features (presale, organizer ranks, 8+ micro-events) behind feature flags (OFF by default)
- [ ] Staging deployment: Test on Railway staging environment (full end-to-end flow)
- [ ] Monitoring setup: Alerts for XP calculation errors, leaderboard anomalies, cache staleness
- [ ] Documentation: API spec for XP endpoints, database schema documentation, deployment runbook

**Acceptance Criteria:**
- [ ] All tests pass (unit + integration + e2e)
- [ ] Feature flags are verified (Phase 2 features don't leak to prod)
- [ ] Staging deployment is stable for 24 hours (no errors on main user flows)
- [ ] Monitoring alerts are configured and tested

---

## QA TEST MATRIX (Phase 1)

**Scope:** All shopper tiers, all XP sources, all seasonal challenges, rank threshold edge cases

### Tier Progression Tests (2 days)

- [ ] **Initiate → Scout (500 XP):**
  - User purchases $500 of items → reaches Scout with rank-up notification
  - User attends 100 sales (500 XP from visits) → reaches Scout
  - User earns 500 XP via referrals (10 referrals × 50 XP) → reaches Scout
  - Combination: 200 in purchases + 60 visits (300 XP) + 2 referrals (100 XP) → reaches Scout
- [ ] **Scout → Ranger (2,000 XP total):**
  - Verify Hunt Pass discount applies immediately (5% off)
  - Verify priority support SLA is gated (2h response, not 24h)
  - Early access to 1 sale/week is enabled
- [ ] **Ranger → Sage (5,000 XP total):**
  - Hunt Pass discount 10% applied
  - Priority support SLA 1h
  - Early access to 3 sales/week enabled
- [ ] **Sage → Grandmaster (12,000 XP total):**
  - Hunt Pass free (or 5% if cap is hit)
  - Priority support SLA 15 min
  - Grandmaster-only presale access enabled (Phase 2, but feature-flag check)

### XP Source Tests (1 day)

- [ ] **Purchases:** $1 = 1 XP (no caps, no resets)
- [ ] **Visits:** 5 XP per visit, max 2/day, geolocation verified
- [ ] **Referrals:** 50 XP one-time per referred user's first purchase, fraud detection on 20+ referrals/month
- [ ] **Specialties:** 25 XP per completed specialty (max 8/year), auto-detect or manual claim
- [ ] **Streaks:** 1.2x multiplier on consecutive active days, 7-day streak = 100 XP bonus, 30-day = 250 XP bonus
- [ ] **Community Actions:** 10–50 XP peer-reviewed, max 200/month, rate-limited

### Seasonal Challenge Tests (2 days)

- [ ] **Q1 Spring Treasure Hunt:** Find 10 items from 3 sale types → 200 XP + "Spring Wanderer" badge
- [ ] **Q1 Renewal Streak:** 7 consecutive days of sales → 150 XP + 1.5x multiplier for 7 days + "Renewal Collector" badge
- [ ] **Q1 Community Garden:** Collect 5 gardening items → 100 XP + "Garden Keeper" badge
- [ ] **Q2–Q4 Challenges:** Similar coverage for all 12 challenges

### Leaderboard Tests (1 day)

- [ ] **Leaderboard Calculation:** Top 100 users by seasonal score are correctly ranked
- [ ] **Seasonal Reset:** Q1 leaderboard resets Q2 Day 1 (scores go to zero, permanent rank persists)
- [ ] **Badge Persistence:** Q1 "Spring Legend" badge (top 10) remains on profile after Q1 ends
- [ ] **Concurrent Updates:** Multiple users earning points simultaneously don't cause ranking glitches

### Edge Cases (1 day)

- [ ] **Concurrent Rank-Ups:** Two users hit Scout threshold simultaneously → both are ranked correctly
- [ ] **Timezone Boundaries:** User in PST earns points at 11:59pm PST, visits a sale in EST at 12:01am EST → visit counts towards correct day
- [ ] **Cache Staleness:** User earns 500 XP, immediate refresh shows new rank (not stale cache)
- [ ] **Leaderboard Snapshot:** Top 100 at end of Q1 are frozen in "Hall of Fame" even after Q2 starts

### Performance Tests (Architect review, 0.5 day)

- [ ] XP calculation latency: <50ms for synchronous purchase XP
- [ ] Leaderboard query: Top 100 query completes in <100ms
- [ ] Cache hit rate: >95% for User.totalGuildXP reads
- [ ] No N+1 queries on Collector Passport load

---

## PHASE 1 EXCLUSIONS (Do NOT Ship)

- ❌ Organizer Host Ranks
- ❌ Sage/Grandmaster presale access (routes, permissions, presale page)
- ❌ 8+ micro-events (Valentine's, Tax Season, Back-to-School, Black Friday, Holiday, New Year, Picnic, Spooktacular are implemented; others deferred)
- ❌ Admin event management UI
- ❌ Mystery boxes, daily spin wheel, appraisal tokens
- ❌ Social sharing (Year-End Reflection graphics) — deferred to Phase 3

**Feature Flag Verification:**
- [ ] All Phase 2/3 features are behind feature flags (default OFF)
- [ ] Confirm flags don't leak to prod (code review, staging test)

---

## POST-LAUNCH LIVE METRICS (4-Week Checkpoint)

**Measure these metrics at 4-week post-launch. They gate Phase 2 approval.**

### Metric 1: Rank Penetration ≥25%
- **Definition:** % of monthly active users who reach Scout (500 XP)
- **Target:** ≥25% by week 4
- **If miss:** Gamification narrative isn't resonating. Investigate onboarding clarity, reward tangibility.

### Metric 2: Engagement Lift ≥10%
- **Definition:** DAU increase (post-Phase 1 vs. pre-Phase 1 baseline)
- **Target:** ≥10% DAU growth
- **If miss:** System isn't driving behavior change. Investigate friction (onboarding copy, challenge clarity, leaderboard achievability).

### Metric 3: Hunt Pass Conversion ≥1.5%
- **Definition:** Scout+ users converting to Hunt Pass at rate X vs. Initiate baseline
- **Target:** Scout+ conversion ≥1.5× higher than Initiate
- **If miss:** Rank discounts aren't driving monetization. Consider increasing discount % (Scout 10% instead of 5%).

### Metric 4: Churn Reduction ≥5%
- **Definition:** Sage+ players' monthly churn vs. Initiate baseline
- **Target:** Sage+ churn ≥5% lower than Initiate
- **If miss:** Higher-rank players aren't more sticky. System might increase engagement but not retention.

---

## PHASE 1 → PHASE 2 HANDOFF (IF METRICS HIT)

If all four metrics hit, proceed immediately to Phase 2 scope:
- [ ] Organizer Host Ranks + advancement logic
- [ ] Sage presale access (routes, permissions, presale UI)
- [ ] 8 Phase 2 micro-events
- [ ] Admin event management panel

**Handoff Artifact:** `gamification-revised-spec-S259.md` Section 8 (Phase 2 Conditional Gate) contains the full Phase 2 scope.

---

## DEPLOYMENT CHECKLIST (Week 5, Post-QA)

Before going live to production:

- [ ] Feature flags created + tested (Phase 2 features OFF)
- [ ] Database migration tested on staging (no data loss, no schema conflicts)
- [ ] Monitoring alerts configured (XP calculation errors, leaderboard anomalies, cache staleness)
- [ ] Deployment runbook written (how to rollback, how to scale XP service)
- [ ] Marketing notified (launch date, communications plan for Explorer's Guild rebrand)
- [ ] Support notified (FAQ prepared for common rank/XP questions)
- [ ] Customer success notified (talking points for beta user onboarding)

---

## AUTHORITY DOCUMENTS

Primary reference for this sprint:

1. **gamification-revised-spec-S259.md** (full implementation spec)
2. **gamification-board-review-S259.md** (locked board decisions + objection resolutions)
3. **PATRICK_DECISION_SUMMARY-S259.md** (Patrick's five tension decisions, required before starting)

---

## ESCALATION CONTACTS

- **Architect Questions:** findasale-architect skill
- **UX Questions:** findasale-ux skill
- **Data/Analytics Questions:** findasale-qa skill (needs live data tracking setup)
- **Production Issues (during Phase 1 beta):** findasale-ops skill

---

**Prepared by:** Innovation Agent (S259)
**Date:** 2026-03-23
**Status:** Ready for findasale-dev skill dispatch
**Next Step:** Patrick confirms five tensions; forward this checklist to dev.
