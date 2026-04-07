# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

**S406 COMPLETE (2026-04-07):** QA sweep (S396–S406 features), OG-3 survey trigger wired, onboarding modal P1 fix

**S406 QA Session Summary (S406b):**

Chrome QA sweep + 2 code fixes shipped.

**QA Results:**
- eBay production API: ✅ PASS — 10 sold listings returned ($32.39–$96.11 range, median $60.99), production Browse API confirmed live
- Condition field (S406): ✅ PASS — confirmed prior session
- Shopper QR code (S405): ✅ PASS — 188×188px PNG QR data URI confirmed on shopper dashboard
- POS full UI (S405): ✅ PASS — all 4 payment tiles render, correct order (Cash/Stripe QR/Card Reader/Invoice)
- Support chat gate (S405): ✅ PASS — "20 requests left today" gate visible for non-TEAMS users
- Treasure Trails routes (S404): ✅ PASS — /trails empty state, /trails/[id] "Trail not found" + back link, /trail/[shareToken] "Trail Not Found" all correct
- ValuationWidget (S406): UNVERIFIED — no draft items available for user2; requires TEAMS user with item in review page
- Treasure Trails check-in (S404): UNVERIFIED — no trail data in DB; requires organizer to create a trail first
- Review card redesign (S399): UNVERIFIED — user2 has no draft items (all 11 are Live/published)
- Camera thumbnail refresh (S400/S401): UNVERIFIED — requires real camera hardware
- POS camera/QR scan (S405): UNVERIFIED — requires camera hardware

**Code fixes this session:**
- `HoldToPayModal.tsx` — OG-3 survey trigger wired after mark-sold success
- `organizer/dashboard.tsx` — P1 onboarding modal loading race fixed (`!isLoading` guard)
- TypeScript check: zero errors

**S406 (dev session) COMPLETE (2026-04-07):** Condition field standardization, health score category fix, ValuationWidget auth+dark mode, eBay production switch, deletion endpoint

**S406 Summary:**

Eight fixes across review page, health score, pricing, and eBay integration. (1) **ValuationWidget 401 + dark mode:** switched from raw `axios` to authenticated `api` helper; replaced non-existent `sage-*` Tailwind classes with `gray-*`/`green-*`. (2) **Health score always flagging category:** `computeHealthScore()` in `itemController.ts` was never passed `category` field — added `category: item.category ?? undefined`. (3) **Health score gate:** capped score at 69 when category OR conditionGrade missing so Improvements section fires. (4) **Condition field mismatch:** review page used `NEW/LIKE_NEW/GOOD/FAIR/POOR`; edit-item used `NEW/USED/REFURBISHED/PARTS_OR_REPAIR`. Standardized entire codebase to canonical set including AI prompts, upload controllers, and schema comment. (5) **Review page condition options not updated:** dev agent updated array/map but not JSX `<option>` elements — fixed inline. (6) **Legacy condition mapping in getEditState:** items with old DB values (GOOD→USED, LIKE_NEW→NEW, POOR→PARTS_OR_REPAIR) now map correctly when loaded in review page. (7) **Dynamic category fallback:** AI-suggested categories not in the curated list (e.g. "Linens") now appear as a dynamic `<option>` in the review page dropdown. (8) **eBay production switch:** switched token + Browse API URLs from `api.sandbox.ebay.com` → `api.ebay.com`; added eBay marketplace account deletion endpoint (`GET/POST /api/ebay/account-deletion`) required to unlock production keyset.

**S406 Files Changed (10 files, 2 new):**
- `packages/frontend/components/ValuationWidget.tsx` — axios→api, sage-*→gray-* dark mode
- `packages/backend/src/controllers/itemController.ts` — category field added to computeHealthScore call
- `packages/backend/src/utils/listingHealthScore.ts` — cap at 69 when category/conditionGrade missing
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — CONDITIONS canonical, CONDITION_MAP, legacy mapping in getEditState, option elements, dynamic category fallback
- `packages/frontend/components/SmartInventoryUpload.tsx` — CONDITIONS canonical
- `packages/backend/src/controllers/uploadController.ts` — validation messages
- `packages/backend/src/controllers/batchAnalyzeController.ts` — fallback defaults
- `packages/backend/src/services/cloudAIService.ts` — AI prompts
- `packages/database/prisma/schema.prisma` — condition field comments
- `packages/backend/src/controllers/ebayController.ts` — sandbox→production URLs + deletion endpoint handlers
- `packages/backend/src/routes/ebay.ts` — NEW (GET/POST /account-deletion)
- `packages/backend/src/index.ts` — registered /api/ebay routes

**S406 No migration required.**

**S406 eBay status:** Production credentials set in Railway. Deletion endpoint live at `https://backend-production-153c9.up.railway.app/api/ebay/account-deletion`. Patrick must go to eBay Alerts & Notifications page and click Save to complete keyset validation. Once validated, Browse API will return real eBay listings.

**S405 COMPLETE (2026-04-07):** TrailCheckIn fix, support chat gate, treasure hunt race condition, POS shopper QR, in-app payment request, Vercel build fixes

**S405 Summary:**

Eight fixes + one new feature shipped. (1) **TrailCheckIn photoId TS error:** `photoId` removed from `trailCheckIn.update` — field was removed from schema in S404 but controller still referenced it. (2) **Support chat gate broken for admin/TEAMS:** `support.tsx` was using `fetch('/api/users/me')` (Next.js 404) instead of `api.get('/users/me')`; also reading `roleSubscriptions` which isn't in the API response — fixed to check `user.organizer?.subscriptionTier`. Backend `supportController.ts` updated to include organizer in user query. Removed dead Community Forum block. (3) **TreasureHunt P2002 race condition:** `findUnique` + `create` replaced with `upsert` — concurrent requests for same date record no longer crash with unique constraint error. (4) **GET /reservations/my-holds-full missing:** 404s on frontend — endpoint added to `reservationController.ts` and registered in routes before catch-all. (5) **POS shopper QR scan:** `GET /users/qr/:userId` endpoint added. Organizer scans `findasale://user/{userId}` QR in POS — toast fires and linked shopper banner persists even when cart is empty. Dark mode fix on banner (`dark:bg-gray-800/border-gray-600/text-warm-100`). (6) **Shopper QR code on dashboard:** "My QR Code" section added to shopper dashboard — fetches QR data URL from backend. (7) **POS in-app payment request:** Architect-approved feature. `POSPaymentRequest` schema + migration. `posPaymentController.ts` (4 endpoints: create/get/accept/decline). Stripe webhook branch in `stripeController.ts`. Socket.io real-time `POS_PAYMENT_REQUEST` / `POS_PAYMENT_STATUS` events via `user:${userId}` rooms. Frontend: `usePOSPaymentRequest` hook, `PaymentRequestForm` component, `shopper/pay-request/[requestId]` page. (8) **Vercel build fixes:** Two errors resolved — `server-sitemap.xml.tsx` `catch` block still called `getServerSideSitemap(ctx, [])` (ctx is undefined in v4 — removed); `usePOSPaymentRequest.ts` imported from `./useSocket` which doesn't exist — replaced with direct `socket.io-client` pattern matching `useLiveFeed.ts`.

**S405 Files Changed (19 files, 5 new):**
- `packages/backend/src/controllers/trailController.ts` — removed photoId from trailCheckIn.update
- `packages/frontend/pages/support.tsx` — api.get fix, chat gate subscriptionTier check, CTA /pricing, forum block removed
- `packages/backend/src/controllers/supportController.ts` — organizer.subscriptionTier in user query + tier check
- `packages/backend/src/services/treasureHuntService.ts` — findUnique+create → upsert
- `packages/backend/src/controllers/reservationController.ts` — getMyHoldsFull added
- `packages/backend/src/routes/reservations.ts` — GET /my-holds-full registered before catch-all
- `packages/backend/src/controllers/userController.ts` — getUserQRData endpoint added
- `packages/backend/src/routes/users.ts` — GET /qr/:userId registered before /:id catch-all
- `packages/frontend/pages/organizer/pos.tsx` — findasale://user/ QR branch, persistent linked shopper banner, dark mode
- `packages/frontend/pages/shopper/dashboard.tsx` — "My QR Code" section added
- `packages/database/prisma/schema.prisma` — POSPaymentRequest model + relations
- `packages/database/prisma/migrations/20260406_add_pos_payment_request/migration.sql` — NEW
- `packages/backend/src/controllers/posPaymentController.ts` — NEW (create/get/accept/decline)
- `packages/backend/src/controllers/stripeController.ts` — POS payment webhook branch
- `packages/backend/src/routes/pos.ts` — 4 new payment-request endpoints
- `packages/frontend/hooks/usePOSPaymentRequest.ts` — NEW (direct socket.io-client, no useSocket)
- `packages/frontend/components/PaymentRequestForm.tsx` — NEW (Stripe CardElement form)
- `packages/frontend/pages/shopper/pay-request/[requestId].tsx` — NEW (countdown + accept/decline + payment)
- `packages/frontend/pages/server-sitemap.xml.tsx` — ctx removed from catch block

**S405 Migration Required — run BEFORE testing POS payment request:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S405 Deferred:**
- Chrome QA sweep (S396–S404) — deferred again; Vercel build repairs took the session
- OG-3 survey trigger (mark-sold) — still deferred from S404
- Google Places API key — Patrick needs to create (console.cloud.google.com → Maps Platform → Places API)

---

**S404 COMPLETE (2026-04-06):** Explorer's Guild + Treasure Trails — full one-shot build + feedback survey triggers

**S404 Summary:**

Three work batches. (1) **Master spec created:** `claude_docs/specs/explorers-guild-master-spec.md` — 403-line authoritative reference combining all locked XP economy, sink, Treasure Trails, API, and schema decisions. (2) **Treasure Trails implemented (one shot):** Schema (TreasureTrail extended + 5 new models: TrailStop, TrailCheckIn, TrailPhoto, TrailCompletion, TrailRating), migration SQL, PlacesService (Google Places API), trailController (11 endpoints), trails route, TrailCard component, trail discovery page (`/trails`), trail detail + check-in page (`/trails/[trailId]`), organizer trail builder (`/organizer/trails/[saleId]`), nav links added to AvatarDropdown + Layout. (3) **Feedback survey triggers wired:** 9/10 triggers wired (OG-3 deferred — mark-sold flow unclear).

**S404 Files Changed (22 files, 8 new):**
- `packages/database/prisma/schema.prisma` — TreasureTrail extended + 5 new models + User/Organizer/Sale relations
- `packages/database/prisma/migrations/20260406_add_treasure_trails/migration.sql` — NEW
- `packages/backend/src/lib/placesService.ts` — NEW (Google Places API, haversine)
- `packages/backend/src/controllers/trailController.ts` — NEW (11 endpoints)
- `packages/backend/src/routes/trails.ts` — NEW (replaces V1 placeholder)
- `packages/frontend/components/TrailCard.tsx` — NEW
- `packages/frontend/pages/trails/index.tsx` — NEW (public trail discovery)
- `packages/frontend/pages/trails/[trailId].tsx` — NEW (trail detail + check-in)
- `packages/frontend/pages/organizer/trails/[saleId].tsx` — NEW (organizer trail builder)
- `packages/frontend/components/AvatarDropdown.tsx` — Treasure Trails nav link added
- `packages/frontend/components/Layout.tsx` — Treasure Trails nav link added (mobile)
- `packages/frontend/pages/organizer/edit-sale/[id].tsx` — OG-1 survey trigger (publish sale)
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — OG-2 survey trigger (10th item)
- `packages/frontend/pages/organizer/pos.tsx` — OG-4 survey trigger (POS checkout)
- `packages/frontend/pages/organizer/settings.tsx` — OG-5 survey trigger (settings save)
- `packages/frontend/pages/shopper/checkout-success.tsx` — SH-1 survey trigger (purchase success)
- `packages/frontend/pages/items/[id].tsx` — SH-2 + SH-3 survey triggers (favorite + bid)
- `packages/frontend/pages/shopper/haul-posts/create.tsx` — SH-4 survey trigger (haul post)
- `packages/frontend/components/FollowOrganizerButton.tsx` — SH-5 survey trigger (follow)
- `claude_docs/specs/explorers-guild-master-spec.md` — NEW
- `claude_docs/STATE.md` + `claude_docs/patrick-dashboard.md` — wrap docs

**S404 Migration Required (run after push):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S404 Continuation — additional fixes (same session):**
- `packages/database/prisma/schema.prisma` — Prisma field conflict fixed: V1 `stops Json` renamed to `stopsJson @map("stops")` (allows `stops TrailStop[]` relation to coexist); TrailCheckIn circular FK fixed (removed photoId FK, replaced with back-reference `photos TrailPhoto[]`)
- `packages/frontend/pages/shopper/hunt-pass.tsx` — Full XP earning table (all actions, Hunt Pass 1.5x column) + XP sinks section added; auth gate removed (page now public; auth check moved to subscribe button)
- `packages/frontend/pages/faq.tsx` — 11 AI text replacements + 5 new XP/Hunt Pass/Trails FAQ entries
- `packages/frontend/pages/support.tsx` — AI text replacements
- `packages/frontend/pages/inspiration.tsx` — AI text replacements
- `packages/frontend/pages/organizer/appraisals.tsx` — AI text replacements
- `packages/frontend/pages/organizer/fraud-signals.tsx` — AI text replacements
- `packages/frontend/pages/organizer/typology.tsx` — AI text replacements
- `packages/frontend/styles/support.module.css` — Organizer support page dark mode fixed
- `packages/backend/src/services/xpService.ts` — `COUPON_GENERATE` cost corrected: 20 → 50 XP (per locked spec)
- `packages/backend/src/controllers/couponController.ts` — (1) removed userId ownership lock from `validateCoupon` (coupons are now redeemable by any shopper with the code); (2) added `generateXpSinkCoupon` endpoint (50 XP, $1-off, 30-day, max 5/month per organizer); (3) disabled `issueLoyaltyCoupon` — not in spec, created undisclosed organizer payout liability
- `packages/backend/src/controllers/stripeController.ts` — commented out `issueLoyaltyCoupon()` call
- `packages/backend/src/routes/coupons.ts` — added `POST /generate` (requireOrganizer)

**S404 Deferred:**
- OG-3 survey trigger (after mark sold) — mark-sold flow location unclear; wire in next session
- Chrome QA sweep (all sessions S396–S402) — deferred to S405 per Patrick

---

**S403 COMPLETE (2026-04-06):** Explorer's Guild full gamification design — Treasure Trails + XP economy

**S403 Summary:**
Full gamification deep dive. Multi-agent pass: Innovation → DA+Steelman (parallel) → Advisory Board. Advisory Board verdict: 8×+1, 3×0, 0×-1 — Conditional Proceed. Three non-negotiables: rank visibility opt-in, seasonal streaks (not calendar), Hunt Pass framed as "support indie sellers."

**S403 Files created:**
- `claude_docs/research/s403-gamification-research.md` — Innovation research memo (600 lines)
- `claude_docs/feature-notes/gamedesign-decisions-2026-04-06.md` — Full XP economy, sinks, $ ratio table, locked decisions (Rev 2)
- `claude_docs/feature-notes/treasure-trails-architect-adr.md` — schema + API contracts, architect feasibility verdict (GO)

---

**S402 COMPLETE (2026-04-06):** Review/edit-item/pricing bug batch — health score, Price Research Panel, eBay integration

**S402 Summary:**

Seven bugs fixed across review page, pricing components, and eBay integration. (1) Health score: `category` field added (0–5 pts), placeholder "Select..." values now treated as empty for both category and conditionGrade. (2) AI confidence copy reworded in review.tsx from "AI suggested these fields (X% confidence)" to "X% confidence in auto suggested fields." (3) Price Research Panel overhauled: renamed to "Smart Pricing," explanatory copy added under each section, eBay button changed from full-width primary to compact outline, subtler dividers, "Platform Comps" → "Sales Comps." (4) ValuationWidget PRO gate fixed to include TEAMS tier. (5) eBay comps endpoint fixed — frontend was calling GET /items/ebay-comps (hitting /:id with id="ebay-comps") instead of POST /items/:id/comps. (6) eBay CSV export now filters to selected item IDs when provided. (7) Health breakdown UI updated — category and condition now appear as line items in the What's Ready/Must Fix/Improvements sections. Follow-on: removed "AI-generated" brand copy violation from PriceResearchPanel, switched eBay to sandbox endpoints, fixed TypeScript optional chaining on category/conditionGrade fields, Railway cache bust.

**S402 Files Changed (9 files):**
- `packages/backend/src/utils/listingHealthScore.ts` — category field + scoring, placeholder detection for category/conditionGrade
- `packages/backend/src/controllers/ebayController.ts` — CSV itemIds filter, sandbox API URLs
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — AI confidence copy, health breakdown UI (category/condition rows), HealthBreakdown type + optional chaining fixes
- `packages/frontend/components/PriceResearchPanel.tsx` — Smart Pricing rename, layout condensed, brand copy fix, eBay endpoint fix POST /items/:id/comps
- `packages/frontend/components/ValuationWidget.tsx` — TEAMS tier added to PRO gate
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — eBay CSV export passes itemIds
- `packages/frontend/pages/faq.tsx` — Patrick's local edits
- `packages/frontend/pages/support.tsx` — Patrick's local edits
- `packages/backend/Dockerfile.production` — Railway cache bust 2026-04-06

**S402 No migration required.**

**S402 eBay note:** Sandbox credentials configured in Railway. When ready for production, swap both eBay API URLs back to `api.ebay.com` and update Railway env vars to production app credentials.

---

**S401 COMPLETE (2026-04-06):** Camera thumbnail refresh, icon-only photo buttons, mobile swipe-back closes camera

**S401 Summary:**

Three camera UX fixes. (1) Thumbnails now refresh without page reload after inline camera Save or X-close: `ItemPhotoManager` gained a `useEffect` keyed on photo URLs to sync local state when the parent query refetches; review and edit-item pages now fire an explicit `invalidateQueries` AFTER the camera closes, not just during upload. (2) Upload/Camera/Rapidfire buttons are now icon-only (📁 📷 ⚡) and live inside the `ItemPhotoManager` header — replacing the old separate "+ Add Photos" button. `ItemPhotoManager` got a new `headerActions` prop for this. (3) Mobile swipe-back in rapidfire/camera mode now closes the inline overlay instead of navigating to the previous page — both pages use `history.pushState` + `popstate` intercept.

**S401 Files Changed (3 files):**
- `packages/frontend/components/ItemPhotoManager.tsx` — `useEffect` to sync initialPhotos prop; `headerActions` prop replaces default "+ Add Photos" button
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — post-close invalidateQueries; icon-only headerActions; popstate swipe-back intercept
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — post-close invalidateQueries; icon-only headerActions; popstate swipe-back intercept

**S401 No migration required.**

---

**S400 COMPLETE (2026-04-06):** QR left-align on labels/price sheet, inline camera append fix, thumbnail strip live update, regular mode photo count awareness

**S400 Summary:**

Camera/upload fixes across edit-item and review pages. (1) Avery label stickers and price sheet cheat sheet: QR code moved from right side to left side; text repositioned right by 50pts to fill vacated space. (2) Label count copy corrected: "1 per page" → "6 per page", "12 per page" → "30 per page". (3) Edit-item and review page camera/rapidfire buttons now open inline RapidCapture overlay instead of navigating to add-items page. Photos append to the existing item, not create new items. (4) Rapidfire thumbnail strip now updates live on each capture (`inlineRapidItems` state — same pattern now on both edit-item and review pages). (5) Regular camera mode seeds `photosThisItem` from the item's existing photo count, so the "X/5" counter and coaching banner show the correct step from the first shot. (6) "Analyze" button renamed "Save". (7) Trailing null byte removed from print-kit page.

