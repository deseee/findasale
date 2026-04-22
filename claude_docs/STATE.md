# PROJECT STATE

This document is the active state anchor for FindA.Sale, a two-sided marketplace connecting organizers (selling items) with shoppers. The project spans backend (Node.js/Prisma/PostgreSQL on Railway), frontend (Next.js on Vercel), and mobile (React Native, future).

## Current Status

**Latest work (S543 — IN PROGRESS):** Smoke test + fixes session. S542 Chrome-verified: cart drawer opens ✅ (ss_38260xriu), Explore▾ dropdown Feed/Calendar/Wishlist ✅ (ss_9925pirt5), ThemeToggle under Appearance in AvatarDropdown ✅ (ss_2838xqo76). S541 bug reanalysis: /coupons Generate buttons DEBUNKED as VM viewport artifact — API fires correctly via JS .click(), code `94764D37` generated, XP deducted 500→400, Deluxe tier correctly disabled (ss_2443ofv38). #241 Brand Kit PDFs confirmed already fixed in S542 commit "brand-kit Railway URLs" — all 4 hrefs use `${NEXT_PUBLIC_API_URL}`. S543 fixes dispatched (pending push): (P0) Print kit 500 — getDrafts itemController Decimal serialization fix for workspace discount rules; (P2) ActionBar Treasure Trails /shopper/trails→/trails; (P2) Hunt Pass badge dashboard.tsx userData→user.huntPassActive; (P2) RankHeroSection Scout boundary nextRankThreshold NEXT_RANK_MAP fix; (minor) coupons.tsx GenerateResult type expanded. Hunt Pass audit: 1.5x XP ✅ confirmed code; 6-hour flash deal early access ✅ confirmed code; newsletter benefit ⚠️ copy-only (no backend); higher XP caps on treasure hunt scans (150 vs 100) 🔲 exists in code, missing from hunt-pass.tsx copy.

**Latest prior work (S542 — COMPLETE):** Cart merge + nav restructure + polling/spam fixes. Root cause discovery: CartDrawer was completely orphaned — CartIcon called openCart() but CartDrawer was never rendered anywhere; ShopperCartDrawer was the only live drawer. Merged into unified CartDrawer wired to CartContext. Price inconsistency fixed: hold prices from API are in dollars (197.81), useShopperCart stores cents — CartDrawer was dividing both by 100 (giving $1.98 instead of $197.81). Remove button restored on Saved in Cart items. Hold expiry toast loop fixed: handleHoldExpiry toast was causing refetch→re-render→HoldTimer remount→already-expired fires again loop; removed toast entirely. 429s on /reservations/my-holds-full fixed: mutations had both invalidateQueries + refetch() (double-fire); removed redundant refetch() calls. Nav changes: clock→cart icon (amber badge), Explore ▾ dropdown added between Trending and Search with Feed/Calendar/Wishlist, Pricing moved next to Host a Sale, ThemeToggle moved from nav to AvatarDropdown "Appearance" row. Search input now absolute-positioned (no squishing). BottomTabNav: Calendar→Trending, Wishlist→Explore bottom sheet. PosPaymentRequestAlert polling 5s→30s. 8 files changed. Push block in patrick-dashboard.md.

