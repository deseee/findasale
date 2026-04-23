# PROJECT STATE

This document is the active state anchor for FindA.Sale, a two-sided marketplace connecting organizers (selling items) with shoppers. The project spans backend (Node.js/Prisma/PostgreSQL on Railway), frontend (Next.js on Vercel), and mobile (React Native, future).

## Current Status

**Latest work (S552 — IN PROGRESS):** Big parallel session. Admin price bug fixed (purchase.amount /100 removed — was Float dollars, not cents). S551 queue dispatched (6 agents): SmartBuyerWidget rank names corrected; HP coupon limits 6/6/3→3/3/2 + "Bonus Coupon Slots" rebrand; hunt-pass.tsx badge split + +10% QR XP + coupon slots card; Bounty Batches A+B+D (auto-match modal, shopper submission review, organizer submissions endpoint). guild-primer Grandmaster Hunt Pass copy corrected ("free forever" removed). Geofencing audit: Trails ✅ geofenced, QR scans ❌ not — P1 next session. XP economy design: rejected hard referral cap + purchase floor; decided tranche escrow + reputation score system. Referral tranche system dispatched to dev (4 tranches, silent rep score, migration required). Condition grade S fixed Excellent→Mint. Appraisal guide/support content written. **Pending push: 27 files + migration + git rm bounties.tsx + wrap docs.**

**Latest work (S550 — COMPLETE):** Affiliate Program Batches 3+4+6 built + Innovation two-phase review + /organizer/earnings real fix + /organizer/calendar same-bug fix. 7 files + 1 new strategy doc pending push. **Affiliate Batch 3 — Code generation:** `affiliateController.ts` gained `generateAffiliateCode` (POST /api/affiliate/generate-code, idempotent, uses `affiliateService.generateCode()` from S545 with 7-day-account / 30-day-lockout fraud gates) and `getAffiliateCode` (GET /api/affiliate/code, returns null if not generated). Both added to `routes/affiliate.ts` — and also registered the orphaned S545 `/me` route that was never wired up. **Affiliate Batch 4 — Signup attribution:** `pages/register.tsx` reads both `?ref=` (existing shopper XP flow, untouched) AND `?aff=` (new affiliate flow); amber banner shows during signup when `?aff=` present ("An organizer referred you to FindA.Sale. If you join as an organizer and complete a paid sale, they earn a thank-you commission."). `authController.ts` accepts `affiliateReferralCode` in req.body (destructure line ~35), looks up the referrer by `User.affiliateReferralCode` inside the existing transaction (lines ~202-237), creates `AffiliateReferral {referrerId, referredUserId, referralCode, status: 'PENDING'}`, blocks self-referral (ID + email match), logs IP pair for fraud audit. Invalid codes silently ignored (no signup failure). **Affiliate Batch 6 — Dashboard endpoints:** `getAffiliateReferrals` (GET /api/affiliate/referrals, paginated with status filter PENDING/QUALIFIED/PAID/REJECTED) and `getEarningsSummary` (GET /api/affiliate/earnings-summary, aggregates totalEarned from PAID sum, unpaidBalance from QUALIFIED sum, thisMonthEarnings, last 5 payouts). Both ORGANIZER-role gated. **Innovation review (`claude_docs/feature-notes/affiliate-innovation-review-S550.md`):** Two-phase analysis (5-framework ideation + feasibility evaluation) before flat 2% payout locks. Top 3 actionable recommendations: (1) tier-matched commission — SIMPLE=$0 / PRO=2% / TEAMS=3% / ENTERPRISE=5% aligning payout to referred customer LTV; (2) hybrid payout — FindA.Sale credits default, Stripe Transfer cash at $200+ balance; (3) defer recurring 12-month subscription % model to 2027 — validate one-time first (clawback complexity, 1099 surprises, churn attribution edge cases). Compliance flags: Stripe Identity verification at >$500 lifetime, 1099-NEC at $600/yr — both must ship before Batch 7. All three recommendations gate Patrick's decision before Batches 5/7/9 dispatch. **P0 /organizer/earnings — REAL fix:** Live smoketest per §10 mandatory post-fix verification found the page STILL crashing despite S549's NaN/divide-by-zero guard. Console revealed React error #310 (hooks order violation) — the page had `if (authLoading) return null;` and `if (!user || !user.roles?.includes('ORGANIZER')) { router.push('/login'); return null; }` as early returns BEFORE the two `useQuery` calls. React requires hooks called in identical order every render; early-return renders skipped the hooks, triggering #310. Fix: moved auth-redirect into `useEffect([authLoading, user, router])`, gated render with `if (authLoading || !user || !user.roles?.includes('ORGANIZER')) return null;` AFTER all hooks. Grepped same pattern across organizer pages — `calendar.tsx` had identical bug, same fix applied. `members.tsx` and `ugc-moderation.tsx` looked suspect but hooks were all above their early returns (safe). **S549 post-mortem:** The divide-by-zero guard was real but wasn't the crash cause. Rubber-stamped without browser verification — exactly what §10 exists to catch. Admin index ✅ (S549 null guards working cleanly, "Unknown" fallback visible in Recent Purchases, only console noise is unrelated MetaMask extension). 7 code files + 1 doc + 2 wrap docs pending push.

