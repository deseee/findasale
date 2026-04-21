# PROJECT STATE

This document is the active state anchor for FindA.Sale, a two-sided marketplace connecting organizers (selling items) with shoppers. The project spans backend (Node.js/Prisma/PostgreSQL on Railway), frontend (Next.js on Vercel), and mobile (React Native, future).

## Current Status

**Latest work (S530 — COMPLETE):** Pure QA discovery run. No code changes. Full Chrome QA of S528/S526 backlog. qa-backlog.md updated with all findings.

**S530 QA results (documented in qa-backlog.md):**
- ✅ Verified: Explorer Profile page + redirect, #270 onboarding card (XP values correct), shopper /coupons (3 tiers), profileSlug XP gate, #200 shopper public profile (collectorTitle gone), S529 avatar dropdown rank (live!), #224 rapid-capture redirect
- ❌ New bugs: AvatarDropdown nav link still "My Profile → /organizer/profile" (P2); SettlementWizard fee label shows "200%" not "2%" (P1 regression from S528); per-sale analytics filter not scoping data (P1)
- DECISION NEEDED: /coupons organizer "Shopper Discount Codes" section visible to PRO — Patrick says TEAMS-only
- UNVERIFIED: #235 DonationModal (no charity-close test data), S529 storefront widget + mobile nav + card reader content (S529 pending push)

**S529 shipped (all live pending push):**
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
- **Coupons (P2):** ✅ FIXED S528 — unified /coupons page (cross-role). /organizer/coupons redirects there. Pending Chrome QA.
- **Organizer Insights (P2):** ⚠️ Runtime error on /organizer/insights ("failed to load") — pre-existing, not caused by S528. Needs Railway log investigation.
- **Sale Analytics drill-down (P2):** ✅ FIXED S528 — GET /api/insights/organizer/sale/:saleId built and wired. Pending Chrome QA.
- **Categories HTML entities (P2):** ✅ FIXED S528 — decoding + href fix live. Pending Chrome QA.
- **Platform fees:** ✅ LOCKED — PRO=8%, TEAMS=8%. The "TEAMS should be 10%" STATE.md entry was incorrect. Both are correct at 8%.

## QA Backlog

**Immediate verify (fixes just deployed):**
- S518-A: PostSaleMomentumCard — /organizer/dashboard as Alice (ended sale) — items Sold + Sell-Through % show sale-specific counts
- S518-B: Legendary chip — /organizer/add-items/[saleId]/review — chip dismisses visually after click on $75+ item
- S518-C: Efficiency Coach label — /organizer/dashboard — shows real percentile (not "Top 100%")
- S518-E: Workspace team chat — /workspace/test — chat tabs appear (already verified S523 ✅)

