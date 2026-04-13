# Gamification Implementation Checklist — Phase 1
## For Dev Team + QA (Board-Approved Scope)

**Status:** READY FOR SPRINT PLANNING
**Owner:** findasale-dev (primary) + findasale-qa
**Duration:** 4–5 weeks
**Priority:** P1 (blocking beta launch signal feature)

---

## PRE-DEV KICKOFF

- [ ] **Schema Review:** Architect approves UserRank, SeasonalLeaderboard, GuildXPTransaction table designs (no surprises)
- [ ] **XP Economics Sign-Off:** Patrick confirms "$1 = 1 XP" is correct (or adjusts to e.g. "$2 = 1 XP" if needed for experimentation)
- [ ] **Rank Rewards Budget:** Patrick confirms staffing cost for Ranger SLA (2h response target) and Sage presale management burden
- [ ] **Seasonal Theme Copy:** Marketing provides copy + images for Spring/Summer/Fall/Winter expeditions (badge names, challenge descriptions)
- [ ] **Narrative Lock:** Confirm "Collector's Guild" terminology is approved (vs. alternatives like "Hunt Pass Tiers" or "Expedition Ranks")

---

## DEVELOPMENT SPRINTS (4–5 weeks)

### Sprint 1: Schema + XP Service (Days 1–5)

**Prisma Migrations:**
- [ ] Create `UserRank` table (user FK, rank enum, totalGuildXP, rankedAt timestamp)
- [ ] Create `GuildXPTransaction` table (user FK, amount, reason enum, relatedId, createdAt)
- [ ] Create `SeasonalLeaderboard` table (user FK, seasonId, seasonalScore, seasonalRank, badgesEarned array, createdAt)
- [ ] Create `SeasonalChallenge` table (seasonId FK, eventId, challengeKey, name, description, xpReward, badgeId FK, isActive, startsAt, endsAt)
- [ ] Create `UserSeasonalProgress` table (user FK, challenge FK, progress int, completed boolean, completedAt timestamp)
- [ ] Modify `User` table: add huntPassTier enum (cache), add totalGuildXP int (cache), add seasonalBadges string array
- [ ] Modify `Badge` table: add isSeasonalBadge boolean, add seasonId string? for filtering
- [ ] Add index: `UserRank.userId` (lookups)
- [ ] Add index: `SeasonalLeaderboard.seasonId, seasonalRank` (sorting)
- [ ] Add index: `GuildXPTransaction.userId, createdAt` (audit trail queries)

**TypeScript Types (shared package):**
- [ ] Type: `UserRank` (with rank enum literal union)
- [ ] Type: `GuildXPTransaction` (with reason enum)
- [ ] Type: `SeasonalLeaderboard` (with computed `seasonalRank` as optional)
- [ ] Type: `SeasonalChallenge`
- [ ] Type: `RankReward` (unlock: discount%, supportSLA, presaleAccess, badgeId)
- [ ] Type: `RankThreshold` (rank enum → XP threshold mapping)

**XP Service (`packages/backend/src/services/xpService.ts`):**
- [ ] Function: `awardXP(userId, amount, reason, relatedId)` — creates transaction, updates User cache, checks rank thresholds
- [ ] Function: `checkRankUp(userId)` — compares User.totalGuildXP against RankThreshold, updates UserRank and emits "rank_up" event
- [ ] Function: `getUserRank(userId)` — reads from UserRank (source of truth), returns full rank with rewards metadata
- [ ] Function: `getXpToNextRank(userId)` — calculates "500 XP to reach Scout" messaging
- [ ] Event: `rank_up` — emitted by checkRankUp, triggers notifications
- [ ] Logging: All transactions logged to GuildXPTransaction (for audit + fraud detection)

**XP Hook-Up (integrate into existing flows):**
- [ ] PurchaseController: Call `xpService.awardXP(userId, purchaseAmount, 'PURCHASE', purchaseId)` after payment confirmed
- [ ] Sale Visit Tracking: On geolocation verified visit, call `xpService.awardXP(userId, 5, 'VISIT', saleId)` (max 2/day, enforce in service)
- [ ] Referral Service: On referred user's first purchase, call `xpService.awardXP(referrerId, 50, 'REFERRAL', purchaseId)` (one-time check in service)
- [ ] Test: Verify sync call adds <50ms latency to purchase endpoint

**Risk Flags:**
- [ ] Concurrent XP awards: Use database-level row lock (`FOR UPDATE`) to prevent race condition on User.totalGuildXP updates
- [ ] Referral fraud: Validate referred user's payment method is unique + new (not previous account)
- [ ] Geolocation spoofing: Flag >50 visits/day as suspicious for investigation

---

### Sprint 2: Collector Passport Redesign (Days 6–11)