**Latest prior work (S549 — COMPLETE):** Two P0 crash fixes + four P1 mobile overflow fixes + workspace tab bar mobile fix + affiliate Batch 2 audit (already-shipped finding). 7 files changed across 4 parallel dispatches. **Affiliate Batch 2 retrofit-audit:** Spec at `claude_docs/feature-notes/affiliate-program-spec-S544.md` DEV INSTRUCTION 2 (Attribution Gap Fix — sessionStorage → Checkout) called for ~30 lines of new code in CheckoutModal.tsx + stripeController.ts. Audit confirmed both files already implement the wire-through end-to-end: CheckoutModal.tsx lines 315–321 reads `sessionStorage.getItem('affiliateRef')` (SSR-guarded), conditionally passes `affiliateLinkId` to /stripe/create-payment-intent. stripeController.ts line 329 destructures it from req.body, line 472 attaches to Stripe metadata, line 520 stores on Purchase row, lines 1195–1197 increment AffiliateLink.conversions on payment_intent.succeeded webhook. Schema `Purchase.affiliateLinkId` (line 11) confirmed present. Batch 2 = ZERO new code. Spec doc should be marked "Batch 2 — already shipped, audit S549" and Batch 3 (POST /affiliate/generate-code + GET /affiliate/code) becomes next priority. **P2 Workspace tab bar fix:** `pages/organizer/workspace.tsx` parent flex container `flex-wrap sm:flex-nowrap`, each tab button `px-2 sm:px-6 flex-shrink-0 text-sm sm:text-base`, removed `overflow-x-auto`. Tabs wrap onto 2 rows under 412px, single-row from sm: up. **Two P0 crash fixes + four P1 mobile overflow fixes shipped in parallel (3 dispatch batches, 6 files).** **P0 #1 — /admin index ErrorBoundary crash:** Root cause was undefined sparklines arrays plus missing nested objects on partial API responses. Fix in `packages/frontend/pages/admin/index.tsx` — 5 guards: `(stats.sparklines?.signups ?? []).reduce(...)` lines 240/253, same pattern for `transactionRevenue` lines 262/275 and `newSales` lines 284/297, plus `purchase.user?.name || 'Unknown'` line 356 and `sale.organizer?.businessName || 'Unknown'` line 423. **P0 #2 — /organizer/earnings ErrorBoundary crash:** Root cause was division-by-zero rendering NaN when `totals.revenue === 0` for organizers with no completed sales — React threw on NaN render. Fix in `packages/frontend/pages/organizer/earnings.tsx` line 230: `totals.revenue > 0 ? ((totals.fees / totals.revenue) * 100).toFixed(1) + '%' : '0%'`. Backend payouts endpoint already safe (Number() conversions present). **P1 mobile overflow batch (4 files, surgical Tailwind):** (1) `pages/organizer/edit-sale/[id].tsx` ENDED-sale header — wrapped action buttons in `flex flex-wrap gap-2`, outer container `flex-col sm:flex-row`, title `min-w-0 truncate`, Settle button `flex-shrink-0 whitespace-nowrap`. (2) `pages/organizer/insights.tsx` SELECT dropdown — parent `flex-wrap`, select `max-w-full w-full sm:w-auto min-w-0 truncate`. (3) `pages/shopper/explorer-profile.tsx` wishlist Add buttons — `flex-wrap gap-2`, input `flex-1 min-w-[200px]`, button `flex-shrink-0`. (4) `pages/admin/items.tsx` pagination/filter — container `flex-wrap`, input `flex-1 min-w-0`, select `flex-shrink-0`. Desktop layouts (sm: and up) unchanged for all four. TS check clean across both packages (only pre-existing AchievementBadge JSX env errors remain, unrelated to S549 edits). **/organizer/workspace tab bar:** deferred to Patrick decision — no code changes. **6 files pending push.**

**Latest prior work (S548 — COMPLETE):** Full mobile QA walkthrough @ 320px (Pixel 6a PWA viewport) + 3 surgical fixes + 2 P0 crash findings. Built a same-origin iframe harness inside finda.sale (auth preserved, width programmatically set) to bypass Chrome Windows 454px window-width floor. Scanned 20+ pages as Alice (ADMIN+ORGANIZER). **Fixed (3 files):** (1) `packages/frontend/pages/_document.tsx` — added explicit `initial-scale=1, viewport-fit=cover` to viewport meta. Root cause of Pixel 6a rendering at 320px CSS width instead of native 412px: Next.js 14's default viewport tag omits initial-scale, and Android PWA falls back to a narrower layout width without it. This was the Pixel 6a mystery. (2) `packages/frontend/pages/organizer/dashboard.tsx` Weather Strip wrapper — `<div className="flex-shrink-0">` → `w-full sm:w-auto sm:flex-shrink-0`. The `flex-shrink-0` was locking the 4-span weather card at its 368px intrinsic width (date + temp + condition + city, with whitespace-nowrap), clipping "Grand Rapids" at <368px viewports. Now own-row on mobile, inline badge on desktop. (3) Same file, B1 Share Nudge header row — `items-start` → `items-stretch` + added `w-full sm:w-auto` + `flex-shrink-0` on emoji + `min-w-0 truncate` on text. Fixed 8px right-edge overflow at 320px. **Clean at 320px:** /organizer/dashboard, /organizer/sales, /organizer/settings, /organizer/add-items/[id], /admin/users, /admin/sales, /admin/feedback, /admin/verification, /admin/invites, /admin/feature-flags, /, /trending, /sales/[id], /shopper/dashboard. **Remaining P1 mobile overflows (not yet fixed):** /organizer/edit-sale/[id] ENDED-sale header row (✓ ENDED + Reopen + Settle overflows 70px), /organizer/insights SELECT dropdown forces 96px horizontal scroll, /shopper/explorer-profile two "Add" buttons overflow 43px, /admin/items pagination button + body at 839px (needs horizontal scroll wrapper or responsive grid). **P0 crashes found (not mobile-specific — crash at any width):** /admin index — "Something went wrong" ErrorBoundary; likely null ref in `stats.sparklines.*.reduce()` or `purchase.user.name` / `sale.organizer.businessName` when API returns partial data. /organizer/earnings — "Something went wrong" ErrorBoundary; needs Railway log check. Both surfaced for P1 follow-up. /organizer/workspace tab bar uses `overflow-x-auto` (4 tabs = 460px, scrollable but no visual affordance) — defer to Patrick decision. 2 files pushed.

**Latest prior work (S547 — COMPLETE):** Mobile overflow fix on organizer dashboard past sales cards. Both "Past Sales" blocks in `packages/frontend/pages/organizer/dashboard.tsx` used a horizontal flex where title+city (`flex-1`) sat next to three inline action items — on narrow mobile viewports the buttons pushed past the card edge. Fix: made outer row responsive (`flex-col sm:flex-row sm:items-center sm:justify-between gap-*`), wrapped the three actions in a `flex flex-wrap items-center gap-2` container so they wrap under the title on mobile and sit right-aligned on desktop, added `min-w-0` + `truncate` to the title/city. 1 file.

**Latest prior work (S546 — COMPLETE):** S545 migration recovery. S545 pushed but `prisma migrate deploy` failed with two cascading errors: (1) P3018 index collision — the consolidate_affiliate_payout_to_referral migration renamed AffiliateReferral → AffiliateReferral_OLD but PostgreSQL indexes are global per schema and traveled with the renamed table under their original names, causing `CREATE INDEX "AffiliateReferral_referrerId_idx"` to fail; (2) P1012 missing opposite relation — `AffiliateReferral.referredUser` had no matching inverse on User model (old comment wrongly claimed "implicit"). Also discovered S545 broke Vercel build: sales/[id].tsx line 524 referenced `user?.explorerRank` but AuthContext User deliberately excludes it (prevents stale JWT cache); plus a JSX structural error where the `{!isSaleLocked && (` conditional was misclosed. Fixes: (a) migration.sql prepended 6 `ALTER INDEX IF EXISTS ... RENAME TO ..._OLD_*` statements before the table rename so new indexes don't collide (old indexes then drop with _OLD table); (b) schema.prisma added `affiliateReferralsReceived AffiliateReferral[] @relation("AffiliateReferrals_Referred")` to User; (c) sales/[id].tsx imported useXpProfile hook, swapped both `user?.explorerRank` refs to `xpProfile?.explorerRank`, fixed JSX `)}` placement; (d) Dockerfile.production cache-bust 2026-04-22a. Patrick ran `migrate resolve --rolled-back` → `migrate deploy` → `generate` against Railway proxy — both pending migrations now OK. psycopg2 verified: AffiliateReferral has 12 consolidated columns, AffiliatePayout dropped, Sale.publishedAt + User.affiliateReferralCode present. Chrome smoke test passed: homepage + sale detail page render clean, only console errors are MetaMask extension conflicts (not our code). 4 files.

