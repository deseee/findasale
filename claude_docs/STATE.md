# PROJECT STATE

This document is the active state anchor for FindA.Sale, a two-sided marketplace connecting organizers (selling items) with shoppers. The project spans backend (Node.js/Prisma/PostgreSQL on Railway), frontend (Next.js on Vercel), and mobile (React Native, future).

## Current Status

**Latest work (S536 — COMPLETE):** Full XP economy security audit (19 findings, hacker agent) + all P0/P1/P2 fixes dispatched + three deferred XP wirings shipped. Security fixes: cap fail-open→fail-closed (2 caps), spendXp atomic updateMany, REFERRAL_FIRST_PURCHASE 24h hold + purchaseId, ORGANIZER_REFERRAL_PURCHASE atomic ordering + constant, both referral awards purchaseId linked (chargeback claw-back now works), SALE_PUBLISHED one-time only, HAUL_POST_COUNT cap renamed HAUL_POST:60 (was breaking after 1st post), ORG_HAUL_FROM_SALE cap 100/month, HP churn hold fail-closed, leaderboard userId removed, Math.random→crypto in referralService, IP pair logging for self-referral detection. New wirings: HAUL_POST_LIKES (5 XP at 10+ likes, once per post, idempotency via PointsTransaction), ORG_SHOPPER_SIGNUP (10 XP to organizer on shopper's first purchase, purchaseId idempotency), REFERRAL_ORG_FIRST_SALE (50 XP to shopper referrer on referred organizer's first published sale). Notable schema finding: `phoneVerified` field does not exist on User — REFERRAL_FIRST_PURCHASE phone gate from gamedesign spec is not yet enforced.

**S530 QA results — full session (documented in qa-backlog.md):**
- ✅ Verified: Explorer Profile page + redirect, #270 onboarding card, shopper /coupons (3 tiers), profileSlug XP gate, #200 shopper public profile (collectorTitle gone), S529 avatar dropdown rank (live!), #224 rapid-capture redirect, #259 Hunt Pass page accuracy, #279 Rare Finds Pass, #282 Explorer Profile Completion XP (+50 XP confirmed)
- ⚠️ Partial: #223 Organizer Guidance Tooltips (pricing ✅, holds UNVERIFIED), #272 Post-Purchase Share (button present, desktop dialog unverifiable)
- ❌ New bugs (P0): #267 RSVP Bonus XP — not firing, no Discoveries notification, XP delta unexplained
- ❌ New bugs (P1): #241 Brand Kit PDF generators — all 4 endpoints 404; #7 Shopper Referral Rewards — page doesn't exist, no dashboard link
- ❌ Pre-compaction bugs: AvatarDropdown nav link "My Profile" (P2); SettlementWizard "200%" fee (P1); per-sale analytics filter (P1)
- LOCKED (S531): /coupons organizer "Shopper Discount Codes" section — NOT TEAMS-only. Available to all organizer tiers. Frontend: `{isOrganizer && (`, backend: `requireOrganizer` only. No code change needed.
- UNVERIFIED: #235 DonationModal, S529 storefront/mobile nav/card reader (pending push), #275 Hunt Pass Cosmetics (Karen has no Hunt Pass), #278/#280/#281/#255/#257/#268/#261/#75 (various test data blockers), Organizer Insights as Alice

**S529 shipped (all live — push confirmed S531 init):**
- ✅ Storefront widget — organizer dashboard shows storefront URL with Copy Link + View Storefront buttons
- ✅ Avatar dropdown rank — replaced large RankBadge with compact inline icon+label+XP bar (Compass for INITIATE, emoji for others)
- ✅ Mobile nav rank — was hardcoded "⚔️ Scout" + static 40% bar; now reads from useXpProfile hook (real rank + XP progress)
- ✅ Card reader content — FAQ, organizer guide, and support pages updated: S700 (standard) + S710 (cellular) only. No Tap to Pay (requires native SDK). Web app connects over internet, not Bluetooth.

**Active priorities:**
- Chrome QA the S528 features (see QA queue below)
- Insights page runtime error (/organizer/insights "failed to load") — pre-existing, needs Railway log check

## Schema & Infrastructure

