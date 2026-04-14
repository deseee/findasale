# Patrick's Dashboard — Week of April 14, 2026

## What Happened This Week

**S461** (2026-04-14) — eBay push 25021 fixes + Taxonomy API wired in:
- **Root cause:** The name→ID category map was resolving to *branch* categories (like Kitchenware → Kitchen Dining & Bar). eBay Inventory API rejects every listing under a branch. Plus the default fallback was `'1'` (Collectibles — also a branch).
- **Honest note you asked for:** the prior "eBay categories implemented sitewide" claim was shallow. The picker uses a static JSON of ~120 categories (with some wrong IDs). The push used a different hardcoded map. Neither ever talked to eBay's live Taxonomy API.
- **Fix 1 ✅ pushed:** Capture eBay's numeric CategoryID on import and store it on the Item. Prefer it on push. Migration applied.
- **Fix 2 ✅ pushed:** For items YOU create in FindA.Sale (not imported), call eBay's Taxonomy API to get a real leaf category from the title.
- **Fix 3 ⏳ ready to push:** Taxonomy was returning 403 — user token doesn't carry the right scope. Swapped to app token (same one we use for OAuth). Push block below.
- **What to do:** Run the push block, wait for Railway deploy, push the travel mug to eBay again. Should work.
- **Queued for next session:** Condition-per-category validation, replace static picker with live Taxonomy, retire the hardcoded category map.