**Latest prior work (S545 — COMPLETE):** P0 auth crash fixed + 2 dev hotfixes + 2 major features built. Railway P2022 `User.tasteProfile does not exist` crashed all authenticated requests — S544 migration applied column as snake_case but Prisma schema uses camelCase with no `@map`. Rename migration `20260422220500_rename_taste_profile_camelcase` deployed via `prisma migrate deploy`, verified via psycopg2. P0 `/organizer/sales` auto-resolved (auth-crash symptom — Patrick confirmed "working"). Dev hotfixes: (a) mobile organizer dashboard layout (dashboard.tsx lines 1145/1150, responsive flex classes), (b) Organizer Insights Decimal fix for Alice (insightsController.ts 222–274, `.toNumber()` per S543 pattern). Architect decision on rank-based early access: Option A (build `publishedAt` + rank-tier windows). Patrick locked 4 questions: (1) presale sales shown with 🔒 badge, (2) Initiates see with "Rank up" CTA, (3) organizer's local TZ, (4) backfill existing sales with `publishedAt = createdAt`. Rank dispatch built: `publishedAt DateTime?` on Sale + migration `20260422231500_add_sale_publishedAt` (backfill UPDATE in SQL), `rankService.ts` with `RANK_EARLY_ACCESS_HOURS` (Scout:1 / Ranger:2 / Sage:4 / GM:6), saleController gating on getSale/listSales/searchSales with locked response shape, SaleLockCard component for detail page, SaleCard lock badge overlay, Initiate Rank-Up CTA. 9 files. Affiliate Program Batch 1 dispatched with placeholder amounts (PRO=$20, TEAMS=$55, SIMPLE=$0, ENT=$0 as config constants per Patrick's "still not sure, build with placeholders"): consolidated AffiliateReferral (AffiliatePayout merged), `affiliateConfig.ts`, `affiliateService.ts` (code gen + fraud gates 7-day account / 30-day lockout), `GET /api/affiliate/me` endpoint, migration `20260422230000_consolidate_affiliate_payout_to_referral`. 5 files. Main session cleanup: removed stale `affiliatePayouts AffiliatePayout[]` relation from Sale model that affiliate agent missed. Two commits already on GitHub via MCP: cf9c7b39, ea885c37. 17 files pending push.

**Latest prior work (S544 — COMPLETE):** Strategy + builds session. Grandmaster Hunt Pass duration revised: free-forever → tied to active status (lapses on Jan 1 reset, re-qualifying restores it). hunt-pass.tsx: Newsletter → "Coming Soon" amber badge, Treasure Hunt Pro restored (150/day confirmed in xpService). Golden Trophy Avatar Frame built — HuntPassAvatarBadge.tsx + Avatar.tsx (new components), AvatarDropdown.tsx updated; purely frontend, no schema needed. 3x Monthly Coupon Slots built — couponController.ts HP limits 6/6/3 vs standard 2/2/1, coupons.tsx shows dynamic limits. Schema migration created (--create-only): tasteProfile Json? on User + ApiKey model. Research: Consignment FULLY BUILT (Consignor model + controller — not a pre-wire). Affiliate Program: full Architect spec written (affiliate-program-spec-S544.md), 10 endpoints, 10-batch dev sequence, schema consolidation (AffiliatePayout → AffiliateReferral). Payout model: flat cash on first successful paid billing only (no SIMPLE/free tier — exploit vector). PRO/TEAMS amounts TBD (config constants). P0 DISCOVERED: /organizer/sales "Unable to load sales" — broken live. S545 first task. 8 code files changed + 4 doc files + 1 migration.