**Latest prior work (S540 — COMPLETE):** Page audit (5 pages) → unified XP-spend hub consolidation. Diagnosis: `/coupons` was organizer-only in nav (shoppers couldn't surface it) yet had a complete shopper section sitting unreachable; `/shopper/loyalty` duplicated rank/XP UI from `/shopper/explorer-profile` and held the only Rarity Boost entry point with stale +3/+5/+10 XP values. Fix: `/coupons` becomes the unified XP-spend hub (already role-aware — confirmed via `isOrganizer` check at line 104). Shopper Rewards link added to nav at 4 locations (desktop sidebar Connect, mobile in-sale tools, mobile shopper-only nav, AvatarDropdown shopper branch). Rarity Boost migrated to `/coupons` shopper section using existing `<RarityBoostModal>` component (drop-in port). `/shopper/loyalty` reduced to 16-line redirect stub → `/coupons` (preserves deep links, email refs, bookmarks). Dashboard duplicate `<AchievementBadgesSection>` removed (still lives on `/shopper/explorer-profile`). 6 orphan `/shopper/loyalty` refs across ranks.tsx, loot-legend.tsx, league.tsx, profile.tsx, ExplorerGuildOnboardingCard.tsx, ActivitySummary.tsx retargeted (5 to `/shopper/explorer-profile` for rank/passport context, 1 to `/coupons` for XP-spend context). 11 files modified, zero new TS logic errors.

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
- **#241 Brand Kit PDFs (P1):** ✅ FIXED S542 — S542 "brand-kit Railway URLs" commit changed all 4 hrefs to `${process.env.NEXT_PUBLIC_API_URL || '/api'}/brand-kit/organizer/...`. Confirmed by code review S543. Pending Chrome QA as organizer.
- **Print kit items/drafts 500 (P0):** ✅ FIXED S543 (pending push) — Root cause: getDrafts in itemController fetches workspace discount rules (Feature #310); Prisma returns `discountPercent` as a Decimal object. JSON.stringify failed on Decimal → 500. Fix: explicit `.toNumber()` conversion before serialization. Pending Chrome QA after push.
- **/coupons Shopper coupon Generate buttons (P1):** ✅ DEBUNKED S543 — Not a bug. Chrome-verified: API fires, code `94764D37` generated, XP deducted 500→400 (ss_2443ofv38). S541 "no API call fires" was a VM viewport artifact (same as /shopper/appraisals). Buttons fully functional.
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
| #241 Brand Kit PDFs | ❌ STILL BROKEN S541 | S531 fixed auth only. Root cause: hrefs hardcoded as /api/brand-kit/... relative to Vercel frontend — no Next.js rewrite exists. Fix: change hrefs in brand-kit.tsx to use NEXT_PUBLIC_API_URL base. | S531 |
| #7 Shopper Referral Rewards | ✅ Chrome-verified S541 — RESOLVED | /shopper/referrals loads, real referral link (REF-0215DAB8), Copy + 5 share buttons, stats section present. ss_59914h5dd | S531 |
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
| S540 Rarity Boost on /coupons | ✅ Chrome-verified S541 — RESOLVED | Shopper tab: "Activate Rarity Boost (50 XP)" active, modal opens with sale list + search. Cost shows 50 XP correctly. ss_4737i417x | S540 |
| S540 Rarity Boost insufficient XP | ⚠️ UNVERIFIED S541 | Current test account has 530 XP — cannot test disabled state without a low-XP account | S540 |
| S540 Organizer view of /coupons | ✅ Chrome-verified S541 — RESOLVED | Organizer sees Shopper Discount Codes + tier cards; Rarity Boost absent. ss_56564zsz7 | S540 |
| S540 Loyalty redirect | ✅ Chrome-verified S541 — RESOLVED | /shopper/loyalty → /coupons instantly, no flash. ss_8103rmsqm | S540 |
| Print kit items/drafts 500 (P0) | ✅ FIXED S543 — pending push + Chrome QA | Decimal serialization bug in getDrafts. Fix in itemController.ts. After push: verify /organizer/print-kit/cmnxvyic4001li51qobwidrbl loads without error. | S541 |
| /coupons Shopper coupon Generate buttons (P1) | ✅ DEBUNKED S543 — RESOLVED | Was VM viewport artifact. Buttons work (ss_2443ofv38). | S541 |
| S540 Dashboard achievements dedup | Pushed — pending Chrome QA | /shopper/dashboard Overview tab: Achievements widget GONE. /shopper/explorer-profile: Achievements widget STILL present | S540 |
| S540 Orphan ref hops | Pushed — pending Chrome QA | From /shopper/ranks, /shopper/loot-legend, /shopper/league, /profile follow back/CTA links → land on /shopper/explorer-profile (not 404, not loyalty) | S540 |

## File Organization

**Backend controllers:** `packages/backend/src/controllers/` — saleController, itemController, authController, stripeController, ebayController, checklistController, labelComposerController, shopAutoRenewJob

**Frontend pages:** `packages/frontend/pages/organizer/` (seller flows), `pages/shopper/` (buyer flows), `pages/admin/` (platform tools)

**Shared types:** `packages/backend/src/types/`, `packages/frontend/types/`

**Database:** `packages/database/prisma/schema.prisma`, migrations in `migrations/` folder

## Next Session (S544)

**S544 priority queue:**
1. **Push S543 + smoke test print kit fix** — After Patrick pushes S543, navigate to /organizer/print-kit/cmnxvyic4001li51qobwidrbl and verify it loads without 500. Also verify #241 Brand Kit PDFs (as Alice/Bob organizer) — all 4 PDF links should download.
2. **Hunt Pass copy gaps — product decisions needed:**
   - "Hunt Pass Insider Newsletter" — copy-only, no backend. Remove / "Coming soon" / implement?
   - "Treasure Hunt Pro" (150 scan/day cap vs 100) — exists in xpService.ts, stripped from hunt-pass.tsx in S534. Restore to "What's Included"? Dispatch dev for copy-only add.
   - "Rare Finds Pass" — 6h early rarity access (Rares), 12h (Legendaries), dedicated feed. Was in old 997-line hunt-pass.tsx. Verify if backend implemented before restoring.
3. **Chrome QA backlog — S543 P2 fixes** — After push: verify ActionBar Treasure Trails → /trails; Hunt Pass Active badge gone for Karen on /shopper/dashboard; /shopper/ranks Scout boundary correct. Also verify guild-primer rank journey accordions show correct perks (hold times, wishlist slots, Treasure Trails gating).
4. **Unbuilt features inventory (from S543 guild-primer/hunt-pass deep-dive) — verify + spec:**
   - Rank-based early access hours (Scout 1h, Ranger 2h, Sage 4h, GM 6h) — shown in RankHeroSection.tsx perks but no backend presale gating found. Needs Architect decision: build or remove from perks copy?
   - Hunt Pass: Golden Trophy Avatar Frame — in old 997-line hunt-pass.tsx as benefit; not found in backend. Verify if implemented or always aspirational.
   - Hunt Pass: 3x Monthly Coupon Slots — listed in old hunt-pass.tsx. Need to verify if coupon generation limits differ by HP status vs plain tier.
   - Annual leaderboard (Grandmaster perk in guild-primer) — verify if implemented or spec only.
5. **Continue Chrome QA backlog** — S540 Rewards nav links (4 locations), dashboard achievements dedup, orphan ref hops, S529 storefront widget, #267 RSVP XP, per-sale analytics, settlement fee %.
6. **Organizer Insights runtime error (P2)** — "Failed to load" on /organizer/insights. Pre-existing. Check Railway logs.
7. **S542 hold price + Remove button** — Karen had no active holds during smoke test. Find a shopper with holds to verify $197.81 (not $1.98) and Remove button works in cart drawer.

**Patrick actions:**
- Push S543 fixes (push block below)

## Current Work

**S542 COMPLETE — Cart merge + nav restructure + polling fixes:**
- ✅ CartDrawer.tsx — full unified rewrite. CartIcon's `openCart()` was a no-op (CartDrawer was never rendered — orphaned). ShopperCartDrawer was the only live drawer. Merged into single CartDrawer wired to CartContext. Holds section (from `/reservations/my-holds-full`) + Saved in Cart section (from `useShopperCart`). Price fix: hold prices from API are dollars (197.81); useShopperCart prices are cents; CartDrawer no longer divides holds by 100. Remove button restored on Saved in Cart items alongside Place Hold button. `handleHoldExpiry` now silent (no toast — toast was looping: refetch→re-render→HoldTimer remount→sees already-expired time→fires again). Both mutations use only `invalidateQueries` (removed redundant `refetch()` calls that caused 429s).
- ✅ CartIcon.tsx — Clock icon → ShoppingCart (lucide-react). Amber-500 badge at -top-1 -right-1. Combined count: holds + browsing cart items. Polling 30s→60s, staleTime 55s.
- ✅ Layout.tsx — wired `openCart` from CartContext (was missing; 3x `setMobileCartOpen` calls fixed). ShopperCartDrawer removed, CartDrawer added. staticNavLinks reduced to [map, trending]. Explore ▾ dropdown added (between Trending and Search): Feed/Calendar/Wishlist with exploreOpen mouse hover state. Explore + Pricing classNames matched to Map/Trending pattern (text-warm-900 dark:text-warm-100, no text-sm/font-medium). Pricing moved next to Host a Sale button. ThemeToggle removed from desktop and mobile nav. Search input now absolute-positioned when open (w-64, right-0, z-50, shadow-lg) — no longer squishes nav items.
- ✅ AvatarDropdown.tsx — ShopperCartDrawer removed; ThemeToggle added with `import ThemeToggle from './ThemeToggle'`; "Appearance" row added before Logout with `<ThemeToggle compact={true} />`.
- ✅ BottomTabNav.tsx — Calendar tab → Trending (TrendingUp icon, href=/trending). Wishlist tab → Explore (compass SVG, opens `exploreSheetOpen` bottom sheet with Feed/Calendar/Wishlist grid). Added useState/TrendingUp/Zap/Calendar/Heart imports.
- ✅ PosPaymentRequestAlert.tsx — refetchInterval 5000→30000, staleTime 0→25000 (was polling every 5s).
- ✅ pages/sales/[id].tsx + pages/items/[id].tsx — ShopperCartDrawer removed, ShopperCartFAB onClick → openCart().
- ✅ Vercel build: 3x `setMobileCartOpen is not defined` errors fixed.

**S541 COMPLETE — Chrome QA session:**
- ✅ /coupons Rarity Boost (shopper, 530 XP) — active, modal opens with sale list, cost 50 XP displayed correctly. ss_4737i417x
- ✅ /coupons organizer view — Shopper Discount Codes visible, Rarity Boost absent. ss_56564zsz7
- ✅ /shopper/loyalty → /coupons redirect — instant, no flash. ss_8103rmsqm
- ✅ /shopper/referrals — referral link REF-0215DAB8, Copy + 5 share buttons, stats present. ss_59914h5dd
- ✅ /shopper/appraisals submit — works via JS .click() (coordinate click is VM viewport artifact)
- ✅ /shopper/early-access-cache — loads correctly
- ❌ Print kit P0 — /api/items/drafts?saleId=cmnxvyic4001li51qobwidrbl returns 500. RETAIL sale, 87 items, whole-month dates. Needs investigation in S542.
- ❌ #241 Brand Kit PDFs P1 — STILL BROKEN. Root cause: hardcoded /api/brand-kit/ relative hrefs, no Next.js rewrite. Fix: NEXT_PUBLIC_API_URL base.
- ❌ /coupons coupon Generate buttons P1 — non-functional, no API call fires.
- ⚠️ ActionBar.tsx P2 — "Treasure Trails" href /shopper/trails → should be /trails (public browse)
- ⚠️ "Hunt Pass Active" badge P2 — showing for Karen (shopper with no Hunt Pass)
- ⚠️ /shopper/ranks Scout boundary P2 — rank badge and earned message mismatch

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

**S543 (2026-04-22, COMPLETE):** Fixes + smoke test + Hunt Pass audit + guild-primer rank fix. S542 Chrome-verified: cart drawer ✅, Explore▾ dropdown ✅, ThemeToggle in AvatarDropdown ✅. S541 bug reanalysis: /coupons Generate buttons debunked as VM viewport artifact — fully functional (ss_2443ofv38). #241 Brand Kit PDFs confirmed already fixed in S542 (code review). Fixes dispatched: P0 print kit 500 (getDrafts Decimal serialization — itemController.ts), P2 batch (ActionBar Trails href, HP badge userData→user, RankHeroSection Scout boundary), minor coupons.tsx type improvement. Hunt Pass audit: fetched pre-S534 997-line hunt-pass.tsx from git — confirmed S534 stripped 2 subscription benefits (Treasure Hunt Pro, Rare Finds Pass) plus full XP economy reference; newsletter was always copy-only. guild-primer rank journey rewritten to match RankHeroSection.tsx (was showing unbuilt perks: priority support, sourcebook, 48h alerts, featured placement, sales/week counts). Grandmaster "Free Hunt Pass included" retained. 6 files changed. Push block below.

**S542 (2026-04-22, COMPLETE):** Cart merge + nav restructure + polling/spam fixes. Root cause discovery: CartDrawer was completely orphaned — CartIcon called openCart() but CartDrawer was never rendered anywhere; ShopperCartDrawer was the only live drawer. Merged into unified CartDrawer wired to CartContext. Price inconsistency fixed: hold prices from API are in dollars (197.81), useShopperCart stores cents — CartDrawer was dividing both by 100 (giving $1.98 instead of $197.81). Remove button restored on Saved in Cart items. Hold expiry toast loop fixed: handleHoldExpiry toast was causing refetch→re-render→HoldTimer remount→already-expired fires again loop; removed toast entirely. 429s on /reservations/my-holds-full fixed: mutations had both invalidateQueries + refetch() (double-fire); removed redundant refetch() calls. Nav changes: clock→cart icon (amber badge), Explore ▾ dropdown added between Trending and Search with Feed/Calendar/Wishlist, Pricing moved next to Host a Sale, ThemeToggle moved from nav to AvatarDropdown "Appearance" row. Search input now absolute-positioned (no squishing). BottomTabNav: Calendar→Trending, Wishlist→Explore bottom sheet. PosPaymentRequestAlert polling 5s→30s. 8 files changed. Push block in patrick-dashboard.md.

**S541 (2026-04-22, COMPLETE):** QA-only session. 6 Chrome-verified ✅, 3 bugs surfaced. Verified: /coupons Rarity Boost (shopper, 530 XP, ss_4737i417x), /coupons organizer view (no Rarity Boost, ss_56564zsz7), /shopper/loyalty→/coupons redirect (ss_8103rmsqm), /shopper/referrals (referral link + share buttons, ss_59914h5dd), /shopper/appraisals submit (JS .click() required — coordinate click is VM artifact), /shopper/early-access-cache (loads correctly). Bugs found: (P0) Print kit "Artifact Downtown Paw Paw" — /api/items/drafts?saleId=cmnxvyic4001li51qobwidrbl returns 500; RETAIL sale, Apr 1–30 whole-month dates, 87 items confirmed in DB — itemController getDrafts likely has unhandled RETAIL type or month-long date range; (P1) #241 Brand Kit PDFs still broken — hardcoded /api/brand-kit/ hrefs relative to Vercel, no rewrite to Railway; (P1) /coupons coupon Generate buttons non-functional — no API call fires. P2 deferred: ActionBar Treasure Trails href wrong, Hunt Pass Active badge showing for non-subscriber Karen, /shopper/ranks Scout boundary mismatch. S542 starts with P0 print kit investigation.

**S540 (2026-04-22, COMPLETE):** Page audit → `/coupons` becomes unified XP-spend hub. Diagnosis: `/coupons` was organizer-only in nav yet the page had a complete shopper section sitting unreachable; `/shopper/loyalty` duplicated rank/XP UI from `/shopper/explorer-profile` and held the only Rarity Boost entry with stale +3/+5/+10 XP values. Patrick approved Path C — use the already-role-aware `/coupons` (isOrganizer at line 104) as the unified hub, consolidate loyalty into redirect stub. Shopper "Rewards" nav link added at 4 locations (desktop sidebar Connect, mobile in-sale tools, mobile shopper-only nav, AvatarDropdown shopper branch) with Ticket icon indigo-500. Rarity Boost card migrated to `/coupons` shopper section as drop-in `<RarityBoostModal>` import (named export, NOT default — verified via grep). `/shopper/loyalty` reduced 636 → 16 lines (useEffect `router.replace('/coupons')`). Dashboard duplicate `<AchievementBadgesSection>` removed + orphan `useMyAchievements` query removed (widget still lives on `/shopper/explorer-profile` — dedup, not deletion). 6 orphan `/shopper/loyalty` refs retargeted: 5 to `/shopper/explorer-profile` for rank/passport-context labels (ranks.tsx, loot-legend.tsx, league.tsx, profile.tsx, ExplorerGuildOnboardingCard.tsx), 1 to `/coupons` for XP-spend context (ActivitySummary.tsx Streak Points card). 11 files modified. TS check: zero new logic errors in edited files (env-only Cannot-find-module 'react' errors in VM are pre-existing and affect every .tsx repo-wide; Vercel will resolve). Push block in patrick-dashboard.md. S541 priorities: push S540, then smoke test 7 verification scenarios.

**S539 (2026-04-21, COMPLETE):** Nav parity + XP achievement bug + create-sale overhaul. Root cause of shopper Settings redirect: both AvatarDropdown.tsx and Layout.tsx mobile nav hardcoded `/organizer/settings` for all users — fixed to role-conditional `/shopper/settings`. Mobile nav: Host a Sale (opens BecomeOrganizerModal) and Explorer Profile added to footer; Install App added; Settings icon indigo for shoppers; shopper-only rank/XP header restored (was organizer branch only). Avatar dropdown: Host a Sale moved from shopper section to footer below Pricing; Explorer Profile icon now indigo. Critical XP bug: achievementService.ts used strict `!== null` on optional chaining result — when existingUserAch is null, `?.unlockedAt` returns `undefined`, and `undefined !== null` is `true`, marking all new users as "already unlocked" and skipping all XP awards. Fixed with loose `!= null`. XP rank now uses `lifetimeXpEarned` (never decrements on spend); spendXp hold check added to appraisal/crew/trail controllers. create-sale stripped to lightweight first step: removed description, neighborhood, duplicate Sale Type; redirects to edit-sale; PRO celebration modal fires on isFirstSaleFreePro. Business name copy updated in settings.tsx + BecomeOrganizerModal.tsx.

**S538 (2026-04-21, COMPLETE):** Shopper video pages — full rebuild. Root cause of prior failure: previous session used rank icons from game design SKILL.md (⚔️/🏹/📚) instead of reading guild-primer.tsx directly, and dev agents received advisory summaries rather than verbatim verified data. Fix: read guild-primer.tsx authoritative source first, included all data verbatim in dispatch prompts. guild-xp-ad.html rebuilt from scratch (1,423 lines) — correct rank icons 🧭🔍🎯✨👑, correct XP values from production tables (auction win 20 XP not 15, haul post 15 XP, all visit/purchase/streak values correct), rich 7-scene RAF animation with XP bar animations, rank badge bounces, streak grid. shopper-video-ad.html patched inline (SCOUT icon ⚔️→🔍, haul XP badge +5→+15). hunt-pass-video-ad.html created (1,268 lines, correct early access copy — no "6 hours", 1.5× XP, hold priority, earn-free path to GRANDMASTER) + hunt-pass-video.html converted to proper wrapper (499 lines). haul-post-video-ad.html created (1,329 lines, 15 XP/post, +5 at 10 likes) + haul-post-video.html wrapper (426 lines). treasure-trails-video-ad.html created (1,030 lines, 40/50/60/70/80 XP by stops, route animation) + treasure-trails-video.html wrapper (436 lines). Push block in patrick-dashboard.md. S539 priorities: push all pending blocks + Chrome QA backlog.

**S537 (2026-04-21, COMPLETE):** Infrastructure + housekeeping session. Beta badge added to Layout.tsx header (desktop + mobile). GitGuardian credential exposure remediated: Railway DB password rotated (old `QvnUGsnsjujFVoeVyORLTusAovQkirAq` invalid), hardcoded credential removed from committed CLAUDE.md, stored in private global mnt/.claude/CLAUDE.md (not in git) and packages/database/.env (gitignored). SEO: www → non-www permanent redirect added to next.config.js, global canonical URL tag added to _app.tsx (strips query params, always points to finda.sale). CLAUDE.md §7 parallel dispatch HARD RULE added to prevent re-deriving Skill vs Agent pattern each session. Railway MCP OAuth double-fire investigated — root cause is Anthropic bug #51398 (CLAUDE_PLUGIN_DATA not persistent in Cowork Desktop). Workaround: Railway CLI v4.40.2 installed with project token, binary stored at mnt/.claude/bin/railway (persistent), token at mnt/.claude/railway.env. Use CLI for all Railway ops (logs, restart, redeploy) — bypass OAuth entirely. Push block in patrick-dashboard.md.

## Historical Reference

Completed phases documented in `claude_docs/COMPLETED_PHASES.md`. Advisory board decisions in `claude_docs/feature-notes/`. Roadmap maintained at `claude_docs/strategy/roadmap.md` (currently v112). Operations checklist: `claude_docs/operations/qa-backlog.md`, `claude_docs/operations/cost-protection-playbook.md`.