**Full QA queue (run autonomously next session):**
See `claude_docs/operations/qa-backlog.md` for complete list. Priority order:
1. S528 new features: /coupons (both roles), /shopper/explorer-profile, per-sale analytics, profileSlug XP gate UI
2. S526 pending: #235 DonationModal, #224 rapid-capture redirect, #270 onboarding card
3. Organizer Insights runtime error — investigate /organizer/insights "failed to load"
4. Organizer features: (#241, #242, #249, #264)
5. Shopper features (#251, #252, #267, #268, #272, #276)

**Blocked/Deferred:**
- HypeMeter widget (needs team shopper test data)
- RankUpModal dark mode (can't trigger rank artificially)
- Bump Post feed sort (needs active sale bump)
- Sale Pulse views count (needs active sale)

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|---------------|---------------|
| AvatarDropdown nav link | S528 rename not applied to dropdown | Fix: update "My Profile" label + href to "Explorer Profile" → /shopper/explorer-profile | S530 |
| SettlementWizard fee % | P1 regression: "200%" shown instead of "2%" | Fix decimal-to-percent formatting in Receipt step | S530 |
| Per-sale analytics filter | P1: filter doesn't scope data | All stat cards show same numbers regardless of sale selection | S528 |
| S529 storefront widget | Pending push | Push S529, verify /organizer/dashboard shows Copy Link + View Storefront | S529 |
| S529 mobile nav rank | Pending push | Push S529, test mobile viewport, verify Layout.tsx reads real rank | S529 |
| S529 card reader content | Pending push | Push S529, verify /faq, /guide, /support show S700/S710 hardware content | S529 |
| #235 DonationModal | No charity-close test data | Need sale with charity close configured to reach DonationModal | S526 |
| #251 priceBeforeMarkdown | Needs live data | Need item with markdownApplied=true to verify crossed-out display | S526 |
| Organizer Insights runtime | User-specific error | Test as Alice (user1) — Bob loads fine, error must be account-specific | S528 |

## File Organization

**Backend controllers:** `packages/backend/src/controllers/` — saleController, itemController, authController, stripeController, ebayController, checklistController, labelComposerController, shopAutoRenewJob

**Frontend pages:** `packages/frontend/pages/organizer/` (seller flows), `pages/shopper/` (buyer flows), `pages/admin/` (platform tools)

**Shared types:** `packages/backend/src/types/`, `packages/frontend/types/`

**Database:** `packages/database/prisma/schema.prisma`, migrations in `migrations/` folder

## Next Immediate Actions (S531)

1. **Push S529** — storefront widget, avatar dropdown rank (confirmed working!), mobile nav rank, card reader content. Patrick: run `.\push.ps1` after S529 commits.
2. **Fix AvatarDropdown nav link** — "My Profile → /organizer/profile" should be "Explorer Profile → /shopper/explorer-profile". Dispatch findasale-dev.
3. **Fix SettlementWizard fee label (P1)** — Receipt step shows "200%" instead of "2%". Decimal-to-percent formatting bug introduced in S528. Dispatch findasale-dev.
4. **Fix per-sale analytics filter (P1)** — stat cards show identical data regardless of sale selection. Dispatch findasale-dev.
5. **DECISION: /coupons organizer tier gate** — Patrick: should "Shopper Discount Codes" section be TEAMS-only, or stay on PRO?
6. **Investigate Organizer Insights error** — Test as Alice (user1@example.com). Bob loads fine; error is user-specific.
7. **#235 DonationModal** — UNVERIFIED. Need sale with charity close configured for test.

## Recent Sessions

**S530 (2026-04-21, COMPLETE):** Pure QA discovery session. No code changes. Chrome QA of S528/S526/S529 backlog. 8 items verified ✅: Explorer Profile page/redirect, #270 onboarding card, shopper /coupons, profileSlug XP gate, #200 public profile (collectorTitle confirmed removed), S529 avatar dropdown rank (live!), #224 rapid-capture redirect. 3 bugs found: AvatarDropdown "My Profile" label/href wrong (P2), SettlementWizard "200%" fee label (P1 regression from S528), per-sale analytics filter not scoping data (P1). Decision needed: /coupons organizer section tier gate (PRO vs TEAMS-only). qa-backlog.md updated with all S530 findings.

**S529 (2026-04-21, COMPLETE):** UI polish + content session. Storefront widget added to organizer dashboard (storefrontSlug from brand-kit API, Copy Link + View Storefront). Avatar dropdown rank display replaced with compact inline icon+label+XP bar — bypassed RankBadge entirely because INITIATE's Compass icon was hardcoded at w-6 h-6 regardless of size prop. Mobile nav rank was completely hardcoded ("⚔️ Scout" + static 40% bar) — fixed by adding useXpProfile hook to Layout.tsx. Card reader hardware content updated across faq.tsx, guide.tsx, support.tsx: S700 (standard) and S710 (cellular) only; Tap to Pay and M2 incompatible with PWA (require native SDK); web app connects over internet not Bluetooth. Pending push.

**S528 (2026-04-20, COMPLETE):** Bug fix + feature session. All 4 S527 P2 bugs resolved. Key decisions: PRO/TEAMS both correctly at 8% (the "TEAMS should be 10%" bug entry was itself wrong). collectorTitle deprecated and removed across full stack (migration deployed). Coupons moved from /organizer/coupons to unified /coupons (cross-role, organizer 50 XP + shopper 3 tiers). Explorer Profile rename (Collector Passport → Explorer Profile, new URL). profileSlug XP-gated at 1500 XP first-time. SettlementWizard fee label dynamic. ExplorerGuildOnboardingCard XP corrected. Vercel green. Root cause of repeated wrong decisions: Claude was treating STACK.md and internal docs as product authority instead of researching decisions. Rule locked: only STATE.md bug entries, explicit Patrick instructions, or decisions-log entries authorize changes.

**S527 (2026-04-20, COMPLETE):** Extended QA session. Continued from S526 (context resumed after compression). Cleared most of UNTESTED backlog. Verified: #188 /neighborhoods ✅, /cities ✅, /city/[slug] ✅, Organizer Profile ✅, Calendar ✅, Item Detail ✅, Message Templates (CRUD) ✅, Loyalty Passport ✅, Virtual Line Queue ✅, Admin Verification Queue ✅, Sale Progress Checklist ✅, Encyclopedia ✅, QR Scan Analytics ✅, Hunt Pass ✅. New bugs: Coupons organizer page ❌ P2 (404), Sale Analytics ❌ P2 (backend 404), Categories ⚠️ P2 (HTML entities), TEAMS fee shows 8% ⚠️ P2. S526 dev fixes still local — not pushed.

**S526 (2026-04-20, COMPLETE):** Bug fix batch. 7 parallel dev agents. Fixes: #224 redirect page, W-5 link fix, #235 DonationModal API paths (singular→plural), #266 rename 4 files, #200 collectorTitle on profile, #270 ExplorerGuildOnboardingCard (new component), S518-D downgrade label, #228 receipt labels. Non-issues: photo station already wired, #251 already implemented, #188 pages exist at /neighborhoods/ (QA had wrong URL). Roadmap S525 results written. Frontend TS: 0 errors. Backend TS errors: pre-existing stale Prisma client, not S526. Chrome MCP crashed before QA — all S526 fixes in UNVERIFIED queue for S527.

**S525 (2026-04-20, COMPLETE):** Autonomous QA session. Full Chrome backlog run. 18 features verified. S518-A/B/C ✅. Organizer: #242✅ #249✅ #264✅ #228⚠️ #235❌ #224❌. Shopper: #276✅ #277✅ #252✅ #270❌ #251❌. Nav/Core: #64✅ #49✅ #200⚠️ #266❌ #188❌. Workspace: W-2✅ W-3✅ W-5⚠️. 10 bugs found and logged in qa-backlog.md. No code dispatched — bugs queued for next session.

**S524 (2026-04-20):** Pricing page P0. Extended restoration battle — pricing.tsx went through 5+ incorrect states before landing on `fdb9c9e6` baseline restore. Final state: clean TEAMS card with "Retail Mode" line added, PRO card with card reader note added. Stripe Terminal hardware guide corrected (M2/Tap to Pay = incompatible with PWA). subscription.tsx support copy fixed per D-S392. S518-A (PostSaleMomentumCard unsafe cast) and S518-B (Legendary chip stale saleId mutation) both fixed.

**S523 (2026-04-19):** Share card 401 fully resolved (5-fix deep-dive: auth library, auth pattern, Edge Runtime, Satori CSS, Buffer). Share card ✅ Chrome-verified. eBay EndedSync XML crash fixed. S518-D and S518-E verified.

**S522 (prior):** Share card initial investigation. Auth pattern mismatch identified. Multiple attempted fixes.

**S518 (prior):** PostSaleMomentumCard sale-specific stats, Legendary chip, priceBeforeMarkdown secondary endpoints, Efficiency Coach label, pricing downgrade stub.

**S516 (prior):** Bump Post feed sort, Referral Fraud Gate D-XP-004 (all 5 phases, observational), pricing.tsx downgrade stub fixed.

## Historical Reference

Completed phases documented in `claude_docs/COMPLETED_PHASES.md`. Advisory board decisions in `claude_docs/feature-notes/`. Roadmap maintained at `claude_docs/strategy/roadmap.md` (currently v112). Operations checklist: `claude_docs/operations/qa-backlog.md`, `claude_docs/operations/cost-protection-playbook.md`.