**Latest work (S543 — COMPLETE):** Smoke test + fixes session. S542 Chrome-verified: cart drawer opens ✅ (ss_38260xriu), Explore▾ dropdown Feed/Calendar/Wishlist ✅ (ss_9925pirt5), ThemeToggle under Appearance in AvatarDropdown ✅ (ss_2838xqo76). S541 bug reanalysis: /coupons Generate buttons DEBUNKED as VM viewport artifact — API fires correctly via JS .click(), code `94764D37` generated, XP deducted 500→400, Deluxe tier correctly disabled (ss_2443ofv38). #241 Brand Kit PDFs confirmed already fixed in S542 commit "brand-kit Railway URLs" — all 4 hrefs use `${NEXT_PUBLIC_API_URL}`. S543 fixes dispatched (pending push): (P0) Print kit 500 — getDrafts itemController Decimal serialization fix for workspace discount rules; (P2) ActionBar Treasure Trails /shopper/trails→/trails; (P2) Hunt Pass badge dashboard.tsx userData→user.huntPassActive; (P2) RankHeroSection Scout boundary nextRankThreshold NEXT_RANK_MAP fix; (minor) coupons.tsx GenerateResult type expanded. Hunt Pass audit: 1.5x XP ✅ confirmed code; 6-hour flash deal early access ✅ confirmed code; newsletter benefit ⚠️ copy-only (no backend); higher XP caps on treasure hunt scans (150 vs 100) 🔲 exists in code, missing from hunt-pass.tsx copy.

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
| /organizer/sales "Unable to load sales" (P0) | ✅ RESOLVED S545 — was auth-crash symptom from tasteProfile P2022. Patrick confirmed "working". | — | S544 |
| Mobile organizer dashboard — Copy Link + More Options layout (P2) | ✅ FIXED S545 — pending push + Chrome QA | Dev modified dashboard.tsx lines 1145/1150 with responsive flex classes | S544 |
| Organizer Insights runtime error for Alice (P2) | ✅ FIXED S545 — pending push + Chrome QA | Decimal serialization fix in insightsController.ts lines 222–274 per S543 precedent | S528 |
| tasteProfile auth crash (P0) | ✅ FIXED S545 | Rename migration deployed to Railway (20260422220500). Verified via psycopg2. | S545 |
| Print kit items/drafts 500 (P0) | ✅ FIXED S543 — pending push + Chrome QA | Decimal serialization bug in getDrafts. Fix in itemController.ts. After push: verify /organizer/print-kit/cmnxvyic4001li51qobwidrbl loads without error. | S541 |
| /coupons Shopper coupon Generate buttons (P1) | ✅ DEBUNKED S543 — RESOLVED | Was VM viewport artifact. Buttons work (ss_2443ofv38). | S541 |
| S540 Dashboard achievements dedup | Pushed — pending Chrome QA | /shopper/dashboard Overview tab: Achievements widget GONE. /shopper/explorer-profile: Achievements widget STILL present | S540 |
| S540 Orphan ref hops | Pushed — pending Chrome QA | From /shopper/ranks, /shopper/loot-legend, /shopper/league, /profile follow back/CTA links → land on /shopper/explorer-profile (not 404, not loyalty) | S540 |
| Past Sales card mobile overflow (organizer dashboard) | ✅ FIXED S547 — pending push + Chrome QA | Load /organizer/dashboard as organizer on mobile viewport (375px). Past Sales list (State 2, has active sale) and Past Sales Archive (State 3, between sales): title + Reopen + Settle → + View Details → should stack cleanly — no horizontal overflow, no clipped button text. Desktop layout unchanged. | S547 |
| /admin index crash (P0) | ✅ Chrome-verified S550 — RESOLVED | Loaded clean, full dashboard rendered with "Unknown" fallbacks, only noise is unrelated MetaMask extension conflict. S549 null guards working. | S549 |
| /organizer/earnings crash (P0) | ✅ FIXED S550 — pending push + Chrome QA | S549 divide-by-zero guard was a red herring — real bug was React #310 hooks order violation (early returns before useQuery). Fix moves auth into useEffect + gates render after hooks. After push: load /organizer/earnings as organizer and as non-organizer; confirm no ErrorBoundary, redirect works for non-organizer. | S549 |
| /organizer/calendar hooks order (P0 latent) | ✅ FIXED S550 — pending push + Chrome QA | Same React #310 pattern as earnings — fixed preemptively with same useEffect + post-hook-gate pattern. After push: load /organizer/calendar as organizer and as non-organizer; confirm no crash, redirect works. | S550 |
| S549 /organizer/edit-sale/[id] ENDED header mobile overflow | Pushed S549 — pending Chrome QA | Load /organizer/edit-sale/[id] for an ENDED sale on mobile (412px); confirm ✓ ENDED + Reopen + Settle buttons wrap onto new row, title truncates cleanly, no horizontal scroll | S549 |
| S549 /organizer/insights SELECT dropdown | Pushed S549 — pending Chrome QA | Load /organizer/insights on mobile (412px); confirm SELECT dropdown wraps/truncates, no 96px horizontal scroll | S549 |
| S549 /shopper/explorer-profile Add buttons | Pushed S549 — pending Chrome QA | Load /shopper/explorer-profile on mobile (412px); confirm wishlist Add buttons don't overflow 43px | S549 |
| S549 /admin/items pagination | Pushed S549 — pending Chrome QA | Load /admin/items on mobile (412px); confirm filter row wraps, table has its own scroll-x, no 839px page-level scroll | S549 |
| S549 /organizer/workspace tab bar | Pushed S549 — pending Chrome QA | Load /organizer/workspace on mobile (<412px); confirm 4 tabs wrap onto 2 rows, no horizontal scroll; desktop (sm: up) stays single row | S549 |
| S550 Affiliate POST /generate-code | Pending push + Chrome/API QA | As organizer, POST /api/affiliate/generate-code → confirm returns code; POST again → confirm idempotent (returns same code, no duplicate User.affiliateReferralCode collision) | S550 |
| S550 Affiliate GET /code | Pending push + Chrome/API QA | As organizer with no code → GET /api/affiliate/code returns null; after generate → returns the code | S550 |
| S550 Affiliate signup attribution (?aff=) | Pending push + Chrome QA | Signup flow with ?aff=VALIDCODE → amber banner shows, AffiliateReferral row created with status PENDING. ?aff=INVALID → banner still shows but no row created, no error. Self-referral (?aff=ownCode) → blocked, no row created. | S550 |
| S550 Affiliate GET /referrals | Pending push + Chrome/API QA | As organizer, GET /api/affiliate/referrals → paginated list; add ?status=PENDING → filter works | S550 |
| S550 Affiliate GET /earnings-summary | Pending push + Chrome/API QA | As organizer with no referrals → zero-state renders cleanly (totalEarned: 0, unpaidBalance: 0, recentPayouts: []). As organizer with paid referrals → correct aggregates. | S550 |
| S550 /me route registration (S545 orphan) | Pending push + Chrome QA | GET /api/affiliate/me was orphaned in S545 (never registered in router). S550 added registration. Confirm endpoint returns 200 with user's affiliateCode + referrals + totals. | S550 |

## File Organization

**Backend controllers:** `packages/backend/src/controllers/` — saleController, itemController, authController, stripeController, ebayController, checklistController, labelComposerController, shopAutoRenewJob

**Frontend pages:** `packages/frontend/pages/organizer/` (seller flows), `pages/shopper/` (buyer flows), `pages/admin/` (platform tools)

**Shared types:** `packages/backend/src/types/`, `packages/frontend/types/`

**Database:** `packages/database/prisma/schema.prisma`, migrations in `migrations/` folder

## Next Session (S553)

**S553 priority queue:**

0. **PUSH S552 BLOCK FIRST** — 27 files + migration. Full block in patrick-dashboard.md. After push, Railway migration must run (ReferralTranche + ReferrerReputationScore new tables).

1. **Mandatory §10 smoke tests after S552 deploys:**
   - /organizer/earnings — confirm React #310 hooks fix holds (no ErrorBoundary)
   - /organizer/calendar — same
   - /organizer/edit-sale/[id] ENDED header — mobile 412px, buttons wrap cleanly
   - /organizer/insights SELECT dropdown — mobile 412px, no 96px scroll
   - /shopper/explorer-profile Add buttons — mobile 412px, no 43px overflow
   - /admin/items pagination — mobile 412px, filter row wraps
   - /organizer/workspace tab bar — mobile <412px, 4 tabs wrap to 2 rows
   - Admin /admin index — Recent Purchases show dollar amounts (not fractions)

2. **Geofence QR scans** — ✅ Dispatched S553. itemController.ts recordQrScan + treasureHuntQRController.ts markClueFound + treasure-hunt-qr/[clueId].tsx frontend. Included in S552+S553 push block.

3. **Affiliate program payout decisions** — Tracked at roadmap #318. No longer an active session todo.

4. **BountyModal.tsx file deletion** — ✅ Approved. git rm included in push block.

5. **1000 XP mid-milestone (Scout→Ranger)** — Research complete S553. Recommendation: Option C (Milestone Badge Overlay + optional feed announcement). Game design dispatch next.

