# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**Session 265 IN PROGRESS (2026-03-24) — QA VERIFICATION + UX IMPLEMENTATION:**

**Batch 1 QA Results (Brand Drift Verification):**
- ✅ **Batches 3+4 brand drift — VERIFIED LIVE.** Tested 9 pages on finda.sale: /trending, /inspiration, /search, /feed, /shopper/loot-log, /shopper/trails, /categories/antiques all show all-sale-types language correctly. P1 brand alignment PASS.
- 📝 **Residual finding:** `/tags/[slug].tsx` empty state still uses "estate sales" (brand-biased, P3 priority). Dispatched findasale-dev for fix.

**Batch 2 QA Results (XP System Testing):**
- ✅ **XP components render correctly:** RankBadge (Initiate rank + emoji, full dark mode support) ✅, RankProgressBar (0/500 XP, animated fill, next rank label) ✅, Leaderboard (top 50 shoppers, rank medals, 0 console errors) ✅.
- ⚠️ **Authentication blocker:** user11 seed account login failed to switch sessions (session persistence issue). Did not block broader XP component testing.
- **Component health:** Zero broken states, zero console errors. All XP endpoints live and responding.

**Phase 2 UX Audit Findings:**
- 🔴 **P1 BLOCKER — XP Sink Visibility:** Backend endpoints exist (POST /api/xp/sink/rarity-boost 15 XP, POST /api/xp/sink/coupon 20 XP) but ZERO frontend UI exposes them. Users can earn XP but cannot spend it — gamification loop incomplete. **Dispatched findasale-dev:** Build XP Sink Options section on /shopper/loyalty + Boost buttons on sale detail pages. Est. 1-2 hours.
- P2 polish (RankProgressBar MAX RANK visual, leaderboard position footer, header clarity) — can ship in v1.1 if timeline tight.
- Full audit report: `claude_docs/ux-audits/explorer-guild-phase2-audit.md` (2,800+ lines).

**Shopper→Organizer Flow (In Progress):**
- ✅ Backend route `/api/users/setup-organizer` works (removes role gate, atomically adds ORGANIZER to roles, returns fresh JWT).
- 📝 **UX spec completed this session.** Dispatched findasale-dev to implement: BecomeOrganizerModal, useOrganizerSetup hook, pricing page "Host a Sale" CTA, nav "Host a Sale" link, organizer dashboard welcome state.

**QA Process Improvement (In Progress):**
- Dispatched findasale-workflow to produce `claude_docs/operations/qa-delegation-protocol.md` (session S265).

- Last Updated: 2026-03-24T18:30:00Z

**Session 264 COMPLETE (2026-03-24) — NEON→RAILWAY DB MIGRATION + PROCESS IMPROVEMENTS:**
[Archived below for reference]

**Session 262 COMPLETE (2026-03-24) — BRAND DRIFT ALL 4 BATCHES + PHASE 2A/2B/2C FULLY DEPLOYED:**

**Brand Drift — D-001 FULLY RESOLVED (30+ violations fixed):**
- ✅ **Batches 1+2 deployed (commit b06242d):** 14 files updated with all-sale-types copy. "Estate Sale Encyclopedia" renamed to "Resale Encyclopedia" (SEO-safe). P0 (city/map/calendar titles) + P1 (organizer pages copy) all live.
- ✅ **Batches 3+4 committed locally, pending S263 QA before push:** 16 shopper pages + 6 components updated (trending, inspiration, tags, categories, search, feed, loot-log, trails, hubs, SaleShareButton, ReferralWidget, SaleOGMeta, SalesNearYou, AddToCalendarButton, og-image API). Ready for push once QA confirms no regressions.

**Explorer's Guild Phase 2a — SCHEMA LIVE ON NEON + BACKEND DEPLOYED TO RAILWAY:**
- ✅ **Schema migration applied to Neon:** User.guildXp (INT), User.explorerRank (ENUM: Initiate/Scout/Ranger/Sage/Grandmaster), User.seasonalResetAt (TIMESTAMP), RarityBoost table (userId, type, multiplier, expiresAt), extended PointsTransaction (xpChange, rarity, boostApplied), extended Coupon (xpSinkValue). Single migration, zero conflicts.
- ✅ **Backend services created:** `xpService.ts` (NEW) — award XP, validate sinks, compute rank. `xpController.ts` (NEW) — GET /api/xp/profile, GET /api/xp/leaderboard, POST /api/xp/sink/rarity-boost, POST /api/xp/sink/coupon.
- ✅ **Deployed:** Commits bd79e1b + 55a9c38 (schema relation fix). Railway PASSED.

