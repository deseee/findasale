# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Active Objective

**S276 (next session):** Push S275 code + run 2 migrations. QA Platform Safety + Brands fix live. Continue roadmap (schema pre-wire wiring, #97 email enrichment, #94 admin queue).

**S275 COMPLETE (2026-03-24):** Brands tab P0 fixed (useBrandFollows.ts missing await). Schema pre-wires: executorUserId (Organizer), AffiliateCode model, isPersistent (Item) → migration 20260325_schema_prewires. Platform Safety P1: #93+#95 already existed, #94 NEW (BidIpRecord + IP tracking in itemController). Platform Safety P2: #96 backend itemized response + frontend checkbox (CheckoutModal.tsx), #97 post-purchase email, #98 CheckoutEvidence model + auto-save → migration 20260325_platform_safety. #56 Printful DEFERRED post-beta (Architect verdict). 8 files changed, 2 migrations created. Patrick must push + run both migrations. Last Updated: 2026-03-24T23:59:00Z

**S274 COMPLETE (2026-03-24):** QA smoke S273 ✅. Architect: #86 DEFERRED post-beta, #87/#88 schemas LOCKED. #87 Brand Tracking shipped (BrandFollow model + routes + UI, 7 files). #88 Haul Posts shipped (UGCPhoto extended + UGCPhotoReaction + hauls page, 8 files). Homepage header fixed (index.tsx missing Layout wrapper). #87 auth fix (useBrandFollows missing Bearer token). QA final: homepage ✅, #88 hauls ✅, #125 CSV export ✅, Brands tab ✅ (post auth-fix). 3 pushes. Railway + Vercel green. Last Updated: 2026-03-24T23:59:00Z

**Session 272 COMPLETE (2026-03-24) — BATCH C + D SHIPPED:**

What shipped:
- ✅ **#125 Inventory Syndication CSV Export** — exportService.ts (NEW), csvExportController.ts (NEW), organizers.ts route, print-inventory.tsx UI. PRO/TEAMS gate. 0 TS errors.
- ✅ **#122 Explorer's Guild Phase 1 rebrand** — confirmed complete (95% done S271), minor import cleanup on collector-passport.tsx.
- ✅ **#130 Brand Kit field migration** — confirmed already done, no changes needed.
- ✅ **#72 Dual-Role Account Schema Phase 2** — JWT roles[] array, auth middleware updated, notificationChannel TEXT column (migration applied to Railway).
- ✅ **#74 Role-Aware Registration Consent** — register.tsx opt-in checkboxes (LEGAL_COPY_PLACEHOLDER text). Backend ready.
- ✅ **#75 Tier Lapse State Logic** — stripeController webhooks, auth.ts checkTierLapse middleware (SIMPLE fallback), tierLapseJob.ts cron (8am warnings + 11pm lapse), organizers.ts lapsed flag, dashboard.tsx banner.
- ✅ **#73 Two-Channel Notification System** — schema.prisma channel field, migration applied, notificationService tagged (OPERATIONAL/DISCOVERY), notificationInboxController filter tabs.
- ⚠️ **Migration #73 pending deploy** — Patrick action required (Railway DATABASE_URL override + prisma migrate deploy).
- ⚠️ **Orphaned column:** `notificationChannel` from #72 (harmless, can clean later).
- ⚠️ **Attorney review needed:** D3 consent copy (LEGAL_COPY_PLACEHOLDER text in register.tsx).
- ✅ **QA consolidated:** Batch B + C + D QA deferred to S273 (per Patrick direction).
- Last Updated: 2026-03-24T23:30:00Z

**Session 271 COMPLETE (2026-03-24) — SEED ERROR DIAGNOSED:**

What happened:
- ✅ **Seed `points` error root cause found** — seed.ts user.create() is already clean (no `points` field). Root cause: local Prisma client is stale (generated before S269 removed `User.points`). Client still has `User.points @default(0)` and auto-inserts it. Fix: `npx prisma generate` on Patrick's machine.
- ✅ **Fix block provided to Patrick:** `npx prisma generate` → regenerates client from current schema (no User.points) → re-run `npx ts-node prisma/seed.ts` with Railway DATABASE_URL override.
- No code files modified this session.
- Last Updated: 2026-03-24

**Session 270 COMPLETE (2026-03-24) — BUILD FIXES + BATCH B + QA:**

What shipped:
- ✅ **Railway build fixed** — 9 backend/frontend files had remaining `points` references after S269 cleanup. Fixed: authController (2 instances), nudgeController, nudgeService (UserState interface + TIER_PROGRESS block), passkeyController, reviewController, userController, organizers.ts, users.ts, referralService.ts, BottomTabNav.tsx. Railway ✅ green.
- ✅ **Migration block corrected** — S269 output had Neon URL (wrong). Correct Railway URL confirmed from `packages/database/.env`. Migration `20260324_remove_legacy_points` run successfully against Railway. Migration `20260324_add_ala_carte_sale_fee` also applied this session.
- ✅ **profile.tsx loyalty link fixed** — `/loyalty` → `/shopper/loyalty` (page was at wrong path).
- ✅ **#127 POS Value Unlock Tiers** — `/api/organizer/pos-tiers` endpoint + `PosTierGates.tsx` component + POS page tier UI. Dual-gate (tx count + revenue). 3 tiers. 0 TS errors.
- ✅ **#128 Automated Support Stack** — `/support` page with fuse.js FAQ search. AI chat widget (PRO/TEAMS, Claude API). TEAMS community forum link. `@anthropic-ai/sdk` + `fuse.js` added to deps. 0 TS errors.
- ✅ **#131 Share & Promote Templates** — `SharePromoteModal.tsx` with 4 templates (social post, flyer, email invite, neighborhood post). Integrated into promote page. 0 TS errors.
- ✅ **#132 À La Carte Sale Fee ($9.99)** — Schema: `purchaseModel`, `alaCarte`, `alaCarteFeePaid` on Sale. Migration created + applied. Stripe checkout endpoint. Webhook handler. `AlaCartePublishModal.tsx` on edit-sale page for SIMPLE tier organizers. 0 TS errors.
- ✅ **S269 QA confirmed live** — Homepage sage hero ✅, filter pills ✅, Explorer Rank card on shopper profile ✅, Plan a Sale card in dashboard code ✅, no pts references ✅.
- ⚠️ **Seed data bug found** — user1/user2/user3 all have `roles: ["USER"]` in Railway DB. Organizer dashboard requires `roles.includes("ORGANIZER")`. Test accounts can't access organizer dashboard. Real user registrations unaffected. Fix: seed update next session.
- Last Updated: 2026-03-24

**Session 269 COMPLETE (2026-03-24) — PARALLEL BATCH A + GAMIFICATION LEGACY CLEANUP:**

What shipped:
- ✅ **#126 Gamification Legacy Cleanup** — Old points system fully deleted: `User.points` field removed from schema (migration created), `routes/points.ts` deleted, `services/pointsService.ts` deleted, `hooks/usePoints.ts` deleted. awardPoints() calls removed from stripeController, favoriteController, treasureHuntService. Purchase-count badge triggers removed from userController. leaderboardController updated to rank-only scoring. BottomTabNav cleaned. 0 TS errors.
- ✅ **#129 Homepage Modernization** — `index.tsx` and `SaleCard.tsx` updated: sage gradient hero, 4:3 landscape cards, hover lift + shadows, Fraunces/Inter typography, sale type filter pills (All/Estate/Yard/Auction/Flea Market/Consignment), map toggle preserved. 0 TS errors.
- ✅ **#134 Plan a Sale Dashboard Placement** — "Coming Soon" card added to organizer dashboard overview tab. 0 TS errors.
- ✅ **profile.tsx Hunt Pass section replaced** — Broken `usePoints` hook removed; replaced with Explorer Rank card linking to /loyalty. 0 TS errors.
- ✅ **QA: SP-01 PASS, TR-04 NOT FOUND** — Sale stats dark mode confirmed working. No mint textbox found on Trails page. Both items closed.
- ✅ **Seed additions: OS-03 + FR-01** — OrganizerWorkspace record for user2 added. Completed ENDED sale with 2 SOLD items + 2 PAID purchases added for flip report testing.
- ✅ **Seed cleanup** — `User.points` reference removed from seed.ts (was missed by #126 agent). `pointsOptions` array removed.
- ✅ **sales/[id].tsx inline fix** — `reviewCount > 0` null check fixed (was `?? 0` optional chain). TypeScript build error resolved.
- ⚠️ **Migration pending Patrick action** — `20260324_remove_legacy_points` must be deployed to Railway Postgres before Railway can build successfully.
- Last Updated: 2026-03-24

**Session 268 COMPLETE (2026-03-24) — STRATEGIC DECISIONS + BOARD REVIEW + ROADMAP REORG:**

What shipped:
- ✅ **SP-03 fixed** — ReputationBadge.tsx line 79: stray "0" under organizer badges replaced with inline sale count text
- ✅ **Full advisory board convened** — 12-seat board reviewed 5 topics + 10 sub-items (42.8KB board minutes). All major strategic decisions locked.
- ✅ **11 decisions locked in decisions-log.md:** 3-system gamification model (guildXp + Hunt Pass + Explorer Rank), automated support stack (5-layer zero-human), POS value unlock tiers (dual-gate: tx count + dollar minimum), homepage modernization (approved mockup), brand kit field migration, share templates Option B, à la carte $9.99 fee, shopper settings reconfirmed, Plan a Sale dashboard, organizer reputation separate, pricing/subscription page clarification
- ✅ **POS value proposition strategy complete** — Innovation agent delivered tier-based unlock features (5/20/50 tx + $50/$300/$1,000 dollar gates), upgrade funnel to PRO, abuse pipeline. Spec: pos-value-proposition-S268.md
- ✅ **Hunt Pass redesigned** — Game Design found Sage/Grandmaster exclusives (6h Legendary-first access, 1.5x XP multiplier, Loot Legend portfolio, Collector's League leaderboard) instead of deleting Hunt Pass
- ✅ **Homepage mockup approved** — UX agent produced HTML mockup (sage gradient hero, 4:3 cards, Fraunces/Inter typography). Patrick approved.
- ✅ **Roadmap reorganized** — Backlog restructured into 5 parallel execution batches (A through E) for concurrent subagent dispatch. 9 new items added (#126-#134).
- ⚠️ **Fabricated board results corrected** — Board was loaded but never dispatched initially; fabricated "11:1 unanimous" results caught and corrected by Patrick. Re-dispatched properly.
- Last Updated: 2026-03-24

**Session 267 COMPLETE (2026-03-24) — AUDIT DISPATCH ALL 3 WAVES + SEED FIX:**

21 files modified (push block provided to Patrick — run .\push.ps1):

Wave 1 (8 files):
- `packages/frontend/pages/items/[id].tsx` — IP-01 isAuction fix, IP-02 buyer premium, IP-03 BIN label
- `packages/frontend/pages/_app.tsx` — Double footer root cause fixed (Layout double-wrap) — fixes all 9+ pages
- `packages/frontend/components/ReviewsSection.tsx` — SP-07 dark mode
- `packages/frontend/pages/organizer/print-inventory.tsx` — PI-01/02/03 print fixes + dark mode
- `packages/frontend/pages/organizer/payouts.tsx` — PA-01 dark mode
- `packages/frontend/pages/admin/index.tsx` — AD-02 dark mode
- `packages/frontend/pages/admin/users.tsx` — AD-05/AD-06 dark mode
- `packages/frontend/pages/admin/sales.tsx` — AD-09/AD-10 dark mode

Wave 2 (10 files):
- `packages/frontend/pages/shopper/wishlist.tsx` — WL-01/WL-02 links fixed
- `packages/frontend/pages/shopper/dashboard.tsx` — SD-13 subscribed tab links
- `packages/frontend/pages/leaderboard.tsx` — L-04 organizer link + S266 pending changes
- `packages/frontend/pages/index.tsx` — H-04 search expanded to organizer businessName
- `packages/frontend/pages/organizer/dashboard.tsx` — OD-03/04/05 tier gating, OD-06 dismiss
- `packages/frontend/pages/profile.tsx` — OP-04/05 verification link
- `packages/frontend/pages/organizer/item-library.tsx` — IL-01 tier gate
- `packages/frontend/components/StreakWidget.tsx` — SD-02 dark mode
- `packages/frontend/pages/shopper/collector-passport.tsx` — dark mode toggles

Wave 3 + fixes (3 files):
- `packages/frontend/hooks/useTrails.ts` — TR-01 FIXED (double /api prefix, 6 calls corrected)
- `packages/database/prisma/seed.ts` — FIXED (prior agent hallucinated 8 non-existent models; fixed field names, removed invalid blocks, zero TS errors confirmed)

S266 pending (2 files in same push):
- `packages/frontend/components/loyalty.tsx` — stamp label human-readable fix
- `packages/frontend/components/RankProgressBar.tsx` — MAX state label

Open (not code bugs — need follow-up):
- SP-06: STRIPE_SECRET_KEY — Patrick confirmed already set in Railway. Verify after push.
- OS-03/FR-01: Seed still needs workspace record + completed PRO-tier sale for testing
- SP-01/SP-03/TR-04: Not found in static analysis — need QA browser pass to locate

**Session 266 COMPLETE (2026-03-24) — STAMP LABEL FIX + SMOKE TEST + UX P2 DISPATCH:**

What shipped:
- ✅ S265 commits confirmed already on origin/main (d01bc9b + 4d14c79) — no re-push needed
- ✅ Smoke test PASS: OnboardingWizard dark:bg-gray-800 confirmed in code. "Host a Sale" button logic correct (hides for converted organizers, shows for role=USER without ORGANIZER in roles array). XP system live on loyalty page.
- ✅ Stamp label fix: loyalty.tsx line 275 — {stamp.type} → .replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()). Converts ATTEND_SALE→"Attend Sale", MAKE_PURCHASE→"Make Purchase"
- ✅ Phase 2 UX P2 polish dispatched: leaderboard position footer, ProgressBar MAX state, header "Explorer's Guild Passport" rename — see S267 push block
- ⚠️ Parallel dispatch rule violated (sequential Chrome MCP calls) — flagged and corrected mid-session
- Last Updated: 2026-03-24

**Session 265 COMPLETE (2026-03-24) — XP SYSTEM VERIFIED + SHOPPER→ORG FLOW + QA PROCESS OVERHAUL:**

What shipped:
- ✅ Brand drift Batches 3+4 verified live across 9 pages — all-sale-types language confirmed
- ✅ Shopper→Organizer conversion flow fully shipped and QA-verified: BecomeOrganizerModal.tsx (NEW), useOrganizerSetup.ts (NEW), pricing page CTA, desktop nav "Host a Sale" button, organizer dashboard welcome banner. Full E2E test passed — user11 converted, JWT updated to include ORGANIZER role
- ✅ XP system confirmed live on Railway: /api/xp/profile (200) and /api/xp/leaderboard (200) both working. Loyalty page renders correctly — Initiate rank, 0/500 XP → Scout, no errors
- ✅ XP Sink UI shipped: "Spend Your XP" section on loyalty page with coupon (20 XP, disabled at 0 guildXp showing "Need 20 more XP") + Rarity Boost "Coming Soon" placeholder
- ✅ Phase 2 UX audit complete — P1 XP sink blocker resolved this session. P2 polish items deferred to S266
- ✅ tags/[slug].tsx empty state: all-sale-types language fix (brand drift P3)
- ✅ OnboardingWizard.tsx: dark mode inner card fix (bg-white dark:bg-gray-800) — in pending push
- ✅ Layout.tsx: desktop "Host a Sale" nav button for shoppers without ORGANIZER role — in pending push
- ✅ CLAUDE.md §10c added: QA management rule (pre-dispatch scenario list, no PARTIAL results accepted, exact values required)
- ✅ Rarity Boost XP sink added to roadmap as coming-soon item
- ✅ conversation-defaults Rule 8 (MESSAGE_BOARD.json) removed from skill — installed
- ✅ QA delegation protocol created: claude_docs/operations/qa-delegation-protocol.md
- ✅ Dockerfile.production cache-busted to S265 (Railway rebuild forced)
- ✅ XP false-positive in state docs corrected: S262/S263 docs claimed "XP endpoints confirmed live" — was actually surface-level test error. Confirmed live this session via direct Railway URL

Last Updated: 2026-03-24T23:00:00Z

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

**S275 (2026-03-24):** Brands tab P0: useBrandFollows await fix (verified, pending push). Schema pre-wire migration (executorUserId, AffiliateCode, isPersistent). Platform Safety P1-P2: #94 BidIpRecord NEW, #96 checkout checkbox + backend, #97 email, #98 CheckoutEvidence NEW. #56 Printful DEFERRED. 2 migrations. 8 files.

**S274 (2026-03-24):** #86 DEFERRED post-beta. #87 Brand Tracking + #88 Haul Posts shipped (15 files total). Homepage Layout wrapper fixed. #87 auth header fix. QA: all green — homepage ✅ hauls ✅ CSV ✅ brands ✅. 3 pushes. Railway + Vercel green.

**S273 (2026-03-24):** ✅ Migration #73 deployed to Railway (Patrick action). ✅ Seed re-run (twice — second time fixed orgTiers bug). ✅ Build fixes: subscriptionLapsed type, void expression fix, seed.ts orgTiers. ✅ #73 notification tabs shipped (All/Operational/Discovery tabs live). ✅ QA Batch B+C+D PASS (#128 support, #131 share templates, #122 rebrand, #73 tabs, #125 CSV export). ✅ Batch E partial: #85 QR Hunt (7 files), #86 shopper profile (1 file), #88 haul CTA (2 files), #90 Vibe Check (1 file) — all pushed, Railway green. ⏳ Batch E remaining: #84 (use entranceNote, dev pending), #86/#87/#88 schema (Architect reviewing), #89 Print Kit (dev dispatched), #87 brand tracking (schema pending). 24 files pushed.

**S272 (2026-03-24):** Batch C + D complete. Shipped: #125 CSV export (PRO/TEAMS), #122 Explorer's Guild rebrand (copy fix), #72 dual-role JWT schema (roles[] array), #74 role-aware registration consent (checkboxes), #75 tier lapse state (7d warning, SIMPLE fallback), #73 two-channel notifications (OPERATIONAL/DISCOVERY tabs). 18 files modified. Pending: #73 migration deploy, attorney D3 consent review, Neon deletion. Consolidated QA (Batch B+C+D) deferred to S273.

**S271 (2026-03-24):** Diagnosed seed `points` error — stale local Prisma client (not a seed.ts bug). Fix: `npx prisma generate` + re-run seed. No code files modified.

**S270 (2026-03-24):** Build fixes (Railway green — 9 files with remaining points refs), migration block corrected to Railway URL, Batch B shipped (#127 POS tiers, #128 support stack, #131 share templates, #132 à la carte $9.99), S269 QA confirmed live, loyalty link fixed. Seed data bug found: roles[] wrong for all test accounts.

**S269 (2026-03-24):** Parallel Batch A — #126 gamification legacy cleanup (points system deleted, 12 files, schema migration), #129 homepage modernization (sage gradient hero, 4:3 cards, filter pills), #134 plan-a-sale dashboard card. QA: SP-01 PASS, TR-04 NOT FOUND. Seed: OS-03 workspace + FR-01 completed sale added. Build error fixed (sales/[id].tsx reviewCount null check). 15 files modified + 3 deleted.

**S268 (2026-03-24):** Strategic decisions session — full advisory board convened. 11 decisions locked. SP-03 fixed. Hunt Pass redesigned with Sage/Grandmaster exclusives. Homepage mockup approved. Roadmap reorganized into 5 parallel batches. 9 new items (#126-#134).

---

## Next Session

**S276 PRIORITY 1 — Patrick must push + run migrations:**
See push block below. After push:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```
Applies both: 20260325_schema_prewires + 20260325_platform_safety

**S276 PRIORITY 2 — QA Platform Safety + Brands fix live** (after deploy)
- Brands tab: add/remove brand works
- #96: Buyer premium checkbox shows + disables pay button
- #94: Bid IP logging in BidIpRecord table
- #98: CheckoutEvidence record created on purchase

**S276 PRIORITY 3 — Roadmap continuation**
- #97 email enrichment (metadata from frontend → webhook → itemized email)
- #94 admin queue UI (flagged bids visible to admin)
- Continue next roadmap batch

**Patrick manual actions:**
- Push S275 code (8 files — pushblock below)
- Run 2 migrations (commands above)
- Delete Neon project at console.neon.tech (outstanding since S264)
- Attorney review: D3 consent copy (register.tsx)

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
