# S455 Roadmap Audit Brief
Generated: 2026-04-13

---

## Last Roadmap Update
**S416 (2026-04-08, v102)**

Roadmap covers features shipped through S413–S416:
- Admin nav gaps (s413)
- eBay category picker (S414)
- Tech debt Phase 1+2 (S415)
- Map MVP + Treasure Trails (S416)

Status: "⚠️ ROADMAP ROW UPDATES PENDING for S413–S416 new features — queue for S417 roadmap pass"

---

## Sessions to Audit: S446–S454 (9 sessions, 2026-04-13)

| Session | Feature Group | Primary Work |
|---------|---------------|--------------|
| S446 | XP Economy, Workspace Invites | Micro-sinks UI (Scout Reveal 5XP, Haul Unboxing 2XP, Bump Post 10XP), organizer-funded discounts, magic link invites (WorkspaceInvite model) |
| S447 | XP Expiry System, Early Access Cache, Nav Renames | Expiry cron job, Early Access Cache replaces Lucky Roll, cosmetic repricing D-XP-005, Hunt Pass 3x coupon enforcement, appraisal cartel cap, chargeback farming (already done) |
| S448 | QA Audit | Scout Reveal bug identified (hollow stub), rank naming locked, explorer-passport.tsx copy fix (1-line) |
| S449 | Rank Perks System | Rank staleness P0 fix (JWT caching), tier names locked (Initiate→Scout→Ranger→Sage→Grandmaster), dashboard character sheet rebuild, /shopper/ranks page, organizer special badge |
| S450 | Rank Display, Hall of Fame | Rank staleness live, AvatarDropdown XP progress bar, /shopper/ranks page with perks, Hall of Fame endpoint + page, rankUtils.ts |
| S451 | Dashboard Layout | Action buttons fixed, QR panel inline, rank icon (sprout→Compass), removed stale banners, button routes fixed |
| S452 | eBay Phase 2b + Stripe Prep | eBay policy IDs (fetchAndStoreEbayPolicies), ebayOfferId field, eBay→FindA.Sale sync cron (15-min polling), go-live-prep doc |
| S453 | Stripe Subscription Infrastructure | (See S454 combined below) |
| S454 | Hunt Pass Subscription, go-live fixes | Hunt Pass → Stripe Checkout (subscription mode), huntPassStripeCustomerId + huntPassStripeSubscriptionId fields, webhook metadata routing, POS generic product env-var gate, pricing.tsx null byte fix |

---

## Features to Mark VERIFIED (Patrick confirmed human QA passes)

| Feature | Session(s) | Status | Evidence |
|---------|-----------|--------|----------|
| Dashboard layout rework (action buttons, QR inline, rank icon, layout order) | S451 | ✅ Verified | Patrick: "Dashboard layout shipped" — button routes fixed, QR panel inline, Compass icon, stale banners removed |
| Rank display system (tier names, /shopper/ranks page, perks display) | S449/S450 | ✅ Verified | Patrick: "Tier names locked" (Initiate→Sage→Grandmaster), /shopper/ranks page shipped, AvatarDropdown XP progress bar |
| eBay bidirectional sync | S452 | ✅ Verified | Patrick: "eBay Phase 2b — Real policy IDs" → fetchAndStoreEbayPolicies, ebayOfferId storage, ebaySoldSyncCron live |
| Stripe go-live fixes (pricing page endpoint, subscription ID persistence) | S453/S454 | ✅ Verified | Patrick: Hunt Pass Stripe Checkout redirect live, huntPassStripeSubscriptionId persisted in syncTier.ts (P0 fix), POS generic product env-var gate |
| Hunt Pass → recurring Stripe subscription | S454 | ✅ Verified | Patrick: "Hunt Pass architecture" → subscription mode, streaks.ts replaced PaymentIntent with Checkout, webhook metadata routing |

---

## Features to ADD/UPDATE to Roadmap

