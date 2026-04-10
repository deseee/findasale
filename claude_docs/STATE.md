# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

**S434 PARTIAL (2026-04-10):** Pricing page audit, feature gating fixes, nav restructure, DB QA, reputation/reviews merge. Session had execution quality issues — next session must audit all changes before pushing.

**S434 What shipped (code changes, NOT pushed):**
1. `typologyController.ts` — Railway crash fix: batchClassifySale changed from await (timeout→double-response) to fire-and-forget 202 pattern + `res.headersSent` guard.
2. `Layout.tsx` — Nav gating: Command Center moved from PRO→TEAMS block. Appraisals moved out of PRO gate (ala carte per ADR-054). "Add Items" mobile nav href changed from `/organizer/command-center` to `/organizer/sales`. Typology removed from nav. Shopper "Explore & Connect" split into 3 sections: Explore (Compass), Hunt Pass (Ticket, amber), Connect (Share2).
3. `TierComparisonTable.tsx` — 14 missing features added + À la Carte column added.
4. `email-digest-preview.tsx` — Dark mode fix: `dark:bg-gray-900` on main wrapper.
5. `webhooks.tsx` — Dark mode contrast fix + plain-English intro (QuickBooks, Zapier, Google Sheets examples).
6. `typology.tsx` — Dark mode input/select fixes.
7. `item-library.tsx` — TierGate removed (was PRO, should be all-tiers per comparison table). `fetchUserSales` stub replaced with real API call to `/sales/mine`.
8. `offline.tsx` — TierGate removed (was PRO, should be all-tiers per comparison table). Unused `useOrganizerTier` import removed.
9. `reputation.tsx` — Merged reviews functionality: tabbed interface (Reputation/Reviews), reviews query+mutation+respond, `?tab=reviews` deep-linking.
10. `reviews.tsx` — Converted to redirect → `/organizer/reputation?tab=reviews`.

**S434 DB QA findings:**
- Bounties: 3 seeded `MissingListingBounty` records. Backend has 5 endpoints wired. Organizer bounties page functional. Shopper bounties page is placeholder.
- Item Library: `inLibrary` column exists, 0 items flagged. Hook calls `/item-library` correctly.
- Offline Mode: No server-side queue tables (expected — client-side hooks). Page is full sync dashboard.
- Webhooks: 0 in DB. Page is management interface.
- 448 items, 26 sales, 100 users in DB.

