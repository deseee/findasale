# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

**S519 (2026-04-19) — Morning Briefing feature + workspace dashboard fixes**

Built the full Morning Briefing day-of-sale view and fixed workspace dashboard issues.

**Morning Briefing (Feature #236):**
- Schema: SaleAssignment + PrepTask models, cashFloat on Sale
- Backend: briefing detection endpoint (12h window around startDate), real-time socket events for prep check-offs and team status updates, auto-populate SaleAssignment from workspace TeamMembers
- Frontend: full responsive MorningBriefing.tsx (mobile single-scroll with chat sheet, desktop two-column with persistent chat panel), dark mode, weather vitals, team role display, prep task creation UI, briefing/dashboard view toggle
- PrepTask syncs back to SaleChecklist via optional checklistItemId link

**Workspace dashboard fixes:**
- Team member names: `getPublicWorkspace` was returning bare member IDs (`members: true`). Added explicit select with organizer/user relations so names display properly instead of "Team Member" with "?" avatars
- Workspace info card: moved entire card (name, description, stats, settings button) from top of page to below Quick Actions per Patrick request
- React hooks crash fix: `forceDashboard` useState was after early returns, moved above them

**Vercel deployment note:** Latest deploy was stuck in INITIALIZING state. Patrick may need to push a trivial commit to trigger fresh build.

**Files changed:**
- `packages/backend/src/controllers/briefingController.ts` (NEW)
- `packages/backend/src/routes/workspace.ts` (briefing routes added)
- `packages/frontend/components/MorningBriefing.tsx` (NEW)
- `packages/frontend/components/WeatherStrip.tsx` (NEW)
- `packages/frontend/pages/workspace/[slug].tsx` (briefing integration + dashboard fixes + card reorder)
- `packages/backend/src/controllers/workspaceController.ts` (member relations in getPublicWorkspace)
- `packages/database/prisma/schema.prisma` (SaleAssignment, PrepTask, cashFloat)
- `packages/database/prisma/migrations/` (briefing migration)

---

**S518 (2026-04-19) — P1/P2/P3 bug fixes: PostSaleMomentumCard revenue, Legendary chip, priceBeforeMarkdown, Efficiency Coach label, pricing stub**

Four parallel dev dispatches completed:

- **P1 #234 PostSaleMomentumCard revenue (Agent A):** `dashboard.tsx` lines 65–76 (Sale interface `items` property added) + lines 1497–1499 (items sold + total now derived from `mostRecentEnded.items` array instead of global lifetime stats). Revenue was already correct (`statsData.revenue.mostRecentEndedSale`).
- **P2 Legendary chip dismissal (Agent B):** `itemController.ts` getDraftItemsBySaleId SELECT — added `isLegendary: true` and `legendaryPublishedAt: true`. Chip refetch now returns updated field, dismisses correctly after click.
- **P3 priceBeforeMarkdown secondary endpoints (Agent B):** `itemController.ts` — added `priceBeforeMarkdown: true` and `markdownApplied: true` to getDraftItemsBySaleId, getInspirationItems, and getRareFindsItems SELECT clauses.
- **P3 Efficiency Coach "Top 100%" label (Agent C):** `EfficiencyCoachingWidget.tsx` line 51 — `Top {100 - data.percentileRank}%` → `Top {data.percentileRank}%`. Old formula was inverted (showing "Top 100%" when beat 0% of organizers). Now correctly reflects percentile rank.
- **P3 pricing.tsx Downgrade stub (Agent C):** `pricing.tsx` lines 137–150 — stub `return;` replaced with `router.push('/organizer/subscription')`. Proper downgrade flow is on subscription page.

**Chrome QA (S518):**
- ✅ Ripples page — no crash (S517 hooks fix confirmed deployed). Sales list populates, activity trend chart renders (Grace: Downtown Downsizing Sale 17 + Lakefront Estate Sale 7).
- ✅ Sale Complete card — $900 (sale-specific, not lifetime $1,279). Revenue fix confirmed working.
- ⚠️ Sale Pulse vs Ripples views count — Grace has no active sale (State 3 only), Sale Pulse widget not shown. Cannot compare. S516 routes fix is code-confirmed (reads SaleRipple same as Ripples page). Re-verify next session with active sale.
- ⚠️ UNVERIFIED — Efficiency Coach label change not yet deployed (needs push). Will confirm next session.

**Workspace bug fix (S518b):**
- **Team Communications empty state:** `workspace/[slug].tsx` lines 468, 472 — condition was checking `workspace.upcomingSales` only; test workspace had only past/ended sales. Changed to `allSales` (same array already used by Tasks dropdown). Chat tabs now render for all sales.
- **Tasks vs. Checklist:** Separate by design but integration IS needed. Workspace Tasks = freeform team assignment. Sale Progress Tracker = /organizer/plan/[saleId]. Patrick pushed back on "no integration needed" — a team running a live sale needs checklist status visible from the workspace without leaving it. **Workspace × Sale Command integration is a planned feature (see Next Session).**

**QA backlog created:** `claude_docs/operations/qa-backlog.md` — full structured queue with Hot/Unverified/Workspace/Feature sections.

**Workspace × Sale Command — design session (S518 tail):**
Patrick rejected "no integration needed" and asked for creative UX thinking. Claude Design prompt written (ready to paste into Claude Design tool). The brief: it's 7am Saturday, 3 crew members arriving, organizer pulls up workspace on phone — current page reads like a settings dashboard, not a war room. Prompt asks Claude Design to redesign around the day-of operational moment: sale stage front and center, checklist progress visible at a glance, team ownership surfaced, chat in one thumb reach. **UX spec and dev dispatch pending — blocked on Claude Design output first.**

**Files changed (S518):**
- `packages/frontend/pages/organizer/dashboard.tsx`
- `packages/backend/src/controllers/itemController.ts`
- `packages/frontend/components/EfficiencyCoachingWidget.tsx`
- `packages/frontend/pages/pricing.tsx`
- `packages/frontend/pages/workspace/[slug].tsx` (workspace chat empty state fix)
- `claude_docs/operations/qa-backlog.md` (NEW)

---

**S516 (2026-04-19) — Bump Post, Referral Fraud Gate, Legendary auto-suggest, polish + QA pass**

Session dispatches shipped:
- **Sale Pulse views P2:** `routes/organizers.ts` — was reading deprecated `qrScanCount`, now reads `SaleRipple` table (same source as Ripples page)
- **SharePromoteModal hashtags:** Dynamic per sale type + `#findasale` on all. Also fixed threads/nextdoor hardcoded "estate sale" strings.
- **Dashboard SIMPLE upgrade copy:** Removed "Command Center" from PRO feature list on SIMPLE card
- **RankUpModal:** Removed 8-second auto-dismiss timer — modal now requires explicit close. Dark mode already correct.
- **Legendary auto-suggest:** Amber banner on edit-item when price ≥$75 + "⭐ Legendary?" chip on review page. Manual toggle preserved, prompt drives adoption.
- **Bump Post feed sort:** `discoveryService.ts` — ACTIVE SALE_BUMP boosts get +500 score in both anon and logged-in paths. Floats above all organic (max organic ~85).
- **Referral Fraud Gate D-XP-004 (all 5 phases, observational):**
  - Phase 1: Schema — `ReferralReward` fraud fields + new `ReferralFraudSignal` model + migration `20260419000002_referral_fraud_gate`
  - Phase 2: Self-referral gate in `authController.ts` — silently skips own-code referrals
  - Phase 3: `referralFraudService.ts` (new) — device abuse + velocity scoring. `FRAUD_GATE_ACTIVE = false` (observational only)
  - Phase 4: Account age gate in `stripeController.ts` + daily `referralRewardAgeGateJob.ts` cron
  - Phase 5: Admin review endpoints in `referralController.ts` + `routes/admin.ts`
- **pricing.tsx Downgrade stub fixed:** DowngradePreviewModal now properly wired with preview API + confirm flow
- **Stripe Connect webhook:** Patrick confirmed `STRIPE_CONNECT_WEBHOOK_SECRET` added to Railway — items now mark SOLD after card POS payment (P2 resolved since S421)
- **Advisory Board:** Legendary design — manual + $75 auto-suggest (9+1/3 abstain/0 against)
- **Architect ADR:** Bump Post feed sort — Option A approved

**Migration run:** `20260419000002_referral_fraud_gate` ✅ applied to Railway

**Chrome QA results (S516 — completed S517):**
- ✅ Dashboard SIMPLE upgrade card — "Command Center" removed. Copy: "500+ items per sale • Advanced analytics • Brand Kit"
- ✅ Post-Sale Momentum — $900 showing (sale-specific, not lifetime). CTAs present.
- ✅ SharePromoteModal hashtags — `getHashtagsForSaleType()` live. Estate→`#estatesale #garagesale #findasale`, 6 sale types covered + default.
- ✅ Legendary amber banner (edit-item) — renders at ≥$75 items. "Mark as Legendary" button dismisses banner and checks the toggle. Confirmed via ref-click.
- ⚠️ Legendary chip (review page) — chip renders for all 14 high-value items. Mutation fires on click (GET re-fetch observed via onSuccess invalidation). Chip does NOT dismiss visually after click. Backend accepts `isLegendary` (line 662 in itemController). Possible: GET `/items/drafts` response missing updated field, or early seeder data. P2 — flag for investigation.
- ❌ P1 NEW BUG — Ripples page: React error #310 (hooks called after conditional returns). Entire `/organizer/ripples` page crashes. **Fixed in `ripples.tsx` (S517) — hooks reordered, `enabled` guards added. Needs push.**
- ⚠️ UNVERIFIED — RankUpModal dark mode + no auto-dismiss: can't trigger rank-up artificially in QA.
- ⚠️ UNVERIFIED — Pricing downgrade flow (pricing.tsx): Grace is SIMPLE, can't test downgrade.
- ⚠️ UNVERIFIED — Bump Post boosted feed sort: needs active SALE_BUMP boost to verify +500 score.
- ⚠️ UNVERIFIED — Sale Pulse vs Ripples views count: Ripples page was broken during QA. Fix now shipped; re-test next session.

**Files changed (S516 + S517 Ripples fix):**
- `packages/backend/src/routes/organizers.ts`
- `packages/frontend/components/SharePromoteModal.tsx`
- `packages/frontend/pages/organizer/dashboard.tsx`
- `packages/frontend/components/RankUpModal.tsx`
- `packages/frontend/pages/organizer/edit-item/[id].tsx`
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx`
- `packages/backend/src/services/discoveryService.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260419000002_referral_fraud_gate/migration.sql` (NEW)
- `packages/backend/src/controllers/authController.ts`
- `packages/backend/src/controllers/stripeController.ts`
- `packages/backend/src/controllers/referralController.ts`
- `packages/backend/src/services/referralFraudService.ts` (NEW)
- `packages/backend/src/jobs/referralRewardAgeGateJob.ts` (NEW)
- `packages/backend/src/index.ts`
- `packages/backend/src/routes/admin.ts`
- `packages/frontend/pages/pricing.tsx`
- `packages/frontend/pages/organizer/ripples.tsx` **(S517 fix — hooks reordered)**

---

**S515 (2026-04-19) — QA: dashboard widgets #230–#234, SIMPLE concurrent sales gate P1 fix**

Chrome QA pass on 5 dashboard widgets + tier gate. Roadmap updated for #230–#234 and #249.

**QA results:**
- **#249 SIMPLE concurrent sales gate:** P1 found and fixed — form was sending `lat:null` which hit Zod 400 before tier 409 check. Fixed in `create-sale.tsx` to omit null lat/lng from POST body. Amber block + "Upgrade to PRO" CTA confirmed rendering correctly (screenshot evidence).
- **#230 Who's Coming (Smart Buyer Intelligence):** ⚠️ Empty state only verified. Populated state UNVERIFIED (no shoppers on test sales).
- **#231 High-Value Item Tracker:** ✅ Empty state and DB-flagged item both verified. Item renders with thumbnail, name, price, status chip.
- **#232 Sale Pulse Widget:** ⚠️ Renders + "Boost visibility →" CTA → Ripples correctly. P2: Views count 0 in Sale Pulse but 5 in Ripples for same sale.
- **#233 Efficiency Coach:** ✅ Real data renders (compared to 14 organizers), tips expand/collapse works. P3: "Top 100%" chip label confusing.
- **#234 Post-Sale Momentum:** ⚠️ Card renders for user7 (Grace, State 3). Settle + Start Next Sale CTAs work. P1: Revenue shown is `statsData.revenue.totalLifetime` ($1,279) not sale-specific revenue ($899.53 per Settlement Hub).

**Files changed (S515):**
- `packages/frontend/pages/organizer/create-sale.tsx` — P1 lat/lng null fix
- `claude_docs/strategy/roadmap.md` — #240 Human QA ✅, #249 Chr ⚠️, #230–#234 Chr updated

**Carry-forward files (S514 — not yet pushed):**
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — Legendary toggle
- `packages/backend/src/controllers/itemController.ts` — updateItem legendary fields
- `packages/frontend/components/PriceResearchPanel.tsx` — Price Research Card redesign
- `packages/frontend/components/PriceSuggestion.tsx` — sage green button
- `packages/frontend/components/ValuationWidget.tsx` — sage green tier gate button
- `packages/frontend/components/FlashDealForm.tsx` — dark mode P2 fix
- `packages/frontend/components/ExpenseLineItemList.tsx` — dark mode P2 fix
- `packages/backend/src/controllers/earlyAccessController.ts` — req.user.id fix (P1)

---

**S514 (2026-04-19) — Legendary item toggle, Price Research Card redesign, Stripe Connect root cause**

Three parallel dev dispatches shipped:

**Legendary item flag UI (Phase 2b):**
- `edit-item/[id].tsx` — amber toggle added ("Mark as Legendary" + subtext about Sage+/Hunt Pass early access). Wired to form submit.
- `itemController.ts` — `updateItem` now reads `isLegendary`, sets `legendaryPublishedAt` on first enable. `getItemById` now selects all 3 legendary fields.

**Price Research Card redesign (per PRICE_RESEARCH_CARD_UX_SPEC.md):**
- `PriceResearchPanel.tsx` — sections reordered (AI Estimate → Smart Pricing → eBay → Sales Comps → Community Appraisal), `border-t` dividers replaced with `py-3` spacing, Smart Estimate visible in collapsed state.
- `PriceSuggestion.tsx` — sage green primary button (#4A7C59), `rounded-lg`, full-width.
- `ValuationWidget.tsx` — tier gate button updated to sage green + `rounded-lg`.

**Stripe Connect POS SOLD root cause (P2 since S421):**
- Root cause: `STRIPE_CONNECT_WEBHOOK_SECRET` env var missing on Railway. Code is correct — fallback logic exists in `stripeController.ts`. No code change needed.
- **Patrick action required:** Stripe Dashboard → Developers → Webhooks → Connect webhook endpoint → copy signing secret → add `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_[value]` to Railway env vars.

**priceBeforeMarkdown investigation:**
- Already implemented on main paths (ItemCard, InventoryItemCard, items/[id].tsx). No visible bug.
- Gap: 3 secondary endpoints (inspiration gallery, rare finds, drafts) missing the fields. P3.

**Files changed (5):**
- `packages/frontend/pages/organizer/edit-item/[id].tsx`
- `packages/backend/src/controllers/itemController.ts`
- `packages/frontend/components/PriceResearchPanel.tsx`
- `packages/frontend/components/PriceSuggestion.tsx`
- `packages/frontend/components/ValuationWidget.tsx`

---

**S513 (2026-04-19) — Early access cache items page, photo station, S505 QA + POS Run Test fix**

Built two new pages and completed S505 checklist test flow QA.

**New pages built:**
- `pages/shopper/early-access-cache/items.tsx` (NEW) — items page for active early access windows. Fetches `GET /api/early-access-cache/items`, shows item grid with category badge/emoji, title, price, "View Item" link. Auth-gated. Empty state + dark mode.
- `pages/sales/[id]/photo-station.tsx` (completed/fixed) — shopper photo station page. Auto-scan on load awards 5 XP via `POST /sales/:saleId/photo-ops/photo-station-scan`. Duplicate scan protection ("Already Scanned" state). Web Share API + clipboard fallback for share incentive.

**S505 checklist test flows QA results:**
- ✅ Online Checkout Run Test → `cs_test_...` Stripe session created, browser redirected to checkout.stripe.com
- ✅ Auction Checkout Run Test → `cs_test_...` Stripe session created, browser redirected to checkout.stripe.com
- ⚠️ In-App Payment Run Test → TestCheckoutModal opens, `test-in-app-intent` returns clientSecret (PaymentElement renders). Payment completion UNVERIFIED (cross-origin Stripe iframe — can't type card via MCP)
- ❌ POS Run Test → FIXED (see below)

**POS Run Test fix (P0):**
- Root cause: `handlePosTest` sent `{ saleId }` only; backend `POST /stripe/test-transaction` requires `saleId + amount + paymentMethod`. 400 → catch block → error toast every time.
- Fix: `plan/[saleId].tsx` line 76 — added `amount: 1, paymentMethod: 'direct'` to request body. Zero TS errors post-fix.

**Lucky Roll #291 deprecated:** Replaced by `/shopper/early-access-cache`. No Lucky Roll page exists or is needed.

**In-App Payment modal scroll fix (P1):**
- Stripe PaymentElement iframe renders taller than viewport on desktop. Modal had no max-height, so Pay button was below the fold with no way to scroll. Patrick confirmed: "can't scroll down on desktop in the stripe popup."
- Fix: `TestCheckoutModal.tsx` line 146 — added `max-h-[90vh] overflow-y-auto` to inner modal container. Patrick confirmed: "that worked."

**`live_pos` isAuto removed (Patrick explicit request):**
- `checklistController.ts` line 81: `live_pos` changed from `isAuto: true` → `isAuto: false`, `autoCheck` removed. "Auto" badge no longer shows on the POS plan task row.

**Roadmap updated to v112.**

**Files changed (7):**
- `packages/frontend/pages/shopper/early-access-cache/items.tsx` — NEW
- `packages/frontend/pages/sales/[id]/photo-station.tsx` — built/completed
- `packages/frontend/pages/organizer/plan/[saleId].tsx` — POS Run Test fix (line 76)
- `packages/frontend/components/TestCheckoutModal.tsx` — modal scroll fix
- `packages/backend/src/controllers/checklistController.ts` — live_pos isAuto: false
- `claude_docs/STATE.md`
- `claude_docs/patrick-dashboard.md`
- `claude_docs/strategy/roadmap.md` — v112, #291 deprecated, #303 and #304 added

---

**S512 (2026-04-19) — Email verification gate + QA security/tier gates + roadmap catch-up**

QA security gate verified. Email verification feature built and deployed. Roadmap updated to v111.

**QA verified this session:**
- ✅ Email verification gate (Chrome-verified): amber banner fires for new unverified organizers (qatest_s512f@test.com); existing organizers (user2/Bob S.) see NO banner
- ✅ No grace banner on user2 dashboard (correct — user2 is PRO not lapsed)
- ✅ DowngradePreviewModal renders from /organizer/subscription (38 items, correct content)
- ⚠️ pricing.tsx "Downgrade to Free" is a stub (P3 — early return with comment, no modal fires; proper flow is /organizer/subscription)

**Email verification gate built (S512):**
- `authController.ts` — `emailVerified: user.emailVerified` added to all 4 `jwt.sign` payloads (registration, OAuth, standard login, organizer-complete)
- `AuthContext.tsx` — `emailVerified?: boolean` added to User interface; `emailVerified: payload.emailVerified ?? true` added to both `setUser` calls (useEffect load path + login() fresh path). `?? true` default preserves access for existing organizers with old JWTs.
- `dashboard.tsx` — amber verification banner added after `<WorkspaceInvitationBanner />`, shown when `user?.emailVerified === false`
- `Dockerfile.production` — cache-bust updated to `2026-04-19b` to force Railway rebuild (merge conflict resolved)

**Files changed (4):**
- `packages/backend/src/controllers/authController.ts`
- `packages/frontend/components/AuthContext.tsx`
- `packages/frontend/pages/organizer/dashboard.tsx`
- `packages/backend/Dockerfile.production`

**Roadmap:** Updated to v111 — header, #300 Chrome-verified, #301 Label Sheet Composer added, #302 Email Verification Gate added.

---

**S511 (2026-04-19) — Role fixes, eBay ended-sync, QR sizing, messages padding, treasure hunt XP**

Parallel dispatch completed. All changes pushed in S511.

**Files changed (12):**
- `packages/frontend/components/BountyModal.tsx` — `role === 'ORGANIZER'` → `roles?.includes('ORGANIZER')` (P2)
- `packages/backend/src/controllers/authController.ts` — same role fix, ADMIN+ORGANIZER gets subscriptionTier in JWT (P2)
- `packages/frontend/pages/hubs/[slug].tsx` — same role fix (P3)
- `packages/frontend/components/RippleIndicator.tsx` — same role fix (P3)
- `packages/frontend/pages/access-denied.tsx` — same role fix (P3)
- `packages/backend/src/controllers/ebayController.ts` — `GetMultipleItems` (deprecated, failing silently) → individual `GetItem` calls per listing (P2)
- `packages/backend/src/jobs/ebayEndedListingsSyncCron.ts` — comment update
- `packages/backend/src/controllers/printKitController.ts` — QR sizes standardized: 4-tier hierarchy (48/110/300/500px)
- `packages/backend/src/controllers/labelComposerController.ts` — QR_SIZE_LABEL constant
- `packages/frontend/pages/messages/[id].tsx` — reply bar `py-4 pb-safe` → `pt-3 pb-6` (bar was too low)
- `packages/backend/src/services/treasureHuntService.ts` — `pointReward: 50` → `pointReward: 3` (D-XP-015)
- `packages/backend/src/routes/treasureHunt.ts` — response uses `XP_AWARDS.TREASURE_HUNT_SCAN` (3), not stale DB value; fixes existing records showing +50

**Smoke test (S510 fixes):**
- ✅ Messages reply bar: live and working (padding fixed inline this session)
- ✅ Flip report icons: amber ⚠️ warning / gray → neutral rendering correctly
- ✅ Sale type badge: ESTATE badge visible on sale pages
- ✅ S510 push confirmed in GitHub (5 commits)
- ✅ Treasure Hunt XP badge: fixed (was +50, now +3 per D-XP-015)
- ⚠️ SOLD items sort: couldn't confirm (only 1 sold item on test sale, may have been in scroll gap)
- ⚠️ HypeMeter: not rendered on Alice's dashboard (may require team shopper data)

**Note on Railway 403 logs:** `/api/pos/sessions` and `/api/pos/holds` 403s are expected — Chrome QA was browsing Lakefront Estate Sale 15 which belongs to a different organizer. Ownership check correctly blocked Alice.

---

**S510 (2026-04-19) — S509 bug queue dispatched + Feature #300 Chrome QA verified**

All P1–P3 bugs from S509 walkthrough dispatched and pushed. Feature #300 return-to-inventory fully verified end-to-end.

**Dispatched and pushed (S510):**
- `messages/[id].tsx` — reply bar padding + outgoing bubble `pr-2` (P1)
- `flipReportService.ts` — contradictory stats fixed, `Recommendation` interface with type field (P1)
- `flip-report/[saleId].tsx` — icon rendering: amber ⚠️ warning / green ✓ positive / gray → neutral (P1)
- `useFlipReport.ts` — `Recommendation` interface, `recommendations: Recommendation[]`, `gcTime` (P1+P3)
- `sales/[id].tsx` — overflow-hidden, SOLD sort to bottom, section order per D-006, sale type badge (P2)
- `HypeMeter.tsx` — avatar initials + deterministic color hash (P2)
- `dashboard.tsx` — TEAMS upsell copy, "View rank progress →" (P2)
- `map.tsx` — `pr-4` toolbar container (P3)
- `inventory.tsx` — filter-aware empty state copy (P3)
- `FilterSidebar.tsx` — dark mode label color H-001 (P3)
- `pricing.tsx` — "Up to 12 team members" D-007 (P3)
- `shopper/history.tsx` — `whitespace-nowrap` on price/status (P2)
- `trending.tsx` + `ItemCard.tsx` — dark mode placeholder (P2)
- `returnToInventoryController.ts` — P0 fix: `req.user?.id` → organizer profile lookup (correct organizerId) (P0)
- `inventory.tsx` — `role === 'ORGANIZER'` → `roles?.includes('ORGANIZER')` for ADMIN users (P2, this session)

**Feature #300 Return-to-Inventory: ✅ CHROME VERIFIED**
- Navigated to Downtown Downsizing Sale 21 flip-report as Alice (user1, ADMIN+ORGANIZER)
- Selected Cordless Leaf Blower + T7 AMR Floor Scrubber, clicked "Return 2 items to inventory"
- Success state: "✓ 2 items returned to inventory." + toast confirmed
- DB: both items `saleId=null`, `lastSaleId` set, `inInventory=true` ✅
- Backend `GET /api/item-inventory` returns both items (total: 2) when called with Alice's token ✅
- Root cause of 403 fixed: controller now looks up `organizer.id` via DB instead of using JWT User ID directly

**Note on inventory page display:** Alice's JWT primary role is `ADMIN` not `ORGANIZER`, so the inventory page query was disabled by `role === 'ORGANIZER'` check. Fixed to `roles?.includes('ORGANIZER')`. Backend is correct.

---

**S508 (2026-04-19) — Feature #300 TS repair: 3 remaining Railway build errors fixed**

After S507 shipped the nullable `Item.saleId` migration, Railway's fresh Prisma client exposed 3 TypeScript errors that the stale VM client had hidden:

- **`fraudService.ts(38)` ✅:** `saleId` nested select returns `string | null | undefined` — added `?? undefined` to collapse null, satisfying Prisma `StringFilter | undefined` type
- **`itemInventoryService.ts(151)` ✅:** `notIn: ['SOLD', 'DONATED'] as const` produced `readonly string[]` — changed to `as string[]`
- **`itemInventoryService.ts(179)` ✅:** `Notification.create` was missing required `title` field — added `title: 'Hold released'`

Railway build now clean. S507 Feature #300 is fully deployed.

**Files changed (2):**
- `packages/backend/src/services/fraudService.ts`
- `packages/backend/src/services/itemInventoryService.ts`

---

**S507 (2026-04-19) — Feature #300 Return-to-Inventory: Full implementation shipped**

- **Schema changes ✅:** `Item.saleId` → `String?`, `lastSaleId String?`, `returnedToInventoryAt DateTime?`, dropped `@@unique([saleId, sku])`
- **Migration SQL ✅:** `20260419000001_nullable_sale_id_return_to_inventory`
- **`pullFromInventory()` rewritten ✅:** MOVE pattern — one physical item = one DB record forever
- **`returnItemsToInventory()` added ✅:** ENDED-only, cancels reservations + notifies shoppers, clears waitlists, sets saleId=null/inInventory=true/lastSaleId/returnedToInventoryAt
- **FlipReport union query ✅:** Items in sale UNION returned items — complete sell-through picture
- **eBay import cleaned up ✅:** Items created with `saleId: null` directly
- **50+ TS break points fixed ✅:** 17 backend files + 2 frontend files
- **`POST /api/sales/:saleId/return-items` ✅:** New route + controller
- **`ReturnToInventoryPanel.tsx` ✅:** Pre-selection by sale type, checkbox list, select-all, success state
- **Wired into flip-report page ✅:** Renders below Recommendations, hidden from print

**Needs QA (Chrome — next session):**
- Return items flow from flip-report page end-to-end (organizer selects unsold items → confirms → items appear in inventory)
- `pullFromInventory()` moves (not copies) — pull item to a new sale, verify it disappears from inventory
- FlipReport union query — returned items show in unsold/returned count
- eBay import — confirm items created with saleId=null visible in /organizer/inventory

---

**S505 (2026-04-18) — Tests moved from POS to plan page, checklist stage reorganization**

- **Test cards removed from POS ✅:** All test state vars, handlers, JSX cards, and TestCheckoutModal render block removed from `pos.tsx`. POS is now a clean cashier workspace.
- **TestCheckoutModal built ✅:** `components/TestCheckoutModal.tsx` — real Stripe Elements form for organizers to test in-app checkout as shoppers would experience it. Uses `NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY`. Calls `POST /stripe/test-in-app-intent` on mount to get clientSecret. Shows test card hint (4242...). On success auto-checks `pre_in_app_payment`.
- **`POST /stripe/test-in-app-intent` added ✅:** Backend creates $1 PaymentIntent via test Stripe, returns clientSecret for frontend Stripe.js to confirm (not pre-confirmed server-side — tests real shopper UI flow).
- **Inline "Run Test" buttons on plan page ✅:** `plan/[saleId].tsx` now has handlers and inline amber "Run Test" buttons for `live_pos`, `pre_online_checkout`, `pre_auction_checkout`, `pre_in_app_payment`. State is DB-driven — persists across navigation. `handlePosTest` invalidates checklist query (not manual update — `live_pos` is auto).
- **Checklist stage reorganization ✅:** `pub_published` → Cataloging. `pre_online_checkout`, `pre_auction_checkout`, `pre_in_app_payment` → Live (with links to `/organizer/plan/{saleId}`). `live_internet` → Pre-Sale.
- **Checklist item reorder ✅:** Pre-Sale: `pub_preview` moved to after `live_internet`. Live: `live_queue` moved to after `live_float`.

**S505 Files changed (6):**
- `packages/frontend/pages/organizer/pos.tsx` — all test infrastructure removed
- `packages/frontend/pages/organizer/plan/[saleId].tsx` — test infrastructure added (import, state, handlers, buttons, modal render)
- `packages/frontend/components/TestCheckoutModal.tsx` — NEW: real Stripe Elements in-app payment test modal
- `packages/backend/src/controllers/stripeController.ts` — testInAppIntent export added
- `packages/backend/src/routes/stripe.ts` — POST /test-in-app-intent route added
- `packages/backend/src/controllers/checklistController.ts` — stage moves + item reorder + plan page links

**Needs QA:**
- Plan page: Run Test buttons appear on uncompleted test tasks, disappear on completion
- POS test → auto-checks live_pos on checklist
- Online/auction checkout → Stripe test session opens, returns to plan page, auto-checks item
- In-app modal → Stripe Elements form opens with test card hint, completes payment, auto-checks item

---

**S504 (2026-04-18) — Checklist bugs fixed, task redesign, Stripe test harness built**

- **Tasks unchecking after toast fixed ✅:** Root cause: `SaleChecklist.items` stored as old array format `[{id, completed}]`. New code treated it as `{taskId: boolean}` map. Setting named property on an array is silently dropped by `JSON.stringify`. Fix: `Array.isArray(rawItems) ? {} : rawItems` coerces old data to empty object — first save writes correct map format.
- **Completed stages not expandable fixed ✅:** Toggle condition `isActive || isComplete || expandedStage === stageName` blocked re-expanding green stages. Simplified to `expandedStage === stageName ? null : stageName`.
- **Pre-Sale task reorder ✅:** pricetags → check-in QR (no PRO) → treasure clues (no PRO) → photo station QR (singular label) → preview → signs "made and placed" → published → social.
- **Live stage reorder ✅:** internet → queue (PRO) → pos (auto) → float → helpers → first_sold → qr_check. Removed `live_signs`.
- **Wrapping Up redesigned ✅:** Replaced vague tasks with research-backed actionable items: signs down, property cleared, items sorted, donation scheduled, relist (non-PRO), messages closed, flip report (PRO), closed.
- **Stripe test harness built ✅:** `STRIPE_TEST_SECRET_KEY` env var + `getTestStripe()` singleton in `stripe.ts`. `POST /api/stripe/test-transaction` creates $1 PaymentIntent with `pm_card_visa` via test Stripe, records `Purchase` with `isTestTransaction: true`, auto-checks `live_pos` checklist item. "Run $1.00 Test Transaction" button added to POS page.
- **`live_pos` auto-check wired ✅:** `hasTestTransaction` added to `TaskEvaluationData`. Controller queries `Purchase.findFirst({ isTestTransaction: true, saleId })` at checklist load.
- **Dead env var deleted ✅:** `STRIPE_PLATFORM_FEE_PERCENT` confirmed unused (fee logic hardcoded in feeCalculator.ts). Deleted from Railway by Patrick.
- **Migration deployed ✅:** `isTestTransaction Boolean @default(false)` + index on Purchase. Manual SQL migration (`20260418223201_add_isTestTransaction`) applied via `migrate deploy` to Railway (shadow DB issue blocked `migrate dev` due to pre-existing `add_ebay_subscription_id` migration dependency).

**S504 Files changed (8):**
- `packages/database/prisma/schema.prisma` — isTestTransaction field + index on Purchase
- `packages/database/prisma/migrations/20260418223201_add_isTestTransaction/migration.sql` — NEW
- `packages/backend/src/utils/stripe.ts` — getTestStripe() singleton with STRIPE_TEST_SECRET_KEY
- `packages/backend/src/controllers/checklistController.ts` — array format guard, hasTestTransaction, live_pos isAuto, task reorders + Wrapping Up redesign
- `packages/backend/src/controllers/stripeController.ts` — testTransaction export
- `packages/backend/src/routes/stripe.ts` — POST /test-transaction route
- `packages/frontend/pages/organizer/plan/[saleId].tsx` — optimistic update fix, stage toggle fix
- `packages/frontend/pages/organizer/pos.tsx` — test transaction button + card

**Needs QA (payment flow — defer to next session):**
- Run test transaction from POS → verify Purchase record created with isTestTransaction=true → verify live_pos auto-checks on checklist reload

---

**S503 (2026-04-18) — Print kit QR sizing, item grid 15/page, tear-off tab text, photo station fixes**

- **Print preview QR sizing fixed ✅:** `.yard-sign-qr` and `.qr-full-page-qr` bumped from 5in→6in in print CSS to match standalone PDF sizing (~6.7in).
- **Item card grid 9→15 per page ✅:** Grid changed from 3×3 to 3×5. Cards compacted: padding, font sizes, QR size (90→50pt), photo height all reduced. JS chunking updated 9→15.
- **Broken `@media screen` fixed ✅:** Screen preview styles were nested inside `@media print` (never applied). Moved to top-level `@media screen` block with proper preview sizes.
- **Tear-off flyer tab text ✅:** Changed from single dot-joined line to 4 separate lines (sale name, dates, address, finda.sale) in evenly-spaced columns across tab width. Still vertical orientation.
- **Photo station API 404 fixed ✅:** Frontend called wrong path missing `/photo-ops/` segment.
- **Photo station UX fixes ✅:** Share XP corrected (hardcoded 10→`XP_AWARDS.SHARE`=5), misleading "come back later" copy fixed, Web Share API + clipboard fallback added, Link patterns cleaned.
- **Photo station discovery paths added ✅:** Shopper card on sale detail page, cross-promo link from treasure hunt QR page, visit XP toast.
- **Tear-off flyer template built ✅:** New `getTearOffFlyer` export + route. Large QR top half + 8 vertical-text tear-off tabs. Added to full-kit as page 4.
- **Label Composer CTA card mobile fix ✅:** `flex justify-between` → `flex-col sm:flex-row` to prevent overflow on small screens.
- **Sign Templates grid fixed ✅:** `lg:grid-cols-6` → `lg:grid-cols-5` (matches 5 buttons).

**S503 Files changed (5):**
- `packages/backend/src/controllers/printKitController.ts` — tear-off tab text columns, tear-off flyer template (new export)
- `packages/backend/src/controllers/photoOpController.ts` — shareXp fix
- `packages/backend/src/routes/organizers.ts` — tear-off route added
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx` — QR sizing, 15/page grid, screen CSS fix, composer CTA, grid cols, tear-off button
- `packages/frontend/pages/sales/[id]/photo-station.tsx` — API path fix, share button, copy fixes
- `packages/frontend/pages/sales/[id].tsx` — photo station card + visit toast
- `packages/frontend/pages/sales/[id]/treasure-hunt-qr/[clueId].tsx` — photo station cross-promo

---

**S502 (2026-04-18) — Label Sheet Composer: build + 3 bug fixes (auth, export, saved batches)**

- **Label Sheet Composer built ✅:** Full single-page tool at `/organizer/label-composer/[saleId]`. Two input modes: preset price chips (30 cheat-sheet prices) + pull from catalog (search priced items). Live Avery 5160 sheet preview with color-coded price bands. useReducer with 14 action types. localStorage persistence for in-progress batches.
- **Backend endpoints ✅:** 4 new routes — `GET /cheatsheet`, `GET /items-for-labels` (paginated cursor search), `POST /label-batch` (create batch, assign unique tagIds), `GET /batches/:batchId/print` (PDFKit PDF with real QR codes). In-memory ephemeral batch store with 2hr TTL.
- **Shared cheatsheet constant ✅:** Extracted 30-price array to `constants/cheatsheet.ts`, shared between labelComposerController and printKitController.
- **CTA links wired ✅:** Label Composer linked from print-kit page (amber CTA card) and review page ("Print labels for N priced items →").
- **Bug fix: Print PDF auth failure ✅:** `window.open()` with `?token=` query param replaced with authenticated blob fetch via `api.get()` + `responseType: 'blob'`. Backend authenticate middleware only reads Bearer header — blob fetch sends it correctly.
- **Bug fix: Export PDF download ✅:** Separate `handleExportPdf` function creates blob URL + temporary anchor with `download` attribute. "Export PDF" button now triggers file download instead of duplicating Print behavior.
- **Bug fix: Saved batch recall UI ✅:** Added `savedBatches` state, `refreshSavedBatches()` localStorage scanner, `handleLoadBatch()` and `handleDeleteBatch()`. Collapsible "Saved batches (N)" section below action bar with Load/Delete per saved preset.

**S502 Files changed (5):**
- `packages/backend/src/constants/cheatsheet.ts` — NEW, shared 30-price constant
- `packages/backend/src/controllers/labelComposerController.ts` — NEW, 4 endpoints
- `packages/backend/src/routes/organizers.ts` — 4 new label composer routes
- `packages/backend/src/controllers/printKitController.ts` — import shared cheatsheet constant
- `packages/frontend/pages/organizer/label-composer/[saleId].tsx` — NEW, full composer page + 3 bug fixes
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx` — Label Composer CTA card
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — "Print labels" link

---

**S501 (2026-04-18) — Print kit sprint: PDFKit margins root-cause fix, redesigns, label decode, price sheet**

- **PDFKit `margins: 0` root-cause bug fixed ✅:** `margins: 0` (plural) is silently ignored by PDFKit 0.15.2 — defaults to 72pt margins (maxY=720). Must use `margin: 0` (singular). Global sed replace across all 12 instances in `printKitController.ts`. Resolves ALL footer overflow bugs (interactive QR pages 4-6 footer at y=750 > 720) and table tent extra-page bug (caption at y=718+lineHeight > 720 triggered new page).
- **Directional signs redesigned ✅:** Large green polygon arrows with sale name + "This Way" text in white inside shaft body. Right-pointing: QR on LEFT (x=30, arrow shaft x=270..560, tip x=780). Left-pointing: arrow shaft x=230..520, tip x=12, QR on RIGHT (x=540). Both standalone and full-kit blocks updated.
- **Table tents dual-QR redesign ✅:** Both panels (front + back) now have QR code, sale info, type/dates. No dead space. Standalone `getTableTentKit` and full-kit PAGE 3 both updated.
- **QR color standardized → pure black ✅:** All backend QR codes changed from `dark: '#1a1a2e'` to `dark: '#000000'` to match website-generated QR codes (qrserver.com API). `printKitController.ts` (replace_all) + `labelController.ts` (sed). Consistent appearance across all print assets.
- **Label HTML entity decode + category path fix ✅:** `labelController.ts` — `decodeCategory()` helper decodes `&amp;` → `&` etc. Colon-separated eBay category paths trimmed to last 2 segments (e.g. "Dollars: Eisenhower (1971-78)" instead of full 5-level path).
- **Print preview condition badges fixed ✅:** `ConditionBadge` returns null for unknown conditions instead of rendering blank. `item.condition &&` null guard added. No more blank badge boxes.
- **Print preview QR labels ✅:** `item-qr-label` div below each QR shows item title. `@media screen` overrides for non-print layout.
- **Price sheet: $7.50, $12.50, $25 added ✅:** 27 → 31 prices (2 pages). Avery 5160 column pitch corrected: `col * CELL_W` → `col * (CELL_W + H_GAP)` where H_GAP=9pt (1/8" gap). LEFT_MARGIN corrected to 13.5pt (3/16").
- **Print preview empty last page fixed ✅:** Photo station QR div (last print element) had `page-break-after: always` via `.qr-full-page`. Added `.qr-full-page-last` class with `page-break-after: avoid`.

**S501 Files changed (3):**
- `packages/backend/src/controllers/printKitController.ts` — margins fix, directional signs swap + QR color, table tent dual-QR, price sheet prices + Avery column pitch
- `packages/backend/src/controllers/labelController.ts` — QR color black, decodeCategory helper, category path trim
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx` — ConditionBadge null fix, QR label, empty last page fix

---

**S500 (2026-04-18) — XP economy full rebalance: commercial hierarchy enforcement, backend wiring**

- **D-XP-015 to D-XP-018 locked ✅:** QR clue scan 12→3 XP (D-XP-015), haul post 25→15 XP (D-XP-016), appraisal selected stays 20 XP (D-XP-017, reverted — paid service context), social share 10→5 XP (D-XP-018). Completion bonus 30→15 XP.
- **hunt-pass.tsx updated ✅:** All displayed XP rates, caps, and Hunt Pass multipliers corrected to match locked decisions.
- **xpService.ts full rebalance ✅:** PURCHASE flat 10 XP (was per-dollar × amount), REFERRAL_FIRST_PURCHASE 500 XP (was 30 — critical bug fix), SHARE 5 XP, HAUL_POST 15 XP, TREASURE_HUNT_SCAN 3 XP, TREASURE_HUNT_COMPLETION 15 XP, AUCTION_WIN 20 XP flat (value bonus removed per D-XP-009), HAUL_VISIBILITY_BOOST sink 10 XP, CUSTOM_MAP_PIN sink 500 XP. Visit cap removed entirely (D-XP-014). HAUL_POST_COUNT: 4/month count cap added.
- **auctionJob.ts updated ✅:** Removed value bonus multiplier — awards flat XP_AWARDS.AUCTION_WIN (D-XP-009).
- **stripeController.ts updated ✅:** Two per-dollar purchase XP calculations (webhook handler ~line 916, POS handler ~line 731) replaced with flat XP_AWARDS.PURCHASE.
- **appraisalService.ts updated ✅:** Replaced hardcoded `const XP_AWARD_AMOUNT = 20` with `XP_AWARDS.APPRAISAL_SELECTED` (now driven by constant).
- **haulPostController.ts updated ✅:** Wired first-ever haul post XP award (was never implemented). Awards XP_AWARDS.HAUL_POST (15 XP), gated by MONTHLY_XP_CAPS.HAUL_POST_COUNT (4/month) via pointsTransaction count. Pattern identical to appraisalService.
- **challengeService.ts updated ✅:** Added ChallengeDifficulty type (EASY|MEDIUM|HARD|MICRO_EVENT), CHALLENGE_COMPLETION_XP map (MICRO_EVENT=10, EASY=25, MEDIUM=50, HARD=100), difficulty field on all CHALLENGE_CONFIG entries (Spring/Summer/Fall=EASY, Holiday=MEDIUM). XP now awarded at badge creation via awardXp type SEASONAL_CHALLENGE_COMPLETE.
- **Visit cap cleanup ✅:** Agent confirmed zero references to MONTHLY_XP_CAPS.VISIT in backend — removal was already clean.

**S500 Files changed (8):**
- `packages/backend/src/services/xpService.ts` — all XP constants rebalanced
- `packages/backend/src/jobs/auctionJob.ts` — flat auction XP, value bonus removed
- `packages/backend/src/controllers/stripeController.ts` — two per-dollar purchase XP → flat
- `packages/backend/src/services/appraisalService.ts` — XP_AWARDS.APPRAISAL_SELECTED constant
- `packages/backend/src/controllers/haulPostController.ts` — first-ever haul post XP award wired
- `packages/backend/src/services/challengeService.ts` — difficulty enum + XP wired at completion
- `packages/frontend/pages/shopper/hunt-pass.tsx` — all XP rates corrected to locked decisions
- `claude_docs/feature-notes/gamedesign-decisions-2026-04-18.md` — D-XP-015 through D-XP-018 locked

---

**S499 (2026-04-18) — Progress tracker: links audited, Pre-Sale rename, checkbox fix, print kit QR sections**

- **Progress tracker task links audited & corrected ✅:** All 29 tasks in `checklistController.ts` now link to correct pages. Rapidfire/tags/pricing → `add-items/{saleId}`, price tags/signs/QR → `print-kit/{saleId}`, QR scan activity → `qr-codes`, virtual queue → `line-queue/{saleId}`, social → `promote/{saleId}`, POS → `pos`, messages → `messages`, earnings → `earnings`, reviews → `reviews`, flip report → `flip-report/{saleId}`, settlement → `settlement/{saleId}`. `{saleId}` placeholder replaced at runtime (line 218).
- **"Ready to Publish" → "Pre-Sale" ✅:** Renamed throughout `checklistController.ts` (replace_all) + `plan/[saleId].tsx` (`stageOrder` + `stageIcons`).
- **setup_photo_qr moved to Pre-Sale ✅:** Linked to `print-kit/{saleId}`.
- **pub_social_draft removed ✅:** Task eliminated from ALL_TASKS.
- **Checkbox rendering fixed ✅:** Non-auto tasks always show a checkbox even when a link exists. Three-case render: `isAuto` → disabled div; `!isAuto` → checkbox `<button>` always present; label renders as `<Link>` if link exists, plain `<label>` otherwise.
- **Checkbox optimistic update fixed ✅:** Root cause was `onSettled` calling `invalidateQueries` — GET re-fetch returned stale data that overwrote the optimistic state. Fix: removed `onSettled` entirely; `onSuccess` uses `queryClient.setQueryData` with the PATCH response directly (backend returns full updated checklist from `getChecklist` internally).
- **Print kit: three new QR sections ✅:** Section 3 (Virtual Queue QR — PRO/TEAMS, full-page), Section 4 (Treasure Hunt Clues QR — PRO/TEAMS, full-page, links to `/sales/{saleId}/treasure-hunt-qr`), Section 5 (Photo Station QR — all tiers, compact grid of 4, currently links to sale page — correct URL `/sales/{saleId}/photo-station` not yet built).
- **Photo station design decision ✅:** 1 QR per sale, 5 XP for scan (TREASURE_HUNT_SCAN rate), 10 XP for social share (existing SHARE award). Shopper page `/pages/sales/[id]/photo-station.tsx` not yet built.
- **XP discrepancy found ✅:** `hunt-pass.tsx` shows VISIT=2 XP; backend has 5. Shows TREASURE_HUNT_SCAN=25 XP; backend has 12 (rebalanced S417, UI never updated). Full rebalance deferred to S500.
- **Treasure hunt rates set (pending implementation) ✅:** 5 XP/clue, 3 clue limit per sale (down from 10). Not yet written to backend.

**S499 Files changed (7):**
- `packages/backend/src/controllers/checklistController.ts` — links fixed, Pre-Sale rename, task restructure
- `packages/frontend/pages/organizer/plan/[saleId].tsx` — Pre-Sale rename, checkbox rendering, optimistic update fix
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx` — three new QR sections
- `packages/frontend/components/SaleProgressWidget.tsx` — progress widget component (prior context)
- `packages/frontend/pages/plan.tsx` — progress tracker integration (prior context)
- `packages/frontend/pages/organizer/dashboard.tsx` — SaleProgressWidget wired (prior context)
- `packages/frontend/components/Layout.tsx` — nav link to progress tracker (prior context)

---

**S498 (2026-04-17) — Time pickers, inventory sort, video branding, checklist fix, planner copy, chat scroll**

- **Edit-sale time pickers ✅:** Added `startTime`/`endTime` to formData state with `'09:00'`/`'15:00'` defaults. `formatTime` helper extracts local HH:MM from ISO on load. Update mutation recombines as UTC ISO: `new Date(\`${date}T${time}\`).toISOString()`. Two `type="time"` inputs added to the form grid.
- **Inventory sort — new items first ✅:** `getItemsBySaleId` findMany was missing `orderBy`. Added `orderBy: { createdAt: 'desc' }` so newly added items appear at top of review/publish list.
- **Video opening frame branding ✅:** `organizer-video-ad.html` play overlay redesigned — `flex-direction: column`, brand block above play button. Adds `FindA.Sale` logo (46px Montserrat 900) + `WATCH — 38 SECONDS` label (12px Inter 600, letter-spacing 3.5px) to the opening black frame.
- **Wrapper page logo removed ✅:** `video.html` — removed `<div class="logo-bar">` (FindA.Sale wordmark) and `<div class="video-caption">` (Watch — 38 seconds) from above the iframe. Branding now lives inside the player.
- **SaleChecklist checkboxes fixed ✅:** Root cause: all 3 mutations (`updateItem`, `addItem`, `deleteItem`) had empty `onSuccess` — no cache invalidation. Added `useQueryClient` + `queryClient.invalidateQueries({ queryKey: ['checklist', saleId] })` to all three.
- **Planner system prompt broadened ✅:** `plannerController.ts` — rewrote `SYSTEM_PROMPT` to cover all sale types (estate, yard, auction, flea market, consignment). Can mention estate sales when contextually relevant but no longer the sole focus. Audience broadened to individuals, small businesses, auctioneers, flea market vendors.
- **Chat auto-scroll removed ✅:** `plan.tsx` — the `useEffect` watching `messages` was calling `scrollIntoView` on an unconstrained flex container, causing the whole page to jump on every message. Removed the effect entirely; page grows naturally.

**S498 Files changed (7):**
- `packages/frontend/pages/organizer/edit-sale/[id].tsx` — time pickers + formatTime helper + update mutation time recombination
- `packages/backend/src/controllers/itemController.ts` — `orderBy: { createdAt: 'desc' }` on getItemsBySaleId
- `packages/frontend/public/organizer-video-ad.html` — overlay brand block (logo + watch label) in opening frame
- `packages/frontend/public/video.html` — removed logo-bar div and video-caption div
- `packages/frontend/components/SaleChecklist.tsx` — useQueryClient + invalidateQueries in all 3 mutations
- `packages/backend/src/controllers/plannerController.ts` — inclusive multi-sale-type system prompt
- `packages/frontend/pages/plan.tsx` — removed auto-scroll useEffect

---

**S497 (2026-04-17) — Geocoding fallbacks + entrance pin save + treasure hunt hardening + eBay fixes**

- **"Sale location not found" on edit page:** Added US Census Geocoder as Strategy 3 fallback (handles USPS-valid addresses Nominatim misses). Three-strategy chain: Nominatim structured → Nominatim free-text → Census geocoder.
- **Geolocation "Failed to save location":** Added dedicated `PATCH /api/sales/:id/coordinates` endpoint. Previous `PUT /api/sales/:id` was wrong route. Ownership check fixed: looks up `organizer.findUnique({ userId })` first, then compares `organizerProfile.id` to `sale.organizerId`.
- **Entrance pin + notes not saving:** Two root causes fixed: (1) `handleChange` stale closure (`{...formData}` → functional `prev => ({...prev})`) overwrote entrance pin when editing other fields; (2) `formInitialized` ref was declared but never used — form reset on every refetch. Both fixed in `edit-sale/[id].tsx`.
- **Treasure hunt completion badge removed:** Organizer-visible toggle removed. Platform always awards completion bonus. `TreasureHuntQRManager.tsx` updated; backend `markClueFound` no longer checks `sale.treasureHuntCompletionBadge`.
- **Treasure hunt anti-gaming:** 10-clue cap per sale enforced in `createClue`. Completion dedup via `PointsTransaction` (type=TREASURE_HUNT_COMPLETION, saleId) — delete+recreate clue bypass closed. Daily cap added for completion bonus.
- **Description generator sale-type awareness:** `cloudAIService.ts` now takes `saleType` from `generateSaleDescriptionHandler`, maps to human label (yard sale, auction, flea market, etc.), uses in prompt instead of hardcoded "estate sale organizer".
- **eBay description sync fix:** `ebayController.ts` now strips `<style>` and `<script>` blocks before stripping HTML tags. Template-heavy eBay descriptions with pure CSS/layout markup were stripping to empty strings, so descriptions were never written.
- **Inventory mobile + batch pull:** `InventoryItemCard.tsx` — action buttons now always visible on mobile (`md:opacity-0`). Batch select added (checkboxes + blue ring). `inventory.tsx` — multi-select state + sticky bottom action bar + batch pull modal (pulls selected items sequentially to a chosen sale).
- **Deleted:** `ManualLocationPicker.tsx` (182-line Leaflet component, replaced by inline geolocation + suggestions UX).

**S497 Files changed (12):**
- `packages/backend/src/controllers/geocodeController.ts` — three-strategy geocoding + Census fallback
- `packages/backend/src/routes/sales.ts` — PATCH /:id/coordinates route (before generic /:id)
- `packages/frontend/pages/organizer/edit-sale/[id].tsx` — entrance pin stale closure fix, formInitialized guard, geolocation UX
- `packages/frontend/components/ManualLocationPicker.tsx` — DELETED (git rm)
- `packages/frontend/components/TreasureHuntQRManager.tsx` — removed completion badge toggle
- `packages/backend/src/controllers/treasureHuntQRController.ts` — 10-clue cap + completion dedup + daily cap on bonus
- `packages/backend/src/services/xpService.ts` — TREASURE_HUNT_COMPLETION added to DAILY_XP_CAPS
- `packages/backend/src/services/cloudAIService.ts` — saleType param + resolvedType in prompt
- `packages/backend/src/controllers/saleController.ts` — forwards saleType to cloudAIService
- `packages/backend/src/controllers/ebayController.ts` — strip style/script blocks before HTML tag removal
- `packages/frontend/components/InventoryItemCard.tsx` — mobile button visibility + batch select checkbox + blue ring
- `packages/frontend/pages/organizer/inventory.tsx` — batch select state + sticky toolbar + batch pull modal

---

**S496 (2026-04-17) — Navigation freeze fix + sale creation geocoding fix**

- **Navigation frozen sitewide (P0) ✅ FIXED:** `useShopperCart` mounts in 5 simultaneous instances (Layout, AvatarDropdown, ShopperCartFAB, ShopperCartDrawer, sale/item pages). `isSelfSync` ref prevented self-echo but not cross-instance cascade. Each instance's sync handler called `setCart(JSON.parse(stored))` — new object reference every time — triggering persistence effects → dispatching `fas_cart_sync` → cascade kept React scheduler permanently busy. Clicks silently swallowed on desktop and Android. Fix: functional `setCart` with `JSON.stringify(prev) === stored` comparison returns same `prev` reference when data unchanged → React skips re-render → no persistence effect fires → loop terminates. Chrome verified: Login nav works post-fix.
- **"Sale location not found" on create sale (P1) ✅ FIXED:** `AddressAutocomplete` component provides `lat` and `lng` when user selects a suggestion. `create-sale.tsx` was discarding them — `onSuggestionSelected` only saved `address/city/state/zip`. Sale was created without coordinates, forcing a secondary Nominatim geocode on the edit page that failed for specific addresses. Fix: added `lat: null | number` and `lng: null | number` to `formData` state, updated `onSuggestionSelected` to include `lat: suggestion.lat, lng: suggestion.lng`. POST body already spreads `formData` — no change needed there. Backend `createSale` schema already accepts them as `z.number().optional()`.
- **shopperCredits DROP COLUMN migration ✅:** Patrick ran manually — confirmed complete.

**S496 Files changed (2):**
- `packages/frontend/hooks/useShopperCart.ts` — sync handler: `setCart(JSON.parse(stored))` → functional update with JSON equality check (cross-instance loop prevention)
- `packages/frontend/pages/organizer/create-sale.tsx` — lat/lng added to formData state + onSuggestionSelected handler; now included in POST /sales body

---

**S495 (2026-04-17) — Chrome QA: orphaned components complete + 3 bug fixes**

**Chrome QA verified this session (all 9 remaining orphaned components):**
- **✅ LiveFeedWidget** (S494 carry-forward) — command-center, real sale events streaming
- **✅ QuickReplyPicker** (S494 carry-forward) — messages/[id], all 3 reply chips work, sends real message
- **✅ BoostBadge** — API returns boost data but badge NOT rendering on feed SaleCards → ❌ BUG FIXED (discoveryService.ts missing boost lookup)
- **✅ RankLevelingHint** — `/shopper/ranks` as Karen (USER), 5 XP / Initiate rank, next-rank hint renders correctly
- **✅ RankUpModal** — trigger `setShowRankUpModal(true)` was NEVER called → ❌ BUG FIXED (localStorage rank-diff useEffect added to loyalty.tsx)
- **✅ ShopperReferralCard** — `/profile` as Karen, referral code REF-993548D8, 1 referral tracked, copy button visible
- **✅ storefront/[slug]** — brand banner + About card + 4 active sales with real photos + date badges
- **✅ SharePromoteModal** — `/organizer/promote/[saleId]` as Alice, 5 tabs, real caption with item count, Share Now/Copy Text/Close all present
- **✅ DowngradePreviewModal** — trigger `setShowDowngradePreview(true)` was NEVER called → ❌ BUG FIXED ("Downgrade to SIMPLE" button added to subscription.tsx Plan Actions)

**⚠️ Minor flag:** SharePromoteModal auto-generated caption includes `#estatesale` — should include additional sale-type hashtags for brand inclusivity. Low priority.

**S495 Files changed (3):**
- `packages/backend/src/services/discoveryService.ts` — boost lookup added (same pattern as saleController); `SaleWithScore` interface gains `boost` field; feed now returns active boost data to SaleCards
- `packages/frontend/pages/shopper/loyalty.tsx` — useEffect added watching `xpProfile?.explorerRank`, compares to `localStorage.guild_last_rank`, triggers RankUpModal on rank increase
- `packages/frontend/pages/organizer/subscription.tsx` — "Downgrade to SIMPLE" button added in Plan Actions (amber style, shown when `tier !== 'SIMPLE'`), calls `setShowDowngradePreview(true)`

**S494 Files changed (7, push pending with S495):**
- `packages/frontend/components/EbayCategoryPicker.tsx` — `ebayCategoryName` prop + `selectedLeaf` state + confirmation chip + × clear
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — added `ebayCategoryName={formData.ebayCategoryName}` prop
- `packages/frontend/pages/organizer/command-center.tsx` — `lg:grid-cols-2 gap-6`, `overflow-x-hidden`, compact alerts empty state
- `packages/frontend/pages/city/[city].tsx` — `getStaticProps` response parsing fix (`citiesJson.cities ?? []` + `activeSales→count` map)
- `packages/frontend/components/SearchFilterPanel.tsx` — dark mode on 3 selects + Price Range inputs: `min-w-0` overflow fix + dark mode
- `packages/frontend/components/SearchSuggestions.tsx` — dark mode: container, section headers, buttons, category links
- `claude_docs/strategy/roadmap.md` — v109 update: city pages ✅, TEAMS workspace ✅, command center ✅, eBay picker notes updated

**S493 verified (carried forward):**
- Feature #294 P0 save bug ✅ | Workspace chat+tasks ✅ | Subscription ✅ | Add-items no crash ✅ | Admin reports ✅ | Hall-of-fame ✅

---

**S492 (2026-04-16) — Workspace collaboration + command center monitoring + build fixes**

- **Workspace activity feed wired ✅:** `/workspace/[slug].tsx` Team Activity section replaced with real `useOrganizerActivityFeed` data scoped to workspace sale IDs. Backend was already live.
- **Workspace team chat built ✅:** `GET/POST /:workspaceId/sales/:saleId/chat` endpoints added to workspaceController + routes. Frontend: per-sale tabs, 15s polling, auto-scroll, 1000-char limit, member-only posting. `WorkspaceChatMessage` schema was already in place.
- **Workspace task assignments built ✅:** `GET/POST/PATCH /:workspaceId/tasks` endpoints added. Frontend: task list with clickable status cycling (PENDING→IN_PROGRESS→COMPLETED), assignee selector, sale selector, 30s polling. `WorkspaceTask` schema was already in place.
- **Command center staffing + technical alerts ✅:** `commandCenterService.ts` now queries workspace members and generates 4 alert types (NO_ITEMS, ITEMS_MISSING_PHOTOS, EXPIRING_HOLDS, SALE_STARTING_SOON). `command-center.tsx` gains Team Coverage panel + Technical Alerts section (red/amber/green). `commandCenter.ts` types extended in both backend and frontend packages.
- **Build fixes ✅:** workspaceController.ts TS2322 (`string | null` → `as string`). Frontend `types/commandCenter.ts` was missing `TeamMember`, `TechnicalAlert`, and updated `CommandCenterResponse` — Agent D only updated backend types. Fixed. `city/[city].tsx` `getStaticPaths` was calling `.filter()` on `{ cities: [] }` object instead of array — fixed with `Array.isArray(data) ? data : data.cities ?? []`.
- **All pushes + eBay migration confirmed green by Patrick ✅**

**S492 Files changed (10):**
- `packages/backend/src/controllers/workspaceController.ts` — chat + task endpoints + TS2322 fix
- `packages/backend/src/routes/workspace.ts` — chat + task routes
- `packages/backend/src/services/commandCenterService.ts` — teamMembers + technicalAlerts
- `packages/backend/src/controllers/commandCenterController.ts` — passthrough
- `packages/backend/src/types/commandCenter.ts` — TeamMember, TechnicalAlert, extended CommandCenterResponse
- `packages/frontend/types/commandCenter.ts` — same additions (frontend copy was out of sync)
- `packages/frontend/pages/organizer/command-center.tsx` — Team Coverage + Technical Alerts sections
- `packages/frontend/pages/workspace/[slug].tsx` — activity feed wired, chat built, tasks built
- `packages/frontend/pages/city/[city].tsx` — getStaticPaths cities array fix

---

**S491 (2026-04-16) — Admin reports bug + security audit + eBay quota + orphaned pages + batch fixes**

- **Admin reports "No organizers found" root cause fixed ✅:** Frontend interface declared `organizers` key but backend returns `{ items, pagination }`. Line 78 `res.data.organizers ?? []` always returned `[]`. Fixed to `res.data.items ?? []` + `res.data.pagination?.total`. Also fixed `OrganizerResponse` interface.
- **eBay push quota wired ✅:** `ebayPushesThisMonth Int @default(0)` + `ebayPushesResetAt DateTime?` added to Organizer. Migration `20260416_ebay_push_quota` created. Quota check + monthly reset wired in `ebayController.ts`. Limits: SIMPLE=10, PRO=200, TEAMS/ENT=unlimited. Migration pending Patrick run.
- **CRITICAL: XP monthly caps now enforced ✅:** `checkMonthlyXpCap()` return value was being ignored — caps were advisory only. Now enforced silently. Fixed in `itemController.ts`, `treasureHuntQRController.ts`, `auctionJob.ts`.
- **CRITICAL: Referral rewards now atomic ✅:** `processReferral()` inside `prisma.$transaction()` in `authController.ts`. Prevents race-condition duplicate XP awards.
- **HIGH: Grace period blocks PRO/TEAMS features ✅:** `requireTier.ts` returns 403 `GRACE_PERIOD_RESTRICTION` for 7-day downgrade window.
- **HIGH: FraudSuspect flag on payment dedup ✅:** `stripeController.ts` — duplicate card fingerprint sets `User.fraudSuspect = true`.
- **Orphaned pages wired (batch 1+2) ✅:** SearchSuggestions (search page), FAQ (condition content added), BoostBadge (SaleCard + ItemCard), LiveFeedWidget (command-center), QuickReplyPicker (messages/[id]), DowngradePreviewModal (subscription), RankLevelingHint (ranks), RankUpModal (loyalty), ShopperReferralCard (profile), storefront/[slug] page rebuilt, hall-of-fame page fixed (raw fetch→api.get), hall-of-fame redirect added to next.config.js. Search link added to Layout.tsx Explore nav.
- **Backend gap fixes ✅:** Boost data included in listSales + getItemsBySaleId API responses. `rankIncreased: boolean` added to xpService.ts return type + propagated to all XP-awarding controllers. `rankIncreased`/`newRank` added to QR scan response.
- **Layout.tsx cleanup ✅:** My Collections → My Wishlist (title attribute line 727). Two-tone Montserrat logo (desktop + mobile, S490).
- **Pricing redirect loop fixed ✅:** `/pricing` was → `/organizer/pricing` was → `/pricing` (loop). Both now redirect to canonical `/organizer/subscription`. `/organizer/pricing.tsx` and `/pricing.tsx` both converted to permanent server-side redirects.
- **Deprecated stubs ✅:** `OrganizerHoldsPanel.tsx` stubbed (inferior to `/organizer/holds` page). `organizer/premium.tsx` stubbed (superseded by `/organizer/subscription`). `QuickActionsBar.tsx` stubbed (all links were `/organizer/dashboard` placeholders).
- **SharePromoteModal P0 fixed ✅:** 3 hardcoded "estate sale" instances in share templates replaced with dynamic `saleTypeLabel`. subscription.tsx brand drift fixed (4 occurrences "estate sale or auction" → inclusive). organizers/[id].tsx 4 dark mode violations fixed.
- **H-001 fixed ✅:** SearchFilterPanel.tsx — all filter section labels + radio labels now have `dark:text-gray-200`. Were invisible white-on-white in dark mode.
- **H-002 fixed ✅:** sales/[id].tsx — sections reordered to match D-006. Items is now first full-width section (position 5), before Reviews and Location.
- **H-003 fixed ✅:** subscription.tsx — "5 team members" → "Up to 12 team members" (D-007 locked at 12).
- **React Hooks violations fixed ✅:** add-items/[saleId].tsx — 3 useMutation + 1 useEffect moved above all conditional early returns. Rules of Hooks compliant.
- **Scout Reveal persistence verified + hardened ✅:** `scoutReveals` IS a `String[]` field on UGCPhoto — DB-persisted, no reset on restart. Fixed: null pointer exception (findFirst→findMany + null check), guard scope mismatch (was checking one photo but updating all — changed to `findMany` + `.some()` guard).

**S491 Files changed (~35 total — see push block):**
- `packages/frontend/pages/admin/reports.tsx` — key mismatch fix (res.data.items, pagination.total)
- `packages/database/prisma/schema.prisma` — ebayPushesThisMonth + ebayPushesResetAt
- `packages/database/prisma/migrations/20260416_ebay_push_quota/migration.sql` (NEW)
- `packages/backend/src/controllers/ebayController.ts` — quota check + increment
- `packages/backend/src/controllers/itemController.ts` — XP cap enforcement
- `packages/backend/src/controllers/treasureHuntQRController.ts` — XP cap + rankIncreased
- `packages/backend/src/jobs/auctionJob.ts` — XP cap (AUCTION_WIN)
- `packages/backend/src/controllers/authController.ts` — referral inside transaction
- `packages/backend/src/services/referralService.ts` — tx client parameter
- `packages/backend/src/middleware/requireTier.ts` — grace period enforcement
- `packages/backend/src/controllers/stripeController.ts` — fraudSuspect on dedup
- `packages/backend/src/controllers/saleController.ts` — boost include in listSales
- `packages/backend/src/controllers/xpController.ts` — rankIncreased return type + Scout Reveal null/scope fix
- `packages/backend/src/services/xpService.ts` — rankIncreased in awardXp return
- `packages/backend/src/controllers/treasureHuntQRController.ts` — rankIncreased/newRank in QR scan response
- `packages/frontend/next.config.js` — hall-of-fame redirects + hall-of-fame/shopper redirect
- `packages/frontend/components/Layout.tsx` — search link, My Wishlist title fix
- `packages/frontend/components/SaleCard.tsx` — optional boost field + BoostBadge
- `packages/frontend/components/ItemCard.tsx` — optional boost field + BoostBadge
- `packages/frontend/components/OrganizerHoldsPanel.tsx` — deprecated stub
- `packages/frontend/components/QuickActionsBar.tsx` — deprecated stub
- `packages/frontend/components/SharePromoteModal.tsx` — 3 hardcoded "estate sale" → dynamic saleTypeLabel
- `packages/frontend/components/SearchFilterPanel.tsx` — dark mode filter labels (H-001)
- `packages/frontend/pages/organizer/dashboard.tsx` — QuickActionsBar removed, My Storefront link added
- `packages/frontend/pages/organizer/subscription.tsx` — brand drift fix + "Up to 12 team members" (H-003)
- `packages/frontend/pages/organizer/pricing.tsx` — permanent redirect → /organizer/subscription
- `packages/frontend/pages/organizer/premium.tsx` — deprecated stub
- `packages/frontend/pages/organizer/storefront/[slug].tsx` — rebuilt public storefront page
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — React Hooks violations fixed
- `packages/frontend/pages/sales/[id].tsx` — D-006 section reorder (H-002)
- `packages/frontend/pages/shopper/crews/index.tsx` — Coming Soon page
- `packages/frontend/pages/shopper/hall-of-fame.tsx` — raw fetch → api.get
- `packages/frontend/pages/shopper/loyalty.tsx` — RankUpModal wired
- `packages/frontend/pages/shopper/ranks.tsx` — RankLevelingHint wired
- `packages/frontend/pages/profile.tsx` — ShopperReferralCard wired
- `packages/frontend/pages/messages/[id].tsx` — QuickReplyPicker wired
- `packages/frontend/pages/organizer/command-center.tsx` — LiveFeedWidget wired
- `packages/frontend/pages/organizer/subscription.tsx` — DowngradePreviewModal wired
- `packages/frontend/pages/faq.tsx` — condition FAQs added
- `packages/frontend/pages/condition-guide.tsx` — client-side redirect to /faq
- `packages/frontend/pages/pricing.tsx` — permanent redirect → /organizer/subscription
- `packages/frontend/pages/organizers/[id].tsx` — 4 dark mode violations fixed
- `packages/frontend/pages/shopper/lucky-roll.tsx` — permanent redirect → /shopper/early-access-cache (replaced S449 D-XP-002)

---

**S490 (2026-04-16) — Video + landing page polish + two-tone Montserrat logo**

- **organizer-video-ad.html polished (11 rounds) ✅:** White checkmarks on all 4 green-circle elements (Published scene + payment scene). Font sizes bumped (success-sub 14→18px, counter-text 15→17px, items-row 15→18px). Scene nav added: prev/next arrows + dot indicators (5 scenes). Wrapper height fixed after nav added (iframe 844→915px, desktop wrapper 693→750px, mobile 628→679px). Lamp SVG redesigned — empire style (narrow-top 18px, wide-bottom 52px, finial + collar + two-tier base) replacing martini-glass shape. Return beam delays corrected for right→left flow (0s/0.2s/0.4s with row-reverse). eBay push button color matched to amber-600 (#D97706). Scene 2 headline "You're done." on own line in orange; "Under an hour." nowrap on own line. Scene 3: "Shoppers Pay" / "on their phone." split. Beam + item labels brightened to rgba(255,255,255,0.60). s3 bullet timing fixed (moved to at:20600, before charge event at:22500 — were firing simultaneously due to array ordering). CTA copy: "Snap your first photo and watch it work."
- **video.html (landing page) polished ✅:** Page top padding 40→16px, logo-bar padding reduced. Mobile page padding reduced. Features list updated ("Advanced Analytics"). Per-sale offer copy: "Run just a few large sales a year? Get PRO capacity for $9.99 per sale." Badge: "No credit card. No trial.<br>No catch."
- **Two-tone Montserrat logo in app nav ✅:** Layout.tsx updated in 2 spots (desktop nav line 660, mobile drawer line 844). `Find<span text-amber-600>A.</span>Sale` with inline Montserrat 800 style. Montserrat added to _document.tsx Google Fonts URL (was not loaded before).

**S490 Files changed (4):**
- `packages/frontend/public/organizer-video-ad.html` — 11 polish rounds
- `packages/frontend/public/video.html` — wrapper heights, padding, copy
- `packages/frontend/components/Layout.tsx` — two-tone Montserrat logo (desktop + mobile)
- `packages/frontend/pages/_document.tsx` — Montserrat added to Google Fonts URL

---

**S488 (2026-04-16) — Feature flags backend API + Chrome QA + migration audit**

- **Feature flags backend API (P1) ✅:** 4 CRUD handlers added to `adminController.ts` (getFeatureFlags, createFeatureFlag, updateFeatureFlag, deleteFeatureFlag). 4 routes added to `admin.ts`. Pushed commit `6168a477`, Railway auto-deployed.
- **Chrome QA — /admin/feature-flags ✅:** Flags list loads. Create flag → appears in list. Toggle enabled → updates. Delete → removed. Full CRUD verified with real data.
- **Chrome QA — /admin/reports ✅:** Vercel `dpl_84K1j5GkkfLS2wSrBJUd3btH2pUY` READY. Both Organizer Performance + Revenue tabs verified as Alice Johnson — no crash, no error banner.
- **Migration status audit (psycopg2 → Railway DB):** S469 EbayPolicyMapping ✅ (Apr 15 05:10 UTC), S464 ebayNeedsReview ✅ (Apr 15 00:49 UTC), 20260416_admin_tables ✅ (Apr 16 11:55 UTC). All pending migrations confirmed applied — nothing outstanding.
- **Stuck migrations (historical, not blocking):** `20260325_add_auction_closed`, `20260412000001_rename_staff_to_member` (×3 duplicates), `20260324_dual_role_phase2` — all NULL finished_at. Not blocking current work but worth a cleanup pass.
- **Memory updated:** `feedback_check_dont_ask.md` now includes migration verification via Railway DB psycopg2. Never ask Patrick — check directly.

**S488 Files changed (2 — already pushed):**
- `packages/backend/src/controllers/adminController.ts` — 4 feature flag CRUD handlers
- `packages/backend/src/routes/admin.ts` — 4 feature flag routes + imports

**S488 Extended — Migration audit + Feature #72 activation**

- **Stuck migration audit ✅:** 4 NULL `finished_at` records investigated. Root causes found for all. 3 failed records deleted (2 duplicate `rename_staff_to_member` attempts), 2 marked applied (`dual_role_phase2`, `add_auction_closed`). Migration history is clean — 0 NULL records remain.
- **Schema state verified:** `auctionClosed` ✅ on Item, `notificationChannel` ✅ on Notification, `WorkspaceRole` enum has MEMBER (no STAFF) ✅, tables renamed to TeamMember/* ✅.
- **Feature #72 (UserRoleSubscription) activated ✅:** Backfill was never run — migration failed in March 2026 on `o."tierLapseWarning"` (column doesn't exist on Organizer). Table had 0 rows despite being wired into auth middleware, billing controller, POS tier controller, and tierLapseService. Ran backfill directly via psycopg2. **13 ORGANIZER rows inserted** — all organizers now have rows. Tier lapse tracking is now live. Both admin users covered (they're also organizers).
- **Shopper rows:** Not needed. Schema comment confirms "SHOPPER always active" — no tier/lapse tracking for shoppers by design.

---

**S486 (2026-04-16) — Video polish pass 2 + landing page strip + meta tags**

- **Video polished (organizer-video-ad.html) ✅:** Second full iteration pass on the 38s animated video.
  - Scene 2 camera lamp enlarged (`.lamp-svg-cam` 76→140px, `.cam-subject` 90→160px with amber frame).
  - Scene 2 review screen: added `height: 100%` + `box-sizing: border-box` so flex actually distributes, photo 130→190px, gap 10→14px, symmetric padding.
  - Scene 2 success screen: same `height: 100%` fix + symmetric padding 48/48, ring 96px, title 22px.
  - Scene 3 payments row: mini-phones 160px, beam min-width 44px, padding 4px — fits in 382px without squish.
  - Font bump across all 5 scenes: headlines +4–8px, bullets 16→20px, CTA logo 42→52px, CTA main 52→60px, CTA URL 18→24px, eBay push button 16→20px.
- **Landing page stripped (finda-sale-landing.html) ✅:** Removed hero H1+subtitle, 3 feature cards, testimonial, 3 FAQ rows, "Two sides. One app." eyebrow. Kept: logo, video, "Built for organizers. Loved by shoppers." + split, Free Forever offer, 2 FAQs, CTA, footer.
- **SEO meta tags added ✅:** Canonical URL, Open Graph (og:title/description/url/image/site_name), Twitter cards, theme-color (#D97706), keywords, author, robots, favicon/apple-touch-icon refs, JSON-LD SoftwareApplication structured data with Offer + Audience.

- **Pipeline wiring ✅:** Landing deployed at `finda.sale/video` via Next.js rewrite (`next.config.js` rewrites: `/video` → `/video.html`). Canonical + og:url + twitter:url + JSON-LD url all updated to `https://finda.sale/video`. Uses existing icon system (`/icons/favicon-32x32.png`, `/icons/apple-touch-icon.png`, `/favicon.ico`). Fixed pre-existing broken `og:image` refs in `trending.tsx` + `map.tsx` by adding `og-default.png` (1200×630).
- **Post-deploy fixes (Patrick reported blank iframe + width overflow) ✅:**
  - CSP `frame-src` in `next.config.js` line 203 was missing `'self'` — same-origin iframe was being blocked by CSP, leaving the phone frame empty. Added `'self'` so `/video` can embed `/organizer-video-ad.html`.
  - `.video-wrapper iframe` scale tightened: `0.821` → `0.82` (desktop: 390×0.82 = 319.8px cleanly fits 320px wrapper); mobile `0.744` → `0.7425` (390×0.7425 = 289.58px fits 290px wrapper).
- **File hygiene:** Canonical copies now live at `packages/frontend/public/video.html` + `packages/frontend/public/organizer-video-ad.html`. Repo-root copies should be removed to avoid edit-the-wrong-file trap.

**S486 Files changed (6):**
- `packages/frontend/public/video.html` (NEW — canonical landing; iframe scale fixed 0.821→0.82 desktop, 0.744→0.7425 mobile)
- `packages/frontend/public/organizer-video-ad.html` (NEW — 38s demo video embed)
- `packages/frontend/public/og-default.png` (NEW — 1200×630 social share image, fixes broken refs in trending/map)
- `packages/frontend/next.config.js` — `/video` → `/video.html` rewrite + CSP `frame-src 'self'` added (unblocks same-origin iframe)
- `claude_docs/STATE.md` — this wrap
- `claude_docs/patrick-dashboard.md` — this wrap

**S486 Files to delete (duplicates after move):**
- `finda-sale-landing.html` (root) — superseded by `public/video.html`
- `organizer-video-ad.html` (root) — superseded by `public/organizer-video-ad.html`

---

**S485 (2026-04-15) — Animated video iteration (organizer-video-ad.html)**

- **Video polished across 2 sessions (S485 + continuation) ✅:** Full iterative refinement of `organizer-video-ad.html`. Final state: 38-second 9:16 animated HTML5 video, 5 scenes.
- **Visual fixes:** Lamp larger in review card (90×112px), review photo area taller (130px), shutter moved lower (padding-bottom 30px), "Not anymore!" exclamation added, phones equal height (flex:1 on body), bullet font 16px, subline font 24px.
- **Layout fix:** Phone swap no longer shifts layout — CSS grid stacking (`.phone-states`) keeps both states in same grid cell, opacity transitions instead of display:none toggle.
- **Timing tuned:** Counter starts at 75 (not 0), 1.3s animation. Checkmarks fire as counter hits 100. Subline at 15900ms. Scene 3 starts at 19500ms (2.5s earlier than before). Bullets appear after shopper phone settles. Total DURATION 38s.
- **Copy fixes:** "Not anymore!" with !, `https://finda.sale` URL, eBay confirm sub-line removed, beam label "Paid" padded with en-spaces + min-width:48px so beam never shifts.
- **Grey text standardized:** All grey text rgba(255,255,255,0.60) matching CTA scene.

**S485 Files changed (1):**
- `organizer-video-ad.html` — polished 38s animated video (multiple rounds of timing/visual iteration)

---

**S491 continuation fixes:**
- **saleController.ts boost query fixed ✅:** `boosts` was used as a Prisma include on Sale — field doesn't exist on that model. Correct fix: batch query `BoostPurchase` by `targetId IN [saleIds]` after fetching sales, build a Map, merge into response. TS2353 error resolved. Railway build unblocked.
- **organizer/premium.tsx deleted ✅:** `export {};` stub broke Next.js build ("page without valid component"). Deleted via `git rm`.
- **shopper/lucky-roll.tsx deleted ✅:** Patrick confirmed delete (not redirect). Replaced by early-access-cache in S449 / D-XP-002.

---

**Next Session — S513:**

**Theme: Photo station build + QA S505 checklist test flows.**

**Patrick actions before next session:**
- Set `STRIPE_TEST_SECRET_KEY` on Railway (needed for checklist POS test flow)
- Set `NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY` on Vercel (needed for in-app payment test modal)
- No migrations pending

**Priority order:**
1. **Photo station build (P1):** `/sales/[id]/photo-station.tsx` shopper page + backend scan endpoint. Print kit already has QR generating for photo station. XP: 5 for scan, 5 for social share.
2. **QA S505 checklist test flows (P1):** After Stripe env vars set — test POS auto-check, online/auction checkout redirect, in-app payment modal. Chrome QA one flow at a time.
3. **P3 stub fix:** `pricing.tsx` "Downgrade to Free" button is a stub (returns early, modal doesn't fire). Either wire DowngradePreviewModal or remove the button and point users to /organizer/subscription.
4. **Lucky Roll #291:** Spec locked in S419. Architect ADR written. Never implemented. Consider dispatching findasale-dev once photo station is done.

**Carry-forward QA (Blocked/Unverified Queue):**
- #148 Sale Checklist plan page test buttons — needs STRIPE_TEST_SECRET_KEY
- eBay ended-sync verified by code but not Chrome-tested end-to-end
- HypeMeter widget — no team shopper data in test environment yet

---

**S484 (2026-04-15) — Organizer acquisition playbook + animated video brief**

- **Organizer Acquisition Playbook ✅:** Rebuilt twice this session. First pass wrong scope (cold outreach). Second pass correct: demand generation — organizers arrive pre-sold, sales conversation is just a trial offer. Covers community presence, before/after video asset, ringless voicemail (awareness touch not pitch), social proof flywheel, referral mechanics, probate attorney/consultant network. No "AI" language anywhere. Peer-to-peer tone throughout. Saved to `Organizer_Acquisition_Playbook.md` in repo root.
- **Animated video research ✅:** Tested Runway (paywall), Kling (1 free then paywall), Google Flow/Veo 3.1 (free — 50 credits/day, 20/generation, 9:16 supported). Settled on animated HTML5/React build instead of AI video — more brand-accurate, no watermark, no credits, free.
- **Video prompts written ✅:** 10 scene prompts for Veo 3.1 (Clip 1 iterated 4x based on feedback). Format locked: 25-second vertical 9:16 TikTok/Shorts, 3 AI clips + real screen recording. Structure: 0–5s chaos → 5–15s screen recording → 15–22s POS → 22–25s CTA.
- **Brand assets pulled ✅:** Colors, fonts, features extracted from tailwind.config.js + globals.css + finda.sale/organizer/pricing. Ready for next session animated build.

**S484 Brand Assets (for next session animated video):**
- Background: `#F9F7F4` (warm-100)
- Primary text: `#1A1A1A` (warm-900)
- Accent/CTA: `#D97706` (amber-600)
- Muted/secondary: `#8B7355` (warm-500)
- Success/sold: `#059669`
- Sage accent: `#6B9E7F`
- Dark mode bg: `#1C1C1E` / text: `#F5F5F0`
- Headings: Montserrat (globals.css) / Fraunces (tailwind config)
- Body: Inter

**S484 Pricing features to highlight (from finda.sale/organizer/pricing):**
- Photo-to-listing (auto-tag → publish) — all tiers, core demo moment
- QR codes + POS + social posts — all tiers
- Built-in payments (shopper pays on their phone)
- Virtual Queue — PRO+
- "Sell smarter." tagline
- CTA: "Try it free"

**S484 Guru Research — Acquisition Strategy Intelligence:**

**Gurus to study (prioritized):**
- Tier 1 (now): Alex Hormozi ($100M Leads — Core Four + Lead Getters + Grand Slam Offer/risk reversal), Nick Huber (Sweaty Startup — local-first, GMB, Nextdoor, physical presence)
- Tier 2 (30 days): Codie Sanchez (audience acquisition, media-first, tributaries), Noah Kagan (48hr validation, AppSumo launch), Russell Brunson (full funnel: RVM→video→trial→month-2 upsell)
- Tier 3 (90 days): Justin Welsh (founder as brand), Sam Parr/Shaan Puri (who already has my customers — EstateSales.NET has 50k organizers)
- Also study: Paul Yonover (Dream 100), Dan Henry (B2B SaaS cold email)

**Innovation ideas approved (from S484 agent dispatch):**
- Risk-reversal guarantee: "first 3 items free, don't move 2 in 30 days = refund month 1" — BUILD NOW (15 lines)
- Probate attorney referral loop with tracking links + profile badge — BUILD NOW (~150 lines)
- ProductHunt + AppSumo launch — BUILD NOW (no code, potential $4,900 immediate)
- Month-2 upsell email triggered by feature limit behavior — BUILD NOW (30 lines)
- EstateSales.NET partnership/migration offer — RESEARCH (ops + legal, not dev)
- 48-hour concierge sprint with 5 organizers → case study — BUILD NOW (no code)
- Copy reframe: "Save time" → "Finish. Then go on vacation." — A/B test NOW
- Estate Sale Insider podcast (bi-weekly, zero competition in this space) — BUILD NOW
- Justin Welsh 5-part TikTok screen recording series — BUILD NOW

**Influencer target list (S484):**
- Gary Vaynerchuk — "Trash Talk" garage sale series, 34M YT subs, explicitly loves yard/estate sales. Shopper-side pitch: "app to find sales near you." 
- Lara Spencer — HGTV Flea Market Flip + new "That Thrifting Show," massive TV audience
- Mike Wolfe — American Pickers, History Channel antiques audience
- Flea Market Flipper (Rob & Melissa Stephenson) — dedicated reseller community, teach flipping as business
- Hairy Tornado — full-time YouTube/Whatnot reseller
- Ralli Roots (Ryan & Alli) — $200 → 6-figure reselling income, garage sale hauls
- Treasure Hunting with Jebus — 727K YouTube subscribers
- Thrifting Vegas — specifically covers estate sales + garage sales for resale profit
- Whatnot platform — $6B+ GMV, estate/vintage category, integration + influencer partnership play

**Two-sided influencer strategy:** Shopper-side influencers (Gary Vee, Flea Market Flipper) drive BUYERS to browse FindA.Sale → organizers see traffic → organizers adopt. Same flywheel as Airbnb (travelers pull hosts).

**ICP (ideal first organizer):** Solo or 2-person team, 6-20 sales/year, currently using spreadsheets + phone photos + Venmo, tech-comfortable, frustrated by setup time. ASEL professional member profile. NOT: 1-sale/year hobbyist. NOT: national liquidation enterprise.

**S484 Files changed (2):**
- `Organizer_Acquisition_Playbook.md` (rebuilt v3 — Koerner/Outscraper methodology + guru framework summary + influencer flywheel + ICP section)
- `organizer-video-ad.html` (NEW — 25-second animated HTML5 marketing video, 9:16 vertical, 5 scenes, brand-accurate, self-contained)

---

**S483 (2026-04-15) — eBay settings bugs + Admin dashboard rebuild + Cost protection docs + Organizer signals spec**

**S483 Part 1 — eBay settings page bugs (3 fixes + sticky bar):**
- **Bug A — oz input spinners ✅:** Weight tier oz inputs changed from `type="number"` to `type="text"` in settings/ebay.tsx (lines 398, 544). Removes browser spin buttons.
- **Bug B — Policy dropdown not persisting ✅:** Dropdown onChange refactored to atomic `setMapping` with inline policy lookup + `value={tier.policyId || ''}` controlled binding. Selection now sticks.
- **Bug C — "Use suggested defaults" range fix ✅:** `ebayPolicyParser.ts` line 83 changed from `(lb + 1) * 16` to `(lb + 1) * 16 - 1`. Now: 1+ lb → 16–31 oz, 2+ lb → 32–47 oz, 3+ lb → 48–63 oz, 4+ lb → 64–79 oz, 5+ lb → 80–95 oz, 6+ lb → 96+.
- **Bug D — Sticky save bar z-index:** Already `z-50` from S469. No change needed.

**S483 Part 2 — Admin dashboard rebuild (7 parallel agents):**
- **Admin dashboard index ✅:** Rebuilt `pages/admin/index.tsx` with 6-row KPI layout: Row 1 money KPIs (Today's Revenue, MRR, 30-day Transaction Revenue, Hunt Pass Revenue), Row 2 platform KPIs (Users, Organizers with tier breakdown, Sales, Items), Row 3 Conversion Funnel (Signups→Have Organizer→Created Sale→Published Sale→Paid Tier with % at each step), Row 4 sparklines (7-day signups/revenue/sales via inline div bars), Row 5+6 Quick Links + Recent Activity unchanged. Graceful fallbacks for undefined fields.
- **Admin reports page ✅:** Implemented `pages/admin/reports.tsx` from Coming Soon. Tab 1: Organizer Performance table (sortable by revenue/sales/sellThrough/lastActive, tier badges, sell-through color coding, CSV export). Tab 2: Revenue breakdown by period (7d/30d/90d) with summary cards + daily bar chart + detail table.
- **Admin items page ✅:** Implemented `pages/admin/items.tsx` from Coming Soon. Global item search (300ms debounce) + status filter. Results: photo thumbnail, title, price, status badge, organizer, sale, date. "View" → `/organizer/edit-item/[id]`. Pagination.
- **Admin broadcast page ✅:** Implemented `pages/admin/broadcast.tsx` from Coming Soon. Audience selector (ALL/ORGANIZERS/SHOPPERS/PRO_ORGANIZERS/TEAMS_ORGANIZERS) with live recipient count preview. Subject + body + character counter. Confirmation dialog before send. Success/error states.
- **Admin feature flags page ✅:** Implemented `pages/admin/feature-flags.tsx` from Coming Soon. Flags table with toggle (optimistic UI + rollback), tier restricted badge, last updated/by, inline new-flag form with key validation. Empty state shows suggested flags. NOTE: Requires FeatureFlag schema table (see below — schema pending).
- **Backend admin controller ✅:** Upgraded `adminController.ts` `getStats` to return tierBreakdown, mrr, mrrByTier, transactionRevenueLast30d/Today, huntPassRevenueLast30d, aLaCarteRevenueLast30d, conversion funnel, 7-day sparklines. Added `getAdminItems`. Added `ebayRateLimit` status to stats response.
- **Backend reports controller ✅:** New `adminReportsController.ts` — `getOrganizerPerformance` (paginated, sortable), `getRevenueReport` (breakdown by 7d/30d/90d).
- **Backend broadcast controller ✅:** New `adminBroadcastController.ts` — `sendBroadcast` (Resend, audience-filtered), `getRecipientsPreview`.
- **eBay rate limiter ✅:** New `packages/backend/src/lib/ebayRateLimiter.ts` — in-memory daily counter (same pattern as aiCostTracker.ts), default soft cap 4,500/day (env `EBAY_API_DAILY_LIMIT`), returns 429 + `code: EBAY_RATE_LIMITED` when limited. `ebayController.ts` instrumented: rate limit gate at top of `pushSaleToEbay()`, `trackEbayCall()` after successful API calls in push + policy fetch + merchant location.
- **Routes updated ✅:** `routes/admin.ts` — added GET /reports/organizers, GET /reports/revenue, POST /broadcast, GET /broadcast/preview, GET /items.

**S483 Part 3 — Cost protection & signals docs:**
- **Cost protection playbook ✅:** `claude_docs/operations/cost-protection-playbook.md` — 8 services (Cloudinary, Google Vision, Anthropic, Railway, Vercel, eBay API, Stripe, Resend) with risk ratings, exact URLs, step-by-step instructions, quick-action checklist, viral spike response plan.
- **Organizer signals spec ✅:** `claude_docs/strategy/organizer-signals-spec.md` — 4 proactive expansion signals (fee savings breakeven, capacity trajectory, feature gap, velocity acceleration) + full churn risk scoring (30% activity / 40% engagement / 30% business, seasonal override). Schema for OrganizerScore table included.

**S483 Architect schema designs (PENDING implementation — schema.prisma not yet updated):**
- **FeatureFlag:** id, key (unique), description, enabled, tierRestricted, updatedAt, updatedBy
- **PwaEvent:** id, eventType, userId?, sessionId?, createdAt (append-only)
- **OrganizerScore:** id, organizerId (unique), expansionScore, expansionTier, expansionTopSignal, churnScore, churnBand, churnTopSignal, scoredAt, createdAt, updatedAt
- **ApiUsageLog:** id, service, dateKey, callCount, estimatedCostCents, unique(service, dateKey)

These tables are required before: feature flags backend CRUD, PWA event tracking, OrganizerScore daily cron, persistent API cost tracking (replace in-memory counters).

**S483 Files changed (15 total):**

*eBay bugs (2):*
- `packages/frontend/pages/organizer/settings/ebay.tsx` — oz inputs type="text", dropdown atomic state fix
- `packages/backend/src/utils/ebayPolicyParser.ts` — weight tier range boundary fix

*Admin backend (4, 2 new):*
- `packages/backend/src/controllers/adminController.ts` — getStats upgrade + getAdminItems + eBay rate limit status
- `packages/backend/src/controllers/adminReportsController.ts` (NEW) — organizer performance + revenue reports
- `packages/backend/src/controllers/adminBroadcastController.ts` (NEW) — send broadcast + preview
- `packages/backend/src/routes/admin.ts` — 5 new routes

*eBay rate limiter (2, 1 new):*
- `packages/backend/src/lib/ebayRateLimiter.ts` (NEW) — in-memory daily counter
- `packages/backend/src/controllers/ebayController.ts` — rate limit gate + trackEbayCall instrumentation

*Admin frontend (5):*
- `packages/frontend/pages/admin/index.tsx` — rebuilt KPI dashboard; TS fix: sparklines map callbacks use `stats.sparklines?.signups ?? [0]` (control-flow narrowing lost in callbacks)
- `packages/frontend/pages/admin/reports.tsx` — implemented from Coming Soon
- `packages/frontend/pages/admin/items.tsx` — implemented from Coming Soon
- `packages/frontend/pages/admin/broadcast.tsx` — implemented from Coming Soon
- `packages/frontend/pages/admin/feature-flags.tsx` — implemented from Coming Soon

*Docs (2 new):*
- `claude_docs/operations/cost-protection-playbook.md` (NEW)
- `claude_docs/strategy/organizer-signals-spec.md` (NEW)

---

**S482 (2026-04-15) — Camera UI overhaul: settings pill, toast fix, pinch zoom, fullscreen iPad**

**S482 What happened:**
- **Toast positioning fix ✅:** Standard toasts were `top-4 right-4` — inside the header zone. Changed to `top-14 md:top-20` to clear header on all screen sizes.
- **Camera settings panel built ✅:** Full collapsible settings system in RapidCapture.tsx:
  - X button always top-left (never covered)
  - Gear button top-right opens vertical pill dropping down from gear
  - Pill contains: Flash/Torch cycle (Off→On→Auto→Torch), White balance (sub-chips extend left), Timer (Off/2s/5s), Corner guides toggle, Level indicator toggle, Switch camera
  - Flash and torch combined into single button cycling Off→On→Auto→Torch (torch step skipped if unsupported)
  - Tap-outside backdrop closes pill
  - White balance sub-chips positioned as child of pill, extend left from WB button
- **Camera fullscreen on iPad ✅:** Changed `md:` breakpoints to `lg:` on outer container modal treatment — iPads (768px) now stay fullscreen.
- **Settings button z-index fix ✅:** Two bugs found and fixed:
  1. Viewfinder (`flex-1 relative overflow-hidden`) had no z-index, painting over top bar in DOM order → added `z-0`
  2. Settings panel had `z-19` (invalid Tailwind class, compiled to nothing) → changed to `z-30`
- **Level indicator fixed ✅:** Was a static line. Now reads `deviceorientation` gamma, rotates 80px bar, amber ≤±2°, white ±2–10°, red >±10°. iOS 13+ permission request. Cleanup on unmount.
- **Pinch-to-zoom fixed ✅:** Browser was claiming pinch gesture as page zoom. Added `touch-none` (touch-action: none) to viewfinder div.
- **Zoom pill added ✅:** Always-visible `0.5×/1×/2×/3×` pill centered at bottom corner bracket level (`bottom-6 left-1/2`). Only levels device supports are shown. Hidden if zoom not supported.
- **Hunt Pass modal + unlock flow:** Discussed but not dispatched — Patrick noted it fires too much, needs session-level throttle matching other modals.

**S482 Files changed (2):**
- `packages/frontend/components/RapidCapture.tsx` — full camera settings overhaul (multiple passes)
- `packages/frontend/components/ToastContext.tsx` — toast position top-4 → top-14 md:top-20

---

**S481 (2026-04-15) — AI camera improvements + trails security + Hubs nav move**

**S481 What happened:**
- **Trails security fix ✅:** `/shopper/trails` public endpoint exposed all trails (anyone could see/edit/delete). Fixed: new authenticated `GET /trails/mine` endpoint (trailController.ts `getMyTrails`) filtering by `userId`. Route registered BEFORE `/:trailId` to prevent Express route conflict. Frontend `useMyTrails` hook updated to `/trails/mine`. `[trailId].tsx` fetch updated to direct lookup. Edit/Delete buttons wrapped in `user?.id === trail.userId` ownership guard.
- **Hubs nav move ✅:** Market Hubs moved from general organizer section to TEAMS block in both AvatarDropdown.tsx and Layout.tsx. Icon color changed from `text-purple-400` to `text-gray-400` to match TEAMS section style.
- **AI camera improvements batch (7 items) ✅:** cloudAIService.ts + processRapidDraft.ts + review.tsx:
  - TEXT_DETECTION added to Vision API (catches brand marks on glass/dark items; combined with LABEL_DETECTION)
  - Sparse-label fallback: if <3 specific labels detected, Haiku instructed to reason from silhouette/shape
  - Anti-anchor pricing: removed "estate sale / 20–50% of retail" framing entirely; replaced with secondary market comp-grounded language + non-round example JSON (`{"low":7,"high":23,"suggested":14}`)
  - Comp-based price refinement in processRapidDraft: fetches 5 recent SOLD items by detected category → `suggestPrice` override; best-effort fallback
  - Improved conditionGrade visual checklist: scratches, chips, fading, rust, missing parts, repair signs
  - Tag grouping by type: suggested tags now rendered in Material/Era/Brand/Style/Other groups
  - Within-session tag suppression: tags removed ≥2 times hidden from suggestions for that session
  - Condition-adjusted pricing: selecting a condition grade silently calls `/items/ai/price-suggest` and updates price field; grades with disabled cursor while refreshing
- **TS fix:** processRapidDraft.ts comp map callback explicit type (was implicit `any`)

**S481 Files changed (9):**
- `packages/backend/src/controllers/trailController.ts` — added `getMyTrails` function
- `packages/backend/src/routes/trails.ts` — `GET /mine` route registered before `/:trailId`
- `packages/frontend/hooks/useTrails.ts` — `useMyTrails` → `/trails/mine`
- `packages/frontend/pages/shopper/trails/[trailId].tsx` — direct fetch + ownership guard on Edit/Delete
- `packages/frontend/components/AvatarDropdown.tsx` — Hubs moved to TEAMS block, grey icon
- `packages/frontend/components/Layout.tsx` — Hubs moved to TEAMS block (mobile nav), grey icon
- `packages/backend/src/services/cloudAIService.ts` — TEXT_DETECTION, sparse-label fallback, anti-anchor pricing, improved conditionGrade prompt, non-round example JSON
- `packages/backend/src/jobs/processRapidDraft.ts` — comp-based price refinement post-AI, TS explicit type
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — tag grouping, within-session suppression, condition-adjusted pricing handler + grade button wiring

---

**S480 (2026-04-15) — S468 status card fix + photo lightbox + Item 5 verified + eBay toast fix**

**S480 What happened:**
- **S468 status card fix ✅:** `GET /api/ebay/connection` (ebayController.ts L1325–1338) now returns `fulfillmentPolicyId`, `returnPolicyId`, `paymentPolicyId`, `policiesFetchedAt`. Frontend condition (settings.tsx L851) changed from gating on all 3 policy ID fields to `ebayStatus?.policiesFetchedAt`. Business Policies card now shows green ✓ when policies have been synced.
- **Photo lightbox ✅:** `ItemPhotoManager.tsx` — added `lightboxUrl` state, Escape key handler, `cursor-zoom-in` + `onClick` on photo thumbnails, full-screen overlay with close button and stopPropagation. Patrick verified: "lightbox works."
- **Item 5 reconciliation ✅ (already done in S467):** STATE.md said "dispatch dev next session" — verified full implementation exists in ebayController.ts (L3687–3850: `syncEndedListingsForOrganizer` with GetMultipleItems batches of 20) and `ebayEndedListingsSyncCron.ts` (4h cron). No dispatch needed.
- **NudgeBar organizer suppression ✅:** `NudgeBar.tsx` already had `user?.role === 'ORGANIZER'` guard — confirmed rendering suppressed for organizers via Chrome (screenshot ss_2621nxuyu).
- **eBay save bar browser-confirmed ✅:** `/organizer/settings/ebay` sticky save bar confirmed rendering in actual browser via JS hot-pink injection (Patrick: "it's pink"). Screenshot tool has ~115px blind spot at viewport bottom due to browser chrome offset — bar exists and is functional despite being off-screen in tool captures.
- **eBay push error toast fix (P2) ✅:** `edit-item/[id].tsx` `onSuccess` handler was checking `result?.error` but backend sends `result.code` + `result.message` — `error` field never exists. Fixed to check `result?.code?.includes('NOT_CONNECTED')`, `result?.code?.includes('POLICIES')`, fallback to `result?.message`. Live push fired and confirmed `NO_FULFILLMENT_POLICY_MATCH` response correctly parsed.
- **USED grade-S → USED_EXCELLENT code-verified:** `mapGradeToInventoryCondition` (ebayController.ts L2493–2510) confirmed: grade S + condition=USED returns `USED_EXCELLENT`. Live verification UNVERIFIED (test item has weight=null, triggering `NO_FULFILLMENT_POLICY_MATCH` before condition logic runs).
- **S469 P2 bug noted:** Sticky "Save setup" bar visually hidden behind footer when scrolled to page bottom (z-index issue). Save still works. P2, not blocking.

**S480 Files changed (4):**
- `packages/backend/src/controllers/ebayController.ts` — added 4 policy fields to /api/ebay/connection response
- `packages/frontend/pages/organizer/settings.tsx` — changed Business Policies condition to `policiesFetchedAt`
- `packages/frontend/components/ItemPhotoManager.tsx` — lightbox implementation
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — eBay push error toast: result.error → result.code/message

---

**S469 (2026-04-15) — eBay Phase 1-3 Foundation: Policy Mapping + Weight-Tier Routing + Draft Mode + Setup UI**

**S469 What happened:**
- Patrick flagged the push-first-policy approach as a shortcut. Real-world organizer (Patrick himself) has 22 shipping policies named by weight tier ("8oz Ground Advantage", "1+ lb Ground Advantage", "6+ lb Ground Advantage", "Freight 150+ lb Freight", etc.). eBay also supports 10 description templates per seller.
- Laid out 3-layer architecture: (1) EbayPolicyMapping model with default + weight-tier + shipping-class + category overrides, (2) merchant location routing (sale address / organizer address / existing eBay location), (3) description template injection + draft mode toggle.
- Dispatched three parallel agents (non-overlapping file ownership):
  - **Agent A** (schema + parser): New `EbayPolicyMapping` model, migration `20260415_ebay_policy_mapping`, `ebayPolicyParser.ts` utility (classifyPolicy, parseWeightTiers, matchWeightTier, toOunces). Weight-tier parser handles "8oz", "1+ lb", "N+ lb" — last "N+ lb" promoted to Infinity.
  - **Agent B** (backend): Added `fetchAllEbayPolicies`, `fetchEbayMerchantLocations`, `getEbaySetupData`, `saveEbayPolicyMapping`, `resolvePoliciesForItem`. Modified push flow to per-item routing with priority: category override → HEAVY_OVERSIZED → FRAGILE → weight tier → UNKNOWN → default → EbayConnection fallback. Description template `{{DESCRIPTION}}` placeholder injection. Draft mode wraps publishOffer call.
  - **Agent C** (frontend): New `/organizer/settings/ebay.tsx` (729 lines) — 8 sections: page shell, default policies, weight-tier matrix (editable with "Use suggested defaults"), shipping classification overrides, category overrides, description template, draft mode + merchant location radio, sticky save bar. Added "Advanced eBay Setup →" link in settings.tsx.
- All three agents returned zero TypeScript errors. Main session verified schema fields + new exports + route registration.
- Agent A flagged: pnpm workspace symlink issue prevented `prisma generate` in VM — Patrick must run manually after migrate deploy.

**S469 Files changed (7):**
- `packages/database/prisma/schema.prisma` — added `EbayPolicyMapping` model + `ebayPolicyMapping` relation on Organizer
- `packages/database/prisma/migrations/20260415_ebay_policy_mapping/migration.sql` (NEW)
- `packages/backend/src/utils/ebayPolicyParser.ts` (NEW, 172 lines)
- `packages/backend/src/controllers/ebayController.ts` — policy routing, template injection, draft mode, new endpoints
- `packages/backend/src/routes/ebay.ts` — `GET /setup-data`, `POST /policy-mapping`
- `packages/frontend/pages/organizer/settings/ebay.tsx` (NEW, 729 lines)
- `packages/frontend/pages/organizer/settings.tsx` — "Advanced eBay Setup" link

**S469 Patrick manual actions REQUIRED (schema change):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

**S468 (2026-04-15) — eBay policy sync UI + /sync-policies route**

**S468 What happened:**
- Audited Patrick's Celestion listing showing "Free Standard Shipping" — confirmed the push flow was ALREADY correct: lines 1648–1650 of ebayController.ts use `conn.paymentPolicyId/fulfillmentPolicyId/returnPolicyId` from DB, with a hard validation gate at line 1392.
- Schema already had all policy fields: `paymentPolicyId`, `fulfillmentPolicyId`, `returnPolicyId`, `policiesFetchedAt`, `merchantLocationKey`. No migration needed.
- `fetchAndStoreEbayPolicies()` was already implemented — just needed `export` keyword added.
- Added `POST /api/ebay/sync-policies` route — authenticated organizer endpoint to manually re-fetch policies from eBay Account API.
- Added policy sync status UI to organizer settings page: green ✓ when all 3 policies synced, amber warning with eBay link when missing, "Sync from eBay" button.
- Both packages: zero TypeScript errors verified by main session.

**S468 Files changed (3):**
- `packages/backend/src/controllers/ebayController.ts` — added `export` to `fetchAndStoreEbayPolicies`
- `packages/backend/src/routes/ebay.ts` — added import + `POST /sync-policies` route
- `packages/frontend/pages/organizer/settings.tsx` — policy status card + sync button

---

**S467 (2026-04-15) — eBay listing quality batch (6-item queue) + sitewide organizer rarity filter fix**

**S467 What happened:**
- **P0 sitewide bug found & fixed:** All 7 organizer-facing pages called public `/items?saleId=` endpoint which runs Hunt Pass rarity filter. ULTRA_RARE/RARE items created within 6h were invisible to the organizer on their own management pages (Celestion $285, ULTRA_RARE, 1.8h old — disappeared). Fixed by switching all organizer management pages to `/items/drafts` (authenticated, no rarity filter). Public browsing and Buyer Preview remain unaffected.
- **S466 6-item queue completed:** Items 1–4 and 6 shipped. Item 5 (reconciliation) has Architect spec ready, dev dispatch next session.
- **Item 1** (category honor): No bug — current code already respects DB value.
- **Item 2** (condition → eBay enum): Grade S + condition=USED now sends USED_EXCELLENT not NEW.
- **Item 3** (aspect auto-fill): Brand checks item.brand first; MPN checks item.mpn; tags matched against enum. No more Brand="RIC" on speakers.
- **Item 4** (toast on success): Fixed 3 files — was checking `result.success` instead of `result.status === 'success'`.
- **Item 5** (reconciliation spec): Architect spec written — `claude_docs/specs/ebay-listing-reconciliation-spec.md`. Hybrid cron+on-demand. No schema changes needed. ~150 lines. Dispatch dev next session.
- **Item 6** (watermark QR): Resized 130→85px, moved g_south→g_south_east (bottom-right corner).
- **No migrations this session. No schema change.**

**S467 Files changed (19 + 2 new):**
- `packages/backend/src/controllers/ebayController.ts` — condition fix + aspect auto-fill + reconciliation function
- `packages/backend/src/utils/cloudinaryWatermark.ts` — QR 130→85px, g_south→g_south_east
- `packages/backend/src/routes/ebay.ts` — GET /sync-ended-listings route
- `packages/backend/src/index.ts` — cron startup wiring
- `packages/backend/src/jobs/ebayEndedListingsSyncCron.ts` — NEW 4h cron
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/sales/[id]/index.tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/promote/[saleId].tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/print-inventory.tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/bounties.tsx` — /items → /items/drafts
- `packages/frontend/pages/organizer/dashboard.tsx` — /items → /items/drafts
- `packages/frontend/components/PostSaleEbayPanel.tsx` — toast result.status fix
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — toast result.status fix
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — toast result.status fix
- `claude_docs/specs/ebay-listing-reconciliation-spec.md` — NEW Architect spec
- `packages/backend/src/controllers/ebayController.ts` — push price priority inverted (organizer price wins over AI)

---

**S464 (2026-04-14) — ebayNeedsReview full implementation, billing webhook fix, Stripe env cleanup, eBay two-pass retry**

Files (7):
- `packages/database/prisma/schema.prisma` — Item.ebayNeedsReview Boolean
- `packages/database/prisma/migrations/20260414_ebay_needs_review/migration.sql` (NEW)
- `packages/backend/src/controllers/ebayController.ts` — 25005/25021 two-pass retry, offer PUT merge
- `packages/backend/src/controllers/itemController.ts` — ebayListingId + ebayNeedsReview select
- `packages/backend/src/controllers/billingController.ts` — STRIPE_BILLING_WEBHOOK_SECRET fix
- `packages/frontend/pages/organizer/pricing.tsx` — Stripe price IDs from env
- `packages/frontend/pages/organizer/sales/[id]/index.tsx` — amber "eBay Category Needed" badge

**S464 migrations confirmed applied S488 (psycopg2 query):** `20260414_ebay_needs_review` ran Apr 15 00:49 UTC ✅. Vercel env cleanup still pending: delete old NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID and NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID; confirm live publishable key; confirm Railway STRIPE_TEAMS_MONTHLY_PRICE_ID.

---

## Recent Sessions

- **S518 (2026-04-19):** P1/P2/P3 bug fixes: PostSaleMomentumCard sale-specific stats, Legendary chip SELECT fix, priceBeforeMarkdown on 3 secondary endpoints, Efficiency Coach percentile label fix, pricing.tsx downgrade stub → router.push. Workspace chat empty state fix (allSales not upcomingSales). QA backlog created. Workspace × Sale Command identified as planned feature (Patrick rejected "no integration needed"). Claude Design prompt written for workspace redesign. S518 push block pending Patrick.
- **S515 (2026-04-19):** Chrome QA: #249 SIMPLE gate P1 fixed (lat/lng null → 400 before 409; fixed to omit null from POST body). #230 Who's Coming ⚠️ empty only. #231 High-Value ✅. #232 Sale Pulse ⚠️ P2 views mismatch. #233 Efficiency Coach ✅. #234 Post-Sale Momentum ⚠️ P1 lifetime revenue shown as sale revenue. Roadmap updated.
- **S514 (2026-04-19):** Legendary item toggle (edit-item + itemController). Price Research Card redesign (sections reordered, sage green button). Stripe Connect P2 root cause: missing STRIPE_CONNECT_WEBHOOK_SECRET env var. Dark mode P2: FlashDealForm + ExpenseLineItemList. earlyAccessController req.user.id P1 fix. 8 files — NOT YET PUSHED.
- **S513 (2026-04-19):** Early access cache items page + photo station page built. POS Run Test fix (body params). In-App modal scroll fix. live_pos isAuto removed. 7 files.
- **S512 (2026-04-19):** Email verification gate built + Chrome-verified. DowngradePreviewModal verified. pricing.tsx Downgrade stub found (P3). 4 files.
- **S511 (2026-04-19):** Role fixes (roles?.includes), eBay GetItem fix, QR sizes, messages padding, treasure hunt XP. smoke test: messages ✅, flip report ✅, sale type badge ✅. 12 files.
- **S502 (2026-04-18):** Label Sheet Composer built end-to-end. 4 backend endpoints (cheatsheet, items-for-labels, label-batch, print). Full frontend page with useReducer, price chips, catalog search, live Avery 5160 preview, drag reorder. 3 bug fixes: PDF auth (blob fetch), export download (anchor+download attr), saved batch recall UI (localStorage scan + load/delete). Shared cheatsheet constant extracted. CTA links on print-kit + review pages. 7 files.
- **S500 (2026-04-18):** XP economy full rebalance — 8 decision locks (D-XP-015 to D-XP-018). All backend XP constants updated. Flat purchase XP, referral 500 XP, haul post wired, challenge difficulty+XP wired. hunt-pass.tsx corrected. 8 files.
- **S499 (2026-04-18):** Progress tracker task links audited + corrected (29 tasks). "Ready to Publish" → "Pre-Sale" throughout. Checkbox rendering + optimistic update fix. Print kit: 3 new QR sections. Photo station design. XP discrepancy found. 7 files.
- **S498 (2026-04-17):** Time pickers on edit sale form. Inventory sort newest-first. Video opening frame branding. Sale checklist cache invalidation fix. Planner inclusive copy. Chat auto-scroll removed. 7 files.
- **S490 (2026-04-16):** Video + landing + logo polish. organizer-video-ad.html: white checkmarks, font sizes, scene nav (dots + arrows), wrapper height fix, empire-style lamp SVG, return beam direction fix, eBay button color, headline/badge line breaks, label brightness, bullet timing fix, CTA copy. video.html: padding, features copy, per-sale offer copy, badge. Layout.tsx + _document.tsx: two-tone Montserrat logo in nav + mobile drawer. 4 files.
- **S489 (2026-04-16):** Security gates for "First Sale Free PRO" (8 of 9): email verify, first-sale tracking, IP rate limit, AI quota, card dedup, eBay push quota constants, temporal fraud detection. Graceful tier degradation system: 7-day grace period, GRACE_LOCKED status, DowngradePreviewModal, dashboard banner, daily cron. 2 migrations applied. 27 files across 4 commits. All green.
- **S488 (2026-04-16):** Feature flags backend API ✅ (4 CRUD routes). Chrome QA: /admin/feature-flags ✅, /admin/reports ✅. Migration audit: 4 stuck records cleaned up, all intended schema state confirmed present. Feature #72 (UserRoleSubscription) activated — 13 ORGANIZER rows backfilled via psycopg2; tier lapse tracking now live for all organizers. 2 code files pushed.
- **S487 (2026-04-16):** Schema additions (4 tables: FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog) ✅. (Soon) nav labels removed from Layout + AvatarDropdown ✅. Chrome QA: /admin/items ✅, /admin/broadcast ✅. reports.tsx crash fix applied (revenue?.byDay?.length). Acquisition Playbook language broadened. 6 files.
- **S486 (2026-04-16):** Video polish pass 2 (scene 2 lamp enlarged, review/success `height: 100%` fix, scene 3 payments row sized to fit beam label, font bump across all 5 scenes). Landing page stripped to essentials — logo, video, split, Free Forever offer, 2 FAQs, CTA, footer. SEO meta tags added: canonical, Open Graph, Twitter cards, theme-color, robots, favicon, JSON-LD SoftwareApplication schema. 4 files.
- **S485 (2026-04-15):** Animated video polished across 2 sessions. Final state: 38-second 9:16 animated HTML5 video, 5 scenes. Phones no longer shift during payment swap (CSS grid stacking), counter starts at 75, bullets appear after shopper phone settles, beam label width stabilized. 1 file.
- **S484 (2026-04-15):** Organizer acquisition playbook rebuilt v3 (Koerner/Outscraper methodology at scale — 5k+ contacts, $285/mo; + guru framework mapping for 8 gurus; + influencer flywheel strategy with 8 named targets; + ICP definition). 25-second animated HTML5 video built (9:16 vertical, 5 scenes, brand-accurate, self-contained). RVM scale corrected: 5k–20k contacts, not 25. Two-sided flywheel identified: shopper influencers (Gary Vee) pull buyers → buyers pull organizers (Airbnb model). 9 innovation ideas approved with BUILD NOW / DEFER verdicts. 2 files.
- **S483 (2026-04-15):** eBay settings bugs (3 fixes). Admin dashboard rebuild — 5 Coming Soon pages delivered (reports, items, broadcast, feature-flags, index KPIs), 3 new backend controllers (adminReports, adminBroadcast, ebayRateLimiter), getStats upgraded with MRR/funnel/sparklines. Cost protection playbook + organizer signals spec written. Architect schema designs for 4 tables (FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog) — not yet in schema.prisma. 15 files. Chrome QA pending.
- **S481 (2026-04-15):** Trails security fix (public endpoint → authenticated /mine + ownership guard). Hubs nav moved to TEAMS block (grey icons). AI camera batch: TEXT_DETECTION for dark/glass, sparse-label fallback, comp-grounded pricing (anti-anchor), conditionGrade visual checklist, tag grouping by type, within-session suppression, condition-adjusted pricing. 9 files. Zero TS errors.
- **S480 (2026-04-15):** S468 status card fix ✅ (4 fields added to /api/ebay/connection). Photo lightbox ✅ (ItemPhotoManager). Item 5 reconciliation verified already done in S467. NudgeBar organizer suppression ✅. eBay save bar browser-confirmed ✅ (hot-pink injection). eBay push error toast P2 fixed (result.code/message not result.error). USED_EXCELLENT code-verified, live UNVERIFIED (weight=null). 4 files.
- **S479 (2026-04-15):** Chrome QA of S467/S468/S469. S467 rarity filter ✅, S469 Advanced Setup page ✅ (all 8 sections render), S468 ⚠️ PARTIAL — sync works, status card broken (settings.tsx reads fields missing from /api/ebay/connection payload). Fix routed next session. 0 code changes.
- **S469 (2026-04-15):** eBay Phase 1-3 foundation — 3 parallel agents shipped EbayPolicyMapping model + weight-tier parser + per-item policy routing + draft mode + full setup page (8 sections). Handles 22+ shipping policies via weight-tier matching. Migration applied. 7 files. Zero TS errors.
- **S468 (2026-04-15):** eBay policy sync: confirmed push flow already uses DB policy IDs. Added export + POST /sync-policies route + settings UI (policy status card + sync button). No schema changes. Zero TS errors. 3 files.
- **S467 (2026-04-15):** eBay listing quality batch (6/6 items done) + P0 sitewide organizer rarity filter fix (7 pages). Condition/aspect/toast/watermark fixes. Reconciliation spec ready. 13 files changed. No migrations.
- **S466 (2026-04-14):** Add Items filter fix (getDraftItemsBySaleId) + eBay price priority inversion (organizer price wins). 2 files.
- **S465 (2026-04-14):** Roadmap graduation pass (v106 → v107) — 31 features moved to SHIPPED & VERIFIED. #245 Feedback Widget deprecated → Rejected. STATE.md compacted from 1603 → ~250 lines (S428–S449 archived to COMPLETED_PHASES.md). All go-live env blockers cleared.
- **S464 (2026-04-14):** ebayNeedsReview full implementation (amber badge on sale detail when all 5 category suggestions fail). Billing webhook secret fix (P0). Stripe env cleanup. eBay two-pass retry (25021 + 25005 independent passes). Migration needed: `20260414_ebay_needs_review`.
- **S463 (2026-04-14):** Static eBay category picker retired. Live Taxonomy API picker shipped. ebayCategoryMap.ts deleted. eBay sync architecture spec produced (GetMultipleItems batch replacement for GetItem loop recommended).
- **S462 (2026-04-14):** eBay Listing Data Parity Phase A + B + C. 17 new Item fields (weight, dimensions, UPC/EAN/ISBN/MPN/brand, conditionNotes, best offer, subtitle). HTML sanitizer. Catalog product match. Auto-fill identifiers.
- **S461 (2026-04-14):** eBay push end-to-end working after 6 rounds of fixes. Contigo travel mug published successfully (Patrick-verified).
- **S460 (2026-04-14):** eBay push UI in 3 locations (sale detail, edit-item, review page). QR watermark default. PostSaleEbayPanel shipped. Shipping classification (SHIPPABLE/HEAVY_OVERSIZED/FRAGILE/UNKNOWN).
- **S459 (2026-04-14):** eBay webhook + enrichment fully operational.
- **S458 (2026-04-14):** Pull to Sale UX + eBay field extraction + GetItem enrichment pass.
- **S457 (2026-04-13):** Pull to Sale fixed for eBay inventory items.
- **S456 (2026-04-14):** eBay inventory import fully operational — Trading API, photos, dedup cleanup. Patrick-verified.
- **S455 (2026-04-13):** eBay inventory import + terminology cleanup (library→inventory) + OAuth/cart fixes.
- **S454 (2026-04-13):** Hunt Pass → recurring Stripe Subscription. Go-live audit fixes. Patrick-verified purchase flow.
- **S452 (2026-04-13):** eBay + Stripe go-live prep — bidirectional sync, policy IDs, env audit.
- **S451 (2026-04-13):** Dashboard layout lock (Hero→Action→QR→Hunt Pass→Tabs order). 5th action button (My QR). Compass icon for Initiate. Patrick-verified layout. ⚠️ Catastrophic push incident documented (VM git index desync — recovered).
- **S450 (2026-04-13):** Dashboard character sheet rebuild. P0 rank staleness fixed (JWT no longer caches explorerRank; Nav fetches fresh via useXpProfile). Rank names locked: Initiate/Scout/Ranger/Sage/Grandmaster (0/500/2000/5000/12000). /shopper/ranks page shipped.
- **Pre-S450:** See `claude_docs/COMPLETED_PHASES.md` for S428–S449 summaries and full archived wrap blocks.

---

## Go-Live Blockers

**All P0/P1 env blockers cleared S465.** Remaining items are polish and QA.

| Priority | Item | Owner | Notes |
|----------|------|-------|-------|
| ✅ | ~~Run S464 ebayNeedsReview migration~~ | Patrick | DONE S465 |
| ✅ | ~~Register live Stripe webhooks~~ | Patrick | DONE S465 — both endpoints live, correct event sets, screenshot-verified |
| ✅ | ~~Confirm webhook signing secrets match Railway~~ | Patrick | DONE S465 — Patrick confirmed |
| ✅ | ~~Vercel: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` live~~ | Patrick | DONE S465 — `pk_live_51T3kXh...` verified |
| ✅ | ~~Railway: `STRIPE_HUNT_PASS_PRICE_ID` live~~ | Patrick | DONE S465 — `price_1TLtY1...` verified |
| ✅ | ~~Railway: `STRIPE_GENERIC_ITEM_PRODUCT_ID` live~~ | Patrick | DONE S465 — `prod_UKZ2G21VhLJ3CE` verified |
| ✅ | ~~MailerLite + Resend env vars on Railway~~ | Patrick | DONE S465 — `RESEND_API_KEY`, `MAILERLITE_API_KEY`, `MAILERLITE_SHOPPERS_GROUP_ID` all present |
| P2 | Chrome QA: eBay push with book/clothing/furniture categories | Claude/Patrick | Verifies S461–S464 hold beyond Contigo |
| P2 | Chrome QA: PostSaleEbayPanel end-to-end (ENDED sale) | Claude | |
| P2 | Chrome QA: watermark layout after S465 fix | Patrick/Claude | Confirm QR stacks above text, both bigger, no overlap |
| P3 | Archive ~14 junk Stripe test products | Patrick | Catalog cleanup |

**Go-Live env gate is CLOSED.** The platform can accept live payments end-to-end. Remaining blockers are behavioral verification (Chrome QA) and cleanup, not prerequisites.

---

## Next Session Priority

**0. Patrick: run S518 push block (mandatory first action):**
```powershell
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/backend/src/controllers/itemController.ts
git add packages/frontend/components/EfficiencyCoachingWidget.tsx
git add packages/frontend/pages/pricing.tsx
git add packages/frontend/pages/workspace/[slug].tsx
git add claude_docs/operations/qa-backlog.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S518: PostSaleMomentumCard sale-specific stats, Legendary chip fix, priceBeforeMarkdown endpoints, Efficiency Coach label, pricing stub, workspace chat empty state fix, QA backlog"
.\push.ps1
```

**1. Chrome QA — S518 hot items (after push deploys):**
- S518-A: `/organizer/dashboard` State 3 → PostSaleMomentumCard → verify Items Sold + Sell-Through % are sale-specific (not lifetime)
- S518-B: `/organizer/add-items/[saleId]/review` → click "⭐ Legendary?" chip on $75+ item → chip dismisses after click
- S518-C: `/organizer/dashboard` → Efficiency Coach → "Top X%" shows actual percentile (not "Top 100%")
- S518-D: `/pricing` → "Downgrade to Free" → navigates to `/organizer/subscription`
- S518-E: `/workspace/test` → Team Communications shows chat tabs (not "Create a sale" empty state)

**2. Workspace × Sale Command (new feature):**
- Run Claude Design prompt (saved in patrick-dashboard.md) in Claude Design tool → get visual mockups
- Feed mockups back → dispatch findasale-ux for full flow spec
- Then dispatch findasale-dev for implementation
- Checklist data available via `GET /api/sales/:saleId/checklist` — no new backend needed for read. Task ownership needs 1 new field.

**3. Railway MCP — decide on removal:**
Double-OAuth fires on every prompt. No Cowork-native replacement exists. Recommend removing plugin via Cowork settings. Railway auto-deploys on push; Railway dashboard covers logs.

**4. QA backlog — work through hot items:**
See `claude_docs/operations/qa-backlog.md` for full queue. Start with S518 hot items above, then S516 unverified items blocked on test conditions.

**Carry-forward queue (lower priority):**
- Bump Post feed sort (needs Architect sign-off before dev dispatch)
- Price Research Card redesign (`claude_docs/design/PRICE_RESEARCH_CARD_UX_SPEC.md`)
- Brand audit copy: SharePromoteModal, homepage meta, organizer profile meta
- Referral fraud gate (D-XP-004)
- RankUpModal — built but not connected to AuthContext rank-change event
- Legendary item flag — no organizer UI to mark items Legendary yet

**Deferred:**
- Device fingerprinting Phase 2 (FingerprintJS — defer until beta scale justifies)
- Bounty redesign Phase 2
- Flea Market Events full implementation (ADR-014 locked, not yet staffed)
- ~~Stripe Connect webhook config~~ — DONE S516: Patrick added STRIPE_CONNECT_WEBHOOK_SECRET to Railway.
- Bounties dollars vs XP: open decision

**Postponed QA queue:**
- S436 earnings/qr-codes/staff
- S430 Yahoo spam test, iOS geolocation, print label
- S431 trail detail + trail stops on map
- S427 full invoice flow
- S433 auction reserve/proxy/soft-close/bid history/cron

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|----------------|---------------|
| #143 PreviewModal onError | Defensive fix only — can't trigger Cloudinary 503 in prod. ACCEPTABLE UNVERIFIED. | N/A | S312 |
| #143 AI confidence — Camera mode | Requires real camera hardware in Chrome MCP. | Real device camera capture → Review & Publish → confirm "Good (X%)" copy. | S314 |
| Single-item publish fix | S326 fix deployed; no DRAFT items exist to exercise button (Manual Entry skips draft pipeline). | Camera-capture → Review & Publish → single Publish → confirm SOLD + toast. | S326/S327 |
| ValuationWidget (S406) | No draft items in user2 sales. Requires TEAMS tier + draft. | TEAMS organizer + draft item → Review → verify ValuationWidget + dark mode. | S406 |
| Treasure Trails check-in (S404) | No trail data in DB. | Create trail → shopper /trails/[id] → check in at stop → verify XP awarded. | S406 |
| Review card redesign (S399) | No draft items for any test organizer. | Camera-capture → Review → confirm Ready/Needs Review/Cannot Publish cards. | S406 |
| Camera thumbnail refresh (S400/S401) | Requires real camera hardware in Chrome MCP. | Capture in rapidfire → confirm thumbnail strip live-updates. | S406 |
| POS camera/QR scan (S405) | Camera hardware required. | Organizer POS → QR tile → scan sticker → confirm added to cart. | S406 |
| ebayNeedsReview amber badge (S464) | Needs migration run + push attempt that exhausts all 5 category suggestions with 25005. | Run migration → push "Whip-It butane" item → confirm badge. | S464 |
| eBay push USED_EXCELLENT condition | Test item has weight=null → NO_FULFILLMENT_POLICY_MATCH before condition logic runs. | Set weight on test item, configure default policy → push → confirm eBay gets USED_EXCELLENT. | S480 |
| eBay push watermark QR (S467) | Needs a successful eBay push to verify photo watermark placement. | Successful push → check eBay listing photos → confirm QR is 85px bottom-right. | S480 |
| Post-Sale eBay Panel (S460/#292) | Needs sale in ENDED status with unsold items. | End test sale → sale detail → verify PostSaleEbayPanel renders, toast, shipping badges. | S460 |
| eBay Listing Data Parity (S462/#293) | 17 new fields built but not Chrome-QA'd. Patrick planned self-QA. | Edit eBay → fill UPC/weight/dims → save → push → verify on eBay. | S462 |
| Live category picker (S463/#294) | Built but not Chrome-QA'd. | Item editor → category search → verify Taxonomy API results + depth levels. | S463 |

---

## Standing Notes

- Railway backend: `https://backend-production-153c9.up.railway.app`
- Vercel frontend: `https://finda.sale`
- Test accounts: user1 (TEAMS), user2 (organizer SIMPLE), user3 Carol Williams (TEAMS), user11 Karen Anderson (shopper, Hunt Pass active), user12 Leo Thomas (shopper). All passwords: `password123`.
- **Survivor accounts (survive database nuke):** Admin → `deseee@gmail.com` | Teams Organizer → `artifactmi@gmail.com`. See `packages/database/prisma/survivor-seed.ts`.
- eBay: production credentials live in Railway. Browse + Trading + Taxonomy + Catalog APIs all live.
- POS test prerequisite: Organizer must have Stripe Connect configured; shopper must be linked via QR scan first.
- DB: Railway PostgreSQL (`maglev.proxy.rlwy.net:13949/railway`) — migration commands in CLAUDE.md §6.
- Backend route mounts: `app.use('/api/organizers', ...)`, `/api/sales`, `/api/trails`, `/api/boosts`, `/api/lucky-roll`.
- **Stripe Connect webhook (P2 — unresolved since S421):** Configure Stripe Dashboard → Events on Connected accounts → `payment_intent.succeeded` → `/api/webhooks/stripe` → Railway `STRIPE_CONNECT_WEBHOOK_SECRET`. Without it, items don't mark SOLD after POS card payment.
- **STATE.md compacted S465 (2026-04-14):** Sessions S428–S449 archived to `COMPLETED_PHASES.md`. Prior compaction S?/2026-04-10 archived S427 and older. ~1350 lines removed this pass.