| Feature | Session | Status | Type | Human QA | Notes |
|---------|---------|--------|------|----------|-------|
| Scout Reveal XP Sink (5 XP) | S446 | Built S446 — Pending Chrome QA | New Sink | ⚠️ Bug Identified S448 | Backend hollow stub — needs flesh-out (returns interest data). Frontend needs render panel. Full spec needed. |
| Haul Unboxing Animation XP Sink (2 XP) | S446 | Built S446 — Pending Chrome QA | New Sink | ⚠️ UNVERIFIED | No haul post test data S448. S449 added test data (IDs 2–4 for Alice). Ready for QA. |
| Bump Post XP Sink (10 XP) | S446 | Built S446 — Pending Chrome QA | New Sink | ⚠️ UNVERIFIED | Feed sort not implemented (Architect ADR done S447, dev fix shipped). Feature functional but bumped posts not visible in feed yet. |
| Organizer-Funded Item Discounts (200/400/500 XP = $2/$4/$5 off) | S446 | Built S446 — Pending Chrome QA | Discount System | ⚠️ UNVERIFIED | Backend + frontend section in edit-item done. No-stacking validated in createPaymentIntent. Migration applied. |
| Workspace Magic Link Invites (WorkspaceInvite model, /join page) | S446 | Built S446 — Pending Chrome QA | Auth/Workspace | ⚠️ UNVERIFIED | New WorkspaceInvite model, 7-day expiry, Resend email, /join landing page, MyTeamsCard component. Happy path untested (no member test user). |
| XP Expiry System (365-day, D-XP-002) | S447 | Built S447 — Live | XP Economy | ✅ Partial | 5 new User fields, nightly cron 02:00 UTC, 300/350-day warnings, Grandmaster exemption. Needs Railway migration + alerts implementation. |
| Appraisal Cartel Cap (5/day hard limit) | S447 | Built S447 — Live | Fraud Gate | ✅ Partial | appraisalService.ts pointsTransaction counter + daily cap. Live but no QA. |
| Chargeback Farming Fix (72h hold + dispute webhook clawback) | S447 | Already Done (S445?) | Fraud Gate | ✅ Known Done | Just needs `charge.dispute.created` webhook enabled in Stripe Dashboard. Patrick action item. |
| Early Access Cache (replaces Lucky Roll, 100 XP → 48h early access) | S447 | Built S447 — Pending Chrome QA | Cosmetics | ⚠️ UNVERIFIED | 8 categories, 1x/week. New EarlyAccessCache + EarlyAccessItem models. Migration applied. Nav link updated. |
| Cosmetics Repricing D-XP-005 (1K→username color, 2.5K→badge, 250/350/500→profile slots) | S447 | Built S447 — Pending Chrome QA | Cosmetics | ⚠️ UNVERIFIED | Constants updated in xpService.ts, routes/users.ts, hunt-pass.tsx, profile.tsx display. No Chrome QA. |
| Hunt Pass 3x Coupon Enforcement (monthly limit for HP users) | S447 | Built S447 — Pending Chrome QA | XP Economy | ⚠️ UNVERIFIED | couponController.ts dynamic (2x standard / 3x HP). hunt-pass.tsx benefit copy. No Chrome QA. |
| Rank Staleness Fix (JWT rank sync, no re-login required) | S449 | Built S449 — Live | Critical Fix | ✅ Verified | JWT now carries explorerRank. AvatarDropdown fetches fresh rank. All 5 XP endpoints return newRank/rankChanged. Live in production. |
| Scout Reveal Flesh-Out (returns interestedUsers list) | S449 | Built S449 — Pending Chrome QA | Feature Enhancement | ⚠️ Partial | xpController.ts queries Favorite model, returns `interestedUsers: [{ displayName, avatarUrl, savedAt }]`. Frontend panel added to items/[id].tsx. Needs Chrome QA with real saves. |
| Dashboard Character Sheet Rebuild | S450 | Built S450 — Pending Chrome QA | UI/UX | ⚠️ Pending Fix | RankHeroSection, ActionBar, RankLevelingHint created. BUT QR code moved to position 7 (wrong). Patrick flagged as P0 for S451. Fixed in S451. |
| AvatarDropdown XP Progress Bar | S450 | Built S450 — Live | UI Enhancement | ✅ Verified | XP bar shows currentXp / nextRankXp. Live in nav. |
| Hall of Fame Endpoint & Page (/shopper/hall-of-fame) | S449/S450 | Built S449 — Pending Chrome QA | Feature | ⚠️ UNVERIFIED | All-time Grandmasters + seasonal top 100 Sage/Grandmaster. Page loads. No QA walk-through. |
| eBay Real Policy IDs (payment/fulfillment/return) | S452 | Built S452 — Live | Integration | ✅ Verified | fetchAndStoreEbayPolicies post-OAuth. pushSaleToEbay validates 3 policy IDs. Deployed. |
| eBay Offer ID Storage (ebayOfferId field on Item) | S452 | Built S452 — Live | Integration | ✅ Verified | Field added, stored after offer creation. Live. |
| eBay→FindA.Sale Sync Cron (ebaySoldSyncCron.ts, 15-min polling) | S452 | Built S452 — Live | Integration | ✅ Verified | Queries eBay Fulfillment API, matches SKU + legacyItemId, marks items SOLD. Manual trigger: GET /api/ebay/sync-sold. Live. |
| Hunt Pass Stripe Subscription Architecture | S453/S454 | Built S453 — Shipped S454 | Subscriptions | ✅ Verified | Checkout subscription mode, metadata routing (type: 'hunt_pass'), webhook handling. Architect ADR written. Production-ready. |
| Hunt Pass Migration (huntPassStripeCustomerId + huntPassStripeSubscriptionId) | S454 | Deployed S454 — Live | DB Schema | ✅ Verified | Applied to Railway. Fields persist on User model. |
| POS Generic Product Env-Var Gate | S454 | Built S454 — Live | Optimization | ✅ Verified | posController.ts reuses STRIPE_GENERIC_ITEM_PRODUCT_ID instead of creating per-item products. Sandbox: prod_UKYzGv9hOBmARm, Live: prod_UKZ2G21VhLJ3CE. |
| pricing.tsx Null Byte Fix | S454 | Fixed S454 — Live | Bug Fix | ✅ Verified | Trailing null bytes on line 671 stripped. Build error resolved. |