**Push block:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/backend/src/controllers/ebayController.ts
git commit -m "fix(ebay): use app token for Taxonomy API (fixes 403 on getCategorySuggestions)"
.\push.ps1
```

---

**S460** (2026-04-14) — eBay push UI everywhere, QR watermark default, photo import fix, post-sale workflow:
- **eBay push button now in 3 places:** Sale detail page (new), Edit Item page, Review & Publish page. Before today, the only way to push to eBay was via a hidden API call — no UI existed.
- **QR watermark is now the default for all eBay photos** — every photo pushed to eBay has a QR code pointing back to `finda.sale/items/{itemId}` + your organizer name. Works for both push and CSV export.
- **Photo import bug fixed** — sync was skipping items that already had 1 photo. Now enrichment always fetches all photos for partially-synced items.
- **Post-sale eBay panel built** — when a sale ends, you'll get a soft toast: "X items didn't sell — ready to list on eBay?" The panel shows each unsold item with a shipping badge (shippable/heavy/fragile), lets you check items to push, and has a "Too heavy to ship?" toggle to flag items you don't want to ship.
- **Shipping classification:** Items are automatically tagged SHIPPABLE/HEAVY/FRAGILE/UNKNOWN from their category and tags. You can override per item.
- **eBay push: no tier gate** — confirmed ungated. Any organizer with eBay connected can push.
- **TS build error fixed** (line 257 in sales/[id]/index.tsx) — bad comparison removed.
- **⚠️ Run migration below before testing the post-sale panel.**

**S459** (2026-04-14) — eBay webhook confirmed + enrichment fully operational:
- **ORDER_CONFIRMATION webhook** ✅ — Per-organizer subscription working. The 409 in logs = correct (subscription already exists from first connect). No action needed.
- **eBay photos now syncing** ✅ — Items showing 4–22 photos each. Categories populated (Comics, Golf, Magazines, Tobacciana, etc.)
- **Shopping API killed, Trading API GetItem in use** — eBay's old Shopping API was silently returning empty responses (retired). Replaced with Trading API GetItem calls, 5 concurrent, fire-and-forget after HTTP response.
- **Timeout error fixed** — Sync now responds immediately with item count. Enrichment runs in background. When done, you'll get a toast: "Photos and details synced for X eBay items."
- **`&amp;` in categories** — eBay returns HTML-encoded category names. Will be fixed next session (cosmetic).
- **Two inventory page bugs queued for next session** — images need hard refresh, no click/edit on cards.

**S458** (2026-04-14) — Pull to Sale UX + eBay GetItem enrichment:
- **Toast on pull** ✅ — "Item added to [sale name]" on pull confirm
- **Sale title in Add Items header** ✅ — was using `sale.name` (wrong), fixed to `sale.title`
- **GetItem enrichment pass** — after sync, calls eBay `GetItem` with `DetailLevel=ReturnAll` for each item missing description/category/tags. Backfills from full eBay item data. (GetMyeBaySelling doesn't return these fields — this was the root cause of empty item cards.)
- **Photo fallback** — `ItemPhotoManager.tsx` now has `onError` retry with raw URL for eBay CORS edge cases
- **⚠️ Architecture concern:** GetItem 1-per-item is a stopgap. Next session: architect designs proper batch sync using `GetItems` (20/call) + eBay Platform Notifications for real-time sold events.

**S457** (2026-04-14) — Pull to Sale P2011 crash fixed + inventory filter:
- `embedding: []` added to `pullFromInventory` create — was causing Prisma P2011 null constraint crash on every pull attempt
- `inInventory: true` filter added to `getInventoryItems` — was returning entire sale history instead of only inventory items
- `conditionGrade` now copied when pulling an item to a sale

**S456** (2026-04-14) — eBay inventory import fully operational:
- **86 eBay listings imported with photos** ✅ — Trading API (GetMyeBaySelling) working. Photos from eBay show correctly on `/organizer/inventory`.
- **Sync is now idempotent** — re-sync correctly shows 0 new items (duplicate detection fixed).
- **81 duplicate items cleaned up** from Railway DB directly (from the previous failed sync attempts).
- **eBay photos were blocked by Next.js CSP** — `i.ebayimg.com` added to image domains and `img-src`. Now visible.
- **`sell.fulfillment` scope added** to eBay OAuth — stops the 403 errors in sync cron logs. Artifact MI should disconnect + reconnect eBay once to get updated token.
- **⚠️ "Pull to Sale" not working** for eBay-imported inventory items — confirmed broken, fix is P0 next session.

**S455** (2026-04-13) — eBay inventory import, library→inventory cleanup, OAuth/cart fixes:
- **eBay "Sync Inventory" button live** on Settings → eBay tab. Pulls all eBay listings into `/organizer/inventory` as persistent items. Deduplicates by SKU on re-sync.
- **"Library" terminology fully eliminated:** All code, files, hooks, components renamed to "inventory." `inLibrary` DB field renamed to `inInventory` via migration.
- **Google/Facebook OAuth auto-link:** Accounts created with email+password can now log in with Google or Facebook (same email). Previously rejected with a 400 error.
- **OAuth mobile race condition fixed:** Login with Google/Facebook on mobile no longer gets stuck loading.
- **Cart isolation fixed:** Each user's cart is isolated by user ID. Logging out clears the cart. Previous user's cart no longer bleeds to next user.
- **eBay redirect fixed:** After eBay OAuth, now correctly lands on FindA.Sale settings page (not Railway backend 404).
- **eBay policy scope fixed:** `sell.account` scope added — Artifact MI needs to disconnect + reconnect eBay to get a new token with this scope.
- **Add-items page:** Sale name now shown in header. Walkthrough modal explains Rapidfire vs Regular mode on first visit. All "AI" branding removed from copy.

**⚠️ Artifact MI action required:** Disconnect and reconnect eBay account after deploy (Settings → eBay → Disconnect, then reconnect).

**S453+S454** (2026-04-13) — Hunt Pass → real recurring subscription. Stripe go-live audit.
- **Hunt Pass is now a real Stripe Subscription** ($4.99/mo auto-renewing). Old PaymentIntent flow removed entirely. Users click "Subscribe" → redirected to Stripe Checkout → webhook activates pass. Cancel at period end supported.
- **Subscription ID persistence fixed (P0):** `stripeSubscriptionId` was never being saved → billing portal and cancel always failed. Fixed in `syncTier.ts`.
- **Pricing page endpoint fixed (P0):** `pricing.tsx` was calling the broken checkout endpoint (orphaned Stripe customers). Now correctly calls `/billing/checkout`.
- **POS product catalog guard:** New env var `STRIPE_GENERIC_ITEM_PRODUCT_ID` — when set, all POS payment links reuse one generic product instead of creating new ones per item. Keeps Stripe catalog clean.
- **pricing.tsx null byte build error fixed.**
- **Migration deployed:** `huntPassStripeCustomerId` + `huntPassStripeSubscriptionId` added to User table.

**S452** (2026-04-13) — eBay + Stripe go-live prep. Bidirectional eBay sync (both directions). Policy ID fetch post-OAuth. endEbayListingIfExists wired into all 5 SOLD paths. Phase 3 polling cron (15-min). Stripe env confirmed. **Hunt Pass is a subscription — investigation required next session.**

**S451** (2026-04-13) — Dashboard layout fixed, QR inline, broken buttons fixed:
- **⚠️ Catastrophic push recovered:** Git index desync wiped 1,708 files. Recovery complete via `git add -A`. All files restored.
- **Dashboard layout now correct:** Hero → Action Buttons → QR Panel (inline toggle) → Hunt Pass strip → Tabs → Content
- **Browse Sales removed** (was 404ing). **Button routes fixed:** Collections → `/shopper/wishlist`, Purchase History → `/shopper/history`
- **My QR button** added to action row — QR expands inline below buttons, no more separate card
- **Initiate icon:** sprout → Compass
- **Purchases tab removed** (redundant). Referral banner removed (stale). Saved items banner removed.
- **Pending Patrick decision:** Followed Brands tab — brand tracking for item alerts — keep, rename, or remove?

**S450** (2026-04-13) — Rank staleness P0 fixed, dashboard character sheet attempt, organizer badge, /shopper/ranks:
- **P0 rank staleness FIXED:** `explorerRank` removed from JWT entirely. `AvatarDropdown` now calls `useXpProfile()` API hook for fresh rank on every render. Cascade fixes in `useXpSink`, `haul-posts`, `items/[id]`, `dashboard` (5 files updated).
- **Tier names LOCKED:** Initiate → Scout → Ranger → Sage → Grandmaster (0/500/2000/5000/12000 XP). "Hunter" was wrong — Ranger confirmed.
- **AvatarDropdown XP progress bar:** XP progress bar now shows below rank badge in dropdown using `rankProgress.currentXp / rankProgress.nextRankXp`.
- **Dashboard character sheet attempt:** `RankHeroSection`, `ActionBar`, `RankLevelingHint` built. Dashboard reordered. **BUT QR code landed at position 7 (near bottom) — this is wrong. QR is how shoppers pay at POS. Fix is first job next session.**
- **`/shopper/ranks` page:** All 5 ranks shown with perks + "you are here" indicator. Linked from loyalty page.
- **Organizer Special badge:** `maxOrganizerDiscount` on SaleCard + sale detail page. 4 backend feed endpoints updated.
- **Specs created:** `claude_docs/design/RANK_PERKS_DISPLAY_SPEC.md`, `claude_docs/UX/SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md`

**S449** (2026-04-13) — Full rank perks system + P0/P1/P4 fixes:
- **Rank perks system shipped:** `rankUtils.ts`, hold enforcement (rank-based duration snapshot), wishlist cap (server-side), legendary early access (0/0/2/4/6h by rank), Hall of Fame endpoint + page, RankBenefitsCard + RankUpModal, `getRankDashboardConfig()`
- **3 new migrations:** rankUpHistory, holdDurationMinutes, legendary fields — need Railway deploy
- **Rank staleness P0:** JWT rank sync + AuthContext.updateUser() — nav rank updates live on XP earn
- **Scout Reveal:** interestedUsers returned + results panel on item page
- **Organizer discount badge:** Teal pill on item detail + subtle pill on sale listing cards
- **Haul post test data seeded:** 3 posts for Alice (IDs 2-4) — Bump Post + Haul Unboxing QA-ready
- **Two push blocks** — first (10 files, S449 P0-P4), second (20 files, rank perks system)

**S448** (2026-04-13) — QA audit + Scout Reveal bug + rank naming locked:
- Scout Reveal is a hollow stub — XP spent, toast fires, nothing revealed. Backend never queries interest data. Full flesh-out queued for S449.
- Rank naming locked: **Initiate → Scout → Ranger → Sage → Grandmaster** (prior session dropped Initiate — that was the error; Ranger was always correct)
- "Save Passport" → "Save Profile" copy fix shipped
- Stripe sandbox: COMPLETED ✅
- Bump Post + Haul Unboxing: unverified (no test haul posts in DB)

**S447** (2026-04-13) — 3 dispatch batches, all shipped ✅

**S446** (2026-04-13) — XP frontend + workspace invite flow:
- Hunt Pass cancellation wired to Stripe webhook (exploit gate closed)
- XP earning rates + coupon tiers updated across 6 frontend pages
- 3 micro-sinks: Scout Reveal (5 XP), Haul Unboxing Animation (2 XP), Bump Post (10 XP)
- Organizer-funded discounts: 200/400/500 XP = $2/$4/$5 off; blocks shopper coupon stacking
- Workspace magic link invite: `/join?token=` page, Resend email, MyTeamsCard on dashboards, welcome banner
- WorkspaceMember schema properly fixed: `organizerId` nullable, `userId` added — no ghost organizer accounts for shoppers/new users
- ⚠️ Bump Post feed sorting pending (DB field set, feed sort not yet implemented)

**S445** (2026-04-13) — XP economy redesign + workspace flows:
- 5 P0 fraud gates shipped (appraisal cap, referral gate, HP claw-back, device fingerprinting, chargeback)
- Workspace invite banner, staff delete, owner permissions gate, template fixes

**S444** (2026-04-13) — STAFF→MEMBER rename + workspace permissions fix.

---

## Action Items for Patrick

**NEW — S460 Push block (do this now):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add packages/frontend/components/InventoryItemCard.tsx
git add packages/frontend/lib/useEbayConnection.ts
git add "packages/frontend/pages/organizer/sales/[id]/index.tsx"
git add "packages/frontend/pages/organizer/edit-item/[id].tsx"
git add "packages/frontend/pages/organizer/add-items/[saleId]/review.tsx"
git add packages/frontend/components/PostSaleEbayPanel.tsx
git add packages/backend/src/controllers/ebayController.ts
git add packages/backend/src/services/exportService.ts
git add packages/backend/src/utils/ebayShippingClassifier.ts
git add packages/backend/src/routes/ebay.ts
git add packages/database/prisma/schema.prisma
git add "packages/database/prisma/migrations/20260414_ebay_shipping_classification/migration.sql"
git add claude_docs/strategy/roadmap.md
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git commit -m "feat: eBay push UI, QR watermark default, photo import fix, post-sale workflow, shipping classification"
.\push.ps1
```