**S400 Files Changed (7 files):**
- `packages/backend/src/controllers/printKitController.ts` — QR left-aligned on Avery stickers + price sheet
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — URL param wiring to append rapidfire photos to existing item
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — inline camera overlay, `inlineRapidItems` state, `refetchOnMount: 'always'`
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — inline camera overlay, `inlineRapidItems` state, seed from existing count
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx` — label count copy fix + null byte removed
- `packages/frontend/pages/faq.tsx` — Patrick's text edits + question rearrangement (restored from truncation)
- `packages/frontend/components/RapidCapture.tsx` — `photosThisItem` seeds from existing photo count in regular mode; "Analyze" → "Save"

**S400 No migration required.**

---

**S399 COMPLETE (2026-04-06):** Review card redesign + feedback system + 6 review-page bug fixes

**S399 Summary:**

Three work batches in one session. (1) Review card redesign: replaces raw health scores/AI confidence with "Ready to Publish" / "Needs Review" / "Cannot Publish" status system, color-coded breakdown sections. (2) Feedback collection system: schema migration (FeedbackSuppression table + User extensions), backend endpoints (submit/suppression CRUD), frontend infrastructure (FeedbackSurvey portal, FeedbackMenu, useFeedbackSurvey hook, FeedbackContext). 10 trigger integrations deferred. (3) Six review-page bug fixes: tag removal fixed, no-price items blocked from "Ready to Publish", "Needs Review" label, print label route reordered (was 404), curated tag list removed, camera/rapidfire mode selector added to Add Photos.

**S399 Files Changed (16 files, 5 new):**
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — Full review card redesign + 4 bug fixes (tag removal, "Needs Review" label, curated tags removed, camera mode selector)
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — Curated tags removed, camera mode selector added
- `packages/backend/src/utils/listingHealthScore.ts` — No-price hard gate (items without price capped at grade "nudge")
- `packages/backend/src/routes/items.ts` — Label route reordered before /:id catch-all (fixed 404)
- `packages/database/prisma/schema.prisma` — FeedbackSuppression model, User extensions, Feedback extensions
- `packages/database/prisma/migrations/20260405_add_feedback_system/migration.sql` — NEW
- `packages/backend/src/controllers/feedbackController.ts` — submitFeedback extended; createSuppression + listSuppressions
- `packages/backend/src/routes/feedback.ts` — Suppression endpoints wired
- `packages/frontend/context/FeedbackContext.tsx` — NEW
- `packages/frontend/hooks/useFeedbackSurvey.ts` — NEW
- `packages/frontend/components/FeedbackSurvey.tsx` — NEW
- `packages/frontend/components/FeedbackMenu.tsx` — NEW
- `packages/frontend/pages/_app.tsx` — FeedbackProvider + FeedbackSurvey portal
- `packages/frontend/pages/organizer/settings.tsx` — Help tab + FeedbackMenu
- `packages/frontend/pages/shopper/settings.tsx` — Help & Support + FeedbackMenu
- `claude_docs/STATE.md` + `claude_docs/patrick-dashboard.md` — wrap docs

**S399 Migration Required (run after push):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S399 Deferred:**
- 10 survey trigger integrations (OG-1 through SH-5) — infrastructure built, triggers not yet wired to specific pages
- Chrome QA: S398 dashboard + S399 review card + feedback system + bug fixes

---

**S398 COMPLETE (2026-04-05):** Dashboard overhaul, feedback system design, review card UX spec, CLAUDE.md dispatch routing fix

**S398 Summary:**

Dashboard UI session + feedback system architecture. Removed floating feedback widget. Dashboard: shrunk welcome text, removed subtitle line, added button icons (Clock/ShoppingCart/Megaphone), reordered POS before Holds, made LIVE badge a link to public sale page with edit pencil button, fixed review count to combine drafts+unpublished, fixed weather overflow (restored 2-line wrap), fixed dropdown overflow on Items/POS buttons, fixed Other Sales card mobile layout (stacked, LIVE badge inline+linked, removed redundant "Live now" text). Feedback system: UX specced 10 event-triggered micro-surveys (5 organizer, 5 shopper) + static menu item. Architect approved schema (FeedbackSuppression table, User model extensions). Review card layout: UX specced full redesign with "Ready to Publish" / "Needs Work" / "Cannot Publish" status system replacing raw percentages.

**S398 Files Changed (7 files):**
- `packages/frontend/pages/organizer/dashboard.tsx` — Welcome padding, subtitle removed, button labels/icons/order, LIVE badge linked, edit pencil, review count combined, dropdown overflow fix
- `packages/frontend/pages/_app.tsx` — Floating feedback widget disconnected
- `packages/frontend/components/WeatherStrip.tsx` — Removed truncation, restored 2-line wrap
- `packages/frontend/components/SecondarySaleCard.tsx` — LIVE badge inline+linked, "Live now" removed, mobile stacked layout
- `packages/backend/src/routes/organizers.ts` — Review count includes drafts+unpublished across all sales
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — Card layout adjustments (partial — UX spec supersedes)
- `CLAUDE.md` — Added dispatch routing rule (Skills vs Agent types) to §7

**S398 Specs Delivered (not yet implemented):**
- `claude_docs/FEEDBACK_SYSTEM_SPEC.md` — Full feedback system architecture
- `claude_docs/FEEDBACK_SURVEY_MAPPING.md` — 10 survey trigger mappings
- `claude_docs/FEEDBACK_SYSTEM_HANDOFF.md` — Patrick summary
- `claude_docs/FEEDBACK_DEV_QUICKSTART.md` — Dev implementation guide
- `claude_docs/ARCHITECT_ASSESSMENT_FEEDBACK_SCHEMA.md` — Schema review + migration plan
- `claude_docs/ARCHITECT_PATRICK_SUMMARY.md` — Architect summary
- `claude_docs/ux-spotchecks/review-card-layout-spec.md` — Review card redesign spec

---

**S397 COMPLETE (2026-04-05):** Add-items page mobile UI polish — sort controls, toolbar layout, dark mode fixes, item row restructure, dropdown escape fix, link/navigation cleanup

**S397 Summary:**

Extensive mobile UI session on the organizer add-items page (`[saleId].tsx`) and review page (`review.tsx`). Also fixed organizer dashboard bugs (Teams modal, Review Drafts link, active sale mismatch) and backend item limit.

**Fixes & Changes:**
- **Teams onboarding modal** — Was firing even when workspace existed (loading state race). Added `workspaceLoading` + `existingWorkspace` guards.
- **Review Drafts link** — Was linking to wrong sale. Fixed to use `activeSale?.id ?? id`.
- **Active sale selection** — Backend now prefers PUBLISHED over DRAFT when selecting active sale.
- **Draft count scoping** — `draftItems` count now scoped to active sale only (was counting across all sales).
- **Item limit raised** — Default limit changed from 20 to 500 in `itemController.ts` to show all items on review page.
- **Sort controls added** — Name/Price/Status/Date sort buttons on both add-items and review pages.
- **Item row restructure** — Checkbox+expand arrow stacked LEFT, thumbnail center, title flex-1, status badge+trash stacked RIGHT. More room for item names on mobile.
- **Header restructured** — Two explicit rows: Row1 = checkbox + "N Items" + Review & Publish; Row2 = Export to eBay + Buyer Preview.
- **Toolbar restructured** — Two explicit rows replacing flex-wrap chaos. Row1 = select all + count + Hide/Show/Delete; Row2 = price input + Set Price + Labels + More.
- **Dark mode fixes** — Toolbar buttons, More Actions dropdown text, hover states all corrected.
- **BulkActionDropdown.tsx** — Switched from `absolute` to `position: fixed` with viewport coordinates to escape parent `overflow-hidden` clipping. Dark mode text and hover fixed.
- **Overflow fix** — Removed `overflow-hidden` from outer items card container that was clipping toolbar and dropdown.
- **Item name link removed** — Title no longer links to edit-item page (was unnecessary navigation away).
- **Thumbnail target="_blank" removed** — Shopper view link no longer opens new tab, fixing mobile PWA swipe-back exiting the app.

**S397 Files Changed (5 files):**
- `packages/frontend/pages/organizer/dashboard.tsx` — Teams modal guards, Review Drafts link fix, active sale preference
- `packages/backend/src/routes/organizers.ts` — Active sale prefers PUBLISHED over DRAFT, draft count scoped
- `packages/backend/src/controllers/itemController.ts` — Default item limit 20→500
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — Sort controls, row restructure, header/toolbar two-row layout, overflow fix, dark mode, link removal, target="_blank" removal
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — Sort controls, limit=500 fetch, createdAt type fix
- `packages/frontend/components/BulkActionDropdown.tsx` — position:fixed dropdown, dark mode, viewport coordinates

**S397 QA Queue (Chrome — next session):**
- Add-items page: sort by Name/Price/Status/Date all work correctly
- Add-items page: item row layout — checkbox+arrow left, status+trash right, title has room
- Add-items page: toolbar buttons visible in dark mode, no overflow
- Add-items page: More Actions dropdown renders fully on screen, readable in dark mode
- Add-items page: tapping item name does NOT navigate away
- Add-items page: tapping thumbnail opens shopper view in same tab, back button returns to add-items
- Review page: shows all items (not capped at 20), sort controls work
- Dashboard: Teams modal does NOT fire for users with existing workspace
- Dashboard: Review Drafts links to correct active sale

---

**S396 COMPLETE (2026-04-05):** Rapidfire batch hold fix, tier limit enforcement, upgrade CTAs, modal navigation fixes

**S396 Summary:**

Four fix areas shipped:

1. **Rapidfire hold-analysis** — Photo 2+ no longer triggers AI during a batch. Root cause: backend `addItemPhoto` was calling `resetRapidDraftDebounce()` unconditionally even on held items. Fix adds a `heldAnalysisItems` Set to `uploadController.ts`; `holdAnalysis` adds to it, `releaseAnalysis` removes and fires debounce. Photo append respects hold state.

2. **Tier limit enforcement + upgrade CTAs** — Photo limits (5 SIMPLE / 10 PRO+ala carte) now enforced in `addItemPhoto` backend with 403 + `upgradeRequired: true`. `RapidCapture` `maxPhotos` is now tier-aware (was hardcoded 20). Item limit 403 now shows upgrade CTA to PRO. AI tag limit check added to `processRapidDraft.ts` — skips AI and marks PENDING_REVIEW when exceeded. `tierEnforcement.ts` gains `checkAITagLimit()`.

3. **Ala carte pricing copy** — Added "Payment of $9.99 is collected when you publish your sale." note below pricing page CTA. Ala carte flow itself is correct (pay at publish, not on create).

4. **Modal navigation** — `OrganizerOnboardingModal` final button now routes to `/organizer/create-sale` (was just dismissing). `TeamsOnboardingWizard` "Complete Setup" now always navigates to `/organizer/workspace` (logic was inverted — only navigated if no `onComplete` callback).

5. **Null bytes cleaned** — `PosManualCard.tsx` and `TierComparisonTable.tsx` had trailing `\x00` bytes; stripped.

**S396 Files Changed (10 files):**
- `packages/backend/src/controllers/uploadController.ts` — `heldAnalysisItems` Set + `resetRapidDraftDebounce` hold check
- `packages/backend/src/controllers/itemController.ts` — `addItemPhoto` photo limit enforcement; `holdAnalysis`/`releaseAnalysis` track Set
- `packages/backend/src/lib/tierEnforcement.ts` — `checkAITagLimit()` added
- `packages/backend/src/jobs/processRapidDraft.ts` — AI tag limit pre-check; TS fix (`id` added to organizer select)
- `packages/frontend/pages/organizer/pricing.tsx` — ala carte payment timing note
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — tier-aware `maxPhotosPerItem`; photo limit 403 upgrade toast; item limit 403 upgrade CTA
- `packages/frontend/components/OrganizerOnboardingModal.tsx` — final button navigates to create-sale
- `packages/frontend/components/TeamsOnboardingWizard.tsx` — complete setup always navigates to workspace
- `packages/frontend/components/PosManualCard.tsx` — null bytes stripped
- `packages/frontend/components/TierComparisonTable.tsx` — null bytes stripped

**S396 QA Queue (Chrome — next session):**
- Rapidfire: take 2+ photos while in add-mode — confirm AI does NOT fire until x pressed
- SIMPLE organizer: attempt 6th photo on an item — confirm upgrade prompt shown
- SIMPLE organizer: hit 200-item limit — confirm upgrade CTA appears (not silent 403)
- First organizer sign-in modal: complete button → routes to create-sale ✅ (not just dismiss)
- Teams onboarding: complete setup button → routes to workspace ✅

---

**S395 COMPLETE (2026-04-05):** Print kit fixes + POS QR scanner overhaul

**S395 Summary:**

Continued from S395 context expiry. Print kit: crash fix (null price), auth fix (blob download), PDF layout rounds (6 templates), QR codes fixed to `https://finda.sale` fallback. POS QR scanner overhauled: price sheet QRs now add misc items to cart, tap-to-scan replaces auto-fire, tap crops to 35% window around tap location to prevent wrong-QR detection, misc item labels fixed (75¢/$1.50/etc.), cart price darkmode set to bright green.

**S395 Files Changed (2 files):**
- `packages/backend/src/controllers/printKitController.ts` — price sheet QR URLs updated to POS misc-add format (`/pos/{saleId}?action=add-misc&price=X.XX`), QR fallback changed to `https://finda.sale`
- `packages/frontend/pages/organizer/pos.tsx` — tap-to-scan (no auto-fire), crop-to-tap-location (35% window), 10-frame retry on tap, misc label fix (75¢/$1.50 etc.), cart price `dark:text-green-400`

**S395 QA:**
- Scan item sticker QR in POS → item added to cart ✅ (Patrick verified)
- Scan price sheet QR in POS → misc item added at correct price ✅ (Patrick verified)
- Tap-to-scan prevents duplicate adds ✅ (Patrick verified)
- Misc item labels show correctly (75¢, $1.50, etc.) ✅ (Patrick verified)
- Cart price bright green in dark mode — pending Chrome verify

---

**S394 COMPLETE (2026-04-04):** POS gap analysis + rebuild — 4 new components (PosManualCard, PosPaymentQr, PosOpenCarts, PosInvoiceModal), pos.tsx multi-payment hub wired up, QR regeneration fix.

**S394 Summary:**

Patrick found the S393 POS delivery didn't match the spec. Full gap analysis + rebuild of the frontend POS layer. 5 files changed (4 new components + pos.tsx heavily modified). No backend changes — posController.ts from S393 is correct.

**What was rebuilt:**
- `PosManualCard.tsx` (NEW) — CNP Stripe Elements flow, amber fee notice (3.4%+$0.30 vs 2.7%+$0.05), dispute warning ($15 fee, no protection, Chargeback Protection option)
- `PosPaymentQr.tsx` (NEW) — QR generate → display → waiting → paid states, full-screen modal, Cancel & Regenerate button
- `PosOpenCarts.tsx` (NEW) — linked shopper carts dashboard, pull-to-POS flow
- `PosInvoiceModal.tsx` (NEW) — holds-to-invoice modal, email delivery, 24h expiry default
- `pos.tsx` — payment grid reordered (Cash→Stripe QR→Card Reader→Invoice), Connect Reader button removed (status badge clickable instead), Card Reader disabled+tooltip when no reader, camera useEffect fix (100ms delay), QR field name fix (qrCodeDataUrl), CNP fee numbers corrected, "Send QR"→"Stripe QR", onReset handler for QR regeneration

**S394 Files Changed (5 files, 4 new):**
- `packages/frontend/components/PosManualCard.tsx` — NEW
- `packages/frontend/components/PosPaymentQr.tsx` — NEW
- `packages/frontend/components/PosOpenCarts.tsx` — NEW
- `packages/frontend/components/PosInvoiceModal.tsx` — NEW
- `packages/frontend/pages/organizer/pos.tsx` — payment hub wiring, all UX fixes

**S394 Pending Patrick Actions:**
Push block at bottom of session (see patrick-dashboard.md)

**S394 QA Queue (Chrome — next session):**
- Payment grid: all 4 tiles render, correct order (Cash / Stripe QR / Card Reader / Invoice)
- Card Reader tile: disabled + tooltip when no reader; clickable status badge
- Stripe QR: generate → QR displays → Cancel & Regenerate resets without page reload
- Manual Card: CNP fees and dispute warning visible; Stripe Elements renders
- Camera: tap QR Code tile → camera opens, scan works
- Invoice tile: holds appear, send invoice email completes
- Cash: change calculator still works

---

**S393 COMPLETE (2026-04-04):** POS backend — 7 endpoints, 2 new Prisma models, Stripe Payment Links, shopper cart sharing, hold invoicing.

**S393 Files Changed (9 files, 2 new):**
- `packages/database/prisma/schema.prisma` — POSSession + POSPaymentLink models
- `packages/database/prisma/migrations/20260404_pos_upgrade/migration.sql` — NEW
- `packages/backend/src/controllers/posController.ts` — NEW (7 endpoints)
- `packages/backend/src/routes/pos.ts` — NEW
- `packages/backend/src/index.ts` — posRoutes mounted
- `packages/backend/src/controllers/stripeController.ts` — payment_link.completed webhook
- `packages/frontend/pages/organizer/pos.tsx` — initial redesign (superseded by S394)
- `packages/frontend/components/ShopperCartDrawer.tsx` — "Share cart with cashier" button
- `packages/frontend/package.json` — jsqr ^1.4.0 added

**S393 Migration (still required if not yet run):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

**S392 COMPLETE (2026-04-04):** Pricing page overhaul, team member limit change, feature naming standardization, flash deal TS fix, concurrent sales gate spec.

**S392 Summary:**

Major pricing/tier accuracy session. Fixed Railway build blocker, overhauled pricing page with correct data, standardized feature naming (no "AI" in customer-facing copy), changed TEAMS member cap 12→5 with $20/mo upgrade path, fixed stale support FAQ pricing.

**Fixes & Changes:**
- **flashDealController.ts TS2322 fix:** `boolean | null` → `!!()` coercion on hasHuntPass. Railway build unblocked.
- **Pricing page overhaul (pricing.tsx):** Hero copy, value prop callout section (6 boxes), all tier feature arrays rewritten with correct limits, ala carte section rewritten (500 items, 10 photos, 500 auto tags, Flip Report, Virtual Queue, 10% fee), Enterprise headline changed, 3 new FAQ questions, PremiumCTA benefits updated.
- **TierComparisonTable.tsx rewrite:** Renamed AI tags→Auto Tags, AI valuation→Smart Pricing, Link click stats→Ripples. Fixed SIMPLE items (200), SIMPLE photos (5), TEAMS photos (Unlimited*). Added Concurrent sales row (1/3/Unlimited*), Photo to listing, Social post generator, QR codes, POS, Holds & reservations. Team members row: "5 (additional $20/mo/ea)". Checkmark alignment fixed with flex centering.
- **Feature naming standardization (D-S392):** No "AI" in any customer-facing copy. Auto Tags, Smart Pricing, Ripples, 24/7 support assistant.
- **TEAMS member limit 12→5 (D-S392):** tierLimits.ts maxTeamMembers=5, workspaceController.ts uses TIER_LIMITS instead of hardcoded 12, workspace.tsx updated (4 instances), error messages mention $20/mo purchasable seats.
- **support.tsx stale pricing fix:** PRO was showing $4.99/month, TEAMS $12.99/month → corrected to $29/month and $79/month with 8% fee.
- **S268 supersedes S251 confirmed:** Support tiers (S251) replaced by zero-human automated support stack (S268). No SLA, no phone, no calendar.
- **À La Carte feature set defined (D-S392):** 500 items, 10 photos/item, 500 auto tags, Flip Report, Virtual Queue, 10% platform fee.
- **Null byte corruption fixed:** Both pricing.tsx and TierComparisonTable.tsx had trailing \x00 bytes causing Vercel build failures. Stripped with perl.
- **Concurrent sales gate spec written:** claude_docs/specs/concurrent-sales-gate-spec.md — full implementation spec for SIMPLE=1, PRO=3, TEAMS=unlimited.

**S392 Files Changed (8 files):**
- `packages/backend/src/controllers/flashDealController.ts` — TS2322 fix
- `packages/backend/src/constants/tierLimits.ts` — maxTeamMembers field (SIMPLE=0, PRO=0, TEAMS=5, ENTERPRISE=MAX_SAFE_INTEGER)
- `packages/backend/src/controllers/workspaceController.ts` — use TIER_LIMITS.TEAMS.maxTeamMembers instead of hardcoded 12
- `packages/frontend/pages/organizer/pricing.tsx` — full overhaul
- `packages/frontend/components/TierComparisonTable.tsx` — full rewrite of FEATURES array + checkmark alignment
- `packages/frontend/pages/organizer/workspace.tsx` — team member limit 12→5 (4 instances)
- `packages/frontend/pages/support.tsx` — stale pricing fix ($4.99→$29, $12.99→$79)
- `claude_docs/decisions-log.md` — 4 new entries (À La Carte, S251 superseded, naming standardization, team member limit)

**S391 Files Changed (16 modified, 5 new):**
- `packages/backend/src/controllers/itemController.ts` — condition rating XP + treasure hunt pro + rare finds visibility + rare finds endpoint
- `packages/backend/src/services/xpService.ts` — daily cap Hunt Pass override + passport comment
- `packages/backend/src/services/streakService.ts` — streak milestone trigger wired
- `packages/backend/src/services/collectorPassportService.ts` — passport completion check + XP award
- `packages/backend/src/routes/items.ts` — rare-finds route added
- `packages/database/prisma/schema.prisma` — passportCompleted on User
- `packages/database/prisma/migrations/20260403_add_passport_completed/migration.sql` — NEW
- `packages/frontend/pages/shopper/hunt-pass.tsx` — Treasure Hunt Pro + Rare Finds Pass benefits
- `packages/frontend/pages/shopper/dashboard.tsx` — Rare Finds feed section (Hunt Pass only)
- `packages/frontend/pages/shopper/haul-posts.tsx` — NEW (community haul feed)
- `packages/frontend/pages/shopper/haul-posts/create.tsx` — NEW (create haul post)
- `packages/frontend/pages/shopper/rare-finds.tsx` — NEW (full rare finds page)
- `packages/frontend/hooks/useHaulPosts.ts` — NEW (haul post hooks)
- `packages/frontend/components/RareFindsFeed.tsx` — NEW (rare finds dashboard widget)
- `packages/frontend/components/Layout.tsx` — Haul Posts nav link
- `packages/frontend/pages/haul/coming-soon.tsx` — redirect to new haul-posts page

**S391 Migration Required:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

**S390b COMPLETE (2026-04-03):** Deferred + gap items from alignment doc — 5 parallel agents, all zero TS errors.

**S390b Summary:**

Implemented all remaining S389 alignment items: backend XP sources, share moments, Hunt Pass cosmetic add-ons, feature audits.

**Agent 1 — Backend XP + Gating (4 files):** RSVP 2 XP (monthly cap 10) wired to rsvpController. Trail completion 100 XP wired to trailController. Legendary-first access 6h gating in flashDealController (Sage+/Hunt Pass see flash deals 6h early). xpService.ts: 7 new XP action types added (CONDITION_RATING, RSVP, STREAK_MILESTONE_5/10/20, TRAIL_COMPLETE, COLLECTOR_PASSPORT_COMPLETE), checkMonthlyXpCap(), checkStreakMilestones(), hasEarnedTrailBonus() functions. Skipped: condition rating (no endpoint), streak milestone trigger (function ready, no hook point), passport completion (needs schema migration).

**Agent 2 — Frontend Nav/Dashboard Gaps (3 files):** Command Center nav already existed (line 340 Layout.tsx — confirmed present, no change). Explorer's Guild onboarding card added to shopper/dashboard.tsx (shows for INITIATE or guildXp < 50, dismissible, localStorage persisted). TEAMS solo differentiator copy updated on pricing.tsx + TierComparisonTable.tsx ("API access, webhooks, white-label for solo power users").

**Agent 3 — Share Moments (3 files):** Post-purchase "Share Your Haul" CTA on checkout-success.tsx (Web Share API + clipboard fallback). Rank achievement share button on notifications.tsx (appears on rank-up notification type). Trail completion share on trails/[trailId].tsx (celebration section + share when all stops found).