**Patrick actions:**
- Push S552+S553 block (see patrick-dashboard.md — updated commit)
- Run migration: `npx prisma migrate deploy` + `npx prisma generate` against Railway (ReferralTranche system requires schema before backend deploy)

---

**Parallel dispatch queue (added S551 — dispatch together once Patrick starts next session):**

These items are independent (different files, no cross-dependencies) and should be dispatched as concurrent `Agent(subagent_type='general-purpose')` calls in a single message per CLAUDE.md §7 parallel pattern.

1. **Trailblazer color map cleanup** — `packages/frontend/components/SmartBuyerWidget.tsx` lines 23–31. `RANK_COLORS` references stale rank names (EXPLORER, PATHFINDER, TRAILBLAZER, LEGEND) that don't exist in the live 5-rank system. Replace with the correct map: INITIATE, SCOUT, RANGER, SAGE, GRANDMASTER. P3 dead-code cleanup, ~10 lines.

2. **Coupon tier Hunt Pass values — CODE FIX** — `packages/backend/src/controllers/couponController.ts` lines 253–255. Currently shipped values are `monthlyLimitHuntPass: 6, 6, 3` — Patrick confirmed S551 these are wrong. Correct values: `monthlyLimitHuntPass: 3, 3, 2`. Standard tier values stay as-is (`monthlyLimitStandard: 2, 2, 1`). Also re-think the "3x Monthly Coupon Slots" branding — the math is now 1.5x (tier 1+2) and 2x (tier 3), so drop the "3x" label or reframe. Verify no callers assume the old 6/6/3 numbers.

3. **Hunt Pass page copy update — frame, badge, bonus, coupons (4 separate cards)** — `packages/frontend/pages/shopper/hunt-pass.tsx`. Three issues and one structural change:
   - **Split badge and frame into two separate cards.** Today the 🎖️ "Exclusive Hunt Pass Badge" card conflates two different features. Split into:
     - **Card A — Golden Trophy Avatar Frame** (new card): amber/gold ring around the avatar on nav + dropdown (HuntPassAvatarBadge.tsx shipped S544). Visual status marker on the profile photo itself.
     - **Card B — Hunt Pass Leaderboard Badge** (rewrite existing): 🏆 badge shown next to the user's name on leaderboards.
   - **Treasure Hunt Pro** (🎯 section) mentions the 100→150 scan cap but omits the **+10% XP bonus** on treasure hunt QR scans (shipped — itemController.ts recordQrScan applies +10% multiplier for Hunt Pass subscribers on top of rank multiplier). Add the +10% bonus line.
   - **Add Coupon Slots benefit card** (new) with the CORRECTED 3/3/2 numbers (after item #2 code fix lands). Describe as more monthly coupon redemptions across the three XP-coupon tiers vs. free accounts.

4. **Bounty redesign Batch A — Auto-match on item publish (highest value)** — Per `claude_docs/strategy/bounty-redesign-spec.md` §1 + §6a. Backend: `POST /api/bounties/:id/match` endpoint with fuzzy match scoring (60% confidence threshold locked, 25mi radius, category bonus, recency bonus, tag overlap). Frontend: post-publish match modal on `/organizer/add-items` showing top 3–5 matches with Submit CTA per bounty. Architect review may be needed for the fuzzy match algorithm approach.

5. **Bounty redesign Batch B — Shopper submission review page** — Per spec §3a + §6a `GET /api/bounties/submissions` and §6a `PATCH /api/bounties/submissions/:id`. New page `/shopper/bounties/submissions` listing PENDING_REVIEW submissions with approve/decline/message actions. Uses shipped BountySubmission schema. Notifications when submissions arrive + expiry warnings.

6. **Bounty redesign Batch C — Integrated purchase + XP flow** — Per spec §3b + §4b + §6a `POST /api/bounties/:id/submissions/:submissionId/purchase`. Shopper approves → Stripe checkout with XP line item (-50 XP shopper / +25 XP organizer via PointsTransaction BOUNTY_FULFILLMENT). Must block purchase if insufficient XP (no overdraft per spec). Order links bountySubmissionId.

7. **Bounty redesign Batch D — Organizer "Your Recent Submissions" backend endpoint** — Frontend placeholder exists in `/organizer/bounties` V4 but backend is missing. Returns past-30-day BountySubmission records for the organizer with status (PENDING_REVIEW / APPROVED / REJECTED / EXPIRED).

8. **Delete dead `BountyModal.tsx` component file** — Removed from sales/[id].tsx S551. No other consumers (grep confirmed). Requires Patrick explicit approval per CLAUDE.md §7 Removal Gate (component file, not dead code at language level). Surface as DECISION NEEDED at dispatch time OR delete inline if Patrick signs off during the S551 wrap push.

**Dependencies between the bounty batches:** Batch D is independent and can ship solo. Batch A feeds organizer activity but doesn't block B/C. Batch B must ship before Batch C (can't approve a submission that has no review UI). Batch C depends on the Stripe + XP service integration being solid; consider Architect review first.

**Patrick decisions still open (from spec §8):** shopper price negotiation (default no), bounty auto-expiry default (60–90 days recommended, nullable today), message char limit (500 default). Not blockers — default values in spec.

## Current Work

**S546 COMPLETE — S545 migration recovery:**
- ✅ `packages/database/prisma/migrations/20260422230000_consolidate_affiliate_payout_to_referral/migration.sql` — prepended 6 `ALTER INDEX IF EXISTS ... RENAME TO ..._OLD_*` statements (Step 1) before the table rename, so PG's global index namespace doesn't collide with the new `CREATE INDEX` calls. Old indexes drop with the _OLD table at Step 7. Fixes P3018.
- ✅ `packages/database/prisma/schema.prisma` — added `affiliateReferralsReceived AffiliateReferral[] @relation("AffiliateReferrals_Referred")` to User model (line ~148). Fixes P1012.
- ✅ `packages/frontend/pages/sales/[id].tsx` — imported `useXpProfile` hook, called with `!!user?.id` gate, swapped `user?.explorerRank` → `xpProfile?.explorerRank` at line 524 (showRankUpCta) and line 546 (SaleLockCard prop). AuthContext User deliberately excludes explorerRank (prevents stale JWT cache — see AuthContext.tsx line 14 comment). Also fixed S545 JSX structural error: moved `)}` to correct position after `</main>` (line 1448), removed stray `)}` at line 1510.
- ✅ `packages/backend/Dockerfile.production` — cache-bust bumped to 2026-04-22a to force Railway rebuild after 2 build failures.
- ✅ Patrick ran recovery sequence against Railway proxy: `prisma migrate resolve --rolled-back 20260422230000_consolidate_affiliate_payout_to_referral` → `prisma migrate deploy` → `prisma generate`. Both pending migrations now OK.
- ✅ psycopg2 post-migration verification: AffiliateReferral has 12 consolidated columns (id, referrerId, referredUserId, referralCode, status, qualifiedAt, payoutAmountCents, payoutCalculatedAt, stripeTransferId, paidAt, createdAt, updatedAt); AffiliatePayout dropped; Sale.publishedAt exists; User.affiliateReferralCode exists.
- ✅ Chrome smoke test: homepage + sale detail page (cmnxvyic4001li51qobwidrbl — Artifact Downtown Paw Paw) render clean. Only console errors are MetaMask browser extension conflicts (not app code). `/settings/affiliate` is 404 — expected since Batch 1 is backend/schema only, no UI built yet.