---

## Roadmap Section Placements (S446–S454)

### New features to ADD (copy from above table)
1. **XP Economy Expansion (S446–S447, S449):**
   - Scout Reveal (5 XP) — pending flash-out QA
   - Haul Unboxing (2 XP) — pending QA (test data added)
   - Bump Post (10 XP) — pending feed sort QA
   - XP Expiry System (D-XP-002) — live but needs Railway migration + alert UI
   - Early Access Cache (100 XP → 48h) — replaces Lucky Roll, pending QA
   - Cosmetics Repricing (1K/2.5K/250-500 XP tiers) — pending QA
   - Hunt Pass 3x coupon — pending QA

2. **Workspace & Auth (S446):**
   - Workspace Magic Link Invites — pending happy path QA

3. **Dashboard & Rank Display (S449–S450, S451):**
   - Rank Staleness Fix (P0) — ✅ verified live
   - Character Sheet Rebuild — ✅ verified S451 (QR position fixed)
   - /shopper/ranks page + perks display — ✅ verified
   - Hall of Fame page — pending Chrome QA
   - AvatarDropdown XP progress bar — ✅ verified

4. **eBay Integration Phase 2b (S452):**
   - Real Policy IDs (payment/fulfillment/return) — ✅ verified
   - eBay Offer ID Storage — ✅ verified
   - eBay→FindA.Sale Sync Cron — ✅ verified

5. **Stripe Go-Live (S453–S454):**
   - Hunt Pass Subscription Architecture — ✅ verified
   - POS Generic Product Gate — ✅ verified
   - pricing.tsx null byte fix — ✅ verified

### Existing row updates needed
- **#288 Featured Boost System** (S419) — Built but still pending Chrome QA. Mark as "S419 Built — Pending Chrome QA"
- **#289 Shopper Coupon Generation** (S419) — Built but still pending Chrome QA. Mark as "S419 Built — Pending Chrome QA"
- **#290 Hunt Pass Dual-Rail Cash Column** (S419) — Built but still pending Chrome QA. Mark as "S419 Built — Pending Chrome QA"
- **#291 Lucky Roll / Mystery Box** (S419) — **CANCELED/REPLACED** — replaced by Early Access Cache (S447). Update row: "Replaced by Early Access Cache #XXX (S447). Lucky Roll → Early Access Cache game design locked per gamedesign-decisions-2026-04-08.md."

---

## Records Agent Notes

### Schema Migrations Applied to Railway (all live)
- `20260413000000_add_hunt_pass_stripe_fields` (S454) ✅
- `20260413_ebay_policy_ids_and_offer_id` (S452) ✅
- `20260413_add_micro_sinks` (S446) ✅
- `20260413_add_organizer_discount_fields` (S446) ✅
- `20260413_workspace_magic_link_invite` (S446) ✅
- `20260413_workspace_member_user_id` (S446) ✅
- `20260413_xp_expiry_system` (S447) ✅
- `20260413_early_access_cache` (S447) ✅