**Explorer's Guild Phase 2b — FRONTEND UI + LEADERBOARD DEPLOYED:**
- ✅ **Components:** RankBadge.tsx (NEW), RankProgressBar.tsx (NEW). Hook: useXpProfile.ts (NEW). Pages: loyalty.tsx + leaderboard.tsx modified.
- ✅ **Bug found + fixed by QA:** useXpProfile.ts + leaderboard.tsx had double `/api` prefix (`/api/xp/...` → 404). Fixed to `/xp/profile` + `/xp/leaderboard`. Pushed.

**Explorer's Guild Phase 2c — XP EVENT WIRING COMPLETE:**
- ✅ **All 4 XP earn events wired:** saleController (sale published → XP award), stripeController (purchase complete → XP award), referralController (referral claimed → XP award), auctionJob (auction win → XP award). Pushed S262.

**Session Housekeeping:**
- ✅ **F4 (SKILL.md bias check) — PASSED.** F5 (profile edit redirect) — verified still in place from S255. P3 (3 new skills) — installed by Patrick.

- 📋 **Carry-forward (S263):** QA smoke test on ALL S262 changes live (brand drift copy, XP endpoints, leaderboard rendering, Phase 2c event wiring). Push Batches 3+4 after QA passes.
- Last Updated: 2026-03-24