**UI Component: Rank Progression Display**
- [ ] Create `RankProgressBar.tsx` component (shows current rank, XP bar, progress to next rank, "X XP to Scout")
- [ ] Component receives: `rank: UserRank`, `xpToNext: number`
- [ ] States: Initiate (blue), Scout (gold), Ranger (emerald), Sage (diamond), Grandmaster (platinum)
- [ ] Interactive: Hover over rank tier shows rewards tooltip (discount %, support SLA, perks)

**UI Component: Rank Rewards Card**
- [ ] Create `RankRewardsDisplay.tsx` component (lists what current rank unlocks)
- [ ] For Scout: "5% Hunt Pass Discount ($4.74/mo)"
- [ ] For Ranger: "10% Discount + 2h Support SLA + Early Access"
- [ ] For Sage: "15% Discount + 24h Presale Access + Exclusive Inner Circle"
- [ ] For Grandmaster: "20% Discount + Free Hunt Pass Annually + Advisory Access"
- [ ] Each reward has icon + short description

**Page: `/shopper/collector-passport` Redesign**
- [ ] Replace old 3-tab layout (overview/badges/specialties) with new structure:
  - [ ] **Header:** "Your Collector Rank" + RankProgressBar
  - [ ] **Rewards Section:** RankRewardsDisplay (what you've unlocked)
  - [ ] **Badges Tab:** All earned badges (split into seasonal vs. permanent)
  - [ ] **Specialties Tab:** Passport specialties (unchanged from before)
  - [ ] **Leaderboard Tab:** Current seasonal leaderboard position (new, see Sprint 4)
- [ ] Mobile responsiveness: test at 375px width

**Dark Mode:**
- [ ] Ensure Rank Progress Bar colors work in dark mode (test contrast with WCAG AA standard)
- [ ] Test all 5 rank colors in both light + dark themes

**Copy Updates:**
- [ ] Update onboarding modal: "Welcome to the Collector's Guild. Earn points by purchasing, visiting sales, and completing challenges."
- [ ] Update ForgotPassword / Login pages: No gamification copy needed
- [ ] Update Hunt Pass CTA: "Scout members get 5% off Hunt Pass. Reach Ranger for 10% off."

---

### Sprint 3: Seasonal Expeditions + Hunt Pass Updates (Days 12–18)

**Seed Data: Seasonal Expeditions**
- [ ] Create 4 SeasonalChallenge records (Spring, Summer, Fall, Winter):
  - **Spring Awakening** (Mar 1 – May 31):
    - Challenge 1: "Spring Cleaner" (3 items tagged "seasonal/spring")
    - Challenge 2: "Estate Scout" (3 estate sales visited)
    - Challenge 3: "Spring Treasure Hunt" (10 items from 3 sale types)
    - Seasonal badge: "Spring Legend" (top 10 finishers)
  - **Summer Adventure** (Jun 1 – Aug 31):
    - Challenge 1: "Summer Wanderer" (5 regions visited)
    - Challenge 2: "Travel Curator" (5 travel/vacation items)
    - Seasonal badge: "Summer Champion"
  - **Fall Collection** (Sep 1 – Nov 30):
    - Challenge 1: "Specialty Mastery" (3 passport specialties completed)
    - Challenge 2: "Collection Quest" (5 items in top specialty)
    - Seasonal badge: "Fall Sage"
  - **Winter Treasures** (Dec 1 – Feb 28):
    - Challenge 1: "Gift Master" (10 gift-wrapped items)
    - Challenge 2: "Year-End Reflection" (50 lifetime purchases)
    - Seasonal badge: "Winter Legend"

**Hunt Pass Copy Update**
- [ ] Pricing page: Add "Rank Tier Benefits" section showing discount tiers
- [ ] Pricing page: Scout gets $4.74 monthly, show as "Save $0.25/month (5% off)"
- [ ] Pricing page: Ranger gets $4.49/month, show as "Save $0.50/month (10% off)"
- [ ] Collector Passport > Hunt Pass section: Add explainer text "Your rank unlocks better prices on Hunt Pass"
- [ ] Dashboard: Add small note "You're a Scout. Hunting Pass is currently $4.74/mo for you"

**Hunt Pass Billing Logic (backend)**
- [ ] Modify PricingService.getHuntPassPrice(userId):
  - [ ] Fetch User.huntPassTier (cache)
  - [ ] Apply tier discount: Scout = 0.95x, Ranger = 0.90x, Sage = 0.85x, Grandmaster = 0.80x
  - [ ] Return $4.99 * multiplier (rounded to nearest $0.01)
  - [ ] Log for analytics

**Test:**
- [ ] Create test user as Scout, verify HuntPass price endpoint returns $4.74
- [ ] Create test user as Ranger, verify returns $4.49
- [ ] Verify discount applies on actual Stripe subscription creation

---

### Sprint 4: Leaderboard Page + Notifications (Days 19–24)

**Page: `/shopper/leaderboard` (NEW)**
- [ ] Header: "Seasonal Leaderboard — Spring Awakening 2026"
- [ ] Filter by season dropdown (if multiple active seasons)
- [ ] Leaderboard table: Rank | Username | Score | Badges Earned
- [ ] Top 10 highlighted (gold background)
- [ ] Current user highlighted (light background)
- [ ] Pagination: Show top 100
- [ ] Mobile: Stacked layout (no horizontal scroll)
- [ ] Auth: Public leaderboard (visible to all users)

**Leaderboard Score Calculation:**
- [ ] Score = seasonal XP earned in current season (resets Q1)
- [ ] Score updated real-time as users earn seasonal badges + complete challenges
- [ ] Rank # computed on read (not stored)

**Notifications: Rank-Up Event**
- [ ] When user reaches new rank (Initiate → Scout, etc.), trigger notification:
  - In-app: "You've reached Scout rank! You now qualify for 5% Hunt Pass discount."
  - Email: Subject: "You're a Scout 🎉"
  - Push (if mobile app): "Rank up! You're now a Scout."
- [ ] Notification includes CTA: "See your new rewards" → collector-passport

**Notifications: Challenge Completed**
- [ ] When user completes a seasonal challenge:
  - In-app: "Challenge completed! +200 XP. You earned [badge name]."
  - Badge instantly appears on Collector Passport
- [ ] Leaderboard position updated in real-time (via WebSocket if possible, else refresh on page load)

**Notifications: Seasonal Badge Earned**
- [ ] When user earns seasonal badge (via challenge or milestone):
  - In-app badge notification with icon + name
  - Email: "You earned a seasonal badge!"
  - Badge appears on leaderboard next to username

**Implementation:**
- [ ] Modify `notificationService.ts` to handle "rank_up", "challenge_completed", "badge_earned" events
- [ ] Use existing email template system (Resend/Brevo)
- [ ] Use existing in-app notification system

---

### Sprint 5: QA + Live Testing (Days 25–35)

**QA Plan: Role Matrix**
- [ ] **Test as Shopper (Initiate):** Day 1 user, verify onboarding mentions "Collector's Guild", dashboard shows rank 0/500
- [ ] **Test as Shopper (Scout):** Create test user with 500 XP, verify Hunt Pass discounted, rank display correct
- [ ] **Test as Shopper (Ranger):** Create test user with 2000 XP, verify all Ranger perks visible
- [ ] **Test as Shopper (Sage):** Create test user with 5000 XP, verify presale access mention (feature ships Phase 2, so UI stub for now)
- [ ] **Test as Shopper (Grandmaster):** Create test user with 12000 XP, verify all perks visible

**QA Plan: Rank-Up Flow**
- [ ] Make purchase as Initiate, verify +XP awarded
- [ ] Hit 500 XP threshold, verify rank-up to Scout
  - [ ] Check UserRank.rank updated to SCOUT
  - [ ] Check notification sent
  - [ ] Check Collector Passport updated
  - [ ] Check Hunt Pass price changed
- [ ] Repeat for other rank thresholds (2000, 5000, 12000)

**QA Plan: Seasonal Challenges**
- [ ] Verify Spring Challenge "Spring Cleaner" (3 items) triggers correctly
  - [ ] Create purchase of item tagged "spring", add to user cart
  - [ ] Verify progress increments: "1/3" shown on Collector Passport
  - [ ] Complete 3 items, verify badge earned + notification
- [ ] Repeat for each seasonal challenge (8–12 challenges total)

**QA Plan: Leaderboard**
- [ ] Create 5 test users with varying seasonal scores
- [ ] Verify leaderboard displays top 100, sorted by score DESC
- [ ] Verify current user highlighted
- [ ] Verify mobile layout (stacked, no horizontal scroll)

**QA Plan: Dark Mode**
- [ ] RankProgressBar color contrast (WCAG AA: 4.5:1 for text)
- [ ] Leaderboard table readability
- [ ] Badge icons visible in dark background

**QA Plan: Performance**
- [ ] Purchase endpoint latency: <100ms (including XP award)
- [ ] Leaderboard page load: <2s (includes DB query for top 100 + current user rank)
- [ ] Rank progression page load: <1s

**QA Plan: Edge Cases**
- [ ] User makes 2 purchases within 1 second: XP awarded to both (no race condition)
- [ ] User visits same sale twice: Only first visit counts (max 2/day limit enforced)
- [ ] User referred with duplicate payment method: Referral XP not awarded (fraud check)
- [ ] Seasonal challenge with 0 items purchased: Progress stays "0/5", badge not awarded
- [ ] User at exactly 500 XP: Rank == Scout (test boundary)
- [ ] User at 499 XP: Rank == Initiate (test just-before boundary)

**Live Beta Testing (end of Sprint 5):**
- [ ] Deploy to beta environment (beta testers have access)
- [ ] Monitor: Do beta testers understand "Guild XP"?
- [ ] Monitor: Do any reach Scout (500 XP)?
- [ ] Monitor: Do any engage with seasonal challenges?
- [ ] Collect feedback: "What would make you care about rank?"
- [ ] Bug report: Any crashes, 404s, missing copy?

---

## DELIVERABLES CHECKLIST

### Code
- [ ] Prisma schema migrations (7 tables/modifications)
- [ ] TypeScript types in shared package
- [ ] `xpService.ts` (awardXP, checkRankUp, getUserRank, etc.)
- [ ] PurchaseController hook-up (xpService call)
- [ ] RankProgressBar.tsx component
- [ ] RankRewardsDisplay.tsx component
- [ ] `/shopper/collector-passport` redesigned page
- [ ] `/shopper/leaderboard` new page
- [ ] Notification templates (rank-up, challenge, badge)
- [ ] PricingService discount calculation
- [ ] Tests: unit tests for xpService (>80% coverage)
- [ ] Tests: integration tests for purchase → XP flow

### Documentation
- [ ] RankThreshold mapping (Initiate 0→500→2000→5000→12000 Grandmaster)
- [ ] Seasonal Challenge seed data script
- [ ] API endpoint docs: `GET /api/ranks/user`, `GET /api/leaderboard/seasonal`
- [ ] QA test cases (copy to QA repo)

### Deployment
- [ ] Migration SQL script ready (to pass to Patrick for `prisma migrate deploy`)
- [ ] Feature flags ready (if phasing out any old gamification UI)
- [ ] Rollback plan documented (how to revert if schema breaks)
- [ ] Environment variables checked (none needed for Phase 1)

### Analytics
- [ ] Event: `guild_xp_awarded` (userId, amount, reason)
- [ ] Event: `rank_up` (userId, newRank, previousRank)
- [ ] Event: `seasonal_challenge_completed` (userId, challengeKey, badgeId)
- [ ] Dashboards: "Rank distribution" (% users by rank), "Avg XP per user per week"

---

## KNOWN RISKS & MITIGATIONS

| **Risk** | **Severity** | **Mitigation** |
|---|---|---|
| **Rank Permanence Confusion** | M | Copy explicitly states "Your rank is permanent" in onboarding. |
| **Leaderboard Frustration** | M | Emphasize that leaderboard is optional. Permanent rank is the real achievement. |
| **XP Inflation** | M | Monitor avg XP gain/week. If users hit Grandmaster in 2 months, adjust formula. |
| **Presale Logic Not Ready** | M | Phase 1 doesn't include presale routing; add UI mention only ("coming soon"). |
| **Badge Art Missing** | M | Use placeholder SVG badges (colored circle + text) until Marketing provides art. |
| **Seasonal Challenge Too Easy/Hard** | M | Beta test 5 users per challenge. If 80%+ complete in <1 week, increase difficulty. |
| **Database Denormalization Drift** | M | Set database trigger or nightly batch to resync User.totalGuildXP with sum(UserRank.totalGuildXP). Verify weekly. |

---

## SUCCESS CRITERIA (Phase 1 Complete)

- [ ] All code deployed to production
- [ ] Zero critical bugs in QA
- [ ] ≥25% of beta users reach Scout (500 XP) within 2 weeks
- [ ] Average time-to-Scout <6 weeks
- [ ] Hunt Pass click-through rate from Rank page ≥2%
- [ ] Notification engagement (opens) ≥40%
- [ ] Leaderboard page 100+ daily views (by Week 2)

---

## HANDOFF TO PHASE 2 (CONDITIONAL)

If Phase 1 success metrics hit:
- [ ] Approve Host Rank system (adds 5 new tables, 2 week dev)
- [ ] Approve Micro-Event calendar (16 events, adds 1 table, 3 days setup)
- [ ] Approve Presale Access routing (adds API route, 2 days)

If Phase 1 metrics miss:
- [ ] Hold Phase 2
- [ ] Investigate friction (copy clarity, rank threshold too high, etc.)
- [ ] Iterate MVP
- [ ] Relaunch with adjusted settings

---

**Owner:** findasale-dev (primary), findasale-qa (secondary)
**Start Date:** [To be set by Patrick after board approval]
**Target Ship:** 4–5 weeks from kickoff
**Status:** READY TO COMMIT