**Key models:** Sale, Item, User, Organizer, WorkspaceRole, SaleAssignment, PrepTask, ShopMode, FeatureFlag, ReferralFraudSignal

**Active jobs:** shopAutoRenewJob (daily 1AM UTC), referralRewardAgeGateJob (daily), auctionJob, ebayEndedListingsSyncCron, challengeService

**Pending migrations:** None — 20260420120000_remove_collector_title deployed S528

**Environment requirements:** STRIPE_TEST_SECRET_KEY, NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY (needed for checklist test QA)

## Known Issues & Debt

- **Legendary chip dismissal (P2):** ✅ Fixed S524, Chrome-verified S525.
- **PostSaleMomentumCard (P2):** ✅ Fixed S524, Chrome-verified S525.
- **Efficiency Coach label (P3):** ✅ Fixed S518, Chrome-verified S525.
- **Sale Pulse vs Ripples views count (P2, unverified):** Needs active sale with real view data.
- **Photo station (P1):** ✅ RESOLVED S526 — endpoint already fully wired, was false alarm.
- **S518-D Downgrade to Free button:** ✅ FIXED S526 — live.
- **#235 Charity Close (P1):** ✅ FIXED S526 — live. Pending Chrome QA.
- **#224 Camera Flow (P1):** ✅ FIXED S526 — live. Pending Chrome QA.
- **#270 Onboarding Card (P2):** ✅ FIXED S526 — live. Pending Chrome QA.
- **#251 priceBeforeMarkdown (P2):** ✅ Already implemented — needs live item with markdownApplied=true.
- **#228 Settlement receipt (P2):** ✅ FIXED S528 — SettlementWizard fee label now dynamic. Pending Chrome QA.
- **#266 / Explorer Profile rename (P2):** ✅ FIXED S528 — "Collector Passport" → "Explorer Profile", new URL /shopper/explorer-profile. Old URL redirects. Pending Chrome QA.
- **#188 Neighborhood Pages (P2):** ✅ Chrome-verified S527.
- **#200 Shopper Public Profiles (P2):** ✅ FIXED S526 — collectorTitle removed S528 (deprecated). Profile display updated. Pending Chrome QA.
- **W-5 Create Sale link (P3):** ✅ FIXED S526 — live. Pending Chrome QA.
- **#277 Haul Posts nav (P3):** ✅ Chrome-verified S525.
- **Coupons (P2):** ✅ FIXED S528 — unified /coupons page (cross-role). /organizer/coupons redirects there. Pending Chrome QA. LOCKED S531: organizer section is NOT TEAMS-only — available to all tiers.
- **#267 RSVP Bonus XP (P0):** ✅ FIXED S531 — RSVP routes were never registered in sales.ts; DISCOVERY notification was missing from rsvpController.ts. Both fixed.
- **#241 Brand Kit PDFs (P1):** ✅ FIXED S531 — PDF routes used `authenticate` but frontend calls via `<a href>` (no auth header). Swapped to `optionalAuthenticate`; controller validates internally.
- **#7 Shopper Referral Rewards (P1):** ✅ FIXED S531 — Created pages/shopper/referrals.tsx using existing useReferral hook + backend endpoints.
- **SettlementWizard fee % (P1):** ✅ FIXED S531 — Backend returns commissionRate as integer (e.g., 8 = 8%). Frontend was multiplying ×100 again. Removed double-multiply.
- **Per-sale analytics filter (P1):** ✅ FIXED S531 — Top metric cards always read aggregate state, ignoring selectedSaleId. Now conditionally shows per-sale data when a sale is selected.
- **AvatarDropdown nav link (P2):** ✅ FIXED S531 — Was hardcoded to /organizer/profile for all users. Now role-conditional: organizers → "My Profile" / /organizer/profile; shoppers → "Explorer Profile" / /shopper/explorer-profile.
- **Organizer Insights (P2):** ⚠️ Runtime error on /organizer/insights ("failed to load") — pre-existing, not caused by S528. Needs Railway log investigation.
- **Sale Analytics drill-down (P2):** ✅ FIXED S528 — GET /api/insights/organizer/sale/:saleId built and wired. Pending Chrome QA.
- **Categories HTML entities (P2):** ✅ FIXED S528 — decoding + href fix live. Pending Chrome QA.
- **Platform fees:** ✅ LOCKED — PRO=8%, TEAMS=8%. The "TEAMS should be 10%" STATE.md entry was incorrect. Both are correct at 8%.