**S544 PRIOR — Hunt Pass features + schema pre-wires + affiliate audit:**
- ✅ Grandmaster Hunt Pass duration changed: free-forever → tied to active status (must re-qualify after Jan 1 reset). Spec updated in gamification-rpg-spec-S260.md. Decision file: gamedesign-decisions-2026-04-22.md.
- ✅ hunt-pass.tsx: Newsletter → "Coming Soon" amber badge (user-written guides platform, coming post-beta). Treasure Hunt Pro restored (150/day cap, confirmed in xpService.ts). Page shows 5 confirmed benefits.
- ✅ Golden Trophy Avatar Frame: HuntPassAvatarBadge.tsx (new), Avatar.tsx (new), AvatarDropdown.tsx updated. Purely frontend — huntPassActive already on User. Amber/gold ring on nav + dropdown avatar for HP subscribers.
- ✅ 3x Monthly Coupon Slots: couponController.ts SHOPPER_COUPON_TIERS updated (HP limits: 6/6/3 vs standard 2/2/1). coupons.tsx shows dynamic limits based on huntPassActive.
- 🔲 Schema migration pending: tasteProfile Json? on User, ApiKey model (both MISSING — all other pre-wire fields already exist).
- ✅ Affiliate Program: Full Architect spec complete (claude_docs/feature-notes/affiliate-program-spec-S544.md). Payout model proposed: 2% of referred organizer's first PAID sale GMV, $50 floor. Schema consolidation: merge AffiliatePayout → AffiliateReferral (single source of truth). 10 API endpoints defined. 10-batch dev sequence ready. 5 items flagged for Patrick approval before dev dispatch (payout %, frequency, scope, emails, fraud thresholds). Do NOT dispatch dev until Patrick approves.

**Research findings (S544):**
- Consignment: FULLY BUILT — Consignor model, ConsignorPayout, consignorController. Not a pre-wire.
- Persistent Inventory: Schema pre-wired (persistentInventory bool + masterItemLibraryId FK on Item) but no MasterItemLibrary model and no active business logic. Frontend inventory.tsx + backend itemInventoryController exist but use the pre-wire fields only.
- executorUserId + estateId on Organizer: Both exist (Estate Planning pre-wire ✅)
- tasteProfile on User: MISSING
- ApiKey model: MISSING
- avatarFrame on User: NOT NEEDED — Golden Trophy is purely frontend via huntPassActive

**S544 files changed (pending push):**
- claude_docs/research/gamification-rpg-spec-S260.md
- claude_docs/feature-notes/gamedesign-decisions-2026-04-22.md
- packages/frontend/pages/shopper/hunt-pass.tsx
- packages/frontend/components/HuntPassAvatarBadge.tsx (new)
- packages/frontend/components/Avatar.tsx (new)
- packages/frontend/components/AvatarDropdown.tsx
- packages/backend/src/controllers/couponController.ts
- packages/frontend/pages/coupons.tsx

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