- [ ] **Run S460 migration:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```
- [ ] **After deploy:** Settings → Sync eBay Inventory — enrichment pass now includes items with ≤1 photo, pulls all eBay photos
- [ ] **Artifact MI: disconnect + reconnect eBay** — gets new token with `sell.fulfillment` scope (stops 403 cron errors)
- [ ] **Run S455 migration** (still pending — `inInventory` rename + `isInventoryContainer` + `lastEbayInventorySyncAt`):
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```
- [ ] **git rm old library files** (from S455 rename):
```powershell
git rm packages/backend/src/services/itemLibraryService.ts
git rm packages/backend/src/controllers/itemLibraryController.ts
git rm packages/backend/src/routes/itemLibrary.ts
git rm packages/frontend/hooks/useItemLibrary.ts
git rm packages/frontend/components/LibraryItemCard.tsx
```

**NEW — S454:**
- [ ] **Add to Railway env vars:** `STRIPE_HUNT_PASS_PRICE_ID=price_1TLtY1LIWHQCHu75W9F23hVJ` (live)
- [ ] **Add to Railway env vars:** `STRIPE_GENERIC_ITEM_PRODUCT_ID=prod_UKZ2G21VhLJ3CE` (live)
- [ ] **Archive junk Stripe sandbox products** — keep only: Hunt Pass, FindA.Sale Teams, FindA.Sale Pro, FindA.Sale — Item Sale
- [ ] **Set up live Stripe webhooks** — live account has no webhooks yet (see S455 next session)
- [ ] ~~**Tell Claude your real organizer email**~~ — `survivor-seed.ts` already created (see Standing Notes)