## QA Backlog

**S531 fixes — all pending Chrome QA (see qa-backlog.md §S531):**
1. #267 RSVP XP — RSVP to a sale, verify 2 XP + Discoveries notification
2. #241 Brand Kit PDFs — /organizer/brand-kit, verify all 4 PDF links download (not 404)
3. #7 Referral Rewards — /shopper/referrals loads, referral link + share buttons + stats
4. #228 SettlementWizard fee — Receipt step shows correct % (2%, not 200%)
5. Per-sale analytics — select sale on /organizer/insights, verify stat cards update
6. #266 AvatarDropdown — as shopper, verify "Explorer Profile → /shopper/explorer-profile"

**S529 features — all live, pending Chrome QA:**
- Storefront widget on /organizer/dashboard (Copy Link + View Storefront)
- Mobile nav rank (real rank from useXpProfile, not hardcoded Scout)
- Card reader content on /faq, /guide, /support (S700/S710 only)

**Blocked/Deferred:**
- HypeMeter widget (needs team shopper test data)
- RankUpModal dark mode (can't trigger rank artificially)
- Bump Post feed sort (needs active sale bump)
- Sale Pulse views count (needs active sale)

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| #267 RSVP XP + Notifications | Fixed S531 — pending Chrome QA | Verify RSVP awards 2 XP + Discoveries notification appears | S531 |
| #241 Brand Kit PDFs | Fixed S531 — pending Chrome QA | Verify all 4 PDF download links work for PRO organizer (not 404) | S531 |
| #7 Shopper Referral Rewards | Fixed S531 — pending Chrome QA | Verify /shopper/referrals loads, shows referral code + stats | S531 |
| SettlementWizard fee % | Fixed S531 — pending Chrome QA | Verify Receipt step shows correct % (2%, not 200%) | S531 |
| Per-sale analytics filter | Fixed S531 — pending Chrome QA | Select a sale from filter on /organizer/insights, verify stat cards update | S531 |
| AvatarDropdown nav link | Fixed S531 — pending Chrome QA | As shopper, verify avatar dropdown shows "Explorer Profile" → /shopper/explorer-profile | S531 |
| S529 storefront widget | Pushed — pending Chrome QA | Verify /organizer/dashboard shows Copy Link + View Storefront buttons | S529 |
| S529 mobile nav rank | Pushed — mobile viewport required | Test mobile viewport, verify rank reads from useXpProfile (not hardcoded Scout) | S529 |
| S529 card reader content | Pushed — pending Chrome QA | Verify /faq, /guide, /support show S700/S710 hardware only (no Tap to Pay, no M2) | S529 |
| #235 DonationModal | No charity-close test data | Need sale with charity close configured to reach DonationModal | S526 |
| #251 priceBeforeMarkdown | Needs live data | Need item with markdownApplied=true to verify crossed-out display | S526 |
| Organizer Insights runtime | User-specific error | Test as Alice (user1) — Bob loads fine, error must be account-specific | S528 |
| #275 Hunt Pass Cosmetics | Karen has no Hunt Pass | Need Hunt Pass subscriber to verify amber avatar ring + 🏆 leaderboard badge | S530 |
| #278 Treasure Hunt Pro | Requires Hunt Pass | Hunt Pass account + active QR scan to verify +10% XP bonus | S530 |
| #280 Condition Rating XP | Session ended before test | Login as Bob, set conditionGrade on item, verify +3 XP fires | S530 |
| #281 Streak Milestone XP | Needs 5 real consecutive days | Cannot simulate multi-day streak in automation | S530 |
| #255 Rank-Up Notifications | Needs XP threshold crossing | Karen needs ~415 more XP to reach Scout | S530 |
| #257 Scout Hold Duration | Karen is INITIATE | Needs Scout+ account to test 45-min hold | S530 |
| #268 Trail Completion XP | Karen's trail has 0 stops | Need trail with all stops completed | S530 |
| #261 Treasure Hunt XP Rank Multiplier | Needs QR scan | Ranger+ account + live sale QR scan | S530 |
| #75 Tier Lapse Logic | No lapsed test account | Need PRO organizer with lapsed subscription | S530 |
| Guild Primer (/shopper/guild-primer) | New page — pending Chrome QA | Verify all sections render, dark mode, personalized bar (logged in), cross-link to /hunt-pass | S534 |
| Hunt Pass slim CTA (/shopper/hunt-pass) | Refactored — pending Chrome QA | Verify hero, price card, 4 benefits, CTA buttons, cross-link to /guild-primer | S534 |
| Layout.tsx mobile nav guild link | Updated — pending Chrome QA | Mobile hamburger: Explorer's Guild should link to /shopper/guild-primer not /loyalty | S534 |
| AvatarDropdown guild link | Updated — pending Chrome QA | CONNECT section: Explorer's Guild → /shopper/guild-primer | S534 |
| RankUpModal dark mode | Fixed — pending Chrome QA | "New Perks Unlocked" box should use dark:bg-gray-700 (not too-light sage) | S534 |

## File Organization

**Backend controllers:** `packages/backend/src/controllers/` — saleController, itemController, authController, stripeController, ebayController, checklistController, labelComposerController, shopAutoRenewJob

**Frontend pages:** `packages/frontend/pages/organizer/` (seller flows), `pages/shopper/` (buyer flows), `pages/admin/` (platform tools)

**Shared types:** `packages/backend/src/types/`, `packages/frontend/types/`

**Database:** `packages/database/prisma/schema.prisma`, migrations in `migrations/` folder

## Next Session (S537)

**S537 priority queue:**
1. **Push S536 changes** — two push blocks provided: (a) security hardening batch (6 files), (b) XP wirings batch (3 files). Both must be pushed before Chrome QA.
2. **Chrome QA — Guild Primer** — verify /shopper/guild-primer: all sections render, Hunt Pass column, tiered trail table, dark mode, personalized XP bar when logged in, cross-link to /hunt-pass.
3. **Chrome QA — Hunt Pass slim CTA** — verify /shopper/hunt-pass: hero, price card, 4 benefits, CTAs, cross-link to /guild-primer.
4. **Chrome QA backlog** — S531/S529/S532 fixes (blocked/unverified queue).
5. **Phone verification feature** — `phoneVerified` field missing from User model. REFERRAL_FIRST_PURCHASE (500 XP) gamedesign spec requires phone gate. Either build phone verification or get explicit gamedesign exception documented.

**Patrick actions:**
- Push security hardening batch (push block from S536 above — 6 files)
- Push XP wirings batch (push block from S536 above — 3 files)

## Current Work

**S536 COMPLETE — XP economy security audit + hardening + deferred wirings:**
- ✅ Hacker audit: 19 findings (2 P0, 8 P1, 9 P2) across full XP economy
- ✅ xpService.ts: cap fail-open→fail-closed, spendXp atomic, HAUL_POST cap fix, HP churn hold fail-closed, ORG_HAUL_FROM_SALE cap, leaderboard userId removed, ORGANIZER_REFERRAL_PURCHASE constant added
- ✅ stripeController.ts: REFERRAL_FIRST_PURCHASE 24h hold + purchaseId, ORGANIZER_REFERRAL_PURCHASE atomic (status CREDITED before award), both referral awards purchaseId + holdUntil
- ✅ saleController.ts: SALE_PUBLISHED one-time idempotency guard, visit XP race condition fixed (Prisma $transaction wrap)
- ✅ referralService.ts: Math.random → crypto.randomBytes
- ✅ authController.ts: IP pair logging for self-referral detection
- ✅ haulPostController.ts: HAUL_POST_LIKES wired (5 XP at 10+ likes, once per post; UGCPhotoReaction unique constraint confirmed)
- ✅ stripeController.ts: ORG_SHOPPER_SIGNUP wired (10 XP to organizer on shopper's first purchase, purchaseId idempotency)
- ✅ saleController.ts: REFERRAL_ORG_FIRST_SALE wired (50 XP to shopper referrer on organizer's first published sale)
- 🚩 OPEN: `phoneVerified` field does not exist on User model — REFERRAL_FIRST_PURCHASE gamedesign phone gate not enforced. Needs phone verification feature first.

**S535 COMPLETE — XP implementation: missing constants + controller wiring + guild-primer rebuild:**
- ✅ xpService.ts: 8 new XP_AWARDS constants added (FIRST_PURCHASE_EVER:50, HAUL_POST_LIKES:5, SALE_PUBLISHED:10, ORG_SHOPPER_SIGNUP:10, ORG_HAUL_FROM_SALE:3, ORG_FIVE_STAR_REVIEW:10, REFERRAL_ORG_FIRST_SALE:50, BOUNTY_FULFILLMENT_SHOPPER:25)
- ✅ xpService.ts: TRAIL_COMPLETE:100 removed — was misleading flat constant. trailController uses tiered completionBonus() from placesService.ts (3→40, 4→50, 5→60, 6→70, 7→80 XP). hasEarnedTrailBonus() updated to check 'TRAIL_COMPLETION' type.
- ✅ xpService.ts: XP_SINKS stale values fixed — GUIDE_PUBLICATION 50→100, HAUL_VISIBILITY_BOOST 10→80 (matches boostPricing.ts)
- ✅ saleController.ts: SALE_PUBLISHED bug fixed — was awarding XP_AWARDS.REFERRAL_SIGNUP instead of XP_AWARDS.SALE_PUBLISHED
- ✅ bountyController.ts: BOUNTY_FULFILLMENT_SHOPPER (25 XP) wired — awards to shopper when bounty fulfilled
- ✅ reviewController.ts: ORG_FIVE_STAR_REVIEW (10 XP) wired — awards to organizer when they receive 5-star review
- ✅ haulPostController.ts: ORG_HAUL_FROM_SALE (3 XP) wired — awards to sale organizer when shopper hauls from their event
- ✅ stripeController.ts: FIRST_PURCHASE_EVER (50 XP) wired — one-time, awards when purchaseCount === 1 after finalization
- ✅ guild-primer.tsx "How to Earn XP" section rebuilt: HP 1.5× column on all tables, tiered Treasure Trail table (40/50/60/70/80), new "In-Person: Hunt & Scan" section, Organizer Bonuses expanded to 8 rows, all new XP actions surfaced
- 🔲 DEFERRED: HAUL_POST_LIKES (no like-count threshold hook), ORG_SHOPPER_SIGNUP (no RSVP hook found — complex fraud surface), REFERRAL_ORG_FIRST_SALE (no organizer referral system — needs phase design)
- 🔲 Chrome QA: guild-primer rebuild + all S534 items still pending

**S534 COMPLETE — Guild Primer + Hunt Pass CTA + XP repricing:**
- ✅ boostPricing.ts repriced: all 9 existing items updated, 4 new dual-rail entries added (CUSTOM_MAP_PIN, TREASURE_TRAIL_SPONSOR, EARLY_ACCESS_BOOST, LISTINGS_EXTENSION)
- ✅ xpService.ts XP_SINKS repriced: CUSTOM_MAP_PIN 500→1000, EARLY_ACCESS_BOOST 75→200, TREASURE_TRAIL_SPONSOR 100→150, LISTINGS_EXTENSION 100→250
- ✅ hunt-pass.tsx refactored to slim CTA (177 lines): header/hero, price card, 4 core benefits, CTA buttons, cross-link to /shopper/guild-primer
- ✅ guild-primer.tsx created (NEW — /shopper/guild-primer): complete Explorer's Guild walkthrough. Hero + personalized XP progress bar, 5 rank cards (accordion), How to Earn XP (5 categorized subsections — full data from xpService.ts), XP Sinks (6 subsections), Seasonal Adventures, Prestige Layer, FAQ, CTAs.
- ✅ How to Earn XP section fixed: 8-row flat table → 5 categorized subsections with all 19 XP-earning actions at correct values. Fixed: Referral (50→split: 20 signup + 500 first purchase), Auction win (15→20), Weekly streak (25→100).
- ✅ Layout.tsx: Explorer's Guild links updated /shopper/loyalty → /shopper/guild-primer in mobile nav (lines 1310, 1492). Duplicate link removed.
- ✅ AvatarDropdown.tsx: Explorer's Guild link updated /shopper/loyalty → /shopper/guild-primer (line 1083).
- ✅ RankUpModal.tsx: "New Perks Unlocked" box dark mode fix (dark:bg-sage-900/20 → dark:bg-gray-700).
- ✅ hunt-pass.tsx cross-link card dark mode fix (bg-sage-50 dark:bg-sage-900/20 → bg-white dark:bg-gray-800).
- 🚩 FLAGGED: xpService.ts XP_SINKS has stale values for GUIDE_PUBLICATION (50, should be 100) and HAUL_VISIBILITY_BOOST (10, should be 80) — deductions don't match boostPricing.ts. Fix next session.
- 🔲 Chrome QA for all S534 changes (pending).

## Recent Sessions

**S536 (2026-04-21, COMPLETE):** XP economy security audit + hardening + deferred wirings. Hacker agent ran full audit — 19 findings (2 P0, 8 P1, 9 P2). All dispatched in parallel (4 fix agents + 3 wiring agents). Key fixes: cap checks now fail-closed (return 0 not full cap on DB error), spendXp atomic via updateMany WHERE guard, REFERRAL_FIRST_PURCHASE gets 24h holdUntil + purchaseId for claw-back, ORGANIZER_REFERRAL_PURCHASE status-CREDITED-before-award (atomic), both referral XP awards now linked to purchaseId (chargeback reversal was blind to them before), SALE_PUBLISHED one-time milestone (no more publish/unpublish farm), HAUL_POST cap renamed HAUL_POST:60 (old value of 4 was firing after the first 15-XP post), ORG_HAUL_FROM_SALE capped at 100/month, leaderboard no longer exposes userId, referral codes now use crypto.randomBytes. Three deferred XP wirings shipped: HAUL_POST_LIKES (5 XP, once per post at 10+ likes), ORG_SHOPPER_SIGNUP (10 XP to organizer on shopper's first purchase), REFERRAL_ORG_FIRST_SALE (50 XP to shopper referrer on organizer's first published sale). Open gap: phoneVerified not on User model — REFERRAL_FIRST_PURCHASE phone gate not yet enforced.

**S535 (2026-04-21, COMPLETE):** XP implementation + guild-primer rebuild. Added 8 new XP_AWARDS constants to xpService.ts. Removed misleading TRAIL_COMPLETE:100 flat constant (trailController already uses tiered completionBonus() returning 40-80 XP). Fixed XP_SINKS stale values (GUIDE_PUBLICATION 50→100, HAUL_VISIBILITY_BOOST 10→80). Wired BOUNTY_FULFILLMENT_SHOPPER into bountyController, ORG_FIVE_STAR_REVIEW into reviewController, ORG_HAUL_FROM_SALE into haulPostController, FIRST_PURCHASE_EVER into stripeController, fixed SALE_PUBLISHED bug in saleController. Rebuilt guild-primer "How to Earn XP" with Hunt Pass 1.5× column on all tables, tiered trail completion table, new Hunt & Scan section, expanded Organizer Bonuses to 8 rows. Deferred: HAUL_POST_LIKES (no hook), ORG_SHOPPER_SIGNUP (no RSVP hook), REFERRAL_ORG_FIRST_SALE (no org referral system).

**S534 (2026-04-21, COMPLETE):** XP repricing + Guild Primer + Hunt Pass slim CTA. boostPricing.ts fully repriced (9 items updated, 4 new dual-rail: CUSTOM_MAP_PIN, TREASURE_TRAIL_SPONSOR, EARLY_ACCESS_BOOST, LISTINGS_EXTENSION). xpService.ts XP_SINKS updated for 4 items. hunt-pass.tsx refactored from 997→177 lines (slim CTA only, cross-links to /shopper/guild-primer). New guild-primer.tsx page created: full Guild walkthrough with personalized XP bar, 5 rank accordion cards, How to Earn XP (5 subsections, 19 actions, corrected values), XP Sinks (6 subsections), Seasonal Adventures, Prestige Layer, FAQ, CTAs. Layout.tsx + AvatarDropdown.tsx Explorer's Guild links updated /loyalty→/guild-primer. RankUpModal dark mode fixed. Hunt Pass cross-link card dark mode fixed. Flagged: xpService.ts XP_SINKS stale for GUIDE_PUBLICATION + HAUL_VISIBILITY_BOOST vs boostPricing.ts.

**S532 (2026-04-21, COMPLETE):** Multi-track session. Loyalty XP audit (4 stale values corrected in shopper/loyalty.tsx). Brand drift batch (11 files — D-001 inclusive copy + D-002 dark mode modals, brand-drift-2026-04-21.md). Vercel build fix (sales/[id].tsx:891 undefined-index guard). Quick Picker Task Modal shipped (taskTemplates.ts util, useTaskTemplates hook, QuickPickerTaskModal.tsx, backend templates endpoint, workspace/[slug].tsx wired). Retail competitive analysis research doc created (retail-mode-competitive-analysis-2026-04-21.md — corrected: retail mode fully built S520, pricing strategy parity/premium vs Ricochet). Roadmap v116: #309–#311 retail gap features added. All pushes green. Vercel + Railway both green at wrap.

**S531 (2026-04-21, COMPLETE):** Bug fix session. 6 parallel fixes dispatched + Vercel build crisis resolved (2 iterations). P0 fixed: #267 RSVP Bonus XP — RSVP routes were never registered in sales.ts Express router; DISCOVERY notification was missing from rsvpController. P1 fixed: #241 Brand Kit PDFs — `authenticate` middleware on routes called via `<a href>` (browser sends no auth header); swapped to `optionalAuthenticate`. #7 Shopper Referral Rewards — created pages/shopper/referrals.tsx using existing useReferral hook. SettlementWizard fee % — backend returns commissionRate as integer (8=8%), frontend was doing ×100 again; removed double-multiply. Per-sale analytics filter — stat cards always read aggregate `insights`; fixed to conditionally show PerformanceMetrics when saleId selected; also fixed stale `Insights` type cast and incorrect field names (5 edits to insights.tsx). P2 fixed: #266 AvatarDropdown — hardcoded to organizer profile for all users; made role-conditional. Vercel errors: (1) pnpm lockfile mismatch from Agent 2 downgrading typescript ^5.1.3→^5.0.0; (2) wrong TS type cast introduced by per-sale fix agent; (3) remaining PerformanceMetrics field errors (dateRange, cacheExpiry, metrics.*) not caught in first fix pass. All 3 resolved. Decision locked: /coupons organizer section NOT TEAMS-only. All 6 fixes live. QA queued.

**S530 (2026-04-21, COMPLETE):** Extended QA discovery session (ran through compaction). No code changes. Full Chrome QA across S528/S526 backlog + Explorer's Guild / shopper XP feature backlog. 10 items verified ✅: Explorer Profile page/redirect, #270 onboarding card, shopper /coupons, profileSlug XP gate, #200 public profile, S529 avatar dropdown rank, #224 rapid-capture, #259 Hunt Pass page accuracy, #279 Rare Finds Pass, #282 Explorer Profile Completion XP (+50 confirmed). 2 partial ⚠️: #223 tooltips (pricing ✅, holds UNVERIFIED), #272 post-purchase share (button present, dialog unverifiable desktop). 6 bugs found: #267 RSVP Bonus XP (P0, not firing), #241 Brand Kit PDFs (P1, 4 endpoints 404), #7 Referral Rewards (P1, page doesn't exist), AvatarDropdown nav link (P2), SettlementWizard "200%" fee (P1), per-sale analytics filter (P1). 10 items UNVERIFIED (Hunt Pass required, multi-day streak, lapsed sub, etc.). Decision needed: /coupons organizer section tier gate.

**S529 (2026-04-21, COMPLETE):** UI polish + content session. Storefront widget added to organizer dashboard (storefrontSlug from brand-kit API, Copy Link + View Storefront). Avatar dropdown rank display replaced with compact inline icon+label+XP bar — bypassed RankBadge entirely because INITIATE's Compass icon was hardcoded at w-6 h-6 regardless of size prop. Mobile nav rank was completely hardcoded ("⚔️ Scout" + static 40% bar) — fixed by adding useXpProfile hook to Layout.tsx. Card reader hardware content updated across faq.tsx, guide.tsx, support.tsx: S700 (standard) and S710 (cellular) only; Tap to Pay and M2 incompatible with PWA (require native SDK); web app connects over internet not Bluetooth. Pending push.

**S528 (2026-04-20, COMPLETE):** Bug fix + feature session. All 4 S527 P2 bugs resolved. Key decisions: PRO/TEAMS both correctly at 8% (the "TEAMS should be 10%" bug entry was itself wrong). collectorTitle deprecated and removed across full stack (migration deployed). Coupons moved from /organizer/coupons to unified /coupons (cross-role, organizer 50 XP + shopper 3 tiers). Explorer Profile rename (Collector Passport → Explorer Profile, new URL). profileSlug XP-gated at 1500 XP first-time. SettlementWizard fee label dynamic. ExplorerGuildOnboardingCard XP corrected. Vercel green. Root cause of repeated wrong decisions: Claude was treating STACK.md and internal docs as product authority instead of researching decisions. Rule locked: only STATE.md bug entries, explicit Patrick instructions, or decisions-log entries authorize changes.

**S527 (2026-04-20, COMPLETE):** Extended QA session. Continued from S526 (context resumed after compression). Cleared most of UNTESTED backlog. Verified: #188 /neighborhoods ✅, /cities ✅, /city/[slug] ✅, Organizer Profile ✅, Calendar ✅, Item Detail ✅, Message Templates (CRUD) ✅, Loyalty Passport ✅, Virtual Line Queue ✅, Admin Verification Queue ✅, Sale Progress Checklist ✅, Encyclopedia ✅, QR Scan Analytics ✅, Hunt Pass ✅. New bugs: Coupons organizer page ❌ P2 (404), Sale Analytics ❌ P2 (backend 404), Categories ⚠️ P2 (HTML entities), TEAMS fee shows 8% ⚠️ P2. S526 dev fixes still local — not pushed.

**S526 (2026-04-20, COMPLETE):** Bug fix batch. 7 parallel dev agents. Fixes: #224 redirect page, W-5 link fix, #235 DonationModal API paths (singular→plural), #266 rename 4 files, #200 collectorTitle on profile, #270 ExplorerGuildOnboardingCard (new component), S518-D downgrade label, #228 receipt labels. Non-issues: photo station already wired, #251 already implemented, #188 pages exist at /neighborhoods/ (QA had wrong URL). Roadmap S525 results written. Frontend TS: 0 errors. Backend TS errors: pre-existing stale Prisma client, not S526. Chrome MCP crashed before QA — all S526 fixes in UNVERIFIED queue for S527.

**S525 (2026-04-20, COMPLETE):** Autonomous QA session. Full Chrome backlog run. 18 features verified. S518-A/B/C ✅. Organizer: #242✅ #249✅ #264✅ #228⚠️ #235❌ #224❌. Shopper: #276✅ #277✅ #252✅ #270❌ #251❌. Nav/Core: #64✅ #49✅ #200⚠️ #266❌ #188❌. Workspace: W-2✅ W-3✅ W-5⚠️. 10 bugs found and logged in qa-backlog.md. No code dispatched — bugs queued for next session.

**S524 (2026-04-20):** Pricing page P0. Extended restoration battle — pricing.tsx went through 5+ incorrect states before landing on `fdb9c9e6` baseline restore. Final state: clean TEAMS card with "Retail Mode" line added, PRO card with card reader note added. Stripe Terminal hardware guide corrected (M2/Tap to Pay = incompatible with PWA). subscription.tsx support copy fixed per D-S392. S518-A (PostSaleMomentumCard unsafe cast) and S518-B (Legendary chip stale saleId mutation) both fixed.

## Historical Reference

Completed phases documented in `claude_docs/COMPLETED_PHASES.md`. Advisory board decisions in `claude_docs/feature-notes/`. Roadmap maintained at `claude_docs/strategy/roadmap.md` (currently v112). Operations checklist: `claude_docs/operations/qa-backlog.md`, `claude_docs/operations/cost-protection-playbook.md`.