**S552 (2026-04-22, IN PROGRESS):** Big parallel + design session. Push verified clean (S550+S551 both live). Admin price P0 fixed inline (purchase.amount/100→purchase.amount; Float is dollars). S551 parallel queue (6 agents all complete): SmartBuyerWidget rank names INITIATE/SCOUT/RANGER/SAGE/GRANDMASTER; coupon HP limits 6/6/3→3/3/2 + "Bonus Coupon Slots"; hunt-pass.tsx Avatar Frame + Leaderboard Badge split, +10% QR XP bonus, coupon slots card (3/3/2); Bounty Batch D (GET /api/bounties/organizer/submissions + organizer/bounties.tsx wired); Bounty Batch A (POST /api/bounties/match fuzzy match + BountyMatchModal.tsx new + add-items wired); Bounty Batch B (shopper/bounties/ restructured to directory, index.tsx + submissions.tsx new, approve/decline flow). guild-primer 2 stale copy fixes (Grandmaster HP "free forever" → "while active Grandmaster, lapses Jan 1"). Geofencing audit: Trails 100m geofenced ✅, QR scans/visits NO geofence ❌. XP economy design: confirmed no item reviews ever existed (Review keyed to saleId). Rejected $20 purchase floor (doesn't close arbitrage). Rejected hard monthly cap. Decided: tranche escrow (A:100/B:150/C:150/D:100 XP, D = trail OR own referral OR 2nd purchase) + silent reputation score (0.0–1.0 multiplier, active day one, 0.1 floor, ≥3 referral threshold, daily job). Referral tranche dev agent: schema.prisma (ReferralTranche + ReferrerReputationScore), referralTrancheService.ts (new), reputationScoreJob.ts (new), xpService.ts + authController + saleController + stripeController + trailController + referralService all modified. Condition grade S fixed Excellent→Mint in itemConstants.ts + ConditionBadge.tsx. Appraisal content: guide.tsx new "Community Appraisals" section + support.tsx 5 FAQ entries. roadmap.md updated (v118). 27+ files pending push + migration.

**S548 (2026-04-22, COMPLETE):** Full mobile QA walkthrough @ 320px (Pixel 6a PWA viewport) + S547 extension + P0 findings. Built iframe harness (same-origin, programmatically-resized) to bypass Chrome Windows 454px window floor. Scanned organizer dashboard, all /admin sub-pages, /organizer/* key pages, /shopper/* key pages. Fixes shipped: (1) `_document.tsx` explicit `initial-scale=1, viewport-fit=cover` viewport meta — this was the reason Pixel 6a rendered at 320px instead of 412px (Next.js 14 default omits initial-scale; Android PWA falls back to narrower layout without it); (2) dashboard.tsx Weather Strip wrapper `flex-shrink-0` → `w-full sm:w-auto sm:flex-shrink-0` (was locking 368px intrinsic width and clipping "Grand Rapids" at <368px); (3) dashboard.tsx B1 Share Nudge items-start → items-stretch + w-full on child + flex-shrink-0 on emoji + min-w-0 truncate (fixed 8px overflow at 320px). **Clean at 320px (15 pages):** /organizer/dashboard, /organizer/sales, /organizer/settings, /organizer/add-items/[id], /admin/users, /admin/sales, /admin/feedback, /admin/verification, /admin/invites, /admin/feature-flags, /, /trending, /sales/[id], /shopper/dashboard. **P1 mobile overflows surfaced (not yet fixed):** /organizer/edit-sale/[id] ENDED header row, /organizer/insights SELECT dropdown, /shopper/explorer-profile "Add" buttons, /admin/items pagination. **P0 crashes surfaced (not mobile-specific):** /admin index + /organizer/earnings both throw ErrorBoundary at any width. /organizer/workspace tab bar scrollable (acceptable per overflow-x-auto) — Patrick decision. 2 files pushed.

**S547 (2026-04-22, COMPLETE):** Mobile overflow bug fix on organizer dashboard past sales cards. Patrick reported Reopen / Settle / View Details buttons overflowing on mobile. Two "Past Sales" blocks in dashboard.tsx (State 2 list at line 1520, State 3 archive at line 1640) both laid out title (`flex-1`) next to three inline action siblings — on narrow viewports the actions pushed past the card edge. Surgical Tailwind-only fix: outer row → `flex-col sm:flex-row sm:items-center sm:justify-between` with gap, three actions wrapped in `flex flex-wrap items-center gap-2 sm:ml-4`, title gets `min-w-0` + `truncate` so long titles don't blow layout. Removed obsolete `ml-4`/`ml-2` inline margins (now handled by parent gap). Zero logic changes, desktop layout preserved. Inline edit per CLAUDE.md §7 single-file <20-line exception. 1 file.

**S546 (2026-04-22, COMPLETE):** S545 migration recovery. S545 pushed but prisma migrate deploy failed: (1) P3018 — AffiliateReferral index name collision when table renamed to _OLD (PG indexes are global per schema and travel with renamed tables); (2) P1012 — AffiliateReferral.referredUser missing opposite relation on User model; (3) Vercel TS error at sales/[id].tsx:524 — `user?.explorerRank` referenced a field deliberately excluded from AuthContext User type (prevents stale JWT cache); (4) JSX structural error from S545 misplaced `)}` after lock conditional. Fixes: migration.sql ALTER INDEX IF EXISTS rename-before-rename pattern, schema.prisma `affiliateReferralsReceived` inverse relation, sales/[id].tsx useXpProfile hook + JSX fix, Dockerfile.production cache-bust 2026-04-22a. Patrick ran `migrate resolve --rolled-back` → `migrate deploy` → `generate` — both migrations now OK. psycopg2 verified: AffiliateReferral has 12 consolidated columns, AffiliatePayout dropped, Sale.publishedAt + User.affiliateReferralCode present. Chrome smoke test: homepage + sale detail page clean. 4 files.

**S545 (2026-04-22, COMPLETE):** P0 auth crash fixed (S544 tasteProfile migration was snake_case but schema.prisma is camelCase — rename migration deployed). Dev hotfixes: mobile organizer dashboard layout + Organizer Insights Decimal fix. Architect decided rank-based early access Option A: build presale windows + publishedAt. Rank dispatch built (9 files): Sale.publishedAt field + migration, rankService.ts with tier hours (Scout 1h / Ranger 2h / Sage 4h / GM 6h), saleController locked response shape, SaleLockCard component, SaleCard lock badge, Initiate Rank-Up CTA. Affiliate Batch 1 dispatched (5 files): consolidated AffiliateReferral schema, affiliateConfig.ts (placeholders PRO=$20 / TEAMS=$55 / SIMPLE=$0), affiliateService.ts with fraud gates (7-day / 30-day), `GET /api/affiliate/me` endpoint. Two commits via MCP (cf9c7b39, ea885c37). 17 files total. S546 had to recover the migration + Vercel build.

**S543 (2026-04-22, COMPLETE):** Fixes + smoke test + Hunt Pass audit + guild-primer rank fix. S542 Chrome-verified: cart drawer ✅, Explore▾ dropdown ✅, ThemeToggle in AvatarDropdown ✅. S541 bug reanalysis: /coupons Generate buttons debunked as VM viewport artifact — fully functional (ss_2443ofv38). #241 Brand Kit PDFs confirmed already fixed in S542 (code review). Fixes dispatched: P0 print kit 500 (getDrafts Decimal serialization — itemController.ts), P2 batch (ActionBar Trails href, HP badge userData→user, RankHeroSection Scout boundary), minor coupons.tsx type improvement. Hunt Pass audit: fetched pre-S534 997-line hunt-pass.tsx from git — confirmed S534 stripped 2 subscription benefits (Treasure Hunt Pro, Rare Finds Pass) plus full XP economy reference; newsletter was always copy-only. guild-primer rank journey rewritten to match RankHeroSection.tsx (was showing unbuilt perks: priority support, sourcebook, 48h alerts, featured placement, sales/week counts). Grandmaster "Free Hunt Pass included" retained. 6 files changed. Push block below.

**S542 (2026-04-22, COMPLETE):** Cart merge + nav restructure + polling/spam fixes. Root cause discovery: CartDrawer was completely orphaned — CartIcon called openCart() but CartDrawer was never rendered anywhere; ShopperCartDrawer was the only live drawer. Merged into unified CartDrawer wired to CartContext. Price inconsistency fixed: hold prices from API are in dollars (197.81), useShopperCart stores cents — CartDrawer was dividing both by 100 (giving $1.98 instead of $197.81). Remove button restored on Saved in Cart items. Hold expiry toast loop fixed: handleHoldExpiry toast was causing refetch→re-render→HoldTimer remount→already-expired fires again loop; removed toast entirely. 429s on /reservations/my-holds-full fixed: mutations had both invalidateQueries + refetch() (double-fire); removed redundant refetch() calls. Nav changes: clock→cart icon (amber badge), Explore ▾ dropdown added between Trending and Search with Feed/Calendar/Wishlist, Pricing moved next to Host a Sale, ThemeToggle moved from nav to AvatarDropdown "Appearance" row. Search input now absolute-positioned (no squishing). BottomTabNav: Calendar→Trending, Wishlist→Explore bottom sheet. PosPaymentRequestAlert polling 5s→30s. 8 files changed. Push block in patrick-dashboard.md.

**S541 (2026-04-22, COMPLETE):** QA-only session. 6 Chrome-verified ✅, 3 bugs surfaced. Verified: /coupons Rarity Boost (shopper, 530 XP, ss_4737i417x), /coupons organizer view (no Rarity Boost, ss_56564zsz7), /shopper/loyalty→/coupons redirect (ss_8103rmsqm), /shopper/referrals (referral link + share buttons, ss_59914h5dd), /shopper/appraisals submit (JS .click() required — coordinate click is VM artifact), /shopper/early-access-cache (loads correctly). Bugs found: (P0) Print kit "Artifact Downtown Paw Paw" — /api/items/drafts?saleId=cmnxvyic4001li51qobwidrbl returns 500; RETAIL sale, Apr 1–30 whole-month dates, 87 items confirmed in DB — itemController getDrafts likely has unhandled RETAIL type or month-long date range; (P1) #241 Brand Kit PDFs still broken — hardcoded /api/brand-kit/ hrefs relative to Vercel, no rewrite to Railway; (P1) /coupons coupon Generate buttons non-functional — no API call fires. P2 deferred: ActionBar Treasure Trails href wrong, Hunt Pass Active badge showing for non-subscriber Karen, /shopper/ranks Scout boundary mismatch. S542 starts with P0 print kit investigation.

**S540 (2026-04-22, COMPLETE):** Page audit → `/coupons` becomes unified XP-spend hub. Diagnosis: `/coupons` was organizer-only in nav yet the page had a complete shopper section sitting unreachable; `/shopper/loyalty` duplicated rank/XP UI from `/shopper/explorer-profile` and held the only Rarity Boost entry with stale +3/+5/+10 XP values. Patrick approved Path C — use the already-role-aware `/coupons` (isOrganizer at line 104) as the unified hub, consolidate loyalty into redirect stub. Shopper "Rewards" nav link added at 4 locations (desktop sidebar Connect, mobile in-sale tools, mobile shopper-only nav, AvatarDropdown shopper branch) with Ticket icon indigo-500. Rarity Boost card migrated to `/coupons` shopper section as drop-in `<RarityBoostModal>` import (named export, NOT default — verified via grep). `/shopper/loyalty` reduced 636 → 16 lines (useEffect `router.replace('/coupons')`). Dashboard duplicate `<AchievementBadgesSection>` removed + orphan `useMyAchievements` query removed (widget still lives on `/shopper/explorer-profile` — dedup, not deletion). 6 orphan `/shopper/loyalty` refs retargeted: 5 to `/shopper/explorer-profile` for rank/passport-context labels (ranks.tsx, loot-legend.tsx, league.tsx, profile.tsx, ExplorerGuildOnboardingCard.tsx), 1 to `/coupons` for XP-spend context (ActivitySummary.tsx Streak Points card). 11 files modified. TS check: zero new logic errors in edited files (env-only Cannot-find-module 'react' errors in VM are pre-existing and affect every .tsx repo-wide; Vercel will resolve). Push block in patrick-dashboard.md. S541 priorities: push S540, then smoke test 7 verification scenarios.

**S539 (2026-04-21, COMPLETE):** Nav parity + XP achievement bug + create-sale overhaul. Root cause of shopper Settings redirect: both AvatarDropdown.tsx and Layout.tsx mobile nav hardcoded `/organizer/settings` for all users — fixed to role-conditional `/shopper/settings`. Mobile nav: Host a Sale (opens BecomeOrganizerModal) and Explorer Profile added to footer; Install App added; Settings icon indigo for shoppers; shopper-only rank/XP header restored (was organizer branch only). Avatar dropdown: Host a Sale moved from shopper section to footer below Pricing; Explorer Profile icon now indigo. Critical XP bug: achievementService.ts used strict `!== null` on optional chaining result — when existingUserAch is null, `?.unlockedAt` returns `undefined`, and `undefined !== null` is `true`, marking all new users as "already unlocked" and skipping all XP awards. Fixed with loose `!= null`. XP rank now uses `lifetimeXpEarned` (never decrements on spend); spendXp hold check added to appraisal/crew/trail controllers. create-sale stripped to lightweight first step: removed description, neighborhood, duplicate Sale Type; redirects to edit-sale; PRO celebration modal fires on isFirstSaleFreePro. Business name copy updated in settings.tsx + BecomeOrganizerModal.tsx.

**S538 (2026-04-21, COMPLETE):** Shopper video pages — full rebuild. Root cause of prior failure: previous session used rank icons from game design SKILL.md (⚔️/🏹/📚) instead of reading guild-primer.tsx directly, and dev agents received advisory summaries rather than verbatim verified data. Fix: read guild-primer.tsx authoritative source first, included all data verbatim in dispatch prompts. guild-xp-ad.html rebuilt from scratch (1,423 lines) — correct rank icons 🧭🔍🎯✨👑, correct XP values from production tables (auction win 20 XP not 15, haul post 15 XP, all visit/purchase/streak values correct), rich 7-scene RAF animation with XP bar animations, rank badge bounces, streak grid. shopper-video-ad.html patched inline (SCOUT icon ⚔️→🔍, haul XP badge +5→+15). hunt-pass-video-ad.html created (1,268 lines, correct early access copy — no "6 hours", 1.5× XP, hold priority, earn-free path to GRANDMASTER) + hunt-pass-video.html converted to proper wrapper (499 lines). haul-post-video-ad.html created (1,329 lines, 15 XP/post, +5 at 10 likes) + haul-post-video.html wrapper (426 lines). treasure-trails-video-ad.html created (1,030 lines, 40/50/60/70/80 XP by stops, route animation) + treasure-trails-video.html wrapper (436 lines). Push block in patrick-dashboard.md. S539 priorities: push all pending blocks + Chrome QA backlog.

**S537 (2026-04-21, COMPLETE):** Infrastructure + housekeeping session. Beta badge added to Layout.tsx header (desktop + mobile). GitGuardian credential exposure remediated: Railway DB password rotated (old `QvnUGsnsjujFVoeVyORLTusAovQkirAq` invalid), hardcoded credential removed from committed CLAUDE.md, stored in private global mnt/.claude/CLAUDE.md (not in git) and packages/database/.env (gitignored). SEO: www → non-www permanent redirect added to next.config.js, global canonical URL tag added to _app.tsx (strips query params, always points to finda.sale). CLAUDE.md §7 parallel dispatch HARD RULE added to prevent re-deriving Skill vs Agent pattern each session. Railway MCP OAuth double-fire investigated — root cause is Anthropic bug #51398 (CLAUDE_PLUGIN_DATA not persistent in Cowork Desktop). Workaround: Railway CLI v4.40.2 installed with project token, binary stored at mnt/.claude/bin/railway (persistent), token at mnt/.claude/railway.env. Use CLI for all Railway ops (logs, restart, redeploy) — bypass OAuth entirely. Push block in patrick-dashboard.md.

## Historical Reference

Completed phases documented in `claude_docs/COMPLETED_PHASES.md`. Advisory board decisions in `claude_docs/feature-notes/`. Roadmap maintained at `claude_docs/strategy/roadmap.md` (currently v112). Operations checklist: `claude_docs/operations/qa-backlog.md`, `claude_docs/operations/cost-protection-playbook.md`.