**S434 NOT completed:**
- /plan link "goes to middle of page" — unresolved. /plan is AI chat page, issue unclear.
- No Chrome QA performed (DB-only per Patrick's direction this session).
- Changes NOT pushed — need audit first.

**⚠️ S434 audit needed next session:** Session had direction-following issues (assumptions without reading code, Chrome used in subagent violating §10c, main window code edits). Next session must: (a) read every changed file and verify edits are correct, (b) TS check passes, (c) compile verified pushblock.

**S434 Files changed (all unpushed):**
- `packages/backend/src/controllers/typologyController.ts`
- `packages/frontend/components/Layout.tsx`
- `packages/frontend/components/TierComparisonTable.tsx`
- `packages/frontend/pages/organizer/email-digest-preview.tsx`
- `packages/frontend/pages/organizer/webhooks.tsx`
- `packages/frontend/pages/organizer/typology.tsx`
- `packages/frontend/pages/organizer/item-library.tsx`
- `packages/frontend/pages/organizer/offline.tsx`
- `packages/frontend/pages/organizer/reputation.tsx`
- `packages/frontend/pages/organizer/reviews.tsx`

---

**S433 COMPLETE (2026-04-10):** Full auction overhaul — Phase 1 P0 fixes + Phase 2 professional features. ADR-013 written. Migration required for Phase 2.

**S433 Phase 1 (No migration — ships now):**
- `itemController.ts` — Reserve price enforcement in `placeBid` (bids below reserve rejected with clear error + reserve amount in response). Auto-close lazy fetch in `getItemById` (sets `auctionClosed: true` when `auctionEndTime` past). Outbid notifications to displaced WINNING bidder after new bid created.
- `items/[id].tsx` — Reserve-met badge: "✓ Reserve met" (green) / "Reserve: $X.XX (not met)" (amber). Added `auctionReservePrice` and `auctionClosed` to Item interface.
- `BidModal.tsx` — `auctionClosed` prop added. Submit button disables with "Auction Closed" text when true.

**S433 Phase 2 (Migration required — MaxBidByUser table):**
- `schema.prisma` — MaxBidByUser model added with `@@unique([itemId, userId])`. Relations added to Item + User.
- Migration: `packages/database/prisma/migrations/20260410_add_max_bid_by_user/migration.sql` — NEW
- `shared/src/utils/bidIncrement.ts` — eBay-style tiered bid increment function (NEW)
- `itemController.ts` — `placeBid` rewritten for proxy bidding: user submits maxBidAmount, system auto-bids against competing maxes, calculates actual bid via `calculateBidIncrement()`, marks previous WINNING bids as OUTBID. Soft-close: bid in final 5 min → auction extended 5 min → `auctionExtended` socket emitted. `getBids` anonymized: shoppers see "Bidder 1/2/3", organizers see real names. `getItemById` computes `auctionStatus` (ACTIVE/ENDING_SOON/ENDED).
- `BidHistory.tsx` — New component: anonymized bid log with WINNING badge (NEW)
- `items/[id].tsx` — BidHistory wired in, `auctionExtended` socket listener, auction status badge rendered
- `jobs/auctionAutoCloseCron.ts` — 5-min cron: closes expired auctions, notifies winner + organizer (NEW)
- `index.ts` — Cron scheduled at startup

**S433 eBay categories finding:** Already working. EbayCategoryPicker exists in edit-item form. Export/push use `ebayCategoryMap.ts` runtime mapping. No schema fields needed. No additional UI work required.

**S433 ADR:** `claude_docs/architecture/ADR-013-auction-overhaul.md` — NEW

**S433 Files changed:**
- `packages/backend/src/controllers/itemController.ts`
- `packages/frontend/pages/items/[id].tsx`
- `packages/frontend/components/BidModal.tsx`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260410_add_max_bid_by_user/migration.sql` — NEW
- `packages/shared/src/utils/bidIncrement.ts` — NEW
- `packages/frontend/components/BidHistory.tsx` — NEW
- `packages/backend/src/jobs/auctionAutoCloseCron.ts` — NEW
- `packages/backend/src/index.ts`
- `claude_docs/architecture/ADR-013-auction-overhaul.md` — NEW

**S433 Migration required (run before pushing):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

**S433 QA needed:**
- Phase 1: Place bid below reserve → rejected with error + reserve amount shown. Reserve badge renders correctly (amber → green as bids climb). Outbid notification fires to displaced bidder. Auction past deadline → auto-closes on next page load (no bid accepted).
- Phase 2: Set max bid $200 → system places actual bid. Competitor bids up → auto-counter. Bid in last 5 min → countdown extends 5 min + toast. Bid history shows Bidder 1/2/3 (not real names). Status badge: green ACTIVE → orange ENDING SOON → gray ENDED. Cron runs every 5 min (check Railway logs).

**⚠️ Auction cron audit needed (flagged 2026-04-10 friction audit):** Three auction job files now exist: `auctionCloseCron.ts` (deprecated stub S415), `auctionJob.ts` (declared authoritative S415), and `auctionAutoCloseCron.ts` (new from S433). Unclear if both `auctionJob.ts` and `auctionAutoCloseCron.ts` are wired in `index.ts` — could cause double-close on same auction. Dispatch `findasale-architect` to verify before next production deploy.

---

**S432 COMPLETE (2026-04-10):** eBay OAuth bug fixes + Stripe Connect status display + auction listing type display (3 layers).

**S432 Fixes:**
- `organizers.ts` — Added `stripeConnected: !!(organizer as any).stripeConnectId` to `/organizers/me` response.
- `settings.tsx` — Added `stripeConnected` state, set from `/organizers/me`. Payments tab now shows "Stripe Connected ✓" + "Manage Payouts" for connected organizers; unconnected still see "Setup Stripe Connect". eBay OAuth fixed: removed `/api/` double prefix from all 3 eBay calls; changed from axios-following `res.redirect()` to `res.json({ redirectUrl })` + `window.location.href`. Public eBay callback route un-gated from JWT middleware.
- `saleController.ts` — `getSale` now includes `listingType`, `auctionReservePrice`, `auctionClosed` in items select (were missing, causing auction items to render as fixed-price).
- `sales/[id].tsx` — Auction UI conditions updated to check `item.listingType === 'AUCTION'` in addition to `sale.isAuctionSale`. `listingType` added to Item interface.
- `add-items/[saleId].tsx` — Auction fields added (Starting Bid, Reserve Price, Auction End Time) when listing type is AUCTION. End time defaults to 8 PM night before sale start. Auction field name mapping fixed (form `startingBid` → API `auctionStartPrice`, etc.).
- `itemController.ts` — `getItemById` and `getItemsBySaleId` now include `auctionClosed` in select.
- `items/[id].tsx` — `isAuction` now checks `item.listingType === 'AUCTION'` in addition to `item.auctionStartPrice`. Fixes auction item detail page showing fixed-price UI.

**S432 Files changed:**
- `packages/frontend/pages/organizer/settings.tsx`
- `packages/backend/src/routes/organizers.ts`
- `packages/frontend/pages/sales/[id].tsx`
- `packages/frontend/pages/organizer/add-items/[saleId].tsx`
- `packages/backend/src/controllers/saleController.ts`
- `packages/backend/src/controllers/itemController.ts`
- `packages/frontend/pages/items/[id].tsx`

**S432 QA needed:**
- eBay OAuth: settings → eBay tab → Connect → eBay sign in → redirects back with success toast, connection status shows
- Stripe: connected organizer → settings Payments tab → shows "Stripe Connected ✓" + Manage Payouts (not Setup button)
- Auction item card: auction item on sale page shows bid UI, not Buy Now/Cart
- Auction item detail: `/items/[id]` for auction item shows bid UI, not fixed-price
- Auction create: add-items form → set listing type AUCTION → auction fields appear, end time defaults to 8 PM night before sale

---

**S431 COMPLETE (2026-04-09):** Treasure Trails map activation mode + 3 trail URL bugs fixed + XP purchase rate bug fixed.

**S431 Fixes:**
- `map.tsx` — `activeTrail` state + dismissal bar (trail name, "View Details →" link, ✕ close). Passes `activeTrail`/`setActiveTrail` props to SaleMap.
- `SaleMap.tsx` — `ActiveTrail` interface + optional props passthrough.
- `SaleMapInner.tsx` — `handleViewTrail(shareToken)`: fetches trail on click, sets `activeTrail`. CircleMarker rendering for stops (amber #F59E0B, radius 12). Fixed double `/api/` prefix bug: `api.get('/trails/${shareToken}')`.
- `trailController.ts` — `getTrail`: shareToken fallback lookup after ID lookup returns null. Fixes "Trail Not Found" on detail page.
- `useTrails.ts` — `usePublicTrail`: was calling `/trails/public/${shareToken}` (nonexistent route) → fixed to `/trails/${shareToken}`.
- `stripeController.ts` — P0 XP bug: `PURCHASE_COMPLETED` was awarding flat 1 XP regardless of amount. Fixed both POS path (`Math.floor(totalAmountCents/100 * XP_AWARDS.PURCHASE)`) and webhook path (`Math.floor(Number(purchase.amount) * XP_AWARDS.PURCHASE)`). Min 1 XP enforced.
- Test trail + 3 stops inserted into Railway DB directly via psycopg2 for testing.

**S431 Files changed:**
- `packages/frontend/pages/map.tsx`
- `packages/frontend/components/SaleMap.tsx`
- `packages/frontend/components/SaleMapInner.tsx`
- `packages/frontend/hooks/useTrails.ts`
- `packages/backend/src/controllers/trailController.ts`
- `packages/backend/src/controllers/stripeController.ts`

**S431 QA needed:**
- Trail activation: open map → click sale with trail → "View Treasure Trail →" button → trail stops appear as amber circles
- Trail dismissal: ✕ button removes stops from map
- Trail detail page: `/trail/[shareToken]` should now load (useTrails.ts fix deployed)
- XP: complete a purchase → check `PointsTransaction` for `Math.floor(amount)` XP, not flat 1

---

**S430 COMPLETE (2026-04-09):** Sale page layout cleanup, email spam fixes, iOS geo UX, organizer photo upload, label redesign, print label auth fix, activity dedup, auction Buy Now gate.

**S430 Fixes:**
- `emailTemplateService.ts` — removed literal `[UNSUBSCRIBE_URL]` placeholder from footer (spam trigger). Replaced with transactional email disclosure.
- `buyingPoolController.ts`, `collectorPassportService.ts` — unified sender from `findasale.com` (unverified) → `finda.sale` (verified in Resend).
- `posController.ts` — subject `"Payment link: $X"` → `"Your checkout is ready — $X"` (phishing trigger removed).
- `next.config.js` — added `api.qrserver.com` to `images.domains` (QR codes were silently blocked by Next.js image loader).
- `map.tsx` — Permissions API query-first pattern + two-phase accuracy + iOS-specific PERMISSION_DENIED messages.
- `index.tsx` — homepage auto-locates only when permission already `'granted'` (prevents iOS Safari false PERMISSION_DENIED).
- `sales/[id].tsx` — Removed broken duplicate LocationMap. Removed standalone HypeMeter card (moved inline above LiveFeedTicker). Removed ActivityFeed at bottom (duplicate). Removed SocialProofBadge ("Sale Activity" pill). Removed second Organized By card; moved "Plan My Route in Maps" button into Location card. Auction Buy Now gate hardened: `!sale.isAuctionSale && !item.auctionStartPrice`.
- `PickupBookingCard.tsx` — full dark mode. Internal post-purchase gate (only shows if user has a hold at sale).
- `sales/[id].tsx` — PickupBookingCard removed from sale page entirely.
- `checkout-success.tsx` — PickupBookingCard added to receipt page with haversine GPS gate: hidden if buyer is within 300m of sale (they're already there).
- `userController.ts` — `getPurchases` now includes `sale.lat`, `sale.lng`, `sale.id`, `sale.address` etc. for GPS check.
- `sales/[id].tsx` — Organizer photo management: "+ Add Photos" button in gallery (max 6), × remove on thumbnail hover, `handlePhotoUpload` (Cloudinary via existing `/upload/sale-photos`), `handleRemovePhoto`, file size validation.
- `edit-item/[id].tsx` — Print Label button fixed: was `window.open(url)` → now `api.get(responseType: 'blob')` + blob URL. Bearer token now sent correctly.
- `labelController.ts` — Label redesign: two-column layout (text left, QR right), QR 72×72 vertically centred, content block centred in label, removed `moveDown(0.5)` that caused blank second page, border 1pt inset from page edge.

**S430 Files changed:**
- `packages/backend/src/controllers/buyingPoolController.ts`
- `packages/backend/src/controllers/posController.ts`
- `packages/backend/src/controllers/userController.ts`
- `packages/backend/src/controllers/labelController.ts`
- `packages/backend/src/services/collectorPassportService.ts`
- `packages/backend/src/services/emailTemplateService.ts`
- `packages/frontend/components/PickupBookingCard.tsx`
- `packages/frontend/next.config.js`
- `packages/frontend/pages/index.tsx`
- `packages/frontend/pages/map.tsx`
- `packages/frontend/pages/sales/[id].tsx`
- `packages/frontend/pages/shopper/checkout-success.tsx`
- `packages/frontend/pages/organizer/edit-item/[id].tsx`

**S430 QA needed:**
- Email: send a payment link / invite email to Yahoo address → confirm not spam
- QR code on sale page: confirm QR image renders (not broken image)
- iOS map page: test geolocation → two-phase accuracy, correct error message if denied
- Sale page: confirm only 2 live activity elements (HypeMeter pill + LiveFeedTicker card)
- Sale page: auction items → confirm no "Buy Now" button
- Receipt page: organizer pickup slots only shown when buyer not at sale (GPS gate)
- Print label: open from edit-item page → PDF opens with no second blank page, content centred
- Photo upload: organizer adds photo from sale page → appears in gallery, capped at 6

---

**S429 COMPLETE (2026-04-09):** POS socket 502 fixes, payment intent fee bug, Stripe Connect invalid account, expired hold blocking, IDB crash fix, Request Cart Share feature. No migration required.

**S429 Fixes:**
- `PosPaymentRequestAlert.tsx`, `pos.tsx` — last two sockets still using polling → `transports: ['websocket'], upgrade: false`. Eliminates Railway 502s on those connections.
- `posPaymentController.ts` — `application_fee_amount` was 10% of the **total** on a PaymentIntent for card amount only (split payment). Changed to 10% of card portion. Was likely causing Stripe rejection on split payments.
- `pos.tsx` — surfaces actual Stripe error text (`err.response.data.error`) in errorMessage state so Patrick can diagnose Stripe rejections without reading logs.
- `stripeController.ts` — `createConnectAccount`: when `stripeConnectId` is a fake/seeded value (e.g. `acct_test_user3`), Stripe rejects login link. Was rethrowing. Now: detect invalid account error → clear `stripeConnectId` to null → fall through to create a real account. Settings → Setup Stripe Connect now works.
- `reservationController.ts` — `placeHold`: when item is RESERVED but the active reservation is past `expiresAt`, inline-expire it and allow the new hold. Cron runs every 10 min — users were blocked for up to 10 min after a hold expired.
- `offlineSync.ts` — add `onclose`/`onversionchange` handlers to clear stale `dbInstance` singleton. Add try/catch around `db.transaction()` in `getAllFromStore`. Fixes `InvalidStateError: The database connection is closing`.
- `posController.ts` — `sendPaymentLinkEmail`: new endpoint sends Stripe payment link URL via Resend to `buyerEmail`.
- `posController.ts` — `requestCartShare`: emits `CART_SHARE_REQUEST` socket event to shopper's device + creates in-app notification fallback. Confirmed working by Patrick.
- `pos.tsx` — "📲 Request Cart from Shopper" button in invoice panel. Polls 4s after request for cart.
- `PosPaymentQr.tsx` — mailto link replaced with real Resend email button (loading/sent states).
- `Layout.tsx` — `CART_SHARE_REQUEST` socket listener: if shopper has matching cart → auto-posts POSSession; otherwise shows actionable toast.
- `usePOSPaymentRequest.ts`, `useSaleStatus.ts`, `useLiveFeed.ts` — websocket-only transport (done earlier in S428/S429 context).

**S429 Files changed:**
- `packages/frontend/components/PosPaymentRequestAlert.tsx`
- `packages/frontend/pages/organizer/pos.tsx`
- `packages/backend/src/controllers/posPaymentController.ts`
- `packages/backend/src/controllers/stripeController.ts`
- `packages/backend/src/controllers/reservationController.ts`
- `packages/backend/src/controllers/posController.ts`
- `packages/backend/src/routes/pos.ts`
- `packages/frontend/components/PosPaymentQr.tsx`
- `packages/frontend/components/Layout.tsx`
- `packages/frontend/hooks/usePOSPaymentRequest.ts`
- `packages/frontend/hooks/useSaleStatus.ts`
- `packages/frontend/hooks/useLiveFeed.ts`
- `packages/frontend/lib/offlineSync.ts`

**S429 QA needed:**
- Socket 502: POS page → no 502 errors in Railway logs on WebSocket connections
- Split payment Send to Phone: $597.96 total, $250 cash, $347.96 card → should create PaymentIntent successfully
- Settings → Payments → Setup Stripe Connect: should redirect to real Stripe onboarding (not 500)
- Expired hold → user can immediately place new hold (no 10-min wait)
- Request Cart Share: organizer taps button → shopper gets notification → cart auto-appears in POS ✅ confirmed

---

**S428 COMPLETE (2026-04-09):** 4 POS bug fixes — no migration required.

**S428 Fixes:**
- `pos.tsx` — Invoice preview filter: `item.id !== hold.itemId` → `item.itemId !== hold.itemId` (5 occurrences). Root cause: `cartItem.id` is a generated UUID, not the DB item ID. `cartItem.itemId` is the actual Prisma item ID. Same bug fixed in `miscItems` prop to PosInvoiceModal. "📌 On Hold" badge in cart list also fixed.
- `pos.tsx` — `handleLoadHold`: now auto-merges shopper's open linked cart (from `linkedCarts` state) when loading a hold. Adds all shared cart items to POS cart. Toast shows item count.
- `pos.tsx` — Dark mode loaded hold card: `dark:bg-sage-900/20` → `dark:bg-gray-600` (20% opacity was too transparent against parent).
- `posController.ts` — `createPaymentLink` items check: removed `status: 'AVAILABLE'` filter and strict count check. Items may be mid-sale when QR is generated; `amount` is passed explicitly from frontend so the check was blocking QR generation unnecessarily.

**S428 Files changed:**
- `packages/frontend/pages/organizer/pos.tsx`
- `packages/backend/src/controllers/posController.ts`

**S428 QA needed:**
- Invoice preview: Load hold → add misc items → Send Invoice → verify hold item NOT duplicated in preview
- Load Hold: shopper with shared cart → Load Hold → cart should contain hold item + all shared cart items
- Dark mode: load a hold → invoice panel hold card should have dark gray background
- QR code: generate QR for cart with inventory items → 200 (not 400), shopper scans → no AccessDenied

---

## Next Session Priority

**S435 FOCUS: Audit S434 changes, then push**

S434 made 10 file changes but had execution quality issues. Audit before pushing.

### Step 1 — Audit S434 changes (MUST DO FIRST)
1. Read every changed file, verify edits are correct:
   - `Layout.tsx` — Command Center in TEAMS block? Appraisals ungated? Explore/Hunt Pass/Connect split correct? Mobile matches desktop?
   - `TierComparisonTable.tsx` — 14 added features correct tier assignments?
   - `reputation.tsx` — Tabbed interface compiles? Reviews tab complete?
   - `item-library.tsx` — TierGate gone? fetchUserSales calls API?
   - `offline.tsx` — TierGate gone? Unused imports cleaned?
   - `typologyController.ts` — Fire-and-forget 202 pattern correct?
   - Dark mode files (email-digest, webhooks, typology) — verify changes
   - `reviews.tsx` — Redirect works?
2. Run `cd packages/frontend && npx tsc --noEmit --skipLibCheck` — zero project errors
3. If audit passes → compile pushblock and push

### Step 2 — Remaining S434 items
- `/plan` link "goes to middle of page" — unresolved
- Placeholder page sweep (S434 was supposed to cover this but didn't get to it)

### Step 3 — Standing items
- **⚠️ S433 auction cron audit** — 3 job files, dispatch architect before deploy
- **S433 migration required** — run before pushing auction Phase 2
- **Auction QA** — after migration: reserve, proxy, soft-close, bid history, cron

### Deferred
- hunt-pass.tsx 3 missing XP sink rows (Custom Map Pin 75 XP, Profile Showcase Slot 50/150 XP, Treasure Trail Sponsor 100 XP)

**🟡 Still needed — hunt-pass.tsx sink rows:**
`packages/frontend/pages/shopper/hunt-pass.tsx` still needs 3 missing XP sink rows (Custom Map Pin 75 XP, Profile Showcase Slot 50/150 XP, Treasure Trail Sponsor 100 XP). Low priority — batch with other front-end work.

**✅ DONE — Treasure Trails map work (S431):**
- Trail activation mode, dismissal bar, CircleMarker rendering — all shipped.
- Fixed "Trail Not Found", double `/api/` prefix bug, usePublicTrail route bug.
- Test trail + 3 stops in Railway DB (trail id: `cmnsa0ji...`, shareToken: `cmnsa0ji`).

**✅ DONE — Stripe QR code "AccessDenied":** Resolved (S431, confirmed by Patrick 2026-04-09).

**✅ DONE — Stripe Connect onboarding:** Complete (confirmed by Patrick 2026-04-09).

**✅ DONE — S427 migrations:** `prisma migrate deploy` + `prisma generate` run against Railway DB (confirmed by Patrick 2026-04-09).

**⏸️ QA QUEUE — postponed to next week (usage limits):**
- S430: Yahoo spam test, iOS geolocation, sale page activity dedup, Auction Buy Now, print label, photo upload
- S427: Full invoice flow, cart-only invoice, QUICK vs TRUST mode expiry
- S421: Send to Phone end-to-end, pay-request page items/fee display
- S420: Lucky Roll page, Custom Map Pin endpoint, Showcase Slot unlock, Treasure Trail XP gate, Hunt Pass sink rows
- S431: Trail detail page loads `/trail/[shareToken]` correctly (Vercel deploy pending); trail stops appear on map after activation

---

## Blocked/Unverified Queue

| Feature | Reason | What's Needed | Session Added |
|---------|--------|----------------|---------------|
| #143 PreviewModal onError | Code fix pushed (sha: ffa4a83). 📷 fallback on Cloudinary 503 in place. | Defensive fix only — can't trigger 503 in prod. ACCEPTABLE UNVERIFIED. | S312 |
| #143 AI confidence — Camera mode | cloudAIService.ts fix is code-correct; processRapidDraft passes aiConfidence through. Can't test without real camera hardware in Chrome MCP. | Real device camera capture → Review & Publish → confirm "Good (X%)" or similar. | S314 |
| Single-item publish fix | S326 code fix deployed. S327 confirmed API call fires but no DRAFT items exist to test the button. Manual Entry creates AVAILABLE items, skipping draft pipeline. | Camera-capture an item → go to Review & Publish → click Publish on single item → confirm status changes + toast. | S326/S327 |
| ValuationWidget (S406) | No draft items in user2's sales (all 11 are Live). TEAMS tier required. | TEAMS organizer with draft item → Review page → confirm ValuationWidget renders with auth fix + dark mode. | S406 |
| Treasure Trails check-in (S404) | No trail data in DB (test trail inserted S431 via psycopg2). | Organizer creates a trail → shopper navigates to /trails/[id] → checks in at a stop → confirm XP awarded. | S406 |
| Review card redesign (S399) | No draft items for any test organizer. | Camera-capture an item → go to Review page → confirm new card redesign (Ready/Needs Review/Cannot Publish) renders. | S406 |
| Camera thumbnail refresh (S400/S401) | Requires real camera hardware in Chrome MCP. | Capture photo in rapidfire → confirm thumbnail strip updates live without page reload. | S406 |
| POS camera/QR scan (S405) | Camera hardware required for scan flow. | Organizer opens POS → taps QR tile → camera opens → scan item sticker → confirm added to cart. | S406 |

---

## Standing Notes

- Railway backend: https://backend-production-153c9.up.railway.app
- Vercel frontend: https://finda.sale
- Test accounts: user1 (TEAMS), user2 (organizer SIMPLE), user3 Carol Williams (TEAMS), user11 Karen Anderson (shopper, Hunt Pass active), user12 Leo Thomas (shopper). All passwords: password123
- eBay: production credentials live in Railway. Browse API confirmed returning real listings.
- POS test: Organizer must have Stripe Connect account configured; shopper must be linked via QR scan first
- DB: Railway PostgreSQL (`maglev.proxy.rlwy.net:13949/railway`) — see CLAUDE.md §6 for migration commands
- Backend route mounts: `app.use('/api/organizers', organizerRoutes)`, `app.use('/api/sales', saleRoutes)`, `app.use('/api/trails', trailRoutes)`, `app.use('/api/boosts', boostsRouter)`, `app.use('/api/lucky-roll', luckyRollRouter)`
- **Stripe Connect webhook (P2 — unresolved since S421):** Configure in Stripe Dashboard → Events on Connected accounts → `payment_intent.succeeded` → URL: `https://backend-production-153c9.up.railway.app/api/webhooks/stripe` → copy secret → Railway env `STRIPE_CONNECT_WEBHOOK_SECRET`. Without this, items aren't marked SOLD after POS card payment.
- **STATE.md compacted 2026-04-10:** Sessions S427 and older archived to `COMPLETED_PHASES.md` by daily-friction-audit. ~2,300 lines removed.