**Carry-forward:**
- [ ] **Add `STRIPE_CONNECT_WEBHOOK_SECRET`** in Railway — Stripe Dashboard → Webhooks → Connected accounts endpoint
- [ ] **Decide: Followed Brands tab** — keep as "Brand Alerts", rename, or remove?
- [ ] **Decide: Sales Near You** — fix or remove permanently?
- [ ] **Decide: Bounties rewards — dollars, XP, or both?** (S440 open, still blocking)

---

## XP System — Current State

**Coupon tiers (locked D-XP-001):**
- 100 XP → $0.75 off $10+ | 2x/mo standard, 3x/mo Hunt Pass
- 200 XP → $2.00 off $25+ | 2x/mo standard, 3x/mo Hunt Pass
- 500 XP → $5.00 off $50+ | 1x/mo all users

**Micro-sinks (new S446):**
- Scout Reveal: 5 XP → see who flagged interest first on an item
- Haul Unboxing: 2 XP → celebratory animation on haul post share
- Bump Post: 10 XP → bumps haul post to feed top for 24h (feed sort pending)

**Organizer-funded discounts (new S446):**
- Spend 200/400/500 XP in item edit → puts $2/$4/$5 off the item
- Shopper coupon doesn't stack — best single discount wins

---

## What's Next (S460+)

**P0 — eBay sync architecture audit (Patrick flagged S458):** The current multi-pass approach (GetMyeBaySelling → separate GetItem per item) is wrong. Next session opens with `findasale-architect` researching the correct bidirectional sync design. Key questions: use `GetItems` batch calls (20/call) instead of 1/item? Switch to eBay Platform Notifications for real-time sold sync? What data is actually available from which API? Goal: single-pass import + webhook-based ongoing sync, replacing the polling cron.

