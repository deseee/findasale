# PROJECT STATE

This document is the active state anchor for FindA.Sale, a two-sided marketplace connecting organizers (selling items) with shoppers. The project spans backend (Node.js/Prisma/PostgreSQL on Railway), frontend (Next.js on Vercel), and mobile (React Native, future).

## Current Status

**Latest work (S540 — COMPLETE):** Page audit (5 pages) → unified XP-spend hub consolidation. Diagnosis: `/coupons` was organizer-only in nav (shoppers couldn't surface it) yet had a complete shopper section sitting unreachable; `/shopper/loyalty` duplicated rank/XP UI from `/shopper/explorer-profile` and held the only Rarity Boost entry point with stale +3/+5/+10 XP values. Fix: `/coupons` becomes the unified XP-spend hub (already role-aware — confirmed via `isOrganizer` check at line 104). Shopper Rewards link added to nav at 4 locations (desktop sidebar Connect, mobile in-sale tools, mobile shopper-only nav, AvatarDropdown shopper branch). Rarity Boost migrated to `/coupons` shopper section using existing `<RarityBoostModal>` component (drop-in port). `/shopper/loyalty` reduced to 16-line redirect stub → `/coupons` (preserves deep links, email refs, bookmarks). Dashboard duplicate `<AchievementBadgesSection>` removed (still lives on `/shopper/explorer-profile`). 6 orphan `/shopper/loyalty` refs across ranks.tsx, loot-legend.tsx, league.tsx, profile.tsx, ExplorerGuildOnboardingCard.tsx, ActivitySummary.tsx retargeted (5 to `/shopper/explorer-profile` for rank/passport context, 1 to `/coupons` for XP-spend context). 11 files modified, zero new TS logic errors.

**Latest prior work (S536 — COMPLETE):** Full XP economy security audit (19 findings, hacker agent) + all P0/P1/P2 fixes dispatched + three deferred XP wirings shipped. Security fixes: cap fail-open→fail-closed (2 caps), spendXp atomic updateMany, REFERRAL_FIRST_PURCHASE 24h hold + purchaseId, ORGANIZER_REFERRAL_PURCHASE atomic ordering + constant, both referral awards purchaseId linked (chargeback claw-back now works), SALE_PUBLISHED one-time only, HAUL_POST_COUNT cap renamed HAUL_POST:60 (was breaking after 1st post), ORG_HAUL_FROM_SALE cap 100/month, HP churn hold fail-closed, leaderboard userId removed, Math.random→crypto in referralService, IP pair logging for self-referral detection. New wirings: HAUL_POST_LIKES (5 XP at 10+ likes, once per post, idempotency via PointsTransaction), ORG_SHOPPER_SIGNUP (10 XP to organizer on shopper's first purchase, purchaseId idempotency), REFERRAL_ORG_FIRST_SALE (50 XP to shopper referrer on referred organizer's first published sale). Notable schema finding: `phoneVerified` field does not exist on User — REFERRAL_FIRST_PURCHASE phone gate from gamedesign spec is not yet enforced.

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
| S540 Rewards nav link (4 locations) | Pushed — pending Chrome QA | As shopper (Karen): verify "Rewards" link → /coupons in desktop sidebar Connect, mobile in-sale tools, mobile shopper-only nav, AvatarDropdown shopper branch | S540 |
| S540 Rarity Boost on /coupons | Pushed — pending Chrome QA | As shopper with ≥15 spendableXp: navigate /coupons → scroll to shopper section → click "Activate Rarity Boost (15 XP)" → select sale → confirm spend → verify XP balance decrements 15, toast appears, modal closes | S540 |
| S540 Rarity Boost insufficient XP | Pushed — pending Chrome QA | As shopper with <15 XP: button disabled, "You need at least 15 XP" hint appears | S540 |
| S540 Organizer view of /coupons | Pushed — pending Chrome QA | As organizer (Bob/Alice): /coupons shows organizer Shopper Discount Codes section + $1-off generator. Rarity Boost card MUST NOT render | S540 |
| S540 Loyalty redirect | Pushed — pending Chrome QA | Navigate /shopper/loyalty → instant redirect to /coupons, no flash of old content | S540 |
| S540 Dashboard achievements dedup | Pushed — pending Chrome QA | /shopper/dashboard Overview tab: Achievements widget GONE. /shopper/explorer-profile: Achievements widget STILL present | S540 |
| S540 Orphan ref hops | Pushed — pending Chrome QA | From /shopper/ranks, /shopper/loot-legend, /shopper/league, /profile follow back/CTA links → land on /shopper/explorer-profile (not 404, not loyalty) | S540 |

## File Organization

**Backend controllers:** `packages/backend/src/controllers/` — saleController, itemController, authController, stripeController, ebayController, checklistController, labelComposerController, shopAutoRenewJob

**Frontend pages:** `packages/frontend/pages/organizer/` (seller flows), `pages/shopper/` (buyer flows), `pages/admin/` (platform tools)

**Shared types:** `packages/backend/src/types/`, `packages/frontend/types/`

**Database:** `packages/database/prisma/schema.prisma`, migrations in `migrations/` folder

## Next Session (S541)

**S541 priority queue:**
1. **Live-site smoke test S540 (FIRST action)** — push S540 from patrick-dashboard.md → wait Vercel green → smoke test 7 areas: shopper desktop sidebar Rewards link, mobile shopper nav Rewards link, AvatarDropdown shopper Rewards link, /coupons Rarity Boost card (shopper view), /coupons organizer view (no Rarity Boost), /shopper/loyalty redirect, dashboard achievements gone.
2. **Chrome QA the S540 dispatch** — full role × tier × interaction matrix per QA Honesty Gate. Use real shopper account with ≥15 XP (Karen has insufficient — may need DB top-up via psycopg2).
3. **Chrome QA backlog carry-over** — S531/S529/S532/S534 fixes still pending verification (blocked/unverified queue grew significantly).
4. **Phone verification feature** — `phoneVerified` missing from User model. REFERRAL_FIRST_PURCHASE phone gate not enforced.
5. **Continue page audits** — S540 only addressed loyalty/coupons/dashboard. Other pages from earlier audit may have similar overlap issues worth investigating.

**Patrick actions:**
- Push S540 nav + Rarity Boost migration + loyalty redirect (Push 1 in patrick-dashboard.md — only push pending)

## Current Work

**S540 COMPLETE — /coupons unified XP-spend hub + loyalty consolidation:**
- ✅ Page audit (5 pages): identified `/coupons` was organizer-only in nav (shoppers couldn't reach it) yet had complete shopper section sitting unreachable; `/shopper/loyalty` had stale +3/+5/+10 XP values (post-S534 actuals are +10 scan/+25 purchase/+2 check-in) and held the only Rarity Boost entry point; `/shopper/dashboard` had duplicate AchievementBadgesSection (also on /shopper/explorer-profile)
- ✅ Strategy decision (Patrick approved Path C): use already-role-aware `/coupons` as unified XP-spend hub instead of either/or split
- ✅ packages/frontend/pages/coupons.tsx — added Sparkles icon import, `import { RarityBoostModal }` named import, `showRarityBoostModal` useState, Rarity Boost card (gradient indigo/purple, gated `{!isOrganizer && ...}`) below shopper newly-generated-code block, `<RarityBoostModal>` rendered with `userXp={spendableXp}` and onSuccess callback invalidating xp-profile query
- ✅ packages/frontend/pages/shopper/loyalty.tsx — replaced 636 lines with 16-line LoyaltyRedirect stub (`router.replace('/coupons')` on mount)
- ✅ packages/frontend/components/Layout.tsx — added shopper "Rewards" link → /coupons with Ticket icon (indigo-500) at 3 nav locations: desktop sidebar Connect (after Explorer's Guild ~line 553), mobile in-sale tools (~line 1318), mobile shopper-only nav (~line 1537)
- ✅ packages/frontend/components/AvatarDropdown.tsx — added shopper Rewards link → /coupons with Ticket icon inside `{!isOrganizer && ...}` branch (after Explorer's Guild link, before Leaderboard, ~line 1086)
- ✅ packages/frontend/pages/shopper/dashboard.tsx — removed duplicate `<AchievementBadgesSection>` block (lines 424-430) + unused imports (`useMyAchievements`, `AchievementBadgesSection`) + orphan `achievementsData` query. Achievements widget remains on /shopper/explorer-profile only (dedup, not removal)
- ✅ packages/frontend/components/ActivitySummary.tsx — Streak Points stat card href: /shopper/loyalty → /coupons (XP-spend context)
- ✅ packages/frontend/components/ExplorerGuildOnboardingCard.tsx — "View Your Rank & Progress" CTA href: /shopper/loyalty → /shopper/explorer-profile (rank context, not coupons — semantically correct adjustment from spec)
- ✅ packages/frontend/pages/shopper/ranks.tsx — back link "← Back to Loyalty Passport" → "← Back to Explorer Profile" → /shopper/explorer-profile
- ✅ packages/frontend/pages/shopper/loot-legend.tsx — back link → /shopper/explorer-profile (label kept "Explorer's Guild")
- ✅ packages/frontend/pages/shopper/league.tsx — back link → /shopper/explorer-profile (label kept "Explorer's Guild")
- ✅ packages/frontend/pages/profile.tsx — Explorer Rank card "View Your Rank" CTA → /shopper/explorer-profile
- ✅ TS check: zero new logic errors in edited files (env-only `Cannot find module 'react'` errors in VM affect every .tsx repo-wide, not introduced by these changes; Vercel will resolve types correctly)
- 🔲 11 files unpushed — Patrick action: push block in patrick-dashboard.md
- 🔲 Chrome QA pending: 7 verification scenarios in Blocked/Unverified Queue

**S539 COMPLETE — Nav parity + XP achievement bug + create-sale overhaul:**
- ✅ Shopper Settings redirect — both AvatarDropdown.tsx and Layout.tsx mobile nav now route shoppers to /shopper/settings (was /organizer/settings → login redirect for all users)
- ✅ Avatar dropdown footer — Host a Sale moved from inside shopper section to footer below Pricing (with UserPlus icon); Explorer Profile icon now indigo for shoppers
- ✅ Mobile nav footer — added Host a Sale (opens BecomeOrganizerModal), Explorer Profile link (indigo), Install App button with iOS tooltip; Settings icon now indigo for shoppers
- ✅ Mobile nav shopper branch — restored rank/XP bar header for shopper-only users (was organizer-only)
- ✅ Achievement unlock bug — `undefined !== null` (strict, always true for new users) → `!= null` (loose). Was silently skipping all achievement checks for new users → 0 XP on first sale/purchase/listing
- ✅ XP rank uses lifetimeXpEarned (not guildXp) — rank never drops when spending XP
- ✅ spendXp hold guard — getSpendableXp check added to appraisalController, crewController, trailController
- ✅ create-sale overhaul — removed duplicate Sale Type, description field, neighborhood field; redirects to edit-sale on submit; PRO celebration modal fires when isFirstSaleFreePro === true
- ✅ Business name copy — settings.tsx + BecomeOrganizerModal.tsx updated: "Name or Business Name", new placeholder, "No business? Your name works perfectly." helper text
- ✅ AvatarDropdown — Host a Sale opens BecomeOrganizerModal (was router.push to 404 /organizer/register)
- 🔲 George Roberts (user33) manually backfilled with 25 XP in Railway DB — achievement unlock bug was confirmed root cause

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

**S540 (2026-04-22, COMPLETE):** Page audit → `/coupons` becomes unified XP-spend hub. Diagnosis: `/coupons` was organizer-only in nav yet the page had a complete shopper section sitting unreachable; `/shopper/loyalty` duplicated rank/XP UI from `/shopper/explorer-profile` and held the only Rarity Boost entry with stale +3/+5/+10 XP values. Patrick approved Path C — use the already-role-aware `/coupons` (isOrganizer at line 104) as the unified hub, consolidate loyalty into redirect stub. Shopper "Rewards" nav link added at 4 locations (desktop sidebar Connect, mobile in-sale tools, mobile shopper-only nav, AvatarDropdown shopper branch) with Ticket icon indigo-500. Rarity Boost card migrated to `/coupons` shopper section as drop-in `<RarityBoostModal>` import (named export, NOT default — verified via grep). `/shopper/loyalty` reduced 636 → 16 lines (useEffect `router.replace('/coupons')`). Dashboard duplicate `<AchievementBadgesSection>` removed + orphan `useMyAchievements` query removed (widget still lives on `/shopper/explorer-profile` — dedup, not deletion). 6 orphan `/shopper/loyalty` refs retargeted: 5 to `/shopper/explorer-profile` for rank/passport-context labels (ranks.tsx, loot-legend.tsx, league.tsx, profile.tsx, ExplorerGuildOnboardingCard.tsx), 1 to `/coupons` for XP-spend context (ActivitySummary.tsx Streak Points card). 11 files modified. TS check: zero new logic errors in edited files (env-only Cannot-find-module 'react' errors in VM are pre-existing and affect every .tsx repo-wide; Vercel will resolve). Push block in patrick-dashboard.md. S541 priorities: push S540, then smoke test 7 verification scenarios.

**S539 (2026-04-21, COMPLETE):** Nav parity + XP achievement bug + create-sale overhaul. Root cause of shopper Settings redirect: both AvatarDropdown.tsx and Layout.tsx mobile nav hardcoded `/organizer/settings` for all users — fixed to role-conditional `/shopper/settings`. Mobile nav: Host a Sale (opens BecomeOrganizerModal) and Explorer Profile added to footer; Install App added; Settings icon indigo for shoppers; shopper-only rank/XP header restored (was organizer branch only). Avatar dropdown: Host a Sale moved from shopper section to footer below Pricing; Explorer Profile icon now indigo. Critical XP bug: achievementService.ts used strict `!== null` on optional chaining result — when existingUserAch is null, `?.unlockedAt` returns `undefined`, and `undefined !== null` is `true`, marking all new users as "already unlocked" and skipping all XP awards. Fixed with loose `!= null`. XP rank now uses `lifetimeXpEarned` (never decrements on spend); spendXp hold check added to appraisal/crew/trail controllers. create-sale stripped to lightweight first step: removed description, neighborhood, duplicate Sale Type; redirects to edit-sale; PRO celebration modal fires on isFirstSaleFreePro. Business name copy updated in settings.tsx + BecomeOrganizerModal.tsx.

**S538 (2026-04-21, COMPLETE):** Shopper video pages — full rebuild. Root cause of prior failure: previous session used rank icons from game design SKILL.md (⚔️/🏹/📚) instead of reading guild-primer.tsx directly, and dev agents received advisory summaries rather than verbatim verified data. Fix: read guild-primer.tsx authoritative source first, included all data verbatim in dispatch prompts. guild-xp-ad.html rebuilt from scratch (1,423 lines) — correct rank icons 🧭🔍🎯✨👑, correct XP values from production tables (auction win 20 XP not 15, haul post 15 XP, all visit/purchase/streak values correct), rich 7-scene RAF animation with XP bar animations, rank badge bounces, streak grid. shopper-video-ad.html patched inline (SCOUT icon ⚔️→🔍, haul XP badge +5→+15). hunt-pass-video-ad.html created (1,268 lines, correct early access copy — no "6 hours", 1.5× XP, hold priority, earn-free path to GRANDMASTER) + hunt-pass-video.html converted to proper wrapper (499 lines). haul-post-video-ad.html created (1,329 lines, 15 XP/post, +5 at 10 likes) + haul-post-video.html wrapper (426 lines). treasure-trails-video-ad.html created (1,030 lines, 40/50/60/70/80 XP by stops, route animation) + treasure-trails-video.html wrapper (436 lines). Push block in patrick-dashboard.md. S539 priorities: push all pending blocks + Chrome QA backlog.

**S537 (2026-04-21, COMPLETE):** Infrastructure + housekeeping session. Beta badge added to Layout.tsx header (desktop + mobile). GitGuardian credential exposure remediated: Railway DB password rotated (old `QvnUGsnsjujFVoeVyORLTusAovQkirAq` invalid), hardcoded credential removed from committed CLAUDE.md, stored in private global mnt/.claude/CLAUDE.md (not in git) and packages/database/.env (gitignored). SEO: www → non-www permanent redirect added to next.config.js, global canonical URL tag added to _app.tsx (strips query params, always points to finda.sale). CLAUDE.md §7 parallel dispatch HARD RULE added to prevent re-deriving Skill vs Agent pattern each session. Railway MCP OAuth double-fire investigated — root cause is Anthropic bug #51398 (CLAUDE_PLUGIN_DATA not persistent in Cowork Desktop). Workaround: Railway CLI v4.40.2 installed with project token, binary stored at mnt/.claude/bin/railway (persistent), token at mnt/.claude/railway.env. Use CLI for all Railway ops (logs, restart, redeploy) — bypass OAuth entirely. Push block in patrick-dashboard.md.

**S536 (2026-04-21, COMPLETE):** XP economy security audit + hardening + deferred wirings. Hacker agent ran full audit — 19 findings (2 P0, 8 P1, 9 P2). All dispatched in parallel (4 fix agents + 3 wiring agents). Key fixes: cap checks now fail-closed (return 0 not full cap on DB error), spendXp atomic via updateMany WHERE guard, REFERRAL_FIRST_PURCHASE gets 24h holdUntil + purchaseId for claw-back, ORGANIZER_REFERRAL_PURCHASE status-CREDITED-before-award (atomic), both referral XP awards now linked to purchaseId (chargeback reversal was blind to them before), SALE_PUBLISHED one-time milestone (no more publish/unpublish farm), HAUL_POST cap renamed HAUL_POST:60 (old value of 4 was firing after the first 15-XP post), ORG_HAUL_FROM_SALE capped at 100/month, leaderboard no longer exposes userId, referral codes now use crypto.randomBytes. Three deferred XP wirings shipped: HAUL_POST_LIKES (5 XP, once per post at 10+ likes), ORG_SHOPPER_SIGNUP (10 XP to organizer on shopper's first purchase), REFERRAL_ORG_FIRST_SALE (50 XP to shopper referrer on organizer's first published sale). Open gap: phoneVerified not on User model — REFERRAL_FIRST_PURCHASE phone gate not yet enforced.

**S535 (2026-04-21, COMPLETE):** XP implementation + guild-primer rebuild. Added 8 new XP_AWARDS constants to xpService.ts. Removed misleading TRAIL_COMPLETE:100 flat constant (trailController already uses tiered completionBonus() returning 40-80 XP). Fixed XP_SINKS stale values (GUIDE_PUBLICATION 50→100, HAUL_VISIBILITY_BOOST 10→80). Wired BOUNTY_FULFILLMENT_SHOPPER into bountyController, ORG_FIVE_STAR_REVIEW into reviewController, ORG_HAUL_FROM_SALE into haulPostController, FIRST_PURCHASE_EVER into stripeController, fixed SALE_PUBLISHED bug in saleController. Rebuilt guild-primer "How to Earn XP" with Hunt Pass 1.5× column on all tables, tiered trail completion table, new Hunt & Scan section, expanded Organizer Bonuses to 8 rows. Deferred: HAUL_POST_LIKES (no hook), ORG_SHOPPER_SIGNUP (no RSVP hook), REFERRAL_ORG_FIRST_SALE (no org referral system).

**S534 (2026-04-21, COMPLETE):** XP repricing + Guild Primer + Hunt Pass slim CTA. boostPricing.ts fully repriced. hunt-pass.tsx refactored 997→177 lines. New guild-primer.tsx created. Layout.tsx + AvatarDropdown.tsx Explorer's Guild links updated /loyalty→/guild-primer. RankUpModal dark mode fixed.

**S532 (2026-04-21, COMPLETE):** Loyalty XP audit (4 stale values). Brand drift batch (11 files). Quick Picker Task Modal shipped. Retail competitive analysis research doc. Roadmap v116. All pushes green.

## Historical Reference

Completed phases documented in `claude_docs/COMPLETED_PHASES.md`. Advisory board decisions in `claude_docs/feature-notes/`. Roadmap maintained at `claude_docs/strategy/roadmap.md` (currently v112). Operations checklist: `claude_docs/operations/qa-backlog.md`, `claude_docs/operations/cost-protection-playbook.md`.