**Agent 4 — Hunt Pass Cosmetic Option A (4 files):** Golden Trophy amber ring frame in AvatarDropdown.tsx (ring-2 ring-amber-400 when huntPassActive). Hunt-pass.tsx: added "🏆 Golden Trophy avatar frame" + "📧 Hunt Pass Insider newsletter" benefits. league.tsx: Hunt Pass badge (🏆) next to subscriber names on leaderboard. loyaltyController.ts: huntPassActive added to getCollectorLeague select.

**Agent 5 — Feature Audit + Brand Follow Fix (1 file):** Haul Posts (#88) = DEAD — backend complete, frontend has coming-soon page only, needs 2 new pages + nav (8-12h effort). Brand Follow (#87) = PARTIAL→FIXED — BrandFollowManager was present but not mounted in dashboard Brands tab; agent wired it (5 lines in shopper/dashboard.tsx). Now LIVE.

**S390b Files Changed:**
- `packages/backend/src/services/xpService.ts` — 7 new XP types + 3 helper functions
- `packages/backend/src/controllers/rsvpController.ts` — RSVP 2 XP wired
- `packages/backend/src/controllers/trailController.ts` — trail completion 100 XP
- `packages/backend/src/controllers/flashDealController.ts` — 6h legendary-first access gate
- `packages/backend/src/controllers/loyaltyController.ts` — huntPassActive in leaderboard
- `packages/frontend/pages/shopper/dashboard.tsx` — Guild onboarding card + Brand Follow wiring (⚠️ dual-agent write — verify)
- `packages/frontend/pages/organizer/pricing.tsx` — TEAMS solo copy
- `packages/frontend/components/TierComparisonTable.tsx` — API/webhooks clarified
- `packages/frontend/components/AvatarDropdown.tsx` — golden trophy frame
- `packages/frontend/pages/shopper/hunt-pass.tsx` — Option A benefits added
- `packages/frontend/pages/shopper/league.tsx` — Hunt Pass badge on leaderboard
- `packages/frontend/pages/shopper/checkout-success.tsx` — Share Your Haul CTA
- `packages/frontend/pages/shopper/notifications.tsx` — rank achievement share
- `packages/frontend/pages/shopper/trails/[trailId].tsx` — trail completion share

**S390b Deferred/Flagged:**
- Haul Posts (#88): DEAD — needs 2 new pages + nav (8-12h). Backlog.
- Condition rating XP: No submission endpoint found to hook to. Backlog.
- Streak milestone trigger: Function ready in xpService, no hook point found. Backlog.
- Collector Passport completion XP: Needs schema migration for `passportCompleted` flag. Backlog.

**S390 COMPLETE (2026-04-03):** S389 alignment doc implementation — all 4 open questions approved, 7 subagent dispatches across 2 parallel batches. 12 files changed, 1 new file.

**S390 Summary:**

Implemented all recommendations from `claude_docs/strategy/S389-comprehensive-alignment.md`. Patrick approved all 4 open questions (tier restructuring, Treasure Hunt XP multiplier, both referral + Hunt Pass improvements, à la carte on pricing page).

**S390 — Batch 1 (Quick Wins):**
- **Hunt Pass page fixed:** "2x XP" → "1.5x XP" throughout `hunt-pass.tsx`. Added full XP Earning Matrix table (Standard vs Hunt Pass columns). Flash deals clarified to "6 hours early". Loot Legend explained. Dashboard Hunt Pass CTA also fixed to 1.5x.
- **À la carte $9.99 on pricing page:** New pay-as-you-go callout section added to `pricing.tsx` (below tier cards). Small callout added to organizer dashboard onboarding state.
- **Treasure Hunt XP multiplier for Ranger+:** Added `getRankXpMultiplier()` to `xpService.ts`. Applied in `itemController.ts` `scanItemQr` handler. Ranger=1.5x(38 XP), Sage=1.75x(44 XP), GM=2x(50 XP). Daily cap (100 XP) still applies. Referral wiring confirmed already done from S389.
- **Tier restructuring:** `batchOpsAllowed: true` for SIMPLE in `tierLimits.ts`. `linkClicks.ts` route downgraded PRO→SIMPLE. `TierComparisonTable.tsx` updated (batch ops, link click stats, seller badge → SIMPLE). `pricing.tsx` updated to reflect new SIMPLE features.

**S390 — Batch 2 (Medium Effort):**
- **Organizer nav reorganized:** Added "Insights" section (→`/organizer/insights`) and "Branding" section (→`/organizer/brand-kit`) to `Layout.tsx` organizer nav. Removed duplicate Brand Kit from Pro Tools. PRO-labeled tooltips intact.
- **Organizer Tier Progress widget:** Added conditional widget to `organizer/dashboard.tsx`. SIMPLE users see PRO upgrade pitch ($29/mo), PRO users see TEAMS pitch ($79/mo), TEAMS users see nothing.
- **Shopper dashboard improvements:** Enhanced rank card with next-rank specific benefit text (e.g., "Ranger: +15 min holds"). Added "Share & Earn" referral card (dismissible, links to `/shopper/referrals`). Both changes in `shopper/dashboard.tsx`.
- **Collector Passport nav:** Renamed "Explorer Passport" → "Collector Passport" across all 4 nav locations in `Layout.tsx` (sidebar, mobile nav ×2) and `AvatarDropdown.tsx` (dropdown menu).
- **Shopper Referral UI:** NEW `pages/shopper/referrals.tsx` — full referral share page with link display, WhatsApp/SMS/Twitter/Email/copy share buttons, referral stats (signups, first purchases, total XP earned). Uses existing `/referrals/my-code` and `/referrals/stats` backend endpoints.

**S390 Files Changed:**
- `packages/frontend/pages/shopper/hunt-pass.tsx` — 1.5x fix + XP matrix + flash deal timing
- `packages/frontend/pages/shopper/dashboard.tsx` — Hunt Pass CTA 1.5x + rank card next-rank benefits + referral card
- `packages/frontend/pages/organizer/pricing.tsx` — à la carte section + SIMPLE feature list update
- `packages/frontend/pages/organizer/dashboard.tsx` — à la carte onboarding callout + Tier Progress widget
- `packages/frontend/pages/shopper/referrals.tsx` — NEW
- `packages/frontend/components/TierComparisonTable.tsx` — batch ops/link stats/seller badge → SIMPLE
- `packages/frontend/components/Layout.tsx` — organizer nav (Insights + Branding) + Collector Passport rename (all 4 locations)
- `packages/frontend/components/AvatarDropdown.tsx` — Collector Passport rename
- `packages/backend/src/services/xpService.ts` — getRankXpMultiplier() function
- `packages/backend/src/controllers/itemController.ts` — rank multiplier applied in scanItemQr
- `packages/backend/src/constants/tierLimits.ts` — batchOpsAllowed: true for SIMPLE
- `packages/backend/src/routes/linkClicks.ts` — requireTier downgraded PRO→SIMPLE

**S390 Deferred / Next Session:**
- QA: Hunt Pass page, pricing page à la carte section, referral page, organizer nav additions (Chrome QA)
- Shopper rank page: add "what you unlock at each rank" explainer (referenced in dashboard "See all rank benefits" CTA)
- Explorer's Guild onboarding card on shopper dashboard (new shopper sees "Initiate • 0 XP" with no context — add brief explainer card)
- PRO→TEAMS solo differentiator story (Section 2.5 of alignment doc — still unaddressed)
- Haul Posts (#88) status audit (live or not? needs verification)
- Brand Follow (#87) status audit
- Legendary-first access route (Phase 2, post-beta)
- Purchase confirmation "share your haul" moment (Phase 2, post-beta)

**S390 Pending Patrick Actions:**
No schema migrations required this session. Just push the files.

---

**S389 COMPLETE (2026-04-03):** P2/P3 sprint + gamification wave + TS fix + comprehensive alignment analysis.

**S389 Summary:**

Two parallel dev waves shipped, one blocking TS error fixed, and a comprehensive product alignment document produced.

**Wave 1 — P2/P3 features (18 files):**
- **Price Research Panel:** NEW `PriceResearchPanel.tsx` — consolidates AI estimate + PriceSuggestion + eBay comps + ValuationWidget into collapsible panel. Wired to add-items, review, and edit-item pages.
- **Reverse Auction:** Listing type dropdown option added to `add-items/[saleId].tsx`.
- **Flash Deal button:** ⚡ button wired in `dashboard.tsx` with `useQuery` for sale items + FlashDealForm props fixed (onClose→onCancel, added saleItems + onSuccess).
- **TierComparisonTable fix:** SIMPLE limits corrected (3→5 photos, 100→200 items to match tierLimits.ts).
- **Verified Purchase badge:** `ReviewsSection.tsx` now shows ✓ Verified Purchase on eligible reviews. `reviewController.ts` returns `verifiedPurchase` on all 4 query endpoints.
- **SettlementWizard:** Transfer ID + failure reason banner added to receipt step.
- **priceBeforeMarkdown:** Crossed-out original price added to `ItemCard.tsx`, `LibraryItemCard.tsx`, `items/[id].tsx`. Backend `itemController.ts` now returns `priceBeforeMarkdown` + `markdownApplied` on item queries.
- **Concurrent sales gate (#249):** `tierLimits.ts` — `maxConcurrentSales` (SIMPLE=1, PRO=3, TEAMS=Infinity). `saleController.ts` — gate in `createSale()` + `updateSaleStatus()`. Frontend 409 handling with upgrade CTA in `create-sale.tsx` + `edit-sale/[id].tsx`. Schema index added to `schema.prisma`.

**Wave 2 — Gamification (6 files):**
- **Scout hold bug fixed:** `reservationController.ts` — SCOUT now returns 45 min (was 30, same as INITIATE).
- **Visit XP cap:** `saleController.ts` — daily cap (max 2 unique sales/day earn XP) + monthly cap (100 XP from visits). Visit XP confirmed 10→5 (S388).
- **Hunt Pass 1.5x multiplier wired:** `stripeController.ts` + `auctionJob.ts` — 1.5x applied before purchase XP and auction win XP awards.
- **Referral first-purchase trigger:** `stripeController.ts` — awards 30 XP to referrer when referred user's first purchase completes.
- **Rank-up notifications:** `xpService.ts` — `awardXp()` now calls `createNotification()` when rank changes.
- **Referral signup wiring:** `authController.ts` — `processReferral()` called at signup + 20 XP to referrer.

**TS fix (Railway unblocked):**
- `saleController.ts` TS2451 duplicate `const today` — removed redundant declaration at line 1271. Railway rebuilt green.

**Comprehensive Alignment Analysis:**
- `claude_docs/strategy/S389-comprehensive-alignment.md` — full product alignment document covering all roadmap features × gamification × virality × nav × dashboards.

**S389 Key Findings (from alignment agent):**
1. Hunt Pass page says "2x XP" — code enforces 1.5x. Trust issue. Fix immediately.
2. À la carte $9.99 is invisible on pricing page. Revenue leak.
3. Rank is cosmetic — Sage/Grandmaster users discover only a badge after 5k+ XP. Need quick rank-gated wins.
4. Referral system now has routes wired (S389) but still needs `/shopper/referrals` UI page.
5. PRO→TEAMS has no solo organizer story — same features, just adds multi-user. Needs a differentiator.

**S389 Files Changed:**
- `packages/frontend/components/PriceResearchPanel.tsx` — NEW
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — Price Research panel + Reverse Auction type
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — Price Research panel + priceBeforeMarkdown
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — Price Research panel (expanded)
- `packages/frontend/pages/organizer/dashboard.tsx` — Flash Deal button + FlashDealForm wiring
- `packages/frontend/components/TierComparisonTable.tsx` — SIMPLE limits corrected
- `packages/frontend/components/ReviewsSection.tsx` — Verified Purchase badge
- `packages/backend/src/controllers/reviewController.ts` — verifiedPurchase on queries
- `packages/frontend/components/SettlementWizard.tsx` — transfer ID + failure banner
- `packages/backend/src/controllers/itemController.ts` — priceBeforeMarkdown + markdownApplied
- `packages/frontend/components/ItemCard.tsx` — crossed-out price
- `packages/frontend/components/LibraryItemCard.tsx` — crossed-out price
- `packages/frontend/pages/items/[id].tsx` — crossed-out price
- `packages/backend/src/constants/tierLimits.ts` — maxConcurrentSales added
- `packages/backend/src/controllers/saleController.ts` — concurrent gate + visit XP cap + TS2451 fix
- `packages/frontend/pages/organizer/create-sale.tsx` — 409 handling
- `packages/frontend/pages/organizer/edit-sale/[id].tsx` — 409 handling
- `packages/database/prisma/schema.prisma` — @@index on Sale model
- `packages/database/prisma/migrations/20260403_concurrent_sales_gate_index/migration.sql` — NEW
- `packages/backend/src/controllers/reservationController.ts` — Scout 45min fix
- `packages/backend/src/controllers/stripeController.ts` — Hunt Pass 1.5x + referral first-purchase
- `packages/backend/src/jobs/auctionJob.ts` — Hunt Pass 1.5x
- `packages/backend/src/services/xpService.ts` — rank-up notifications
- `packages/backend/src/controllers/authController.ts` — referral signup wiring
- `claude_docs/strategy/S389-comprehensive-alignment.md` — NEW

**S389 Deferred / Next Session:**
- Hunt Pass page: fix "2x XP" → "1.5x XP" + add XP earning matrix table (15 min fix, HIGH priority)
- Pricing page: add à la carte $9.99 option + make it visible (revenue leak)
- Rank gates: implement first rank-gated benefit to make rank non-cosmetic (Ranger+ suggestion: +5 XP bonus on treasure hunt scans)
- Shopper referrals UI: `/shopper/referrals` page — routes wired in S389, frontend page missing
- PRO→TEAMS solo differentiator: decide what feature elevates TEAMS for solo organizers
- Tier rearrangement implementation: batch ops + seller badge + link click stats → SIMPLE (board approved)
- Concurrent sales migration: run `prisma migrate deploy` + `prisma generate` against Railway
- Roadmap update: 20+ entries need Chrome QA status updates

**S389 Pending Patrick Actions:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

**S388 COMPLETE (2026-04-03):** Documentation & Coaching Overhaul — research sprint + implementation across 5 focus areas.

**S388 Summary:**

Research phase dispatched 5 parallel agents covering pricing, tier matrix, rank matrix, coaching, and FAQ/copy. Patrick corrected initial research that re-surfaced locked decisions as open questions — all 10 key decisions were already locked in S240/S259/S268/S332/S341. Game design agent output was ~85% redundant with S259's comprehensive gamification session; synthesized into research doc with S259 as source of truth.

Implementation phase (3 dev batches, all zero TS errors):
- **Pricing fix (P0):** `pricing.tsx` — $49→$29 PRO, $99→$79 TEAMS. TierComparisonTable and AlaCartePublishModal already correct.
- **XP threshold fix:** `xpService.ts` — RANGER 1500→2000, SAGE 2500→5000, GRANDMASTER 5000→12000. Visit XP 10→5, Purchase XP 15→$1=1XP.
- **AI branding purge (13 locations):** Replaced all "AI" references with "smart tagging" / "auto-tagging" / "system" across plan.tsx, privacy.tsx, dashboard.tsx, settings.tsx, faq.tsx, OrganizerOnboardingModal, SmartInventoryUpload, PriceSuggestion, guide.tsx.
- **Sale type inclusivity:** Broadened "estate sale" language in index.tsx, about.tsx, guide.tsx, faq.tsx.
- **Camera coaching banner:** Replaced dead `showShotGuidance` with inline contextual banner in RapidCapture.tsx (regular mode only). Progressive messages for shots 1–5+. Dismissable. Dead function removed from [saleId].tsx.
- **7 new FAQ entries:** Explorer's Guild, seasonal challenges, Collector Passport, Condition Rating (shopper); SIMPLE/PRO/TEAMS differences, Brand Kit, Command Center (organizer).
- **Research docs:** Full synthesis at `claude_docs/research/S388-documentation-coaching-research.md` with code-verified file paths. Game design matrix at `claude_docs/feature-notes/gamedesign-shopper-rank-matrix-S388.md`.

**Confirmed Decisions (S388):**
1. PRO = $29/mo, TEAMS = $79/mo (S268 locked)
2. SIMPLE stays SIMPLE (not "Essential")
3. Enterprise stays per D-007 ($500-800/mo, contact-sales)
4. Founding Organizer program: REJECTED
5. À la carte = $9.99/sale for non-subscribers
6. Fee model: standard (10% SIMPLE / 8% PRO/TEAMS)
7. Rank thresholds: board numbers (500/2000/5000/12000)
8. Social/viral features stay on ALL tiers
9. Gate SIMPLE concurrent sales: approved (architect spec needed — maxConcurrentSales not yet in tierLimits.ts)
10. Coaching: Option A (inline banner) — implemented

**S388 Files Changed:**
- `packages/frontend/pages/organizer/pricing.tsx` — price fixes ($29/$79)
- `packages/backend/src/services/xpService.ts` — rank thresholds + XP values
- `packages/frontend/pages/plan.tsx` — AI branding
- `packages/frontend/pages/privacy.tsx` — AI branding
- `packages/frontend/pages/organizer/dashboard.tsx` — AI branding
- `packages/frontend/pages/organizer/settings.tsx` — AI branding
- `packages/frontend/pages/faq.tsx` — AI branding + 7 new FAQ entries
- `packages/frontend/components/OrganizerOnboardingModal.tsx` — AI branding
- `packages/frontend/components/SmartInventoryUpload.tsx` — AI branding
- `packages/frontend/components/PriceSuggestion.tsx` — AI branding
- `packages/frontend/pages/guide.tsx` — AI branding + inclusivity
- `packages/frontend/pages/about.tsx` — inclusivity
- `packages/frontend/pages/index.tsx` — inclusivity
- `packages/frontend/components/RapidCapture.tsx` — coaching banner added
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — dead showShotGuidance removed
- `claude_docs/research/S388-documentation-coaching-research.md` — research synthesis
- `claude_docs/feature-notes/gamedesign-shopper-rank-matrix-S388.md` — game design matrix

**S388 Additional Work (post-compaction):**
- Teams member count fixed: pricing.tsx 5→12 per D-007
- Stripe audit: price IDs confirmed correct (subscription uses Stripe price objects, not hardcoded amounts). À la carte = $9.99 (999 cents). No Stripe changes needed.
- Concurrent sales gate: architect spec complete at `claude_docs/specs/concurrent-sales-gate-spec.md` (SIMPLE=1, PRO=3, TEAMS/ENT=unlimited)
- Tier + rank matrices: formal code-verified deliverable at `claude_docs/feature-notes/S388-tier-rank-matrices.md`
  - Key finding: TierComparisonTable understates limits (shows 3 photos/100 items but code enforces 5/200)
  - Key finding: Rank is cosmetic today — no rank-gated gameplay advantages are live yet
  - Key finding: Referral system has schema + XP values but no routes wired

**Additional S388 Files Changed:**
- `packages/frontend/pages/organizer/pricing.tsx` — Teams 5→12 members
- `claude_docs/specs/concurrent-sales-gate-spec.md` — NEW (architect spec)
- `claude_docs/feature-notes/S388-tier-rank-matrices.md` — NEW (organizer tier + shopper rank matrices)
- `claude_docs/strategy/roadmap.md` — v93, 5 entries added/updated

**S388 Deferred / Next Session:**
- Concurrent sales gate implementation: spec ready, needs dev dispatch (#249)
- TierComparisonTable limit discrepancy: shows 3 photos/100 items, code enforces 5/200 — fix the table
- Organizer tier rearrangement: Patrick open to moving features between tiers — needs formal proposal
- Referral system wiring: schema + XP values exist, routes not mounted
- Gamification Phase 1 completion: ~45-50% ready. Seasonal infrastructure, notifications, XP wiring to purchase/visit/auction flows, dynamic pricing all missing. Full checklist at DEV_HANDOFF_CHECKLIST-S259.md.

---

**S386 COMPLETE (2026-04-03):** TS error repair sprint + 3 deferred component wirings + full roadmap audit (S373–S386).

**S386 Summary:**
- **itemCount fix:** `organizers.ts` now returns `itemCount` (non-draft items) + `itemsSold` (SOLD items) on activeSale. Frontend type updated. Fixes SalePerformanceBadge TS error on dashboard.
- **3 deferred components wired:** CartIcon → Layout.tsx header (hold count badge, polls /api/reservations/my-holds-full). AddressAutocomplete → create-sale.tsx address field (OpenStreetMap Nominatim, free, auto-fills city/state/zip). TooltipHelper → pricing.tsx tier section (SIMPLE/PRO/TEAMS explainers).
- **TS repair chain (5 errors fixed sequentially):** OrganizerSaleCard Sale interface fields made optional → photoUrls optional chaining → useSocialProof→useSaleSocialProof import fix → Sale.status made required → LootLogResponse.hauls field added.
- **Full roadmap audit:** v92 — 20+ entries updated. S375 features (#229, #240, #241, #242, #243, #244) correctly marked shipped. S376 #235 Charity Close marked shipped. S373 #51/#68 fixes noted. All S385 wirings documented.

**S386 Files Changed (all pushed):**
- `packages/backend/src/routes/organizers.ts` — itemCount/itemsSold on activeSale
- `packages/frontend/pages/organizer/dashboard.tsx` — activeSale type update
- `packages/frontend/components/Layout.tsx` — CartIcon in header
- `packages/frontend/components/CartIcon.tsx` — dark mode classes
- `packages/frontend/components/AddressAutocomplete.tsx` — dark mode classes
- `packages/frontend/pages/organizer/create-sale.tsx` — AddressAutocomplete wired
- `packages/frontend/pages/organizer/pricing.tsx` — TooltipHelper wired
- `packages/frontend/components/OrganizerSaleCard.tsx` — all fields optional + photoUrls optional chaining
- `packages/frontend/pages/sales/[id].tsx` — useSaleSocialProof import fix + Sale.status required
- `packages/frontend/hooks/useLootLog.ts` — LootLogHaulPost type + hauls field on LootLogResponse
- `claude_docs/strategy/roadmap.md` — v92 full audit

**S385 Files Changed (push block provided):**
- `packages/database/prisma/schema.prisma` — arrivalRank removed
- `packages/database/prisma/migrations/20260403_remove_arrival_rank/migration.sql` — NEW
- `packages/frontend/pages/_app.tsx` — FeedbackWidget
- `packages/backend/src/controllers/stripeController.ts` — CheckoutEvidence.emailSentAt
- `packages/frontend/pages/sales/[id].tsx` — 7 components wired + BountyModal
- `packages/frontend/pages/shopper/history.tsx` — DisputeForm, HaulPostCard, UGCPhotoSubmitButton
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — BulkPriceModal
- `packages/frontend/components/BulkActionDropdown.tsx` — onSetPrice prop
- `packages/backend/src/controllers/reviewController.ts` — respondToReview, getMyOrganizerReviews, shopperRating trigger
- `packages/backend/src/routes/reviews.ts` — new me + respond routes
- `packages/frontend/components/ReviewsSection.tsx` — organizer response display
- `packages/frontend/pages/organizer/reviews.tsx` — NEW
- `packages/backend/src/services/reputationService.ts` — recalculateShopperRating helper
- `packages/backend/src/jobs/reputationJob.ts` — batch shopperRating update
- `packages/backend/src/controllers/reputationController.ts` — expose shopperRating
- `packages/frontend/pages/shopper/wishlist.tsx` — WishlistAlertForm
- `packages/frontend/pages/wishlists.tsx` — WishlistShareButton
- `packages/frontend/pages/organizer/edit-item/[id].tsx` — ItemPriceHistoryChart
- `packages/frontend/pages/organizer/dashboard.tsx` — SalePerformanceBadge, TeamsOnboardingWizard
- `packages/frontend/pages/organizer/sales.tsx` — OrganizerSaleCard
- `packages/frontend/pages/organizer/pricing.tsx` — PremiumCTA, TierComparisonTable
- `packages/frontend/pages/shopper/reputation.tsx` — ShopperReferralCard (replaced Coming Soon)
- `packages/frontend/pages/items/[id].tsx` — BidModal
- `packages/frontend/components/AuthContext.tsx` — teamsOnboardingComplete field
- `packages/frontend/components/TeamsOnboardingWizard.tsx` — endpoint fix
- `packages/backend/src/routes/users.ts` — teamsOnboardingComplete support
- `packages/frontend/components/AvatarDropdown.tsx` — Reviews nav link
- `packages/frontend/components/Layout.tsx` — Reviews nav link

**S385 Push Block (pending Patrick action — run S383 push first, then this):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/database/prisma/schema.prisma
git add packages/database/prisma/migrations/20260403_remove_arrival_rank/migration.sql
git add packages/frontend/pages/_app.tsx
git add packages/backend/src/controllers/stripeController.ts
git add "packages/frontend/pages/sales/[id].tsx"
git add packages/frontend/pages/shopper/history.tsx
git add "packages/frontend/pages/organizer/add-items/[saleId].tsx"
git add packages/frontend/components/BulkActionDropdown.tsx
git add packages/backend/src/controllers/reviewController.ts
git add packages/backend/src/routes/reviews.ts
git add packages/frontend/components/ReviewsSection.tsx
git add packages/frontend/pages/organizer/reviews.tsx
git add packages/backend/src/services/reputationService.ts
git add packages/backend/src/jobs/reputationJob.ts
git add packages/backend/src/controllers/reputationController.ts
git add packages/frontend/pages/shopper/wishlist.tsx
git add packages/frontend/pages/wishlists.tsx
git add "packages/frontend/pages/organizer/edit-item/[id].tsx"
git add packages/frontend/pages/organizer/dashboard.tsx
git add packages/frontend/pages/organizer/sales.tsx
git add packages/frontend/pages/organizer/pricing.tsx
git add packages/frontend/pages/shopper/reputation.tsx
git add "packages/frontend/pages/items/[id].tsx"
git add packages/frontend/components/AuthContext.tsx
git add packages/frontend/components/TeamsOnboardingWizard.tsx
git add packages/backend/src/routes/users.ts
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/Layout.tsx
git add -u
git commit -m "feat: S385 Wave 1+2+3 — 24 components wired, review responses, shopperRating, Teams onboarding, nav cleanup"
.\push.ps1
```

**S385 Post-push schema migration (required):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S385 Orphan file deletions (PowerShell, before or after push):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
Remove-Item packages/frontend/components/Layout_current_github.tsx
Remove-Item packages/frontend/components/BulkItemToolbar.tsx
Remove-Item packages/frontend/components/ItemListWithBulkSelection.tsx
Remove-Item packages/backend/src/routes/templates.ts
```

---

**S384 COMPLETE (2026-04-03):** Full orphan audit — 4 layers scanned (backend routes, frontend components, schema fields, feature conditions). Research-only session. All dispatch decisions made. S385 starts dispatching immediately.

**S384 Summary:**
- **Layer 1 — Backend routes:** Ripples and SmartFollows were false alarms (properly mounted via sub-routers). `templates.ts` is a duplicate of `messageTemplates.ts` — delete it. `treasureHuntQR.ts` routes are NOT mounted — feature is 70-75% complete (schema, controller, component, shopper page all done); mount routes in index.ts to ship.
- **Layer 2 — Component orphans:** 35 orphaned components audited. 25 are WIRE candidates with real backends. Key finds: ActivityFeed + HypeMeter (backend complete, just needs wiring to sales/[id].tsx), FeedbackWidget (backend complete, trivial — add to _app.tsx), DisputeForm (backend complete, disputes view exists but no create button), BulkPriceModal (missing from add-items bulk flow), TeamsOnboardingWizard (Teams users get zero onboarding). LiveFeedWidget deferred (WebSocket events need verification). `Layout_current_github.tsx`, `BulkItemToolbar`, `ItemListWithBulkSelection` approved for deletion.
- **Layer 3 — Schema fields:** 22 fields audited. `holdDurationHours` safe to delete (rank system is active, field never read/written). `arrivalRank` approved for removal (superseded by LineEntry.position). `priceBeforeMarkdown` + `markdownApplied` — backend cron writes them, frontend should show crossed-out original price. `Review.verifiedPurchase` — backend sets it, badge missing from review cards. `SaleSettlement.clientPayoutStripeTransferId/FailureReason` — controller returns them, SettlementWizard doesn't display. `Review.respondedAt` + `OrganizerReputation.shopperRating` — BUILD these (small effort, high value). `masterItemLibraryId` — DEFER.
- **Layer 4 — Feature conditions:** Tier gates are all properly gated with upgrade CTAs (good news). FlashDeal remains the only dead condition (known from S383).
- **S383 push block still pending Patrick action.**

**S384 Files Changed:** None (research session).

---

**S385 DISPATCH PLAN — start immediately:**

**Cleanup (approved):**
- Delete `packages/frontend/components/Layout_current_github.tsx`
- Delete `packages/frontend/components/BulkItemToolbar.tsx`
- Delete `packages/frontend/components/ItemListWithBulkSelection.tsx`
- Delete `packages/backend/src/routes/templates.ts` (duplicate of messageTemplates.ts)
- Remove `arrivalRank` field from SaleCheckin model + migration to DROP COLUMN

**Wave 1 — Wire (backend complete, just needs wiring):**
- Mount `treasureHuntQR.ts` routes in `packages/backend/src/index.ts` (ship the feature)
- Wire `FeedbackWidget` → `packages/frontend/pages/_app.tsx` (global floating button)
- Wire `ActivityFeed` + `HypeMeter` → `packages/frontend/pages/sales/[id].tsx`
- Wire `DisputeForm` → `packages/frontend/pages/shopper/history.tsx` (add "Report Issue" button per purchase)
- Wire `BulkPriceModal` → `packages/frontend/pages/organizer/add-items/[saleId].tsx` (bulk price action in BulkActionDropdown)
- Set `emailSentAt: new Date()` in `packages/backend/src/controllers/stripeController.ts` when confirmation email fires (1 line)

**Wave 2 — Build (small, high value):**
- `Review.respondedAt` — organizer review response feature (1 endpoint + organizer UI + display in ReviewsSection)
- `OrganizerReputation.shopperRating` — aggregate Review.rating into reputation score calculation

**Wave 3 — Wire remaining 24 WIRE components (batch by feature area):**
Batch A (RSVP system): `SaleRSVPButton`, `RSVPBadge`, `SaleWaitlistButton` → wire to `sales/[id].tsx`
Batch B (Shopper discovery): `SimilarItems`, `SearchSuggestions`, `AddToCalendarButton`, `LocationMap`, `SocialProofBadge` → wire to appropriate pages
Batch C (Wishlist): `WishlistAlertForm`, `WishlistShareButton` → wire to wishlist/shopper pages
Batch D (Organizer tools): `OrganizerHoldsPanel`, `OrganizerSaleCard`, `SalePerformanceBadge`, `ItemPriceHistoryChart`, `PremiumCTA`, `TierComparisonTable`
Batch E (Gamification/Community): `PointsBadge`, `HaulPostCard`, `UGCPhotoSubmitButton`, `ShopperReferralCard`, `BountyModal`, `BidModal`
Batch F (Teams): `TeamsOnboardingWizard` → trigger for new Teams-tier users
Batch G (UX): `TooltipHelper`, `CartIcon`, `AddressAutocomplete`

**S383 push block (still pending):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/ToastContext.tsx
git add packages/frontend/components/OrganizerOnboardingModal.tsx
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/Layout.tsx
git commit -m "fix: toast dismiss button, onboarding completion stays on dashboard, Install App in nav"
.\push.ps1
```

---

**S383 COMPLETE (2026-04-03):** Toast dismiss, onboarding fix, Install App nav, pricing audit.

**S383 Summary:**
- **Toast dismiss button:** `components/ToastContext.tsx` — added `dismiss()` callback + `×` button to both standard and points toast variants. All toasts now immediately closeable instead of waiting 10s.
- **Onboarding modal fix:** `components/OrganizerOnboardingModal.tsx` — final step CTA now calls `onDismiss()` (stays on dashboard) instead of navigating to `/organizer/create-sale`. Root cause: new organizers hit "Start my first sale" and landed on create-sale page rather than seeing the dashboard.
- **Install App in nav:** `components/AvatarDropdown.tsx` + `components/Layout.tsx` — "📲 Install App" button added between Settings and Logout in both organizer and shopper sections (both mobile drawer and desktop dropdown). Hides when already installed (standalone mode). Android: clears dismiss timer + reloads so `beforeinstallprompt` fires. iOS: shows inline "Tap Share → Add to Home Screen" tooltip.
- **Pricing audit:** Full map of all pricing features across app — 4 suggestion tools (AI Auto-Price, Suggest Price, eBay Comps, ValuationWidget), 4 pricing mechanics (BulkPriceModal, FlashDeal, Reverse Auction, Appraisals). Two orphaned features found: FlashDealForm imported on dashboard but `setFlashDealSaleId` never called (never renders); Reverse Auction option missing from listingType dropdown on add-items (fields exist, UI option absent).
- **S380/S381/S382 push verification:** All three confirmed landed on GitHub.

**S383 Files Changed:**
- `packages/frontend/components/ToastContext.tsx` — dismiss button
- `packages/frontend/components/OrganizerOnboardingModal.tsx` — completion stays on dashboard
- `packages/frontend/components/AvatarDropdown.tsx` — Install App button
- `packages/frontend/components/Layout.tsx` — Install App button

**S383 Push Block (pending Patrick action):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/ToastContext.tsx
git add packages/frontend/components/OrganizerOnboardingModal.tsx
git add packages/frontend/components/AvatarDropdown.tsx
git add packages/frontend/components/Layout.tsx
git commit -m "fix: toast dismiss button, onboarding completion stays on dashboard, Install App in nav"
.\push.ps1
```

---

**S382 COMPLETE (2026-04-02):** Review & Publish page — delete + mobile UX fixes.

**S382 Summary:**
- **Always-visible photo buttons (mobile):** `ItemPhotoManager.tsx` — X delete button and ← → reorder arrows changed from `opacity-0 group-hover:opacity-100` to `opacity-80 hover:opacity-100` so they're always visible on touch devices. Hint text updated to "Tap × to delete, ← → to reorder".
- **Bulk delete:** Selection toolbar in `review.tsx` — Delete button added before Clear. Confirms item count before firing `deleteMutation`. Red button, disabled while pending.
- **Per-item delete:** 🗑️ button added to every collapsed card row's right column. `stopPropagation` so it doesn't also toggle expand. Same `deleteMutation` with single-item array.
- **Scroll-to-top on expand:** `itemRefs` map + `handleToggleExpand` wired — collapsed row `onClick` changed from inline `setExpandedItemId` to `handleToggleExpand`. On expand, `scrollIntoView({ behavior: 'smooth', block: 'start' })` fires after 50ms so card top is always in view.
- TypeScript check: zero errors.

**S382 Files Changed:**
- `packages/frontend/components/ItemPhotoManager.tsx` — always-visible photo action buttons
- `packages/frontend/pages/organizer/add-items/[saleId]/review.tsx` — bulk delete, per-item delete, scroll-to-top

---

**S381 COMPLETE (2026-04-02):** Camera flow fixes — RapidCapture bugs + regular flow overhaul.

**S381 Summary:**
- **Bug 1 (RapidCapture "+" button timing):** `+` button now appears immediately when `thumbnailUrl` exists, grayed out until DB ID confirmed — no longer waits 4.5s for AI analysis. (`RapidCapture.tsx`)
- **Bug 2 (AI analysis not pausing on "+" tap):** Verified `hold-analysis` endpoint call was already correctly wired in `onAddToItem` handler — no changes needed.
- **Bug 3 ("+" mode item assignment regression post-debounce):** Introduced `addingToItemIdRef` (`useRef`) to track append target item ID. Ref is set on "+" tap and read at upload time — eliminates stale closure where post-analysis state overwrote the append target. (`[saleId].tsx`)
- **Regular camera flow overhaul:** Deferred AI analysis — no auto-analysis on capture. Added live "X/5" counter (replaces static text), per-thumbnail delete buttons, explicit "Analyze" button (triggers AI on all captured photos). Post-analysis: same "taken → enhanced → review" status flow as RapidCapture. "Done" button added to RapidCapture for rapidfire mode. (`RapidCapture.tsx`, `[saleId].tsx`)

**S381 Files Changed (PUSHED):**
- `packages/frontend/components/RapidCapture.tsx` — "+" button timing fix, regular mode: X/5 counter inline in hint, per-thumb delete buttons, unified stats line (Analyze in regular / Enhance in rapidfire), carousel guard removed so regular items show left of shutter, mode switch clears photos, onPhotoCapture only fires in rapidfire
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — addingToItemIdRef stale closure fix, handleRegularAnalyze replaced with non-blocking rapidfire-style pipeline, processAndUploadRapidPhoto accepts additionalPhotos for multi-photo regular items

**S380 COMPLETE (2026-04-02):** Orphaned pages audit + nav dead-link cleanup + gamification nav wiring.

**S380 Summary:**
- **Full pages audit:** Catalogued all 130+ frontend pages vs. nav entries. Identified 9 dead nav links, 5 mobile↔desktop parity gaps, and 20+ orphaned pages.
- **Dead links removed from mobile nav:** Sale Map (`/organizer/map`), Analytics (`/organizer/analytics`), Item Tagger duplicate (`/organizer/item-tagger` — typology already present), Saved Items duplicate (`/shopper/saved-items` — wishlist already present).
- **Path fixes:** `/organizer/sale-hubs` → `/organizer/hubs` in mobile nav.
- **4 sale-picker index pages created:** `organizer/line-queue/index.tsx`, `organizer/photo-ops/index.tsx`, `organizer/promote/index.tsx`, `organizer/send-update/index.tsx` — all with auth guard, sale picker list, dark mode.
- **New nav links added (both menus):** Bounties (In-Sale Tools), Email Digest (Pro Tools), Refer a Friend (Explore & Connect), Settings (shopper), Achievements (gamification), Explorer Leaderboard (gamification), My Trails (Explore & Connect), Loyalty Passport (gamification).
- **Disputes tab added** to `/shopper/history` page.
- **shopper/dashboard hauls link** → `/shopper/history?view=gallery` + relabeled "My Finds".
- **3 orphaned pages removed:** `shopper/hauls.tsx` (replaced by history gallery), `shopper/alerts.tsx` (redirect stub), `organizer/performance.tsx` (redirect stub).
- **Research:** Gamification pages analyzed — loot-legend stays as deep-link only (linked from hunt-pass/league); loyalty overlaps with explorer-passport (separate entry added for now, consolidation deferred).

**S380 Files Changed:**
- `packages/frontend/components/Layout.tsx` — dead link removals, path fix, 8 new links
- `packages/frontend/components/AvatarDropdown.tsx` — 8 new links added
- `packages/frontend/pages/organizer/line-queue/index.tsx` — NEW
- `packages/frontend/pages/organizer/photo-ops/index.tsx` — NEW
- `packages/frontend/pages/organizer/promote/index.tsx` — NEW
- `packages/frontend/pages/organizer/send-update/index.tsx` — NEW
- `packages/frontend/pages/shopper/history.tsx` — disputes tab added
- `packages/frontend/pages/shopper/dashboard.tsx` — hauls link fixed
- DELETED: `shopper/hauls.tsx`, `shopper/alerts.tsx`, `organizer/performance.tsx`

**S379 COMPLETE (2026-04-02):** Full mobile + desktop nav overhaul — 4 rounds of changes.

**S379 Summary:**
- **Round 1:** Admin icons, Admin Dashboard above collapse, My Profile/Plan a Sale repositioning, POST SALES section, In-Sale Tools ordering, Pro Tools reorder (Command Center first), Workspace→Teams, icon standardization, print-kit general page, subscription admin toast fix.
- **Round 2:** Bottom nav reorder (Map→Calendar→Wishlist→Messages→Profile), Selling Tools section removed, section reorder (In-Sale→Post Sales→Pro Tools), Sale Ripples→Your Sales, Reputation→Post Sales, mobile color fixes, desktop message badge, "as a shopper" removal.
- **Round 3:** Mobile user info block (name/email/rank/XP) above Admin section, Pro Tools purple color, desktop My Profile/Settings moved to footer, desktop Settings uses amber gear icon, desktop Messages link removed.
- **Round 4+:** Restored Map/Calendar to staticNavLinks. Feed/Inspiration/Trending moved to Explore & Connect (both menus), with Map+Calendar duplicated there too — ordered Map, Calendar, Feed, Inspiration, Trending. Pricing added above My Profile in both menus. My Collection icon changed to Package; Wishlist icon changed to Heart. Mobile: dead space/border above username removed, Subscription moved above Pro Tools, hr above Your Sales removed. Desktop AvatarDropdown: duplicate In-Sale Tools section below Post Sales removed.

**S379 Files Changed:**
- `packages/frontend/components/Layout.tsx` — mobile drawer full restructure
- `packages/frontend/components/AvatarDropdown.tsx` — desktop dropdown restructure
- `packages/frontend/pages/organizer/print-kit/index.tsx` — NEW sale picker landing page
- `packages/frontend/pages/organizer/subscription.tsx` — admin guard added

**S378 COMPLETE (2026-04-02):** Nav menu parity (mobile ↔ desktop), Shopping Cart fix, icon fixes.

**S378 Summary:**
- **P1 Vercel green:** Confirmed READY after S377 revert push.
- **P2 Nav audit decision doc:** Built 43+ line decision document, Patrick approved every item.
- **P2 Nav implementation (3 dev dispatches + inline fixes):**
  - Mobile menu now mirrors desktop exactly: Admin (collapsible, 7 items), Quick Links w/icons, Your Sales, Selling Tools, IN-SALE TOOLS (renamed from "Sale Context", added Print Kit), PRO TOOLS (added Insights, Sale Hubs, Virtual Queue, UGC Moderation), TEAMS (new section), DEVELOPER TOOLS (new section).
  - Removed "Account & Profile" section from mobile (Messages/Settings in footer like desktop).
  - 11 coming-soon placeholder pages created for routes that had no page.
  - "(Coming Soon)" labels standardized to "(Soon)" across both menus.
  - Shopping Cart fixed: desktop button now imports useShopperCart + renders ShopperCartDrawer with item count badge. Mobile gets same cart button in both organizer+shopper and shopper-only paths.
  - Icons fixed: Manage Photos → Image, UGC Moderation → Image, Workspace → Network, Payouts → Wallet, Item Library → BookOpen.
  - Caught and fixed temporal dead zone bug (isClient referenced before declaration).
- **P3 Chrome QA:** Carried to S379 — context tight after large dev dispatches.

**S378 Files Changed:**
- `packages/frontend/components/AvatarDropdown.tsx` — icons, cart integration, ShopperCartDrawer
- `packages/frontend/components/Layout.tsx` — full mobile menu restructure, cart, footer
- 11 new coming-soon pages: `organizer/calendar.tsx`, `organizer/earnings.tsx`, `organizer/staff.tsx`, `organizer/qr-codes.tsx`, `admin/items.tsx`, `admin/reports.tsx`, `admin/feature-flags.tsx`, `admin/broadcast.tsx`, `shopper/bounties.tsx`, `shopper/reputation.tsx`, `shopper/trades.tsx`

**S377 COMPLETE (2026-04-02):** Print Kit path fix + user1 TEAMS upgrade + nav audit research. Nav menus reverted after unauthorized removal.

**S377 Summary:**
- **Print Kit 404 fix (PUSHED, commit 143780c6):** `print-kit/[saleId].tsx` — changed 6 `window.open` paths from `/organizer/sales/${saleId}/signs/...` to `/organizers/${saleId}/signs/...` (matching backend route mount `app.use('/api/organizers', organizerRoutes)`). Labels path `/sales/${saleId}/labels` was already correct, untouched. This is the ONLY valid code change from S377.
- **user1 upgraded to TEAMS tier:** Direct Railway DB update via psycopg2.
- **Nav audit research COMPLETED (valuable — pass to S378):** Full page-existence audit of every nav link in both Layout.tsx (mobile) and AvatarDropdown.tsx (desktop). Results documented in Next Session handoff.
- **⚠️ CRITICAL INCIDENT: Unauthorized nav removal.** Dev agent REMOVED working nav links without Patrick's approval — direct Removal Gate violation (CLAUDE.md §7). Both Layout.tsx and AvatarDropdown.tsx REVERTED to pre-S377 state (commit 4018b881). Root cause: orchestrator included removal instructions in dev agent prompt instead of presenting decisions to Patrick first.

**S377 Files Changed:**
- `packages/frontend/pages/organizer/print-kit/[saleId].tsx` — pushed (commit 143780c6, correct)
- `packages/frontend/components/Layout.tsx` — REVERTED to 4018b881
- `packages/frontend/components/AvatarDropdown.tsx` — REVERTED to 4018b881

**S376 COMPLETE (2026-04-02):** S375 smoke test + Smart Cart fixes + #235 Charity Close + Print Kit bug fixes. All pushed. Migration deployed.

**S376 Summary:**
- Smoke tested all 7 S375 features on finda.sale — all deployed and rendering correctly
- **Smart Cart Chrome QA (as Karen Anderson / user11):** "Buy Now" + "+ Cart" buttons on every item card for shoppers ✅. Toast on add ✅. Button toggles to "✓ In Cart" ✅. SOLD items excluded ✅. Cart drawer in DOM ✅.
- **Smart Cart FAB fix:** z-index bumped z-40 → z-50, bottom position adjusted to sit above bottom nav bar (bottom-24 mobile, md:bottom-8 desktop)
- **Smart Cart on item detail page:** Full integration added to `items/[id].tsx` — useShopperCart hook, "+ Cart" / "✓ In Cart" button next to Buy It Now, ShopperCartDrawer + ShopperCartFAB rendered, cross-sale switch modal. HoldButton recolored blue to avoid amber conflict.
- **#235 Charity Close + Tax Receipt PDF:** SaleDonation + DonatedItem schema models, migration deployed, donationController (POST donate, GET list, GET receipt PDF via PDFKit), 3 routes wired, DonationModal (3-step: charity info → item select → confirm), PRO-gated with upgrade CTA, integrated into SettlementWizard receipt step.
- **P0 Price Comps auth fix:** `ebayController.ts` — `getComps` and `exportSaleToEbay` both compared `sale.organizerId` (Organizer ID) against `req.user.id` (User ID) — always mismatched. Fixed to look up Organizer record by userId first, then compare IDs. Same root cause as S373 Command Center/Ripples auth bugs.
- **P1 Print Kit nav wiring (4 surfaces):** Dashboard live sale card now has "🖨️ Print Kit" button. Layout.tsx nav links enabled (were disabled stubs). Add-items bulk toolbar gets Print Kit button. BulkActionDropdown updated with onPrintLabels prop.
- **P1 Print Kit buttons 404 fix:** All 7 `window.open('/api/...')` calls in `print-kit/[saleId].tsx` were routing to Vercel instead of Railway. Fixed by introducing `apiBase = process.env.NEXT_PUBLIC_API_URL` and using it in all calls.

**S376 Files Changed (all pushed):**
Push 1: `ShopperCartFAB.tsx`, `items/[id].tsx`, `schema.prisma`, `organizers.ts` (routes), `SettlementWizard.tsx`, `donationController.ts` (NEW), `DonationModal.tsx` (NEW), `migrations/20260402_add_charity_donation/migration.sql` (NEW)
Push 2: `ebayController.ts`, `dashboard.tsx`, `Layout.tsx`, `BulkActionDropdown.tsx`, `add-items/[saleId].tsx`
Push 3: `print-kit/[saleId].tsx` (window.open URL fix)

**S375 COMPLETE (2026-04-01):** Session A — 4 parallel dev agents built 7 features. All pushed S376.

**S375 Summary:**
- 4 agents dispatched in parallel (~447k agent tokens total), all returned clean
- **#240 Print-to-QR Sign Kit:** 5 sign templates (yard, directional, table tent, hang tag, full kit). Routes: `/api/organizer/sales/:saleId/signs/{type}`. UI on print-kit page.
- **#242 QR/Barcode Item Labels:** QR codes in item labels (40×40px → item page URL). Print Label button on edit-item page.
- **#241 Brand Kit Expansion (PRO):** 4 PDF generators (business cards, letterhead, social headers, branded yard sign). PRO-gated with SIMPLE upsell.
- **#229 AI Comp Tool:** eBay Browse API OAuth + search. "Get Price Comps" on edit-item page. Mock fallback without credentials.
- **#244 Phase 1 eBay CSV Export:** eBay File Exchange CSV from add-items page. Watermark toggle (clean = PRO-gated).
- **#243 Smart Cart:** localStorage shopper cart — hook + drawer + FAB. Single-sale scoping, cross-sale switch confirm. Integrated into sale detail page.
- Agents 1+3 both modified edit-item/[id].tsx — no conflict (different sections: header vs price form)
- Combined TS check passed: zero errors frontend + backend

**S374 COMPLETE (2026-04-01):** Roadmap planning session. #240–244 slotted into Building backlog. eBay Quick List spec written. S375 parallel dispatch prompts prepared.

**S373 COMPLETE (2026-04-01):** Ripples + Command Center auth/data/UX fixes. Two pushes. Seed data synced.

**S373 Summary:**

**Root cause bugs fixed (both pushed):**
- **Ripples "No sales found"** — Two compounding bugs: (1) missing `GET /organizers/me/sales` endpoint (bare path without auth); (2) `ripples.tsx` + `useRipples.ts` both used bare `axios` (no JWT) instead of authenticated `api` lib. Fixed: added endpoint to `organizers.ts`, converted all 4 axios calls across both files to `api` lib with correct paths (no `/api` prefix).
- **Command Center always 401** — `commandCenterController.ts` checked `req.user?.organizer?.id` which auth middleware never populates. Fixed to DB lookup pattern (`prisma.organizer.findUnique({ where: { userId: req.user.id } })`).
- **Command Center all tabs same data** — Redis cache key was `command-center:${organizerId}` (status-agnostic). Fixed to `command-center:${organizerId}:${status}`.
- **Command Center Recent tab empty** — Service required `status: 'ENDED'` but sales never auto-transition from PUBLISHED when dates pass. Fixed: `status: { in: ['PUBLISHED', 'ENDED'] }`.

**UX improvements (pushed):**
- `CommandCenterCard.tsx` — date-aware badge logic: `◷ UPCOMING` for future PUBLISHED sales, `● LIVE` only when dates bracket today, `◉ ENDED` for past. Status colors updated with dark mode variants.
- `CommandCenterCard.tsx` — title now has `hover:underline`. "View Sale ↗" button added alongside Manage.
- `command-center.tsx` — SaleStatusWidget gated: only renders when sale is currently live (dates + PUBLISHED).
- Dark mode added to CommandCenterCard and SaleStatusWidget (prev session).

**Ripple events wired (pushed):**
- `sales/[id].tsx` — VIEW ripple fires on page load (fire-and-forget)
- `FavoriteButton.tsx` — SAVE ripple fires after successful favorite toggle
- `SaleShareButton.tsx` — SHARE ripple fires from all 6 share handlers

**Seed data fixed (DB direct):**
- Seeded 30 SaleRipple records for Carol's 2 published sales (VIEW/SAVE/SHARE/BID)
- Synced Item.status vs Purchase.status: 18 items updated to SOLD (had PAID purchases), 17 orphaned SOLD items reset to AVAILABLE. All sales now show consistent sold count + revenue.

**S373 Files changed (all pushed):**
Push 1: `packages/frontend/hooks/useRipples.ts`, `packages/frontend/pages/organizer/ripples.tsx`, `packages/backend/src/routes/organizers.ts`, `packages/backend/src/controllers/commandCenterController.ts`, `packages/backend/src/services/commandCenterService.ts`, `packages/frontend/components/CommandCenterCard.tsx`, `packages/frontend/components/SaleStatusWidget.tsx`, `packages/frontend/pages/sales/[id].tsx`, `packages/frontend/components/FavoriteButton.tsx`, `packages/frontend/components/SaleShareButton.tsx`

Push 2: `packages/backend/src/services/commandCenterService.ts` (Recent tab fix), `packages/frontend/components/CommandCenterCard.tsx` (badge + View Sale), `packages/frontend/pages/organizer/command-center.tsx` (SaleStatusWidget gate)

**S373 Chrome QA:**
- Ripples ✅ ss_6281sqjiq — Carol: 10 views, 2 shares, 2 saves, 15 total, chart rendering across 3 sales
- Command Center dark mode ✅ ss_8507mzglt
- Command Center Upcoming tab ✅ ss_8507mzglt — real data (14 items, $1136 rev, 14.3% conv)
- Command Center All tab ✅ ss_5606o78tb — multiple sales, tabs correctly segmented

**S372 COMPLETE (2026-04-01):** Dashboard polish + AI wiring + endpoint expansion. All pushed.

**S372 Summary:**
- P1: Live sale card buttons consolidated into one row (PUBLISHED: View Live | Items(purple) | Holds | POS | Close Sale; DRAFT: View Live | Items(purple) | Publish Sale(amber) | Holds | POS). Dead space above buttons removed.
- P1: Holds and POS pages now read `?saleId=` query param on mount and pre-select that sale
- P2: Auto high-value flagging wired into `itemController.ts` AI callback — fires after `estimatedValue`/`aiConfidence` update, respects `isHighValueLocked`, graceful error handling
- P3: `/sales/mine` endpoint expanded — explicit `select` clause guarantees `qrScanCount`, added `_count.items` for itemCount, grouped `holdCount` per sale. SecondarySaleCard now shows real stats.
- Bug: "Other Active Sales" renamed → "Other Sales"
- Bug: Collapse loop with 1 sale fixed (setState-in-render → useEffect + useRef guard)
- Bug: Make Primary now updates sale name + all button hrefs (switched from `statsData.activeSale` → local `getActiveSale()` variable)
- Bug: Multiple `statsData` possibly-undefined Vercel errors fixed with optional chaining
- Bug: `highValueFlagging.ts` `category` type fixed (`string` → `string | null`) to match Prisma
- localStorage persistence: `manualPrimaryId` + `otherSalesExpanded` lazy-initialized from localStorage, saved on change

**S372 Files changed (all pushed):**
dashboard.tsx, holds.tsx, pos.tsx, itemController.ts, saleController.ts, highValueFlagging.ts, claude_docs/human-QA-walkthrough-findings.md

**S371 COMPLETE (2026-04-01):** Dashboard overhaul — 5 dev rounds, all pushed. Migration deployed.

**S371 Summary:**
- Top action bar: [+ New Sale] [Add Items] [Holds] [POS] [Ripples] pills below Welcome header
- Smart nudge replaces static "looking good" card (contextual: no items / questions / no description / default)
- Multi-sale: collapsible "Other Active Sales" section between nudge and Real-Time Metrics; max 2 SecondarySaleCards + "X more → Command Center" link
- Weather inline with LIVE badge in sale card header
- Holds summary compact inside live sale card; full OrganizerHoldsPanel removed from page
- Selling Tools card removed; Boost visibility 404 fixed → /organizer/ripples
- Holds + POS buttons in live sale card now include saleId in href
- Add Items / POS top bar buttons: dropdown sale selector when 2+ active sales
- Tooltips on all Real-Time Metrics, Sale Pulse, Efficiency Coach labels, High-Value Items header
- OrganizerTierBadge: accurate tier copy (no false fee discounts); Gold "dedicated support" claim removed from badge + tierService.ts
- Auto high-value flagging: schema (3 Item fields + 2 Sale fields), migration deployed, backend utility + PATCH endpoint, widget badge. ⚠️ Utility not yet wired into AI analysis callback — needs one more dev pass.
- SecondarySaleCard: stats (items/holds/visitors) show 0 because /sales/mine doesn't return per-sale counts yet — needs /sales/mine endpoint expansion.

**S371 Files changed (all pushed):**
dashboard.tsx, WeatherStrip.tsx, OrganizerHoldsPanel.tsx, HighValueTrackerWidget.tsx, SecondarySaleCard.tsx (NEW), SalePulseWidget.tsx, EfficiencyCoachingWidget.tsx, OrganizerTierBadge.tsx, next.config.js, schema.prisma, migrations/20260401_auto_high_value_flagging/, itemController.ts, items.ts (routes), highValueFlagging.ts (NEW), tierService.ts, shoppers/[id].tsx, useAchievements.ts, SaleShareButton.tsx

**S370 COMPLETE (2026-04-01):** QA all S369 fixes + 4 bugs fixed. All pushed S371.

**S370 QA Results:**
- Dashboard greeting ✅ (ss_4723mliw1, ss_9241d0vbz, ss_7467gghly)
- Settle → dashboard ✅ (ss_4723mliw1, ss_7467gghly, ss_9241d0vbz)
- Settle button /organizer/sales ✅ (ss_0317vf3pv, ss_5667rz7te)
- Settlement wizard + dark mode ✅ (ss_64290amld, ss_4500erofx)
- Holds page dark mode ✅ (ss_5909fjyqw)
- Upgrade guard ⚠️ P1 → FIXED (see below)
- #37 Sale Alerts tab filter ✅ (ss_7662vnzuw, ss_1684z25na, ss_48788fik0); trigger UNVERIFIED (needs organizer publish)
- #29 Loyalty Passport ✅ (ss_4536dwars, ss_1469q7jsn, ss_7611iil7t, ss_84910ix70)
- #213 Hunt Pass CTA ✅ hidden for active user (ss_0386yjbib); CTA state UNVERIFIED (user11 has active pass)

**S370 Bugs Fixed:**
1. **Upgrade guard P1** — `organizer/dashboard.tsx` line 804: changed `tierData.progress.nextTier !== null` → `user?.organizerTier !== 'TEAMS'`. Fix was comparing activity tier (BRONZE/SILVER/GOLD) instead of subscription tier. Now hides "Upgrade →" correctly for TEAMS users.
2. **#199 Profile dark mode P2** — `shoppers/[id].tsx`: 36 lines, added `dark:` variants to all profile cards (`bg-white dark:bg-gray-800`), stat cards (`bg-warm-50 dark:bg-gray-700`), text (`text-warm-600 dark:text-gray-400`), borders, container.
3. **#58 Achievements 401 P1** — `hooks/useAchievements.ts`: replaced bare `fetch()` (no auth headers) with authenticated `api` lib. Root cause: same `fetch` vs `api` pattern that caused other 401s.
4. **#131 Share Templates ❌→FIXED** — QA found SaleShareButton.tsx only had Copy Link + Facebook + Twitter. Added Nextdoor (copy+toast+newsfeed), Threads (intent popup), Pinterest (pin dialog), TikTok (copy+toast+TikTok). `SaleShareButton.tsx` is the component on sale pages (not SharePromoteModal.tsx).

**S369 COMPLETE (2026-04-01):** Dashboard QA fixes shipped. Vercel green. QA done S370.

**S369 Implementation Summary:**
- Greeting: dashboard now shows saleType-aware greeting via `getSaleTypeConfig(activeSale.saleType).greeting` (State 2 active sale)
- Upgrade guard: "Upgrade →" link now hidden when `tierData.progress.nextTier === null` (already on highest tier)
- Settle links: "Settle →" link added to ENDED sales in both dashboard State 3 past-sales list and organizer/sales.tsx card actions
- Dark mode holds: OrganizerHoldsPanel.tsx dark mode contrast fixed
- Build fix 1: `SettlementWizard.tsx` was missing `import Link from 'next/link'` — fixed by S369 dev agent
- Build fix 2: `Sale` interface in `dashboard.tsx` was missing `saleType?: string` — found + fixed this session (strict TS caught it during Vercel build)
- Commits: `8cd4647` (S369 dev fixes), `174811502` (Link import fix), `4f4c438` (cache-bust), Patrick's commit (saleType fix + cache-bust cleanup)

**S368 COMPLETE (2026-04-01):** Dashboard Makeover Phase 1 built + deployed. 8 roadmap items (#228, #230-234, #236-237). Migration deployed to Railway. Code pushed — both Vercel and Railway green.

**S368 Implementation Summary:**
- Schema: 4 new models (SaleSettlement, SaleExpense, ClientPayout, SaleTransaction) + field additions to Sale, Item, Organizer
- Migration: `20260401_settlement_hub_dashboard_widgets` deployed to Railway ✅
- Backend: settlementController (7 functions), settlement routes, 3 widget endpoints on organizer routes, high-value toggle on items, lifecycle endpoint on sales
- Shared: settlement.ts types + CONSIGNMENT/OTHER added to SaleType enum
- Frontend: 6 dashboard widgets (SalePulse, SmartBuyer, HighValueTracker, EfficiencyCoaching, WeatherStrip, PostSaleMomentum), settlement wizard (5-step + simple card), 3 wizard sub-components, settlement page, dashboard integration, edit-sale "Settle" button
- Deploy fixes: Purchase.amount (not totalPrice), Follow.userId (not followerId), WeatherStrip type keys, dashboard saleType type, efficiency-stats route ordering (was caught by /:id catch-all)

**S368 Dashboard QA Issues (from Patrick screenshot — S369 P1):**
- Past Sales card: shows sale but only Reopen button, no link to the sale itself, no other sales/drafts card visible
- Manage Holds card: dark mode styling broken (looks washed out / wrong background)
- Organizer Tier card: still shows "Upgrade →" link, no meaningful tier info displayed
- Widget grid (SalePulse, Who's Coming, High-Value, Efficiency Coach): rendering in "between sales" state when they should only show during active sale — need to verify dashboard state logic
- WeatherStrip: not visible (may be correct — no sale within 10 days)
- PostSaleMomentum: not visible in screenshot — need to check if it renders in State 3
- Nav menus: need full audit against spec to verify all items present
- Sale-type adaptive layout: untested — only ESTATE type exists in current data

**S367 COMPLETE (2026-04-01):** Dashboard bug fixes (5 P1s) + Dashboard Makeover architecture + spec. All pushes confirmed on GitHub.

**S366 COMPLETE (2026-04-01):** Camera P1 QA ✅ verified. Review & Publish mobile card width fixed (4 iterations). Dashboard P1/P2 batch. All orphaned organizer pages wired into nav (19 items). Close Sale Early: confirm dialog + reopen flow added. Eastside Collector's Sale 2 manually restored to PUBLISHED via Railway SQL.

- P2: Compact all-sales list (up to 5, View all → /organizer/sales)
- P2: QR Codes route fixed

**Nav wiring (19 orphaned pages):**
Active: messages, profile, settings, payouts, item-library, reputation, message-templates, manage-photos, appraisals, command-center, typology, fraud-signals, workspace
Disabled/coming-soon: inventory, promote, send-update, photo-ops, print-kit, line-queue

**Gamification/Tier research locked:**
- OrganizerTierBadge = Phase 31 fee-benefit tiers (BRONZE/SILVER/GOLD), earned by activity, NOT subscription
- verificationStatus = Feature #16 (separate), reputationTier = Feature #71 (separate, ratings-based)
- OrganizerReputation model in schema for #71. S268 decision: zero shopper gamification cross-pollination.

**S365 COMPLETE (2026-04-01):** Camera UI scroll strip + add-mode fixes.

All changes pushed this session:
- Thumbnail scroll strip: LTR with `paddingLeft: calc(50% + 40px)`, auto-scroll to newest on capture. Photos start right of shutter, grow right, older ones scroll left.
- `+` add-mode stale closure fix: added `onPhotoCapture` to `capturePhoto` useCallback deps — was causing 2nd photo to create new item instead of appending
- `+` disabled on temp-* items (append only works on real DB ids)
- Orphan temp entry removed from carousel after successful append
- `hold-analysis` endpoint: cancels AI debounce timer entirely when + is tapped (organizer repositioning)
- `release-analysis` endpoint: restarts fresh 4.5s debounce when + is turned off
- Frontend: `onAddToItem` fires hold on enter, release on exit

Files changed: `RapidCapture.tsx`, `[saleId].tsx`, `itemController.ts`, `routes/items.ts`

---

**S364 COMPLETE (2026-03-31):** S363 verification + camera mobile refactor + scheduled task backlog + orphaned component wiring.

(1) **S363 verified + pushed (commit 18235d33):** Dead files confirmed gone, TS clean. Caught orphaned `setPreCaptureWarning` call from Batch 1 removal — fixed inline.

(2) **Camera UI mobile refactor (pushed):** Pixel 6a showed viewfinder at ~60% height. Collapsed 3-row bottom into single ~80px band: thumbnails LEFT of shutter, stats shrunk to text-xs, + button transparent outline. BrightnessIndicator: 500ms init delay, null → "Checking light..." placeholder, isActive=cameraReady.

(3) **Scheduled task backlog fixes (pushed commit 63e879ce):** 6 independent fixes — password reset email (authController.ts), SharePromoteModal dynamic sale types, item query pagination cap (take:500), snooze log clarity, .env.example Neon comment.

(4) **.gitignore + doc commit (commit 1a2b5552):** .fuse_hidden* + temp root files gitignored. 28 accumulated doc files committed (audits, health reports, friction audits, competitor intel, UX specs, improvement memos).

(5) **Feature #121 wiring (push block ready — NOT YET PUSHED):** OrganizerHoldsPanel.tsx wired into organizer dashboard (holds summary widget). LeaveSaleWarning.tsx wired into sale detail page (shopper navigation guard). Roadmap updated under Features #146 + #24.

⚠️ **Patrick must push Feature #121 wiring:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/LeaveSaleWarning.tsx
git add packages/frontend/components/OrganizerHoldsPanel.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add "packages/frontend/pages/sales/[id].tsx"
git add claude_docs/STATE.md
git add claude_docs/strategy/roadmap.md
git commit -m "feat(#121): wire OrganizerHoldsPanel into dashboard, LeaveSaleWarning into sale detail page"
.\push.ps1
```

⚠️ **#37 notifications.tsx still not pushed** (local only since S359).

---

**S360 COMPLETE (2026-03-31):** Railway TS1127 null byte fix + #48 Treasure Trail Chrome-verified.

(1) **Railway TS1127 unblocked:** Two backend files had null bytes appended from prior MCP pushes in S359. `followerNotificationService.ts` (127 null bytes) + `notificationInboxController.ts` both caused `error TS1127: Invalid character` at EOF, blocking Railway build. Fixed: fetched from GitHub, stripped null bytes, pushed clean versions (commits 1e84c0ab + ea4acf36). Railway went green.

(2) **#48 Treasure Trail ✅ Chrome-verified (ss_5655xvb8r):** Vercel wasn't deploying the S359 MCP commits — Vercel Redeploy re-ran old code, and `push.ps1` returned "Everything up-to-date" (no new push event). Fix: pushed Dockerfile.production cache-bust comment as new commit `5a0eed56` → Vercel webhook fired → deployed. Hard reload confirmed: `GET /api/trails → 200` (was `/api/api/trails → 404`). Trail "Grand Rapids Saturday Run" renders with description, stops, Edit/Delete. Double /api/ prefix root cause: S359 changed `import axios` to `import api` but left path as `/api/trails`; `api` lib has `/api` in baseURL already.

(3) **#37 Sale Alerts:** Backend fixes on GitHub (null bytes stripped = clean versions of followerNotificationService.ts + notificationInboxController.ts). `notifications.tsx` tab styling fix NOT YET PUSHED (local only). Full browser QA not yet done — needs browser test after notifications.tsx push.

S360 commits: `1e84c0ab` (followerNotificationService clean), `ea4acf36` (notificationInboxController clean), `ba619fa7` (trail fix), `900cff4d` (trail /api/ prefix fix), `5a0eed56` (Dockerfile cache-bust)

---

**S359 COMPLETE (2026-03-31):** QA backlog run — 3 features QA'd, 2 bugs fixed.

(1) **#37 Sale Alerts** ❌ BUGS FOUND + FIXED (NOT YET PUSHED): (a) No in-app notification when followed organizer publishes — followerNotificationService.ts fixed. (b) Organizer Alerts tab filter broken — notificationInboxController.ts fixed. (c) Notification page tab styling — notifications.tsx fixed. 3 files ready to push.

(2) **#48 Treasure Trail** ❌ P1 BUG FIXED + PUSHED (commit 1c1896369): Trail create ✅, list ✅, dark mode ✅. Detail page showed "Trail Not Found" immediately — root cause: [trailId].tsx imported bare `axios` (no JWT token) → 401 → HTML redirect → JSON parse fail. Fixed: `import api from '../../../lib/api'` + `api.get('/api/trails')`. 2-line fix, pushed via MCP. Verify in browser as S360 first action.

(3) **#46 Typology Classifier** ⚠️ PARTIAL PASS: All 4 add-items tabs ✅, tab switching ✅, Classify fires + persists ✅ (Retro/Atomic 88%). BUGS: (P2) UI doesn't refresh in-place after Classify (needs page reload). (P2) CSV import broken — Zod `.enum().optional()` doesn't accept empty string `""` from app's own template header → "No valid rows found." Fixed test CSV at `FindaSale/test-import.csv` (no status/auction cols). Backend fix needed.

(4) **#199 User Profile** ⚠️ PARTIAL PASS (light mode only): `/shoppers/cmn9opa330009ij7tqwvt463c` (Bob Smith) loads — name, member since 3/27/26, 12-day visit streak, stats, bio, Message button. Dark mode NOT tested.

Files changed S359 NOT YET PUSHED:
- `packages/backend/src/services/followerNotificationService.ts` (#37 fix)
- `packages/backend/src/controllers/notificationInboxController.ts` (#37 fix)
- `packages/frontend/pages/shopper/notifications.tsx` (#37 fix)

Already pushed via MCP:
- `packages/frontend/pages/shopper/trails/[trailId].tsx` (#48 fix — commit 1c1896369)

**S357 COMPLETE (2026-03-31):** Shopper page consolidation — purchases/receipts/loot-log → /shopper/history. Continuation from S356 context limit.

Changes:
- `packages/frontend/pages/shopper/history.tsx` (NEW — 397 lines): consolidated page with List/Gallery/Receipts view tabs, URL query param `?view=list|gallery|receipts`, fetches all 3 data sources
- `packages/frontend/pages/shopper/loot-log/[purchaseId].tsx` (MODIFIED): back-link updated → /shopper/history, title "My History"
- `packages/frontend/components/Layout.tsx` (MODIFIED): 3 nav entries updated href → /shopper/history, label → "My History"; also fixed truncated `export default Layou` → `export default Layout`
- `packages/frontend/components/AvatarDropdown.tsx` (MODIFIED): 1 nav entry updated href + label
- `packages/frontend/pages/shopper/dashboard.tsx` (MODIFIED): 2 Quick Link buttons (Loot Log + Receipts) → 1 "My History" button

Delete via push block: `purchases.tsx`, `receipts.tsx`, `loot-log.tsx`
Preserved: `loot-log/[purchaseId].tsx` (reused as detail page), `loot-log/public/[userId].tsx` (external share URL)

⚠️ **S356 carry-over still pending push + Railway:**
- ⏳ **#153 Organizer Profile social fields** — code on GitHub (a60e912 + cache-bust 994ba10), Railway not deployed
- ⏳ **#41 Flip Report ownership** — code on GitHub (9ec5ea1), Railway not deployed
- ⏳ **#80 Purchase Confirmation** — `packages/backend/src/controllers/userController.ts` edited locally, NEEDS PUSH

**S355 COMPLETE (2026-03-31):** Live Chrome QA of S344 backlog + 2 bug fixes dispatched. QA results: ✅ #7 Referral — renders at /referral-dashboard (no nav link yet); ✅ #89 Print Kit — toast fires correctly; ✅ #149 Remind Me by Email — fires, toggles to Cancel Reminder; ✅ #62 Digital Receipts — page renders, empty state correct; ❌ #184 iCal — FIXED (changed relative path to NEXT_PUBLIC_API_URL); ⚠️ #41 Flip Report — PRO gate correct for SIMPLE user, ownership bug fixed in code. Files: packages/frontend/pages/sales/[id].tsx (iCal), packages/backend/src/controllers/authController.ts (Hunt Pass JWT), packages/frontend/pages/organizer/dashboard.tsx (dedup stats).

**S354 COMPLETE (2026-03-31):** UX skill rewrite + Dashboard State 2 redesign shipped. (1) **findasale-ux skill researched + rewritten:** New SKILL.md grounded in organizer job-to-be-done (JTBD) framework — 5 core organizer jobs identified, skill now produces specs tied to workflow outcomes not wireframes. (2) **Dashboard State 2 redesigned:** Sale Status Widget rebuilt — full-width, sale title + thumbnail + status badge. Next Action Zone added (single context-aware recommended action). Real-Time Metrics block wired to /api/organizers/stats (items listed, visitors today, active holds). Tier Progress card replaced with Subscription card. Revenue display added from stats API. Files: organizer/dashboard.tsx.

**S353 COMPLETE (2026-03-31):** Dashboard/nav polish + deployment verification + UX skill gap identified. (1) **Dashboard dead space fixed:** Organizer dashboard stats (Items Listed, Visitors Today, Active Holds) now render real data from `statsData` — previously fetched but never mounted. (2) **Nav mirroring fixed:** Mobile hamburger now mirrors desktop AvatarDropdown — organizer collapsibles (YOUR SALES, SELLING TOOLS, PRO TOOLS) + shopper sections (MY COLLECTION, EXPLORE & CONNECT with all subitems + Coming Soon badges) added. Orphaned top-level Payouts/Insights/Workspace removed. (3) **Hunt Pass CTA rank-aware:** INITIATE/SCOUT = XP hook, RANGER = early access hook, SAGE/GRANDMASTER = Collector's League hook. (4) **Deployment confirmed:** All code on GitHub ✅, all migrations deployed ✅, all Railway env vars confirmed set (STRIPE_WEBHOOK_SECRET, MAILERLITE_SHOPPERS_GROUP_ID, RESEND_API_KEY, RESEND_FROM_EMAIL). (5) **UX skill gap identified:** findasale-ux produced workflow specs that still missed organizer job-to-be-done logic. S354 P1 is skill research + rewrite. Dashboard State 2 redesign (remove redundant cards, fix revenue source, replace dead tier progress with subscription card, add Next Action Zone) is ready for dev but blocked on skill fix first — UX spec from this session is in claude_docs/ux-spotchecks/ if needed. Files changed: Layout.tsx, organizer/dashboard.tsx, shopper/dashboard.tsx.

**S352 COMPLETE (2026-03-30):** 4 dispatches across Architect + 3 Dev agents. (1) **#84 ExplorerProfile Architect decision RESOLVED:** Option A confirmed — all gamification fields already exist on User (guildXp, explorerRank, huntPassActive, huntPassExpiry). No schema change needed. Decision doc written to packages/database/prisma/EXPLORER_PROFILE_DECISION.md. (2) **#225 Revenue/Metrics API SHIPPED:** GET /api/organizers/stats built (revenue lifetime/current/this-month, item counts, active sale hold count). Wired into organizer dashboard State 2. Zero TS errors. Files: packages/backend/src/routes/organizers.ts, packages/frontend/pages/organizer/dashboard.tsx. (3) **#226 Pre-wire schema SHIPPED:** persistentInventory + masterItemLibraryId + consignor relation added to Item model. Migration created: 20260330_add_item_prewire_fields. ⚠️ Patrick must deploy this migration to Railway. Files: schema.prisma, migration SQL. (4) **#227 XP Profile SHIPPED:** GET /api/xp/profile already existed — service response shape corrected + GRANDMASTER threshold fixed (10000→5000). Shopper dashboard already wired via useXpProfile hook. File: packages/backend/src/services/xpService.ts. All items pending Chrome QA. Roadmap: #84 resolved, #225/#226/#227 added to Building as Shipped S352.

**S351 Dashboard Redesign COMPLETE (2026-03-30):** 3 parallel dev agents, 7 files changed + 2 new components. (1) **Organizer dashboard (organizer/dashboard.tsx):** Full 3-state redesign — State 1 (new organizer): welcome hero, 3-step path, benefit grid, CTAs; State 2 (active sale): Sale Status Widget (full-width, title/thumbnail/status badge/stats), Next Action Zone (single context-aware recommended action), Quick Stats Grid, Tier Progress card, 6-tool Selling Tools grid, 4 shortcuts; State 3 (between sales): congratulations card, past sales archive. State detection via getDashboardState(). Removed old CollapsibleSection nav dumps. OrganizerOnboardingModal wired: shows once to new organizers (State 1), localStorage gate. (2) **Shopper dashboard (shopper/dashboard.tsx):** State-aware hero (A: new shopper welcome, B: returning shopper with pending payments priority zone), Rank Progress Card with exact spec copy formulas per rank (INITIATE→SCOUT→RANGER→SAGE→GRANDMASTER with XP thresholds, progress bars, "best way to earn" per rank), permanent Streak explainer + StreakWidget, Hunt Pass CTA (only when huntPassActive !== true, 3 benefits, $4.99/mo). Preserved ClaimCard + AchievementBadgesSection. (3) **Guidance layer (5 files):** TooltipHelper.tsx (new — ❓ icon, floating tooltip, dark mode, accessible); OrganizerOnboardingModal.tsx (new — 3-screen: Welcome, Photos matter, You're in control, localStorage gate); pricing.tsx tier inline explainers (SIMPLE/PRO/TEAMS plain-English below names); holds.tsx rank badges (⚔️/🐦/🧗/🧙/👑 per rank, Grandmaster "almost always follows through" copy); reservationController.ts adds explorerRank to organizer holds query. ⚠️ TODO placeholders: revenue API, items count, visitor metrics (not in existing API), ExplorerProfile (not in schema). Roadmap updated: #222 + #223 + #224 → Shipped S351 Pending Chrome QA. Deleted misplaced claude_docs/DASHBOARD_CONTENT_SPEC.md. Files: organizer/dashboard.tsx, shopper/dashboard.tsx, TooltipHelper.tsx (NEW), OrganizerOnboardingModal.tsx (NEW), reservationController.ts, pricing.tsx, holds.tsx, strategy/roadmap.md.

**S351 Photo Capture Protocol COMPLETE (#224, 2026-03-30):** 4 phases, 5 files changed (1 new). (1) **Tiered lighting system:** `checkImageQuality()` upgraded — brightness normalized 0–100; Tier 1 (65–95): silent proceed; Tier 2 (40–65 or >95): soft warning toast with "Use This Photo" + "Retake in Better Light" buttons, no auto-dismiss; Tier 3 (<40): hard modal blocking upload, "Retake" auto-launches camera, "Skip" discards. Replaces the old binary isDark toast. (2) **Shot sequence guidance:** `sessionPhotoCount` tracked per session; `ShotGuideToast` component fires after each upload with contextual copy (shot 1→5 per spec, 4s auto-dismiss, "Review & Tag" appears at shot 3+). (3) **PreviewModal AI confidence copy:** high (≥80%): "We identified this as…" + confidence bar; medium (50–79%): "We think this might be…"; low (<50%): "We couldn't identify this — no problem, tell us." Maker's mark detected copy added. (4) **Pre-capture viewfinder indicator:** `BrightnessIndicator.tsx` (NEW) — samples video feed every 500ms via canvas, shows ●●●●● green / ●●●○○ yellow / ●○○○○ red at top of viewfinder, advisory only. Files: add-items/[saleId].tsx, camera/PreviewModal.tsx, camera/RapidCarousel.tsx, RapidCapture.tsx, camera/BrightnessIndicator.tsx (NEW).

**S350 Design Brief COMPLETE (2026-03-30):** Ground-up dashboard redesign brief + organizer guidance layer + photo capture protocol. (1) **dashboard-redesign-brief-s350.md CREATED:** 5-part spec — state-aware organizer layouts (3 states: new/active/between-sales), state-aware shopper layouts (3 states: new/returning/pending-payment), gamification copy (exact per-rank formulas for Initiate→Grandmaster), 11 shared design rules, innovation recommendations (Sale Momentum feed green-lit). Locked decisions: revenue display on dashboard for all tiers/both, tier progress always-visible-compact, Hunt Pass one-placement/7-day-dismiss, analytics inline+PRO-Flip-Report link. Nav shortcuts added (3–5 most-used features) — not nav-as-primary-content, shortcuts only. Rank Unlock Pathway card replaces decorative leaderboard snippet. Urgency color-coding (red <6h, orange <24h, green healthy). (2) **organizer-guidance-spec-s350.md CREATED:** Feature names unchanged — tooltip/explainer copy lives alongside existing labels. Tooltip library for 20+ features, 4 critical workflow guidance flows, 3-screen onboarding modal, error message rewrites, Explorer's Guild buyer intelligence layer (rank badges on holds = Grandmaster "almost always follows through"). (3) **photo-capture-protocol-s350.md CREATED:** 9-shot sequence (hero, back, sides ×2, maker's mark/label, damage closeup, detail/pattern, scale reference, inside/underside), 3-tier lighting system (Tier 1 proceed silently, Tier 2 soft warning allow, Tier 3 hard warning recommend retake), AI feedback copy (high/medium/low confidence, maker's mark detected, damage detected), 12 item-type guides (furniture through clothing). (4) **Roadmap updated:** #222 (Dashboard Redesign), #223 (Organizer Guidance Layer), #224 (Photo Capture Protocol) added to Building — Active Backlog. ⚠️ claude_docs/DASHBOARD_CONTENT_SPEC.md misplaced (UX agent created at root instead of ux-spotchecks/); cannot delete via shell — Records cleanup needed S351. Files: ux-spotchecks/dashboard-redesign-brief-s350.md (CREATED), ux-spotchecks/organizer-guidance-spec-s350.md (CREATED), ux-spotchecks/photo-capture-protocol-s350.md (CREATED), strategy/roadmap.md (updated).

**S348 Nav/Dashboard Redesign COMPLETE (2026-03-30):** 2 parallel dev agents, 5 files changed. Full nav redesign across Layout.tsx, AvatarDropdown.tsx, TierGatedNav.tsx + tier-aware dashboard sections + shopper gamification widgets. (1) **Dual-role deduplication:** Fixed — "My Profile", "Shopper Dashboard", "My Collections" no longer appear twice for organizer+shopper users. (2) **Icons on all nav items:** lucide-react icons added to every link and section header across both menus (amber for organizer, indigo for shopper, purple for Pro Tools, red for Admin). (3) **Section restructure:** "Your Sales", "Selling Tools", "Pro Tools", "My Collection", "Explore & Connect", "Admin" — consistent across mobile + desktop. (4) **Rank badge in AvatarDropdown:** Static "⚔️ Scout" placeholder with XP mini-bar in dropdown header. TODO comment for real data wire. (5) **Brand voice:** Payouts→Earnings, Typology Classifier→Item Tagger, UGC Moderation→Manage Photos, standalone Explorer's Guild link removed. (6) **Coming soon badges:** Sale Hubs, Virtual Queue, Trades. (7) **Tooltips:** 10 confusing items (Holds, POS, Print Inventory, Brand Kit, Flip Report, Webhooks, Item Tagger, Hunt Pass, Explorer Passport, League). (8) **Admin collapsible:** ShieldAlert icon, red styling, all 7 sub-links, ADMIN-only gate. (9) **Organizer dashboard tier sections:** CollapsibleSection component, 5 tier-gated sections (FREE/SIMPLE/PRO/TEAMS), locked state shows upgrade CTA linking to /pricing, placeholder tier via `// TODO: wire to real tier field`. (10) **Shopper dashboard gamification:** 5 widgets (Streak Tracker, Rank/XP Bar, Recent Achievements, Hunt Pass CTA, Leaderboard Snippet) in responsive grid below quick-links. ⚠️ ExplorerProfile model not in schema — Rank/XP widget uses placeholder with TODO. ⚠️ Leaderboard widget uses static placeholder with TODO for API. Files: Layout.tsx, AvatarDropdown.tsx, TierGatedNav.tsx, organizer/dashboard.tsx, shopper/dashboard.tsx.

**S347 Batch 2 COMPLETE (2026-03-30):** 3 parallel agents, 3 more files changed + roadmap updated. (1) **Roadmap updated:** 7 rows updated to reflect S347 Batch 1 completions (#212, #213, #131, #123, #153, #60, #59). (2) **#75 Tier Lapse — CONFIRMED FULLY IMPLEMENTED (no code change needed):** Audit found complete implementation — tierLapseService.ts, tierLapseJob.ts (8AM + 11PM UTC crons), stripeController.ts handles customer.subscription.deleted + invoice.payment_failed, auth.ts middleware sets req.user.subscriptionLapsed, organizer dashboard lapse banner exists. Feature is code-complete, moving to Chrome QA queue. (3) **#124 Rarity Boost XP Sink UI BUILT:** New RarityBoostModal.tsx (sale picker, 15 XP cost, disabled when insufficient XP); useXpSink.ts updated (saleId param added); loyalty.tsx "Coming Soon" placeholder replaced with functional Rarity Boost card. Backend POST /api/xp/sink/rarity-boost was already complete.

**S347 Batch 1 COMPLETE (2026-03-30):** QA deferred to evening. 4 parallel agents, 8 files changed. (1) **#212 Leaderboard badges FIXED:** leaderboardController.ts now includes top-3 userBadges (id, name, iconUrl) in shopper query; leaderboard.tsx adds `> 0` guard on totalItemsSold display. (2) **#59 Streak Rewards:** StreakWidget was already wired into loyalty.tsx — confirmed no change needed (was already there per S346). (3) **#71 Reputation stray-0 on leaderboard FIXED:** `{org.totalItemsSold > 0 && ...}` guard added to leaderboard.tsx. (4) **#213 Hunt Pass CTA FIXED:** dashboard.tsx Hunt Pass card upgraded — now shows 3 benefits (2x XP, 6h early access, exclusive badge), prominent "Upgrade Now" button to /shopper/hunt-pass, pricing visible ($4.99/mo). Only shows when huntPassActive !== true. (5) **#131 Share Templates FIXED:** SharePromoteModal.tsx — Facebook uses sharer popup, Nextdoor = copy+open newsfeed with toast, Threads uses threads.net/intent/post popup, Pinterest uses pin dialog, TikTok = copy+open with toast. (6) **#60 Premium Tier Bundle IMPROVED:** organizer/pricing.tsx updated with correct prices ($49 PRO, $99 TEAMS) and full feature lists (Flip Report, AI Valuation, CSV Export, Brand Kit, Auto-Markdown, Print Kit, etc). (7) **#123 Explorer's Guild Phase 2 IMPROVED:** loyalty.tsx — XP earn tooltip (+5 visit, +10 scan, +25 purchase), rank threshold display (Initiate→Scout 500→Ranger 1500→Sage 2500→Grandmaster 5000), Hunt Pass "$4.99/month" badge. Layout.tsx — "Loyalty" nav label → "Explorer's Guild". (8) **#153 Organizer Profile IMPROVED:** settings.tsx — Facebook, Instagram, Etsy URL fields added (all exist in schema). PARTIAL items 8 of 14 now addressed.

**S346 Batch 1 COMPLETE (2026-03-30):** TS build fixes + 4 BROKEN items cleared. (1) **TS fixes:** `estimatedValue` (non-existent field) → `price` in userController.ts line 442; `name` → `businessName` in routes/users.ts OrganizerSelect; added `profileSlug`, `collectorTitle`, `purchasesVisible` to AuthContext.tsx User interface (fields exist in schema, were missing from frontend type). Both Railway and Vercel unblocked. (2) **#48 Treasure Trail FIXED:** Dark mode contrast on trail/[shareToken].tsx + stale state after edit save in trails/[trailId].tsx. (3) **#13 TEAMS Workspace FIXED:** Member lookup missing workspace relations in workspaceController.ts + invite error handlers parsing wrong field (`error` vs `message`) in workspace.tsx. (4) **#157 Pickup Scheduling FIXED:** All 4 react-query mutations (PickupBookingCard, PickupSlotManager x2, MyPickupAppointments) were returning full axios response instead of `response.data` — onSuccess callbacks silently received wrong shape. (5) **#46 Typology Classifier FIXED:** Missing ANTHROPIC_API_KEY guard in typologyService.ts batchClassify() + dark mode contrast in TypologyBadge.tsx. BROKEN section now clear of all P1 code bugs.

**S346 Batch 2 COMPLETE (2026-03-30):** 5 PARTIAL features improved. (1) **#199 User Profile:** Bid status was hardcoded `PARTICIPATING` in routes/users.ts — now returns real DB value (ACTIVE/WINNING/WON/LOST). Hunt Pass section added to profile.tsx. Push notification toggle moved from profile.tsx to shopper/settings.tsx. (2) **#58 Achievement Badges:** New `AchievementBadgesSection.tsx` component wired into dashboard.tsx, loyalty.tsx, explorer-passport.tsx — badges were only rendering on /shopper/achievements. (3) **#59 Streak Rewards:** Was already on loyalty page per code check — no fix needed. (4) **#29 Loyalty Passport:** Copy rewritten to Explorer's Guild narrative — XP earn guide (Scan +10, Visit +5, Purchase +25), tier names (Initiate/Scout/Ranger/Sage/Grandmaster), coupon/rarity boost explainers updated. (5) **#177 Sale Detail:** Reviews moved inside Organized By card, platform fee display gated to auction items only, item cards now aspect-square with uniform height.

**S345 COMPLETE (2026-03-30):** roadmap.md Decisions Needed cleanup. Removed 9 signed-off features from ## Decisions Needed (kept #82 + #83 legal items). Re-slotted: #188, #49, #64, #122 → UNTESTED Pending Chrome QA; #149/#174/#200 were already in correct sections (no change needed). #90 Sale Soundtrack → Deferred > Advanced Organizer Features. #69 Local-First Offline Mode → Deferred > Infrastructure & Platform. QA deferred per Patrick.

**S344 Batch 2 COMPLETE (2026-03-30):** 5-agent parallel bug-fix + feature batch. (1) **#174+#80 Phase 1+2 shipped:** auctionJob.ts reserve price check (16-line block — if reserve not met, item moves to AUCTION_ENDED + organizer notified); /purchases/[id].tsx new 400+ line persistent confirmation page (hero, item details, pickup info, order details, status badges, auction buyer premium 5%); CheckoutModal now captures purchaseId and redirects to /purchases/${id}; checkout-success.tsx backward-compat redirect added. (2) **#184 iCal FIXED:** Express route ordering fix in routes/sales.ts — /:id/calendar.ics moved before generic /:id catch-all. (3) **#41 Flip Report FIXED:** null-safety on bestCategory.category + itemsSold division-by-zero guard in flipReportService.ts; enhanced error logging in flipReportController.ts. (4) **#7 Referral FIXED:** missing return statements before res.json() on lines 26+38 of referralController.ts — API was hanging silently, frontend showed 0. (5) **#89 Print Kit FIXED:** frontend was POSTing to /organizer/sales/{id}/print-kit (wrong prefix) — corrected to /organizers/{id}/print-kit in print-inventory.tsx. (6) **#62 Digital Receipts FIXED:** receiptController.getMyReceipts now queries Purchase model (status: PAID) directly instead of DigitalReceipt which had no auto-created records. Response shape preserved (issuedAt mapped from createdAt). (7) **#50 Loot Log:** NOT a code bug — user11's purchases are PENDING not PAID. Loot Log correctly filters PAID only. No fix needed.

**S344 COMPLETE (2026-03-30):** 5-agent parallel roadmap batch. (1) **P2 cleanup:** XP language fixed on 3 remaining components (HuntPassModal, TreasureHuntBanner, StreakWidget). EmptyState dark mode contrast added. D-001 "Estate Sale" placeholder copy fixed. (2) **city-heat-index.tsx:** Replaced Coming Soon stub with redirect to /cities per locked decision #49. (3) **#149 Email Reminders frontend:** RemindMeButton enhanced — copy → "Remind me by email", toggle-off "Cancel Reminder" state added, disabled for ended/cancelled sales, dark mode fixed. Wired into sales/[id].tsx replacing inline button. (4) **#200 Shopper Public Profiles full stack:** schema.prisma + new migration (profileSlug @unique, purchasesVisible Boolean @default(true), collectorTitle String?), backend GET /shoppers/:id + PATCH /users/me extended, /shoppers/[id].tsx UI (avatar, rank, collectorTitle badge, recent finds grid), shopper/settings.tsx Public Profile section (title dropdown, slug input, visibility toggle). **Patrick must deploy migration 20260330_add_shopper_profile_fields to Railway.** (5) **#64 My Collections full consolidation:** Favorites tab removed from shopper/dashboard.tsx, BottomTabNav + Layout.tsx nav updated to /shopper/wishlist, /shopper/favorites + /shopper/alerts already redirect from S343. Nav now unified. (6) **Architect spec #174+#80:** Full spec in claude_docs/architecture/AUCTION_WIN_SPEC.md. Key finding: no schema changes needed — all fields exist. Code-only, 3-phase plan (auctionJob+reserve ~3-4h, /purchases/[id] page ~2-3h, organizer UI deferred).

**S343 Part 2 COMPLETE (2026-03-30):** Guild Phase 1 wrap-up + My Collections + BUSINESS_PLAN.md fix. (1) **Guild Items 6 & 7 schema shipped:** SourcebookEntry model (author/sale/organizer FKs, @@unique per author+target, 3 indexes) + Sale.prelaunchAt DateTime? + index added to schema.prisma. Migration SQL at `migrations/20260330_add_sourcebook_and_prelaunch/migration.sql` — Patrick must deploy to Railway manually per CLAUDE.md §6. prisma validate ✅ TypeScript ✅. (2) **Hunt Pass trial banner wired (loot-legend.tsx):** Amber banner, useState dismiss (no localStorage), POST /api/hunt-pass/trial on CTA, toast on success, silent 409 hide. Only shows if huntPassActive !== true. TS ✅. (3) **#64 My Collections shipped:** Renamed Saves/Wishlist → "My Collections" on 6 surfaces (wishlist.tsx, wishlists.tsx, AvatarDropdown.tsx, Layout.tsx, ActivitySummary.tsx, dashboard.tsx). Added collections stub UI (All Saves pill + "+ New Collection" Coming Soon toast). No backend changes. TS ✅. (4) **BUSINESS_PLAN.md truncation fixed:** Last two lines were cut off — restored "Quarterly)" + Author line. (5) **roadmap.old.md:** 179-line deletion confirmed as intentional prior cleanup — including in push block.

**S343 COMPLETE (2026-03-30):** Polish + Guild wiring + architect decisions. (1) **CLAUDE.md §12 hard rule added:** STATE.md + patrick-dashboard.md must always be first two `git add` lines in every wrap push block — fixes the push.ps1 abort that ended S342. (2) **Visit XP frontend wired:** `useEffect` in `sales/[id].tsx` fires `POST /api/sales/:id/visit` on page load (auth-gated, fire-and-forget). Backend was complete from S342. (3) **Sale Soundtrack removed:** `SALE_TYPE_PLAYLISTS` constant + JSX render block deleted from `sales/[id].tsx` (−69 lines). Locked decision: return as organizer-side inline player. (4) **P2 cleanup shipped (11 files):** Points→XP on 9 UI surfaces (hunt-pass.tsx, dashboard.tsx). Messages dark mode contrast fixed (dark:text-gray-300 on empty state). Estate Sale placeholder copy fixed on 6 organizer forms. (5) **Architect approved Items 6 & 7:** SourcebookEntry schema approved with changes (@@unique per author+sale, @@unique per author+organizer, named relations, backend exactly-one-of enforcement). Sale.prelaunchAt nullable DateTime approved. Dev dispatch ready for S344. (6) **#149 confirmed correct** — no stale copy found. (7) **#49 city-heat-index.tsx** — Coming Soon stub, /cities page is the feature. Needs `git rm` in S344 (no nav links). (8) **Hunt Pass trial banner (loot-legend.tsx)** — analysis complete, NOT implemented. S344 P2.

**S342 COMPLETE (2026-03-30):** Roadmap decisions (9 features) + Explorer's Guild Phase 1 foundation + hold bug fix. (1) **Hold bug fixed:** Organizers were blocked from placing holds on ANY sale. Fixed — HoldButton blanket organizer gate removed; backend now only blocks organizer from holding their OWN sale's items. Files: HoldButton.tsx, reservationController.ts. (2) **Explorer's Guild Phase 1 — 5 of 8 items shipped:** P0 scan cap (100 XP/day + duplicate scan prevention), Visit XP wired (POST /api/sales/:id/visit, once/sale/day), Explorer's Guild nav link added to shopper dropdown, 3-screen onboarding modal (localStorage-gated, shows once), Sage threshold lowered 4000→2500 for beta, Hunt Pass 7-day trial backend endpoint. Files: xpService.ts, itemController.ts, saleController.ts, userController.ts, sales.ts, users.ts, AvatarDropdown.tsx, loyalty.tsx. (3) **Phase 1 items deferred to S343:** Item 6 (Sourcebook Editor — needs SourcebookEntry schema), Item 7 (Early Bird 48h — needs Sale.prelaunchAt field), Item 8 frontend (Hunt Pass trial banner in Loot Legend). (4) **Roadmap decisions locked (10 items):** #174+#80 merged (Auction Win + Persistent Purchase Confirmation, payment at winning bid), #200 spec complete, #188 resolved (pages work, stale note), #90 deferred to organizer-side, #49 consolidate into /cities, #64 UX spec complete, #149 copy fix dev pending, #69 deferred, organizer hold = bug (fixed). Full details in decisions-log.md. (5) **Visit XP + Hunt Pass trial frontend wiring** still needed — backend complete, useEffect call in sales/[id].tsx + trial banner in Loot Legend page. S343 P2.

**S339 COMPLETE (2026-03-29):** Hold notification system + 5 bug fixes + product direction. (1) **Hold notification system shipped:** Shopper gets in-app Notification + Resend email on approve/cancel/extend/release via `updateHold` and `batchUpdateHolds`. New `sendHoldStatusToShopper()` in saleAlertEmailService.ts covers 4 action types (confirmed/cancelled/extended/released) with tailored copy and CTA. (2) **Organizer in-app notification on hold placed:** `placeHold` now creates Notification record for organizer (was email-only). (3) **Bug fix — "Item already has active hold" after cancel:** `itemId @unique` on ItemReservation blocked new holds when old CANCELLED/EXPIRED record existed. Fix: `deleteMany` stale records inside placeHold transaction before creating new reservation. (4) **Bug fix — batch extend used 48h hardcoded:** Changed to rank-based `getHoldDurationMinutes()` using shopper's `explorerRank`. Added `explorerRank` to user select in batch query. (5) **Bug fix — markSold notification copy:** Removed incorrect "Thank you for your purchase!" — replaced with neutral "marked as sold by the organizer." (6) **Toast duration ✅ CONFIRMED:** Patrick tested manually — toast fires for full 10 seconds. Removed from unverified queue. (7) **Product direction logged:** Patrick wants markSold to evolve into POS cart integration (for POS organizers) or Stripe invoice/checkout link (for non-POS organizers). Logged for architect spec in future session. Files: reservationController.ts, saleAlertEmailService.ts.

**S332 COMPLETE (2026-03-28):** Hold Button #13 full board review + design finalization + foundation implementation. (1) **Board session unanimous GO (12/12 + 1 advisory):** DA + Steelman + Hacker + Advisory Board all dispatched on abuse/fraud risk, business model, gamification angle, organizer control. Unanimous recommendation: GO with rank-gated durations (no Hunt Pass paywall, no deposit required). (2) **Design finalized:** QR check-in primary, GPS fallback by sale type (outdoor/flea 150m, indoor estate 250m, large/auction 400m). En route grace for shoppers within 10mi but outside geofence (limited holds: Initiate/Scout 1, Ranger 2, Sage/Grandmaster 3). Hold duration by rank: Initiate/Scout 30min/1 hold, Ranger 45min/2 holds, Sage 60min/3 holds, Grandmaster 90min/3 holds. Natural expiry at timer end + navigate-to-different-sale prompt (no continuous GPS polling). Organizer controls: per-sale `holdsEnabled` toggle, view/cancel/extend/edit all active holds. Business model: rank-gated free, no Hunt Pass gate, no deposit. (3) **Architecture spec produced (400+ lines):** staged in VM, locked designs for GPS haversine, QR validation, fraud detection, organizer settings, cron expiry 10min. (4) **Foundation shipped (5 files):** schema (SaleCheckin + OrganizerHoldSettings), migration, reservationController.ts (GPS/QR/fraud/rate-limit gates), 3 new routes (placeHold, checkHoldStatus, organizer endpoints), cron 30min → 10min. (5) **4 P1 gaps remain for S333:** GPS radii by sale type (built flat 100m, needs 150/250/400m), rank-based hold duration (not implemented), en route logic (not implemented), per-sale holdsEnabled toggle (not added to Sale model). Frontend HoldButton + OrganizerHoldsPanel stubs not pushed. (6) **ItemCard.tsx TS fixes:** photoUrls cast + _count cast (union type UnifiedItemCardItem | Item) shipped. Files: ItemCard.tsx (cast fixes), schema.prisma (models), migration, reservationController.ts, routes/reservations.ts, jobs/reservationExpiryJob.ts, decisions-log.md (6 decisions logged).

**S331 COMPLETE (2026-03-28):** Desktop nav search + map sale type filter + edit-sale cover photo. (1) **Desktop nav search ✅ VERIFIED** — Layout.tsx updated. Search icon in nav bar expands to input on click, collapses on Escape/blur. Submits form to `/?q=<term>`. Chrome-verified working (ss_62400ab1c, ss_1378f5bto). (2) **Map sale type filter ✅ VERIFIED** — map.tsx updated with filter pills (All Types / Estate / Yard / Auction / Flea Market / Consignment). Chrome-verified: Estate → 15 sales, Auction → 0 sales (ss_1871l57bx → ss_3209bt61b → ss_57862pvhm). (3) **Edit-sale cover photo section ✅ (CODE-VERIFIED, NOT YET BROWSER-TESTED)** — NEW SaleCoverPhotoManager.tsx component + edit-sale/[id].tsx integration. Section visible in form with upload/preview/remove buttons. (4) ⚠️ **Cover photo useState bug found:** Component uses `useState(initialPhotoUrl)` which only reads the value at mount time. When formData loads async from API, the component doesn't update — seeded photo doesn't show. Fix: add `useEffect` hook to sync state when `initialPhotoUrl` changes. P2 for S331. (5) ⚠️ **Cover photo save behavior:** Currently saves immediately on upload (bypasses "Save Changes" button). Decision pending: should hold in formData and commit only on Save Changes. P2 for S331.

**Decisions logged:**
- Sale cover photo: 1 photo only (not a gallery). Index 0 of `photoUrls[]` array.
- Remind Me: email reminders backend is built. "Push reminders coming soon" copy is stale — should say "Remind me by email."

**Resolved this session:**
- ✅ P2 draft counter mismatch — FIXED: backend `getItemsBySaleId` wasn't returning `draftStatus` field. Added to select clause. Frontend `computeDraftStatus` now uses real DB value instead of guessing.
- ✅ QA Test Item cleanup — deleted via live site UI.
- ✅ Single-item Publish button — VERIFIED WORKING via camera capture → AI tag → Review & Publish → Publish.
- ✅ conditionGrade + tags not loading on Edit Item page — FIXED: `getItemById` select clause was missing both fields. Chrome-verified: grade "B" highlighted correctly.
- ✅ Edit Item / Review & Publish parity — Added Condition Grade, Tags, Suggest Price, Publish/Unpublish to Edit Item page.

**S341 (2026-03-30):** Hold-to-Pay full feature shipped (Railway ✅ Vercel ✅). (1) **Strategic planning:** Innovation, Investor, Game Design, Legal agents all reviewed the Hold-to-Pay monetization opportunity. Key finding: Remote Invoice path is the highest-ROI feature (closes cash-at-pickup fee bypass, ~$5K/month incremental at 50 organizers). 7 architecture decisions locked in decisions-log.md. (2) **Phase 1 — Schema + migration:** HoldInvoice model, InvoiceStatus enum, invoiceId FK on ItemReservation, flashLiquidationEnabled on OrganizerHoldSettings, User/Sale inverse relations. Migration 20260330_add_hold_invoice deployed to Railway. (3) **Phase 2 — Backend:** POST /reservations/:id/mark-sold (bundled Stripe Checkout), GET /reservations/my-invoices, GET /invoices/:invoiceId, GET /items/:itemId/invoice-status, POST /reservations/:id/release-invoice, Stripe webhook handlers (checkout.session.completed → PAID + XP, charge.failed → retry). Bundling: one consolidated invoice per shopper per sale. (4) **Phase 3 — Frontend:** HoldToPayModal.tsx (organizer), ClaimCard.tsx (shopper dashboard, amber/gold), HoldInvoiceStatusCard.tsx (item detail). items/[id].tsx and shopper/dashboard.tsx updated. (5) **Fee model correction** logged: platform fee (10%/8%) is organizer-paid, not shopper-paid. Shoppers pay item price only. Decisions-log.md updated. (6) **Roadmap #221 updated.** Files: schema.prisma, migration, reservationController.ts, reservations.ts, stripeController.ts, HoldToPayModal.tsx, ClaimCard.tsx, HoldInvoiceStatusCard.tsx, items/[id].tsx, shopper/dashboard.tsx, decisions-log.md, roadmap.md.

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|----------------|---------------|
| #143 PreviewModal onError | Code fix pushed (sha: ffa4a83). 📷 fallback on Cloudinary 503 in place. | Defensive fix only — can't trigger 503 in prod. ACCEPTABLE UNVERIFIED. | S312 |
| #143 AI confidence — Camera mode | cloudAIService.ts fix is code-correct; processRapidDraft passes aiConfidence through. Can't test without real camera hardware in Chrome MCP. | Real device camera capture → Review & Publish → confirm "Good (X%)" or similar. | S314 |
| Single-item publish fix | S326 code fix deployed. S327 confirmed API call fires but no DRAFT items exist to test the button. Manual Entry creates AVAILABLE items, skipping draft pipeline. | Camera-capture an item → go to Review & Publish → click Publish on single item → confirm status changes + toast. | S326/S327 |
| Mark Sold → POS/Invoice evolution | Patrick wants markSold to become POS cart item (POS organizers) or Stripe checkout link (non-POS organizers). | Architect spec needed — touches POS, Stripe, holds, notifications, checkout flow. Future session. | S339 |
| ValuationWidget (S406) | No draft items in user2's sales (all 11 are Live). TEAMS tier required. | TEAMS organizer with draft item → Review page → confirm ValuationWidget renders with auth fix + dark mode. | S406 |
| Treasure Trails check-in (S404) | No trail data in DB. | Organizer creates a trail → shopper navigates to /trails/[id] → checks in at a stop → confirm XP awarded. | S406 |
| Review card redesign (S399) | No draft items for any test organizer. | Camera-capture an item → go to Review page → confirm new card redesign (Ready/Needs Review/Cannot Publish) renders. | S406 |
| Camera thumbnail refresh (S400/S401) | Requires real camera hardware in Chrome MCP. | Capture photo in rapidfire → confirm thumbnail strip updates live without page reload. | S406 |
| POS camera/QR scan (S405) | Camera hardware required for scan flow. | Organizer opens POS → taps QR tile → camera opens → scan item sticker → confirm added to cart. | S406 |

**S326 COMPLETE (2026-03-28):** 3 bugs fixed + 1 test item cleanup. (1) **P1 Buyer Preview placeholder — ROOT CAUSE FIXED:** `buildCloudinaryUrl()` in review.tsx was replacing `:` with `_` in aspect ratio transforms (`ar_4_3` → Cloudinary rejects). Removed the `.replace(':', '_')` so it sends correct `ar_4:3`. Chrome-verified: Buyer Preview grid now shows real Cloudinary photos (ss_7201mwej2, ss_6354i4qpv). (2) **Face-detection blob URL fix (secondary):** `handleFaceUploadAnyway` in [saleId].tsx was storing blob URLs instead of Cloudinary URLs returned by API. Now stores `res.data.photoUrl`. (3) **P1 Single-item Publish button — FIXED:** `handlePublishItem` was sending `draftStatus` via generic PUT `/items/:id`, but backend `updateItem` didn't include `draftStatus` in destructured fields — silently dropped. Fix: frontend now uses dedicated `POST /items/:itemId/publish` endpoint for publishing, generic PUT for unpublishing (with `draftStatus` added to backend's accepted fields). Also relaxed publish gate to allow DRAFT + PENDING_REVIEW items (was PENDING_REVIEW-only). NEEDS CHROME VERIFY after deploy. (4) **P2 Nav search — already working:** S322/S323 fixed this. Desktop has no nav search (mobile-only) — logged as P3 gap. (5) **Test item cleanup:** Deleted 2 of 3 test lighters per Patrick, kept 1. Sale now has 14 items. Files: review.tsx, [saleId].tsx, itemController.ts. Pushblock provided.

**S321 COMPLETE (2026-03-28):** Nav full audit + homepage fixes. (1) Review Item modal thumbnail fixed: `thumbnailUrl` dropped during ID swap in [saleId].tsx (lines 701, 757) — now preserved so review modal shows captured photo instead of placeholder. (2) Desktop dropdown full nav audit: added Organizer Tools + Pro Tools collapsible sections (were missing entirely); normalized all links to `px-3 py-2 rounded-md`; added `text-sm` to TierGatedNav.tsx both link states. (3) Shopper menu parity: desktop dropdown had only About/Settings/Sign Out for shopper users — added Shopper Dashboard, My Profile, My Saves, Referrals, Host a Sale CTA, My Explorer Profile collapsible (10 links). (4) Dual-role: "My Dashboard" → "Shopper Dashboard" in mobile; both dashboards shown for dual-role users. (5) Homepage search: itemSearchService.ts now queries item tags + sale tags via PostgreSQL `@>` — "eames", "mid century", "rolex" now searchable. (6) Sales Near You card: redesigned as 2-column layout, sale counts by type, full card links to /map. Files: [saleId].tsx, AvatarDropdown.tsx, Layout.tsx, TierGatedNav.tsx, itemSearchService.ts, index.tsx. All pushed.

**S322 COMPLETE (2026-03-28):** Edit-sale form fixes + bulk publish gate fix. (1) SaleMap restored to Sales Near You card (S321 removed it); collapsed text to single footer line. (2) Homepage search wired to `/api/search?q=...` FTS endpoint — was filtering client-side only; now finds items by name/tags/description. (3) `getSaleType()` fixed to read `sale.saleType` DB field instead of parsing tags. (4) Sale type select dropdown added to edit-sale form. (5) PickupSlotManager dark mode pass. (6) Pro gate on edit-sale fixed: try/catch swallows 403 from markdown-config endpoint so SIMPLE users can save. (7) Save Changes button added at top of form. (8) Form reset bug fixed: `refetchOnWindowFocus: false` + `queryClient.invalidateQueries` on save. (9) Entrance note dark mode fixed in EntrancePinPickerInner.tsx. (10) Root cause of non-saving fields found: `notes`, `treasureHuntEnabled`, `treasureHuntCompletionBadge` were not in `saleCreateSchema` Zod — Zod stripped them silently. Added all 3. (11) `notes` field added to Sale model in schema.prisma + migration `20260328_add_sale_notes`. (12) Review & Publish PRO gate fixed: `POST /items/bulk` was `requireTier('PRO')` — SIMPLE users couldn't publish items. Changed to `requireTier('SIMPLE')`. Files: edit-sale/[id].tsx, EntrancePinPickerInner.tsx, saleController.ts, schema.prisma, migration (NEW), items.ts.

**S323 COMPLETE (2026-03-28):** QA session — S322 verification + 2 bug fixes + Chrome concurrency rule. (1) Edit-sale field persist ✅ — entrance note, approach notes, treasure hunt all saved and reloaded correctly as SIMPLE user (ss_0940ajm6p/ss_2627ysx2a/ss_5529i8hqh). No PRO gate. (2) Review & Publish Publish All — UNVERIFIED (all seeded items are AVAILABLE, Publish All only shows with DRAFT items). (3) Nav menus: Organizer collapsibles ✅, shopper links ✅. P2 bug fixed: duplicate Logout in mobile nav — Layout.tsx had a bare Logout button in `authLinks` AND another in the global footer section; removed the one from `authLinks`. (4) Homepage search ✅ — FTS wired and working: "chair" returns 5 results with item cards, photos, prices, "View Sale →" links. (5) Sales Near You card ✅ — map loads, "View on Map →" links to /map. (6) Search results below-fold UX fixed: index.tsx now auto-scrolls to results heading when query ≥2 chars. (7) Chrome concurrency rule added to CLAUDE.md §10c + findasale-qa.skill packaged. Files: Layout.tsx, index.tsx, CLAUDE.md.

**S349 Nav/Dashboard Pass COMPLETE (2026-03-30):** Continued nav audit from S348 feedback. 4 files changed. (1) **P0 dual-role regression fixed:** AvatarDropdown.tsx + Layout.tsx — Shopper Dashboard was hidden for dual-role users behind `!isOrganizer` condition. Now always shows for users with USER role + "As a shopper" label for dual-role context. (2) **P0 Webhooks regrouped:** Moved from Pro Tools to new TEAMS-gated "Developer Tools" collapsible in both AvatarDropdown.tsx + Layout.tsx. (3) **Mobile nav rewritten:** Removed 8 dead items (UGC Moderation, Typology Classifier, Fraud Signals, Offline Mode, Command Center, Appraisals, Sale Ripples, Item Library). Now matches desktop: amber/purple/indigo sections, icons on all items, MY COLLECTION + EXPLORE & CONNECT collapsible for shoppers. (4) **Organizer dashboard cleaned:** Community defaultOpen=true. "How It Works" gated to zero-sales organizers. Duplicate Creator Tier card removed. "Plan a Sale — Coming Soon" card removed. Webhooks removed from dashboard button grid. (5) **Shopper dashboard dead space removed:** Nav shortcut buttons compacted. Empty "Saved Sales Coming Up" section hidden. "Welcome to FindA.Sale!" gated to zero-purchase users. Duplicate stat cards removed. Sales Near You hides on error. ⚠️ **Design quality assessment (Patrick):** Organizer dashboard is C+ — structured as navigation-menu-on-page rather than data/job-to-be-done dashboard. Gamification is D — rank/XP shows state but not motivating next action. S350 needs ground-up dashboard design brief before any more dev. Files: AvatarDropdown.tsx, Layout.tsx, organizer/dashboard.tsx, shopper/dashboard.tsx.

---

**S354 COMPLETE (2026-03-31):** findasale-ux skill rewrite + Dashboard State 2 redesign shipped. (1) **findasale-ux skill rewritten:** Added 4 mandatory gates — Job-to-be-Done gate (must answer "what is the user trying to DO in 30-60s" before any layout), Code-First gate (read API/schema before speccing any data), Action-First Section rule (every section needs a user action or gets cut), No-Redundancy check (no duplicate nav links as dashboard cards). Ran 3-eval A/B test (new vs old skill), generated static eval viewer, packaged as findasale-ux.skill. Patrick installed. (2) **Dashboard State 2 redesign shipped:** organizer/dashboard.tsx + organizers.ts route updated. Sale Status Widget: urgency tags (red <6h, orange <24h), context-aware primary button (Add Photos / Publish Sale / Close Early / Manage Items). Next Action Zone: 6-condition logic tree (draft+items, high holds, ending soon, draft items, traffic-no-holds, healthy). Real-Time Metrics Panel: LIVE 4-col (items/visitors/holds/sold) vs DRAFT 3-col (drafted/with photos/ready to publish), wired to real statsData. Selling Tools: static 6-item → dynamic 4-item state-aware grid (DRAFT vs LIVE tools, tier gates). Tier card: full card → compact single-line badge + link. Earnings/payout alert: conditional green banner when cashFeeBalance > 0. 2 TS fixes applied (urgency null narrowing, arithmetic ?? unreachable). Files: packages/backend/src/routes/organizers.ts, packages/frontend/pages/organizer/dashboard.tsx.

---

**S358 COMPLETE (2026-03-31):** Vercel/Railway unblocked + #153/#41/#80 fully QA verified.

(1) **Vercel build fix:** `shopper/dashboard.tsx` was truncated at line 640 from a prior MCP push — `<>` fragment at line 192 had no closing tag. Fixed by restoring complete closing structure. TS check: zero errors on that file.

(2) **Railway unblocked:** S357 push triggered "Dockerfile does not exist" transient error. Cache-bust comment pushed to `Dockerfile.production` → Railway went green.

(3) **QA #153 ✅ VERIFIED:** Navigated to `/organizer/settings` Profile tab as user2. Facebook/Instagram/Etsy URL fields present, typed values, saved — toast confirmed, page reload confirmed persistence.

(4) **QA #41 ✅ VERIFIED:** Navigated to `/organizer/flip-report/[saleId]` as user3 (Carol Williams, TEAMS). Page rendered with revenue/items data — no 403. Correct route is `/organizer/flip-report/[saleId]` not `/organizer/sales/[id]/flip-report`.

(5) **QA #80 ✅ VERIFIED:** `/shopper/history` as user11 — all 3 bugs fixed and confirmed in Chrome. Cards show: "Vintage Typewriter #5 / From: Priority Estate Sales / 3/28/2026 / $430.59 / PENDING". Details:
- **Field mapping:** `purchase.itemTitle/organizerName/purchasedDate` → `purchase.item.title`, `purchase.sale.organizer.businessName`, `purchase.createdAt`
- **Gallery fix:** `useLootLog` was calling `/api/loot-log` (double prefix → `/api/api/loot-log` 404). Fixed to `/loot-log`.
- **ReceiptCard dark mode:** Added `dark:` variants throughout (was hardcoded `bg-white`/`text-gray-900`).
- **Thumbnails:** List view now shows `purchase.item.photoUrls[0]` thumbnail with 🏷️ placeholder.
- **Root date bug:** `convertDecimalsToNumbers` in `userController.ts` was missing `instanceof Date` guard — Date objects have no enumerable keys so recursive call returned `{}`. Fixed.
- **Null bytes:** Stripped from `userController.ts`, `useLootLog.ts`, `ReceiptCard.tsx` (pre-existing from prior MCP pushes, caused TS1127 errors).

Files changed S358:
- `packages/frontend/pages/shopper/dashboard.tsx` — truncation fix
- `packages/backend/Dockerfile.production` — cache bust
- `packages/frontend/pages/shopper/history.tsx` — field names + thumbnails + card layout
- `packages/frontend/hooks/useLootLog.ts` — double /api/ prefix fix + null bytes stripped
- `packages/frontend/components/ReceiptCard.tsx` — dark mode + null bytes stripped
- `packages/backend/src/controllers/userController.ts` — instanceof Date guard + null bytes stripped

All pushed. Vercel ✅ Railway ✅.

---

**S361 COMPLETE (2026-03-31):** Camera UX + P3 fixes + null byte sweep.

(1) **AI tagging flow fixed (P1):** Root cause: S351 tiered lighting checks + shot guidance all rendered in page JSX, invisible behind full-screen camera overlay. Fix: quality overlays moved INSIDE RapidCapture via `qualityOverlay` prop. `pollForAI(itemId)` added — polls `GET /items/:id` every 3s for 30s, updates carousel badge DRAFT→PENDING_REVIEW. `processAndUploadRapidPhoto()` no longer blocks flow: Tier 2 shows toast + continues, Tier 3 no longer calls `setCameraOpen(false)`.

(2) **Brightness threshold false positives fixed:** Tier 3 `< 40` fired on all normal indoor photos. Lowered to `< 15` (pitch black only). Normal indoor photos (avg 25–97%) now solidly Tier 1.

(3) **Camera UX improvements shipped:**
- "→ Pub" button removed from RapidCapture.tsx thumbnail strip (was redundant with Review button + thumbnail tap)
- Thumbnails enlarged: `w-20 h-20` → `w-24 h-24` (96×96px)
- "+" button enlarged: `w-6 h-6` → `w-8 h-8` with `text-lg`
- Green "Ready ✓" strip added at bottom of PENDING_REVIEW thumbnails (full-width, `bg-green-500/90`)
- Title/category truncate widths updated to `w-24`
- Auto-enhance: confirmed working (`brightness(1.15) saturate(1.1)`), ✨ badge correct

(4) **P3 fixes shipped (local only — in Patrick's push block):**
- `itemController.ts`: CSV Zod empty string → `undefined` conversion
- `settings.tsx`: Business name loads from `/organizers/me` API
- `[saleId].tsx`: Brightness threshold lowered

(5) **Null byte sweep (global):** `find ... | xargs perl -pi -e 's/\x00//g'` run across all .ts/.tsx files in frontend + shared. tsconfig.json also fixed. Zero TS1127 errors remaining (only pre-existing [trailId].tsx JSX tag mismatch unrelated). useTypology.ts was already fixed via MCP (commit e6e71fde, S361 earlier).

Files changed S361:
- `packages/frontend/pages/organizer/add-items/[saleId].tsx` — brightness fix + pollForAI + quality overlay prop
- `packages/frontend/components/RapidCapture.tsx` — → Pub button removed, qualityOverlay prop added
- `packages/frontend/components/camera/RapidCarousel.tsx` — thumbnails larger, + button larger, Ready ✓ strip
- `packages/backend/src/controllers/itemController.ts` — CSV Zod fix
- `packages/frontend/pages/organizer/settings.tsx` — biz name fix
- `packages/frontend/hooks/useTypology.ts` — null bytes + UI refresh invalidation (pushed via MCP e6e71fde)
- Null bytes stripped from many frontend/shared files (ActivityFeed.tsx, ActivitySummary.tsx, tsconfig.json, tagVocabulary.ts, + others via batch)

---

**S362 COMPLETE (2026-03-31):** Camera QA (partial) + smart crop architecture + repo wipe recovery.

(1) **Camera QA (desktop) ✅ Chrome-verified:** Rapidfire opens, Tier 2 brightness soft warning fires ("Lighting is soft. We'll still try."), photo captures, "Analyzing item with AI…" toast appears, counter updates 0→1, green badge on thumbnail, Review(1) updates. "→ Pub" button confirmed absent. Mobile layout responsive. Thumbnails noticeably larger. Tier 2 = soft continue, Tier 3 = hard block. All core AI flow verified on desktop.

(2) **Smart crop architecture decided:** Upload original always, Cloudinary delivers per context: `c_fill,ar_1:1` for grid (square), `c_fill,ar_3:4` for item detail (portrait), `c_fill,ar_4:3` for preview (landscape). Phase 2: add bounding box request to Haiku AI call for crop centering. Canvas crop approach rejected — would lose original.

(3) **Camera UI improvements shipped (in push block):**
- RapidCapture.tsx: Review button → bottom-left 3-zone flex layout, useless left thumbnail removed from Rapidfire
- RapidCarousel.tsx: "+" button 32px→48px, centered bottom of strip, always visible
- imageUtils.ts: `getLandscape4x3Url()` and `getPortrait3x4Url()` added alongside existing `getThumbnailUrl()`
- ItemCard, LibraryItemCard, ItemSearchResults, ItemListWithBulkSelection, RecentlyViewed, InspirationGrid: applied `getThumbnailUrl()` for 1:1 square grid context
- `pages/items/[id].tsx`: applied `getPortrait3x4Url()` for item detail main photo

(4) **CRITICAL: Repo wipe recovered.** `3ceae665` deleted 1,483 files on push (second occurrence this project). Recovery: `git reset --hard cadddf6e` + `git push origin main --force` via Patrick's PowerShell. 10 S362 files saved to VM temp before reset, restored to disk. Pushblock provided — Patrick must run it. Root cause locked in CLAUDE.md §5: subagent git ban (hard rule).

---

## Next Session (S407)

### Patrick Actions First (push this session's changes)
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/HoldToPayModal.tsx
git add packages/frontend/pages/organizer/dashboard.tsx
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "S406 wrap: OG-3 survey trigger + onboarding modal loading fix + QA sweep"
.\push.ps1
```

**Pending migrations (if not already run):**
- S399: FeedbackSuppression table
- S404: `20260406_add_treasure_trails`
- S405: `20260406_add_pos_payment_request`
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**Google Places API key still needed:** console.cloud.google.com → Maps Platform → Places API. Set $200/mo billing cap. Add to Railway as `GOOGLE_PLACES_API_KEY`.

### S407 Priority 1 — QA carry-forward (camera hardware items need real device)
Items in Blocked/Unverified Queue that can be cleared next session:
- ValuationWidget — TEAMS user with draft item needed
- Treasure Trails check-in — create a trail first, then test
- Review card redesign — camera-capture a new item to get a DRAFT
- Camera thumbnail refresh — real camera hardware
- POS QR scan — real camera hardware

### S407 Priority 2 — Roadmap work
- S397 sort/toolbar QA (Chrome — sort by Name/Price/Status/Date on add-items page)
- S396 rapidfire hold/photo limit/onboarding modal QA
- Full POS walkthrough: 4 payment modes (Cash, Stripe QR, Card Reader, Invoice)
- eBay production: Patrick's keyset validation (Alerts & Notifications → Save) should now be complete — verify Browse API is returning real listings

### Standing Notes
- Railway backend: https://backend-production-153c9.up.railway.app
- Test accounts: user1 (TEAMS), user2 (organizer SIMPLE), user3 Carol Williams (TEAMS), user11 Karen Anderson (shopper, Hunt Pass active), user12 Leo Thomas (shopper). All passwords: password123
- eBay: production credentials live in Railway. Browse API returning real listings (verified S406b).
- Backend route mounts: `app.use('/api/organizers', organizerRoutes)` and `app.use('/api/sales', saleRoutes)` and `app.use('/api/trails', trailRoutes)`

## Next Session (S406) — COMPLETE — see S406b above

---

## Next Session (S405) — COMPLETE — see S406 above

### S403 Priority 1 — GAMIFICATION DEEP DIVE (full board session)

Patrick wants a full strategic proposal for a sustainable, fun Shopping Companion / loyalty system for FindA.Sale shoppers. This is a multi-agent session. Fire in this order:

**Step 1 — Research (Innovation agent):** Research these reference programs before anything else:
- Duolingo XP/leagues/streak psychology (anti-churn via streak freeze)
- Starbucks Stars (purchase-tiered unlocks, seasonal specials, emotional attachment)
- Whatnot live auction gamification (bidding streaks, heat signals, FOMO mechanics)
- Poshmark Ambassador (community-driven status, social proof, zero cash cost)
- Pokémon GO (location-based discovery, collection completion compulsion loop)
- Foursquare Mayor → why it died (single axis of competition, no progression depth)
- Robinhood confetti → negative example (trivializing serious decisions with rewards)
- Reddit karma → zero monetary value, high social value — the "why it works" model

**Step 2 — Roadmap feature audit through gamification lens:** For each feature below, determine if it can generate XP, unlock a badge, or trigger a companion event. Rank each: A (core XP driver), B (badge/achievement), C (companion notification trigger), D (not applicable):
- Favorites, Holds, Purchases, Repeat-organizer purchases, Reviews/feedback, Haul posts, Referrals, Early-bird purchase (<1hr of sale open), Consecutive-sale streaks, Category collecting (10+ in one category), Hunt Pass (premium layer — already exists)

**Step 3 — Shopping Companion framing:** A "Shopping Companion" implies the system has agency — it helps you, not just rewards you. This is meaningfully different from a loyalty card. The companion should have three modes:
- Pre-sale: proactive alerts matching user favorites + rank context ("You're 3 XP from Silver — this sale has 4 items in your saved categories")
- During sale: in-context coaching ("First In Door badge available — sale opens in 20 min")
- Post-sale: haul summary + next-goal preview

**Step 4 — Fire DA + Steelman together (co-fire rule):** Give both the full research output from Steps 1–3. Specific tensions to resolve: (a) Does gamification attract bargain hunters who depress organizer revenue? (b) Does an XP economy create unfair dynamics between power shoppers and casual ones? (c) Is "Explorer's Guild" the right brand for non-gamer users?

**Step 5 — Full Advisory Board review:** Give the board the DA+Steelman outputs + the Shopping Companion spec. Ask the board specifically about: sustainable economics (does this cost FindA.Sale money?), regulatory exposure (sweepstakes/prize law), notification fatigue strategy, and social visibility design (are badges public to organizers?).

**Questions Patrick hasn't asked that should alter the proposal:**
1. **Retention vs. acquisition** — Is this solving churn or acquisition? These need different mechanics. What's the actual drop-off point in the shopper journey — first browse, first purchase, or post-purchase?
2. **End-game problem** — What happens when users max rank (12,000 XP threshold confirmed S388)? Without prestige/seasonal systems, power users disengage at peak. Seasonal resets vs. prestige tracks vs. infinite XP — which?
3. **Shopper vs. organizer economies** — Should organizers earn XP too, or is this shopper-only? Mixing creates structural unfairness (organizers transact more). Two parallel systems or one?
4. **Monetization of the system itself** — Does the loyalty system cost FindA.Sale money (redeemable rewards, discounts) or generate revenue (premium badge unlocks, Hunt Pass upsell)? The economics must pencil out before design is locked.
5. **Price depression risk** — Rewarding "deal finding" or volume purchasing could train buyers to lowball or wait for markdowns, actively hurting organizer revenue. Is the incentive structure aligned?
6. **Social visibility design** — Are badges/rank visible to organizers? To other shoppers on a leaderboard? Visibility drives virality but also creates anxiety, cheating incentives, and exclusion for new users.
7. **Notification cadence strategy** — Gamification dies without a smart notification strategy. Too many = unsubscribe. Too few = forgetting. What's the trigger matrix and opt-out design?
8. **Legal/regulatory** — If any rewards have cash value or function like prizes, state sweepstakes law applies. Legal must review before launch.
9. **Platform vs. sale-level loyalty** — XP scoped to a single sale drives short-term engagement. Platform-wide drives retention but is harder to attribute to organizer value. Which serves the business goal?
10. **"Explorer's Guild" brand fit** — Has "Guild" been validated with non-gamer users? It may read as niche. Alternatives: "FindA.Sale Circle," "The Haul," "Collector Status."

**Known decisions to honor:** Rank thresholds locked at 500/2000/5000/12000 XP (S388, board confirmed). PRO=$29, TEAMS=$79. Loyalty vs. explorer-passport consolidation still deferred.

---

### S403 Priority 2 — Wire 10 feedback survey triggers
Infrastructure is built (S399). Wire `showSurvey()` into: OG-1 (publish), OG-2 (10th item), OG-3 (mark sold), OG-4 (POS checkout), OG-5 (settings save), SH-1 (checkout success), SH-2 (favorite), SH-3 (bid), SH-4 (haul post), SH-5 (follow). See `claude_docs/FEEDBACK_DEV_QUICKSTART.md`.

### S403 Priority 3 — Chrome QA sweep
- S402: Price Research Panel, health breakdown checklist, eBay sandbox button
- S398 dashboard, S399 review card, S400–401 camera fixes
- QA carry-forward: S397 sort/toolbar/dark mode, S396 rapidfire hold/photo limit/onboarding modal, full POS walkthrough (4 payment modes)

### Standing Notes
- Railway backend: https://backend-production-153c9.up.railway.app
- Test accounts: user1 (TEAMS), user2 (organizer SIMPLE), user3 Carol Williams (TEAMS), user11 Karen Anderson (shopper, Hunt Pass active), user12 Leo Thomas (shopper). All passwords: password123
- eBay: sandbox credentials live in Railway (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET). URLs pointing at api.sandbox.ebay.com. Swap to api.ebay.com + production creds when ready to go live.
- Backend route mounts: `app.use('/api/organizers', organizerRoutes)` and `app.use('/api/sales', saleRoutes)`
- All migrations current ✅