**P1 — Verify S460 photo import fix:** After syncing, check items in eBay inventory — they should now show all photos, not just the cover. Railway logs will show `[eBay Enrich]` entries.

**P1 — Run S455 migration on Railway** (still pending — `inInventory` rename, `isInventoryContainer`, `lastEbayInventorySyncAt`). eBay inventory sync won't be fully live until this runs.

**P2 — Add Railway env vars:** `STRIPE_HUNT_PASS_PRICE_ID` + `STRIPE_GENERIC_ITEM_PRODUCT_ID` (live values, see Action Items).

**P2 — Live Stripe webhooks:** Register both webhook endpoints in LIVE Stripe Dashboard with correct event sets.

**P3 — Roadmap audit:** Dispatch `findasale-records` to update roadmap with all sessions since last roadmap update. Mark Patrick's human QA passes as verified.

**Carry-forward:**
- QA queue (S436/S430/S431/S427/S433) — still postponed
- Bump Post feed sort (Architect sign-off in place, dev pending)
- RankUpModal — not connected to AuthContext rank-change yet
- Legendary item flag — no organizer UI yet

---

## Recent Sessions

| Session | Date | Summary |
|---------|------|---------|
| S460 | 2026-04-14 | eBay push UI (3 locations), QR watermark default, photo import fix, PostSaleEbayPanel, shipping classification. 13 files. |
| S457 | 2026-04-14 | Pull to Sale fixed: embedding[] in create, inInventory=true filter in list query. |
| S456 | 2026-04-14 | eBay import fully working: Trading API auth, xmlVal regex fix, photos via GranularityLevel=Fine, CSP fix, 81 dupes removed. |
| S455 | 2026-04-13 | eBay sync button, library→inventory rename, Google OAuth auto-link, cart isolation fix. |
| S454 | 2026-04-13 | Hunt Pass → Stripe Subscription. Pricing page P0. POS catalog guard. |
| S452 | 2026-04-13 | eBay bidirectional sync: policy fetch, offer withdrawal, Phase 3 cron. Stripe env audit. Hunt Pass subscription gap flagged. |
| S451 | 2026-04-13 | Dashboard layout fix: QR inline, action buttons fixed, Compass icon, layout reordered. Catastrophic git push (1,708 files deleted) — recovered. |
| S450 | 2026-04-13 | Rank staleness P0 (JWT fix), dashboard character sheet attempt, /shopper/ranks, organizer badge, XP progress bar in nav. QR code landed wrong — fix is P0 next session. |
| S449 | 2026-04-13 | Rank staleness P0, Scout Reveal P1, discount badge P4, dashboard/perks specs, haul test data. 10 files. |
| S448 | 2026-04-13 | QA audit. Scout Reveal bug ID'd. Rank naming locked. 1-line fix. |
| S447 | 2026-04-13 | 3 dispatch batches: Early Access Cache, XP expiry, bump sort, cosmetics repricing, coupon enforcement, nav renames. |
| S446 | 2026-04-13 | XP frontend, 3 micro-sinks, organizer discounts, workspace magic link invite, WorkspaceMember schema fix |
| S445 | 2026-04-13 | XP economy redesign + 5 fraud gates + workspace invite flow |

---

## Brand Audit (still open) — Updated 2026-04-14

⚠️ **P0 SharePromoteModal has now been flagged 3 consecutive weeks** — still unresolved. Garage/auction/flea market organizers sharing via Nextdoor/Threads get "estate sale" copy. 1 existing function (`saleTypeLabel()`) already exists in that file — fix is ~10 lines.

**Current violation count: ~22 active** (was ~20 last week, +3 new, -1 fixed)

**New since last audit:**
- `subscription.tsx:205/517` — PRO upgrade copy says "large estate sale or auction" — ignores garage/flea market organizers
- `condition-guide.tsx:56` — Condition FAQ says "The estate sale organizer" — applies to all organizer types
- `organizers/[id].tsx` — 4 dark mode violations (missing `dark:` variants on header card and empty state) + 1 D-003 violation (empty state has no CTA)

**Fixed this cycle:** `typology.tsx` — 2 violations resolved ✅

Full audit: `claude_docs/audits/brand-drift-2026-04-14.md`

All ~25 fix items are dispatch-ready to `findasale-dev` — no decisions needed. Batches grouped in the audit file.