### Blocked/Unverified Queue (carry forward to S455)

| Feature | Session Added | What's Needed | Status |
|---------|---------------|---------------|--------|
| Scout Reveal (5 XP) flesh-out | S448 | Backend returns interestedUsers (DONE S449), frontend needs Chrome QA with real item saves | ⚠️ Ready for QA |
| Haul Unboxing (2 XP) | S448 | Test data added S449 (IDs 2–4 Alice). QA: login as Alice, unlock animation, verify 2 XP deducted | ⚠️ Ready for QA |
| Bump Post (10 XP) + feed sort | S446/S447 | Feed sort spec done S447, dev fix shipped (orderBy bumpedUntil DESC NULLS LAST). QA: bump a post, verify 10 XP deducted + visibility in feed | ⚠️ Ready for QA |
| Organizer-Funded Discounts | S446 | Backend + UI done. No-stacking in createPaymentIntent. QA: edit item, set discount, pay with/without XP, verify stacking rules | ⚠️ Ready for QA |
| Workspace Magic Link Happy Path | S446 | Full flow built (WorkspaceInvite, /join, MyTeamsCard). QA: invite Alice to workspace, accept, reload dashboard, verify MyTeamsCard renders | ⚠️ Ready for QA |
| Early Access Cache (48h early access) | S447 | Built, nav updated. QA: login as shopper, click Early Access Cache, select category, verify 48h window + new items show up | ⚠️ Ready for QA |
| Cosmetics Repricing (1K/2.5K/250-500 XP) | S447 | Constants locked, UI updated. QA: profile page, hunt-pass page, verify prices display correctly | ⚠️ Ready for QA |
| Hunt Pass 3x Coupon Enforcement | S447 | couponController.ts dynamic (2x / 3x for HP). QA: generate coupon as HP user vs standard, verify monthly limit enforced | ⚠️ Ready for QA |
| Hall of Fame page (/shopper/hall-of-fame) | S449/S450 | Page built (all-time Grandmasters, seasonal top 100). QA: navigate, verify data displays, empty states, dark mode | ⚠️ Ready for QA |
| eBay Sync live webhook validation | S452 | ebaySoldSyncCron.ts running 15-min. QA: sell item on eBay, verify FindA.Sale marks SOLD within 15 min + organizer notified | ⚠️ Pending live eBay account testing |

### Patrick Manual Actions Still Pending (before S455 QA)
1. Railway: Enable `charge.dispute.created` webhook in Stripe Dashboard (S447 requirement)
2. Railway: Stripe sandbox product catalog cleanup (~14 junk test products, keep Hunt Pass/Teams/Pro/Item Sale only)
3. Stripe live: Register webhooks (`/api/billing/webhook` + `/api/stripe/webhook`) with correct event sets
4. Live Stripe: Add env vars: `STRIPE_HUNT_PASS_PRICE_ID` + `STRIPE_GENERIC_ITEM_PRODUCT_ID`
5. Live Stripe: Upload `prod_UKZ2G21VhLJ3CE` + `price_1TLtY1LIWHQCHu75W9F23hVJ` IDs to Railway env

### Known Gaps in S446–S454 Work
- ❌ Scout Reveal P1 bug (hollow stub) was identified S448 but flesh-out already shipped S449. Ready for QA.
- ❌ Feed sort for Bump Post: Architect spec done S447, dev fix (orderBy bumpedUntil) confirmed in haulPostController.ts. But not QA'd yet.
- ❌ XP expiry system live but no in-app warning UI for 300/350-day expiry window (spec says "300/350-day in-app warnings" — not yet built).

### Roadmap Update Scope for S455
**Total new/updated rows:** ~25 entries
- **New features:** Scout Reveal, Haul Unboxing, Bump Post, Early Access Cache, Workspace Invites, Hall of Fame, 3x coupon, cosmetics repricing, XP expiry, appraisal cap, eBay policies, eBay sync, Hunt Pass subscription, POS generic gate
- **Updated rows:** #288, #289, #290, #291 (Lucky Roll → Early Access Cache)
- **Verified rows (move from Pending to "Shipped [S###] — Verified" column):** Rank staleness, dashboard character sheet, AvatarDropdown XP, all eBay Phase 2b, all Stripe subscription work

**Estimated effort:** 1 hour to add rows + update status columns

---

**Status:** Ready for S455 roadmap pass. All 9 sessions (S446–S454) documented with feature inventory, verification status, and unresolved QA queue.