**Session 260 COMPLETE (2026-03-23) — RPG SPEC LOCK + EXPLORER'S GUILD PHASE 1 COPY:**
- ✅ **RPG economy spec complete** — all 8 open decisions resolved. `claude_docs/research/gamification-rpg-spec-S260.md` created. Seasonal reset floors, streak XP formula, Sage payoffs (Sourcebook/Early Bird/Sage Coupon), wins-only auction XP, honor-system social share, 3 XP sinks, 4-tier rarity system (Common/Uncommon/Rare/Legendary) all locked.
- ✅ **Agent prompt bias fixed** — global CLAUDE.md + project CLAUDE.md + findasale-innovation SKILL.md + findasale-advisory-board SKILL.md all updated to "secondary sale organizers (estate sales, yard sales, auctions, flea markets, consignment)."
- ✅ **Roadmap updated** — #122 (Explorer's Guild Phase 1, copy/rebrand, no schema) and #123 (Phase 2, XP economy, schema) added to `claude_docs/strategy/roadmap.md`.
- ✅ **Explorer's Guild Phase 1 copy dispatched + complete** — 5 frontend files updated: collector-passport.tsx (Collector→Explorer labels), loyalty.tsx (collect→explore language), OnboardingWizard.tsx (estate sale bias removed), Layout.tsx (nav "My Collection"→"My Explorer Profile"), dashboard.tsx (🏺→🗺️, "Collection"→"Explorer"). TypeScript clean.
- ✅ **`/organizer/onboarding` 404 clarified** — NOT a bug. OnboardingWizard is a modal component (fixed inset-0 overlay), not a page route. No fix needed.
- 📋 **Carry-forward:** Dashboard copy "Manage your estate sales" (1 line, dispatch findasale-dev). findasale-dev/ux/qa SKILL.md bias not confirmed (zip archives — flag for skill-creator pass). Phase 2 XP economy (roadmap #123, requires schema changes, multi-session).
- Last Updated: 2026-03-23

**Session 259 COMPLETE (2026-03-23) — SMOKE TEST + GAMIFICATION DEEP DIVE:**
- ✅ **S258 smoke test (9/10 PASS)** — My Saves, trending buttons, inspiration footer, collector-passport dark mode, contact form, TreasureHuntBanner dismiss, ActivitySummary dark mode, domain strings, /pricing redirect all confirmed live. User2 login failed → organizer pages (/organizer/onboarding, /organizer/pricing) UNVERIFIED — carry forward.
- ✅ **2 bugs fixed + pushed (commit efe96ee):** Purchases tab now clickable (Link wrapper, dark mode classes). YourWishlists.tsx dark mode fixed (hardcoded `bg-white` → `dark:bg-gray-800` + all text/badge classes corrected).
- ✅ **Explorer's Guild gamification spec complete** — 6 research docs in `claude_docs/research/`. Board reviewed + issued CONDITIONAL APPROVAL.
- ✅ **Phase 1 APPROVED (3 mods):** (1) Rebrand "Collector's Guild"→"Explorer's Guild". (2) 8 micro-events at launch (not 16+). (3) Legal review on Sage presale access ToS language.
- ✅ **Phase 2 NO-GO** until organizer reward redesign — fee discounts rejected unanimously. Approved alternative rewards: featured placement, service credits, API access (TEAMS-gated), community perks.
- ✅ **Game design research complete:** Soft reset (annual January) confirmed, weekly streaks over daily, Loot Legend as Sage alternative payoff.
- ✅ **XP economy researched:** 25 XP sources tabled. Flat per-item (not dollar-tied). Top viral accelerators: referrals, auction wins, photo uploads of finds, social shares.
- 📋 **8 game designer decisions still open** — see next-session-prompt.md for full list
- ⚠️ **Patrick design direction (S260):** Loot Legend should NOT be gated — all users get a shareable collection page; earned items populate it. Coupons + auction fees are available as reward/redemption currency. RPG economy research needed (loot tables, XP sinks, item rarity). Abuse prevention design required before dev dispatch.
- ⚠️ **Agent prompt bias fix NOT done** — carry forward from S259. Still need to update CLAUDE.md + SKILL.md files to say "secondary sale organizers" not "estate sale operators."
- Last Updated: 2026-03-23

**Session 258 COMPLETE (2026-03-23) — UX BATCHES + ONBOARDING + STRATEGIC INITIATIVES:**
- ✅ **Dev Batch A (shopper pages)** — 6 UX fixes shipped: AvatarDropdown "My Wishlists"→"My Wishlist", contact page copy shortened, inspiration page double footer removed, trending page wishlist/favorite button added to item cards, typology page dark mode text fix, collector-passport.tsx dark mode class added.
- ✅ **Dev Batch B (functional fixes)** — 6 fixes shipped: TreasureHuntBanner dismiss button + localStorage persistence (`onboarding_dismissed_at`), ActivitySummary skeleton dark mode fix, contact form subject field added, `findasale.com`→`finda.sale` domain fix in 4 files (admin/invites.tsx, tags/[slug].tsx, AddToCalendarButton.tsx, contact.tsx), SD6/SD8/FR1 confirmed already correct (no changes needed).
- ✅ **Dev Batch C (organizer onboarding)** — OnboardingWizard.tsx restructured to 5-step flow (Email Verification stub → Business Profile → Stripe → Create Sale → Success stub). Step progress indicator added ("Step X of 5"). localStorage dismissal tracking added. OrganizerOnboardingModal.tsx removed (legacy). _app.tsx OrganizerOnboardingShower removed.
- ✅ **Q2 My Saves consolidation** — wishlist.tsx restructured: 3 tabs→2 tabs (Items + Sellers). Page renamed "My Saves". AvatarDropdown.tsx, Layout.tsx, ActivitySummary.tsx nav labels updated to "My Saves".
- ✅ **Q3 Premium page consolidation** — /organizer/pricing.tsx created (new consolidated discovery page, all tiers, Stripe CTAs, current plan highlight). /pricing.tsx converted to redirect → /organizer/pricing. /organizer/premium.tsx and /organizer/upgrade.tsx already redirecting from prior sessions.
- ✅ **Advisory Board reviewed 3 strategic questions:** Gamification (Patrick rejected deletion approach), Feature overlap Q2 (Approved), Premium pages Q3 (Approved).
- ✅ **Innovation Agent produced 3 gamification narrative concepts:** Treasure Map Collector's Guild (rank: Initiate→Scout→Ranger→Sage→Grandmaster), Antiquarian's Collection Quest (prestige/expertise), Estate Sale Seasonal Challenge Circuit (seasonal resets). Recommendation: blend Concepts 1+3 with more research next session.
- ⚠️ **Patrick feedback logged:** Agent prompts inject "estate sale" bias — platform serves estate sales, yard sales, auctions, flea markets, consignment. Next session: fix agent prompt bias toward "secondary sale organizers." Removal gate tone too quick to delete — need real justification beyond "couldn't think of narrative."
- 📋 **S259 PRIORITY 1 (MANDATORY):** Smoke test all S258 changes live via Chrome MCP (finda.sale) — per CLAUDE.md §10
- 📋 **S259 PRIORITY 2:** Gamification narrative session — blend Concepts 1+3, research competitive inspiration, produce unified spec before dev work
- 📋 **S259 PRIORITY 3:** Fix agent prompt bias in CLAUDE.md or relevant skills — "secondary sale organizers" not just "estate sale operators"
- 📋 **S259 PRIORITY 4:** Guild narrative copy/label implementation — once narrative finalized + Patrick approves
- Last Updated: 2026-03-23

---

**Pricing Model (LOCKED):**
- **SIMPLE (Free):** 10% platform fee, 200 items/sale included, 5 photos/item, 100 AI tags/month
- **PRO ($29/month or $290/year):** 8% platform fee, 500 items/sale, 10 photos/item, 2,000 AI tags/month, unlimited concurrent sales, batch operations, analytics, brand kit, exports
- **TEAMS ($79/month or $790/year):** 8% platform fee, 2,000 items/sale, 15 photos/item, unlimited AI tags, multi-user access, API/webhooks, white-label, priority support, **12-member cap (D-007 LOCKED)**
- **ENTERPRISE (Custom, $500–800/mo):** Unlimited members, dedicated support, SLA (D-007 LOCKED)
- **Overages:** SIMPLE $0.10/item beyond 200; PRO $0.05/item beyond 500; TEAMS $0.05/item (soft cap)
- **Shopper Monetization:** 5% buyer premium on auction items ONLY; Hunt Pass $4.99/mo (PAUSED); Premium Shopper (DEFERRED to 2027 Q2)
- **Post-Beta:** Featured Placement $29.99/7d, AI Tagging Premium $4.99/mo (SIMPLE), Affiliate 2-3%, B2B Data Products (DEFERRED)
- **Sources:** pricing-and-tiers-overview-2026-03-19.md (complete spec), BUSINESS_PLAN.md (updated), b2b-b2e-b2c-innovation-broad-2026-03-19.md (B2B/B2C strategy)

**DB test accounts (Railway Postgres - current):**
- `user1@example.com` / `password123` → ADMIN role, SIMPLE tier organizer
- `user2@example.com` / `password123` → ORGANIZER, PRO tier ✅
- `user3@example.com` / `password123` → ORGANIZER, TEAMS tier ✅
- `user11@example.com` / `password123` → Shopper

---

## Recent Sessions

**S264 (2026-03-24):** Neon→Railway Postgres migration complete. 114 migrations + full seed applied. Smoke test PASS. Process improvements: pushblock-first strategy, wrap file consolidation (4→2 files), real dispatch token estimates, parallel dispatch up to 7 agents. Registration bug fix (SHOPPER→ORGANIZER role transition). 9 skill packages rebuilt. Savings: ~$18.50/month on database costs.

**S263 (2026-03-24):** QA smoke test all S262 changes — ALL PASS. XP system bug fixed (TS2345 null guard + prisma singleton). Batches 3+4 brand drift pushed (22 files). XP endpoints confirmed live.

**S262 (2026-03-24):** Brand drift D-001 fully resolved (30+ violations, 4 batches). Explorer's Guild Phase 2a/2b/2c all deployed. RPG spec locked.

**S260 (2026-03-23):** RPG economy spec locked (8 decisions). Agent prompt bias fixed. Roadmap updated. Explorer's Guild Phase 1 copy complete.

**S259 (2026-03-23):** S258 smoke test (9/10 PASS). 2 bugs fixed (Purchases tab, Wishlists dark mode). Explorer's Guild gamification spec complete. Board conditional approval.

---

## Next Session

**S266 PRIORITY 1 (AFTER DEV RETURNS):** XP Sink UI push from findasale-dev — once XP Sink Options UI merges, dispatch post-deploy QA to verify spend-XP flow end-to-end (earn, reach rank threshold, discover sinks, spend successfully).

**S266 PRIORITY 2 (AFTER DEV RETURNS):** Shopper→Organizer flow push — once BecomeOrganizerModal + nav "Host a Sale" link + pricing CTA merges, dispatch post-deploy QA to verify: logged-in shopper can access onboarding flow, user role transitions to ORGANIZER, JWT updates correctly.

**S266 PRIORITY 3 (IF TIME):** Post-deploy smoke test on `/tags/furniture` empty state fix (P3 findasale-dev dispatch).

**S266 PRIORITY 4 (IF TIME):** Review QA delegation protocol (findasale-workflow deliverable) — formalize for future sessions.

**S266 PRIORITY 5 (P5 — LOW PRIORITY):** Brand copy deep audit — page titles, meta descriptions, all 5 sale types represented consistently.

**Patrick action (before S266 starts):** Monitor Railway build after dev push. Expect 2 push blocks: (1) XP sink UI + Shopper→Organizer flow (findasale-dev), (2) QA protocol (findasale-workflow).

---

## Active Infrastructure

### Database
- **Railway Postgres** — `maglev.proxy.rlwy.net:13949/railway` (~$0.55/month, migrated from Neon S264)

### Connectors
- **Stripe MCP** - query payment data, manage customers, troubleshoot payment issues. Connected S172.
- **MailerLite MCP** - draft, schedule, and send email campaigns directly from Claude.
- *CRM deferred - Close requires paid trial. Spreadsheet/markdown for organizer tracking until beta scale warrants it.*

### Scheduled Automations (11 active)
Competitor monitoring, context freshness check (weekly Mon), UX spots, health scout (weekly), monthly digest, workflow retrospective, weekly Power User sweep, daily friction audit with action loop (Mon-Fri 8:38am), weekly pipeline briefing (Mon 9am), session warmup (on-demand), session wrap (on-demand). Managed by findasale-records + findasale-workflow + findasale-sales-ops agents.
