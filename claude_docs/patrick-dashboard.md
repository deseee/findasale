# Patrick's Dashboard — Week of April 14, 2026

## What Happened This Week

**S483** (2026-04-15) — Admin dashboard rebuild + eBay settings bugs + Cost protection docs ✅

**eBay settings bugs — ✅ 3 fixed:**
- oz inputs no longer show browser spin buttons (changed to text type)
- Policy dropdowns now stick — selection persists after choosing
- "Use suggested defaults" weight-tier ranges corrected (1+ lb = 16–31 oz, 2+ lb = 32–47 oz, etc.)

**Admin dashboard — ✅ rebuilt with real business metrics:**
Your admin dashboard home page now shows: MRR by tier, today's revenue, 30-day transaction revenue, Hunt Pass revenue, organizer tier breakdown (SIMPLE/PRO/TEAMS counts), a full conversion funnel (Signups → Have Organizer → Created Sale → Published Sale → Paid Tier with % at each step), and 7-day sparklines for signups/revenue/new sales.

**4 Coming Soon admin pages — ✅ all implemented:**
- **Reports:** Organizer performance table (sortable by revenue, sales, sell-through, last active; tier badges; CSV export) + Revenue breakdown by 7d/30d/90d with daily chart
- **Items:** Global search across all items with photo thumbnail, status, price, organizer, sale info, pagination
- **Broadcast:** Send emails to specific audiences (All users, Organizers, Shoppers, PRO, TEAMS) with live recipient count preview before sending
- **Feature Flags:** Toggle product features on/off with optimistic UI — NOTE: needs schema migration before backend works (see below)

**eBay rate limiter — ✅ shipped:**
eBay API now has an in-memory daily call counter. Soft cap at 4,500/day (eBay's limit is 5,000). If a bug or bulk import hits the cap, pushes return a clean "rate limited" error instead of exhausting your quota and breaking eBay for the rest of the day.

**Cost protection playbook — ✅ written:**
All 8 services (Cloudinary, Google Vision, Anthropic, Railway, Vercel, eBay API, Stripe, Resend) documented with exact URLs, step-by-step instructions for spending caps and alerts, and a viral spike response plan. See `claude_docs/operations/cost-protection-playbook.md`. 7 quick-action items for you to do manually (links are all in the doc).

**Organizer signals spec — ✅ written:**
Full spec for expansion readiness scoring (when to nudge SIMPLE → PRO, PRO → TEAMS) and churn risk scoring for the admin dashboard. 4 proactive expansion signals: fee savings breakeven math, capacity trajectory (trending toward limit before hitting it), feature gap (high-GMV organizer never used Smart Pricing), velocity acceleration (doubled sale frequency). Ready for schema + dev dispatch when you want it.

**Schema work pending (Patrick action required):**
Architect designed 4 new tables: FeatureFlag (needed for feature flags backend), PwaEvent (PWA metrics), OrganizerScore (expansion/churn scoring), ApiUsageLog (replace in-memory AI/Cloudinary cost trackers with DB persistence). These are NOT in schema.prisma yet — dispatch Architect+Dev next session or the session after.

**15 files changed total. Push blocks below.**

---

**S482** (2026-04-15) — Camera UI overhaul: settings pill, toast fix, pinch zoom, iPad fullscreen ✅
- **Toast fix — ✅ done.** Toasts were firing inside the header zone (top-4 = 16px, header is 48–64px tall), covering the notification bell and hamburger. Now clears the header: `top-14` mobile / `top-20` desktop.
- **Camera settings redesigned — ✅ done.** The old torch-button-in-top-bar approach caused X button to be covered on devices with torch. Full redesign:
  - X button always top-left, never covered.
  - Gear icon top-right opens a **vertical pill** that drops down from the gear.
  - Pill contains: Flash/Torch cycle, White balance (with sub-chips extending left), Timer, Corner guides toggle, Level indicator toggle, Switch camera.
  - **Torch merged into flash cycle:** Off → On → Auto → Torch (4-step cycle, one button). Torch step hidden on devices that don't support it.
  - White balance sub-chips now correctly clickable (were broken due to wrong positioning context — fixed by moving inside pill as child).
  - Tap outside or re-tap gear to close.
- **iPad now fullscreen — ✅.** Camera was switching to modal at 768px (iPad portrait). Bumped modal treatment from `md:` to `lg:` breakpoints.
- **Settings button was unclickable — ✅ fixed.** Two separate bugs: (1) viewfinder had no z-index and was stacking above top bar in DOM paint order — fixed with `z-0`; (2) settings panel had `z-19` which isn't a valid Tailwind class (compiled to nothing) — fixed to `z-30`.
- **Level indicator is now live — ✅.** Was a static line. Now reads device gyroscope, rotates an 80px bar: amber within ±2°, white ±2–10°, red beyond. Cleans up on unmount, handles iOS 13+ permission.
- **Pinch-to-zoom fixed — ✅.** Browser was claiming the pinch gesture as a page zoom. Added `touch-action: none` to the viewfinder — all pinch events now handled by the camera's custom zoom logic.
- **Zoom pill added — ✅.** `0.5×/1×/2×/3×` tap targets centered between the bottom corner brackets. Shows only levels the device actually supports. Hidden entirely if zoom not supported.
- **2 files changed (RapidCapture.tsx, ToastContext.tsx). Zero TypeScript errors.**

**Next session — push S482 first, then fix 3 eBay settings bugs:**
- Bug A: oz inputs show as number spinners (up/down arrows) — should be plain text inputs
- Bug B: Policy dropdowns open but can't select — stays at "-- Select policy --"
- Bug C: "Use suggested defaults" not matching lb-weighted policies to correct oz ranges (1+ lb = 16–31oz, 2+ lb = 32–47oz, etc.)

---

**S481** (2026-04-15) — AI camera improvements batch + trails security + Hubs nav ✅
- **Trails security — ✅ fixed.** Anyone could see, edit, and delete other people's Treasure Trails at `/shopper/trails`. The public endpoint returned all trails with no ownership check. Fixed: new authenticated `/trails/mine` endpoint filters by your user ID. Edit/Delete buttons now check `trail.userId === user.id` — other people's trails are read-only.
- **Hubs nav move — ✅ done.** Market Hubs removed from the general organizer nav section and moved into the TEAMS block in both the avatar dropdown and mobile nav. Icons changed from purple to grey to match the TEAMS section style.
- **AI camera batch (7 improvements) — ✅ all shipped:**
  - **Dark/glass items:** Google Vision now runs TEXT_DETECTION alongside LABEL_DETECTION — catches brand marks and etched text on glass, dark ceramics, and transparent items. If fewer than 3 usable labels come back, Haiku is told to reason from silhouette and shape instead of guessing blindly.
  - **Pricing anti-anchor:** Removed the "estate sale / 20–50% of retail" framing that was pulling prices toward round numbers. Prices are now grounded in actual secondary market comps (real sold items from your DB by category). Example JSON in the prompt changed from `$15` to `$14` — breaks the model's round-number bias.
  - **Comp-based price refinement:** After AI tags an item, the system fetches the 5 most recent sold items in that category and runs a `suggestPrice` call to override the raw AI price with a market-informed one. Requires at least 2 comps to trigger.
  - **Condition grade visual checklist:** The AI now assesses scratches, chips, color fading, rust, missing parts, and signs of repair — not just "good/fair/poor" intuition.
  - **Tag grouping:** In the Review page, suggested tags are now displayed in labeled groups — Material, Era, Brand, Style, and Other — instead of a flat unlabeled list.
  - **Within-session suppression:** If you remove a suggested tag twice, it stops appearing for the rest of that session. The system learns your preferences as you work.
  - **Condition-adjusted pricing:** Clicking a condition grade (S/A/B/C/D) on the review page now silently re-fetches a price suggestion adjusted for that grade. Price field updates automatically. Grade buttons dim while refreshing.
- **9 files total. Zero TypeScript errors.**

---

**S480** (2026-04-15) — S468 status card fix + photo lightbox + Item 5 confirmed done + eBay push error toast fix ✅
- **S468 status card — ✅ fixed.** The "Business Policies" card on Settings → eBay now shows green ✓ when you've synced policies. Root cause: `/api/ebay/connection` was stripping 4 policy fields from its JSON response. Added them, simplified display condition to `policiesFetchedAt`. 2 files.
- **Photo lightbox — ✅ shipped.** Clicking any photo in the item editor now opens a full-screen overlay. Escape-to-dismiss, close button, `cursor-zoom-in` hint. You verified it works. 1 file.
- **Item 5 reconciliation — ✅ already done.** Verified the full implementation was already in S467. No new code needed.
- **NudgeBar — ✅ confirmed.** Organizer suppression working. Nudge bar does not show for organizer accounts.
- **eBay Advanced Setup save bar — ✅ browser-confirmed.** The bar renders at the bottom of the browser — confirmed by setting it to hot-pink and you said "it's pink." The screenshot tool has a blind spot at the viewport bottom (browser chrome offset). Bar is real and functional.
- **eBay push error toast — ✅ P2 fixed.** The item editor's "Push to eBay" button was always showing a generic "Failed to push item" error even when the backend sent a specific error code. Root cause: frontend checked `result.error` but backend sends `result.code` + `result.message` — `error` field never exists. Fixed in `edit-item/[id].tsx`. Now correctly shows "eBay not connected" or "eBay policies not configured" for the right error codes, with `result.message` as fallback. Also fired a live push to confirm the fix — backend returned `NO_FULFILLMENT_POLICY_MATCH` (test item has no weight set), which the fix now surfaces correctly instead of falling through to generic.
- **USED_EXCELLENT condition — ✅ code-verified, ⚠️ live unverified.** `mapGradeToInventoryCondition` correctly returns `USED_EXCELLENT` for grade S + condition=USED. Can't verify on eBay yet because the test item has no weight set — the push fails before reaching condition logic.
- **S469 sticky save bar — ⚠️ P2 noted.** Bar hides behind footer when scrolled to very bottom. Save still works. Fix next session (z-index, <5 lines).
- **4 files total this session.**

---

**S479** (2026-04-15) — Chrome QA of S467/S468/S469 ✅ mostly, ⚠️ one bug found
- **S467 rarity filter fix — ✅ verified.** Celestion Vintage 30 G12 (ULTRA_RARE) now visible on Add Items page as Artifact MI. Organizer no longer loses sight of their own ULTRA_RARE items during the 6h Hunt Pass window.
- **S469 Advanced Setup page — ✅ verified.** All 8 sections render on `/organizer/settings/ebay`: default policies dropdown (22 real policies populated), weight-tier matrix, shipping classification overrides, category overrides, description template, draft-mode checkbox, merchant location radio (3 options, Sale Address pre-selected), sticky "Save setup" bar. No app-level console errors.
- **S468 policy sync — ⚠️ partial.** The sync endpoint works — 22 real eBay business policies ARE in the DB and populating the Advanced Setup dropdowns (e.g. "No Return Accepted (295102147011)", "1 lb Ground Advantage", "6+ lb Ground Advantage"). But the "Business Policies" status card on the main Settings → eBay tab still shows `⚠ No policies synced` even after a successful sync. **Root cause located:** `GET /api/ebay/connection` response strips `fulfillmentPolicyId`, `returnPolicyId`, `paymentPolicyId`, and `policiesFetchedAt` from its payload — the frontend status card gates its green ✓ on those undefined fields. ~30 line fix across 2 files. Routed to dev next session.
- **Minor note:** Your `1+ lb` through `5+ lb` Ground Advantage policies are classified as `unknown` by the weight-tier parser — only the highest `N+ lb` tier gets promoted to Infinity per S469 design. May be working as intended, but worth checking when you click "Use suggested defaults" that the auto-match gets every tier covered.
- **No code changes this session.** Just QA + doc updates.

---

**S469** (2026-04-15) — eBay Phase 1-3 Foundation: Policy Routing + Weight Tiers + Draft Mode + Setup UI ✅
- **The problem you flagged:** I picked the "first payment policy" as a shortcut. Your real-world account has 22 shipping policies named by weight tier ("8oz Ground Advantage", "1+ lb Ground Advantage", "6+ lb Ground Advantage", "Freight 150+ lb Freight"). eBay also supports 10 description templates per seller. One-policy-wins is not automation — it's a guess.
- **The architecture shipped:** New `EbayPolicyMapping` model (separate from EbayConnection) lets you configure: default fulfillment/return/payment policies, weight-tier routing table, shipping classification overrides (HEAVY_OVERSIZED / FRAGILE / UNKNOWN), category-specific overrides, description template (with `{{DESCRIPTION}}` placeholder), draft-mode toggle, merchant location source (Sale Address / Organizer Address / Existing eBay location).
- **Per-item policy resolution priority:** category override → HEAVY_OVERSIZED override → FRAGILE override → weight-tier match → UNKNOWN override → default fulfillment → EbayConnection fallback. Every push now picks the right policy based on the actual item's weight and classification.
- **Weight-tier parser:** Automatically parses your policy names ("8oz", "1+ lb", "6+ lb") into ranges and matches item `packageWeightOz` to the correct tier. Last "N+ lb" tier is promoted to Infinity (catches everything heavier).
- **New setup page:** `/organizer/settings/ebay` — 8 sections covering defaults, weight tiers (with "Use suggested defaults" button that auto-matches your policies), classification overrides, category overrides, description template, draft mode, merchant location, sticky save bar. Linked from your main Settings page as "Advanced eBay Setup →".
- **Draft mode:** Toggle "Push as Draft" to create unpublished Offers on eBay — you can review/edit in Seller Hub before publishing. Unchecked = auto-publish (current behavior).
- **3 parallel dev agents shipped this session:** non-overlapping file ownership, all returned zero TypeScript errors. Main session verified schema fields, new exports, route registration.
- **Migration required** before testing — block below.
- **Files changed:** 7 (2 new frontend files, 1 new backend util, 1 new migration). Push block below.

---

**S468** (2026-04-15) — eBay policy sync UI + /sync-policies route ✅
- **Confirmed push flow was already correct:** `conn.paymentPolicyId/fulfillmentPolicyId/returnPolicyId` are used in the push call at lines 1648–1650 of ebayController.ts, with a hard validation gate at line 1392. Schema already had all fields. The "Free Standard Shipping" issue on the Celestion listing was because the policy fields were never populated on your EbayConnection row.
- **What shipped:** `POST /api/ebay/sync-policies` route (authenticated) + "Business Policies" block on settings page with green ✓ when synced, amber warning with eBay link when missing, "Sync from eBay" button. `fetchAndStoreEbayPolicies()` was already implemented — just needed `export`.
- **No schema changes. 3 files.**

---

**S467** (2026-04-15) — eBay listing quality batch (all 6 items) + sitewide organizer rarity filter fix ✅
- **P0 bug found:** Your Celestion ($285, ULTRA_RARE) was invisible on ALL your organizer management pages because they were all calling the public browsing endpoint — which runs the Hunt Pass rarity filter (ULTRA_RARE items hidden for 6 hours unless shopper has Hunt Pass). You correctly identified this should be sitewide. Fixed: all 7 organizer pages (Add Items, Sale Detail, Print Kit, Promote, Print Inventory, Bounties, Dashboard) now call the authenticated `/items/drafts` endpoint. Public browsing stays filtered — Hunt Pass early access still works. Buyer Preview still shows the shopper view.
- **Item 1** (manual category): No bug. Code already respects your picker selection.
- **Item 2** (condition fix): Grade S + condition=USED now pushes to eBay as USED_EXCELLENT not NEW.
- **Item 3** (aspect quality): Brand now checks your item.brand field first. MPN checks item.mpn. Tags matched against enum values. No more Brand="RIC" on a Celestion speaker.
- **Item 4** (toast fix): "Failed to push" showing on success — fixed in 3 files (was checking `result.success` instead of `result.status === 'success'`).
- **Item 5** (reconciliation): When you end a listing on eBay directly, the app now detects it. Cron runs every 4 hours + you can trigger it manually via `/api/ebay/sync-ended-listings`. When detected: clears `ebayListingId`, sends in-app notification, item becomes re-listable. No schema changes.
- **Item 6** (watermark): QR resized 130→85px, moved from bottom-center to bottom-right corner.
- **Files changed:** 19 files. Push block below.

---

**S466** (2026-04-14) — Post-push triage: Add Items filter fix + eBay price override fix ✅
- **Problem you hit:** Pushed a Celestion guitar speaker to eBay, ended the listing on eBay, then couldn't find the item in the app. Also flagged a long list of listing-quality problems (wrong category, nonsense aspects like Brand="RIC" and Type="Control Knob", condition miscategorized as NEW when it was USED grade S, and $285 saved → $169.09 on eBay).
- **Root cause — missing item:** Add Items was filtering out everything you'd already published. The backend's `getDraftItemsBySaleId` hardcoded `draftStatus IN ('DRAFT','PENDING_REVIEW')`. Once you pushed an item to eBay, it flipped to PUBLISHED and vanished from your working view. Your mental model (Add Items is home base for the whole sale regardless of publish state) is correct — fixed.
- **Root cause — price override:** eBay push was resolving price as `aiSuggestedPrice → estimatedValue → item.price`. Your explicit $285 got overridden by an earlier AI guess of $169.09. Inverted: your price now wins when set; AI fields are fallbacks only for items you never priced.
- **What did NOT ship this session:** The other 5 listing-quality issues (manual category override, condition mapping, aspect auto-fill, "Failed to push" toast on success, reconciliation) plus the watermark QR resize (6th item). All queued for next session as a parallel dev dispatch — plan in STATE.md "Next Session Priority."
- **Files pushed:** 2 (itemController.ts, ebayController.ts).

---

**S465** (2026-04-14) — Roadmap graduation audit + STATE.md compaction ✅
- **31 features graduated to SHIPPED & VERIFIED:** Audited the roadmap (v106 → v107) for features with both ✅ Claude QA and ✅ Human QA marks. Moved 10 more items from the Building/UNTESTED sections plus 21 already-graduated items from "Only Human Left" into the SHIPPED & VERIFIED table. Newly graduated this pass: #222 Dashboard Redesign, #225 Revenue/Metrics API, #229 AI Comp Tool, #236 Weather Strip, #246 Camera Coaching Banner, #247 AI Branding Purge, #248 FAQ Expansion, #250 Price Research Panel, #262 Tier Restructure, #149 Email Reminders.
- **#245 Feedback Widget deprecated:** Moved from Building to Rejected section. Decision: replaced with planned micro-surveys approach (less intrusive, contextual).
- **STATE.md compacted from 1603 → 150 lines:** Sessions S428–S449 (~850 lines of narrative) archived to `COMPLETED_PHASES.md`. STATE.md rewritten to compact structure: Current Work / Recent Sessions one-liners / Go-Live Blockers / Next Session Priority / Blocked-Unverified Queue / Standing Notes. Complies with T5 size rule.
- **No code changes this session.** Pure documentation pass. S464 code/migration from earlier today still needs your manual actions (below).

---

**S464** (2026-04-14) — ebayNeedsReview, billing webhook fix, Stripe env cleanup, eBay retry hardening ✅
- **ebayNeedsReview:** When eBay push exhausts all 5 category suggestions with error 25005 (non-leaf category), the item is now flagged in the DB and the sale detail page shows an amber "⚠ eBay Category Needed" badge. The push button switches to "Set Category" with an amber color. When you push successfully later, the flag clears. Migration added: `20260414_ebay_needs_review` — **you must run this before testing.**
- **Billing webhook secret fixed (P0):** The billing webhook was using the wrong signing secret (`STRIPE_WEBHOOK_SECRET` instead of `STRIPE_BILLING_WEBHOOK_SECRET`). This meant every incoming subscription event (subscribe, cancel, renew) would fail signature verification and be silently dropped. Fixed. Make sure `STRIPE_BILLING_WEBHOOK_SECRET` is set in Railway with the correct signing secret from the `/api/billing/webhook` endpoint in Stripe live dashboard.
- **Stripe price IDs from env vars:** The pricing page now reads price IDs from `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` and `NEXT_PUBLIC_STRIPE_TEAMS_PRICE_ID` (you added these to Vercel). Old hardcoded test IDs gone. You can now delete the old Vercel vars: `NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID` and `NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID`.
- **eBay retry hardening:** Rewrote the 25005/25021 retry as two independent passes instead of a chained `else if` (Pass 1 = 25021 condition retry, Pass 2 = 25005 category candidates — always runs after Pass 1). Offer PUT now fetches the existing offer first before merging changes (fixes a bug where sending only `{ categoryId }` wiped all other offer fields and caused 25002 "currency missing" error).
- **itemController.ts fix:** The `/items?saleId=` endpoint wasn't returning `ebayListingId` or `ebayNeedsReview` — both were undefined in the frontend. Fixed.
- **Roadmap updated to v106:** New rows #292–#295 (Post-Sale Panel, Listing Data Parity, Live Category Picker, ebayNeedsReview). Feature #25 and #244 notes updated.

**The Whip-It item:** All 5 eBay category suggestions for "Whip-It butane lighter fuel" come back as branch (non-leaf) categories — there's no good leaf category for this product in eBay's tree. After S464 ships, this item will show the amber "⚠ eBay Category Needed" badge on the sale detail page, which is exactly the right behavior. You'll need to set the category manually in the item editor.

---

**S463** (2026-04-14) — Static eBay category picker retired, eBay sync architecture spec, roadmap audit ✅
- **Live eBay category picker shipped:** `EbayCategoryPicker.tsx` now calls the Taxonomy API as you type (400ms debounce), shows real leaf categories with IDs from eBay. The old 120-entry static JSON (with wrong IDs on several categories) is gone. `ebayCategoryMap.ts` deleted. `getEbayCategoryId()` and all 3 call sites removed. New `GET /api/ebay/taxonomy/suggest?q=...` endpoint added.
- **eBay sync architecture spec:** The sequential GetItem enrichment loop (86 API calls, ~9 seconds) should be replaced with `GetMultipleItems` Shopping API (5 calls, ~1-2 seconds). Webhook code to retire the 15-min polling cron already partially exists. Next dev dispatch: implement the batch refactor.
- **Roadmap updated to v105:** Human QA marks added for S450 rank display, S451 dashboard layout, S454 Hunt Pass Stripe, S456 eBay import, S461 Contigo push.
- **QA deferred:** You indicated you'll Chrome-QA S462 listing parity yourself. Any failures become S464 fix items.

---

**S462** (2026-04-14) — eBay Listing Data Parity (Phases A + B + C shipped) ✅ (pending Chrome QA)
- **The problem you caught:** Our FAS-pushed Contigo mug showed "Free Standard Shipping" and "Grand Rapids, MI" pickup — both wrong. Meanwhile, a native eBay listing from the same account (Spawn #4 comic) showed real calculated shipping, the correct Fox Island pickup location, rich HTML description, 18+ item specifics, catalog match, and "or Best Offer." Our push was technically working but producing low-credibility listings. Your call: "i'd rather be right than fast."
- **What shipped (Phase A — code-only fixes):**
  - Merchant location now queries your real eBay location first, falls back to the Sale's structured address, never hardcodes Grand Rapids.
  - Business policy picker filters to EBAY_US marketplace + prefers the policy you marked as default (not `[0]` alphabetized).
  - HTML descriptions now sanitize instead of strip — rich formatting carries through to eBay.
  - Condition description builds from grade + notes + description excerpt + tags (used to be enum-only).
  - Secondary category auto-adds for vintage/antique/handmade/rare/collectible tags.
- **What shipped (Phase B — schema additions, 17 new Item fields + 2 EbayConnection fields):**
  - Package dimensions (weight oz, L/W/H, package type) → unlocks real calculated shipping.
  - Product identifiers (UPC, EAN, ISBN, MPN, brand, EPID) → unlocks catalog match + product ratings box.
  - Best Offer opt-in (with auto-accept/auto-decline thresholds) — opt-in only, never forced.
  - Condition notes, secondary category, subtitle (55-char paid upgrade).
  - Organizer-facing "Edit eBay" form on the post-sale panel with 3 collapsible sections (Product Details / Shipping / Offers), client validation (UPC 12 digits, ISBN 10/13), dark mode, sage palette.
- **What shipped (Phase C — new service layer):**
  - eBay Taxonomy API integration with 24h cache (`get_item_aspects_for_category`).
  - eBay Catalog API search by GTIN or MPN+brand → returns top 3 matches for catalog hit.
  - Haiku-powered "Auto-fill" suggest for brand/UPC/MPN from title + description + tags. Skips already-filled fields. Labeled "Auto-fill" per your rule — never says "AI."
  - 3 new endpoints: `/api/ebay/taxonomy/aspects/:categoryId`, `/api/ebay/catalog/search`, `/api/ebay/suggest/identifiers`.
- **Answers to your four decisions:** (1) Phase B+C now ✅ (2) HTML allowlist = standard safe tags + tables for comic-seller specs ✅ (3) Best Offer opt-in only ✅ (4) Missing Sale.address blocks push with clear error ✅.
- **Migration ran:** `add_ebay_listing_parity_fields` applied to Railway production DB. All fields nullable/defaulted — existing items unaffected.
- **Rollback plan:** code revert reverses Phases A+C cleanly. Phase B migration is additive/nullable so rollback is non-destructive.
- **Chrome QA queued for you** — you asked to drive the QA. Test flows: (1) push a Contigo-like item with UPC + package dimensions + Best Offer enabled, verify eBay shows calculated shipping + catalog match + offer button. (2) push an item with zero package dims → confirm "Calculated shipping unavailable" warning (or block, depending on policy). (3) open "Edit eBay" panel, click Auto-fill, verify brand/UPC suggestions. (4) verify merchant location reads your real eBay location, not Grand Rapids.
- **Files pushed:** 12 (schema.prisma, migration.sql, ebayController.ts, itemController.ts, ebayTaxonomyController.ts + service + routes, index.ts, PostSaleEbayPanel.tsx, package.json, pnpm-lock.yaml, ADR doc).

---

**S461** (2026-04-14) — eBay push end-to-end WORKING (6 rounds of fixes) ✅
- **Verified live:** Contigo Stainless Steel Travel Mug published to eBay successfully. Category 177006 (Mugs), condition NEW_OTHER (after retry), Brand="Contigo" + Color="Black" auto-filled from title.
- **Why it kept breaking:** Each fix revealed the next layer. (1) Static map returned branch categories, not leaf IDs. (2) No API call for items we created ourselves. (3) Taxonomy API required app token, not user token. (4) `LIKE_NEW` is media-only and was being sent for hard goods. (5) Even after (4), stale offer state from earlier failures persisted. (6) eBay categories require specific item aspects (Type, Brand, Color) that we weren't sending.
- **Fix 1 ✅:** Capture eBay's numeric CategoryID on import and prefer it on push.
- **Fix 2 ✅:** For items we create in FindA.Sale, call eBay Taxonomy API to get a real leaf category from the title.
- **Fix 3 ✅:** Swapped Taxonomy call from user token → app token (user token lacks `commerce.taxonomy` scope).
- **Fix 4 ✅:** Grade "Like New" (A) now maps to `USED_VERY_GOOD` instead of `LIKE_NEW` (media-only). Before every push we hit eBay's condition-policies API and auto-remap if needed. Cached in memory.
- **Fix 5 ✅:** Three safety nets — (a) GET inventory_item back after PUT and log `sent=X stored=Y`, (b) if existing offer has wrong categoryId, DELETE and recreate, (c) 25021 retry loop walks remaining accepted conditions until one publishes.
- **Fix 6 ✅:** Programmatic required-aspect population. Before publish, call Taxonomy API `get_item_aspects_for_category` to get required aspects for the target category. Smart-fill from title/description with keyword matching. Brand defaults to "Unbranded" if available, FREE_TEXT non-brand defaults to "Unspecified", SELECTION_ONLY defaults to first enum value.
- **Verification log excerpt:**
  ```
  [eBay RequiredAspects] category 177006: 3 required (Type, Brand, Color)
  [eBay AspectFill] Brand="Contigo" (auto-filled)
  [eBay AspectFill] Color="Black" (auto-filled)
  [eBay Retry25021] succeeded with condition=NEW_OTHER
  ```
- **Known minor issues (queued, not blocking):** USED_VERY_GOOD false-positive from Metadata API (retry loop handles it, one wasted API call per push). Static EbayCategoryPicker still in use. `ebayCategoryMap.ts` is dead code. In-memory caches clear on Railway restart.
- **Queued for next session:** Retire static picker (use live Taxonomy search), delete dead `ebayCategoryMap.ts`, optionally persist condition/aspect caches to DB, cache last-successful condition per category, end-to-end organizer QA across book / clothing / furniture categories.

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

**✅ All S464 manual actions COMPLETE (verified S465).** Migration run, Vercel + Railway env clean, all live Stripe keys/IDs confirmed by screenshot.

**✅ All Go-Live env blockers CLOSED (S465).** Live webhooks registered, signing secrets match, publishable key is `pk_live_...`, `STRIPE_HUNT_PASS_PRICE_ID` and `STRIPE_GENERIC_ITEM_PRODUCT_ID` are live values, Resend + MailerLite keys present on Railway.

**Remaining open checklist items (non-blocking):**
- [ ] **Archive junk Stripe test products** (P3) — keep: Hunt Pass, Teams, Pro, Item Sale. Delete the rest.
- [ ] **Chrome QA walkthrough:** eBay push with book/clothing/furniture items (beyond Contigo), PostSaleEbayPanel on an ENDED sale, watermark layout after S465 fix (QR above text, no overlap).

**Carry-forward from S463:**
- [ ] **STEP 2 Broader category test:** Push a book, clothing item, and furniture item to verify Phase A/B/C holds
- [ ] **STEP 0 Chrome QA:** Walk S462 eBay listing parity (PostSaleEbayPanel → Edit eBay → Auto-fill → Push)

**NEW — S461 Session wrap push block (do this now):**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale
git add claude_docs/STATE.md
git add claude_docs/patrick-dashboard.md
git add claude_docs/.last-wrap
git add claude_docs/audits/brand-drift-2026-04-14.md
git add claude_docs/design/SHOPPER_DASHBOARD_RETHINK_UX_SPEC.md
git add claude_docs/feature-notes/adr-ebay-sync-architecture.md
git commit -m "docs(s461): wrap eBay push fixes (6 rounds) + brand audit + shopper dashboard spec + eBay sync ADR"
.\push.ps1
```

*(Note: eBay Fix 6 code in `ebayController.ts` was already pushed and verified live during S461 — no code files in this wrap push.)*

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

## What's Next (S466+)

**✅ Go-Live env gate CLOSED (S465).** All P0 and P1 environment blockers cleared:
- S464 migration applied
- Live Stripe webhooks registered (both endpoints, correct events)
- Signing secrets match Railway env
- `pk_live_...` publishable key on Vercel
- Live `STRIPE_HUNT_PASS_PRICE_ID` + `STRIPE_GENERIC_ITEM_PRODUCT_ID` on Railway
- Resend + MailerLite keys present on Railway

Live payments can now transact end-to-end. Remaining work is behavioral QA (Chrome walkthroughs) and a Stripe catalog cleanup — not blockers.

**P1 — Patrick Chrome QA:** Walk S462/S463/S464 eBay flow (PostSaleEbayPanel → Edit eBay → Auto-fill → Push). Also test: push an item with no good eBay leaf category → verify amber badge.

**P1 — Broader category test:** Push a book, clothing item, furniture item to verify Phase A/B/C holds beyond Contigo.

**P2 — eBay sync batch refactor:** Replace sequential GetItem loop with `GetMultipleItems` batches (20/call). 86 API calls → 5. Dev dispatch ready (spec from S463).

**P2 — Vercel/Railway env cleanup** (see Action Items).

**Carry-forward:**
- QA queue (S436/S430/S431/S427/S433) — still postponed
- Bump Post feed sort (Architect sign-off in place, dev pending)
- RankUpModal — not connected to AuthContext rank-change yet
- Legendary item flag — no organizer UI yet

---

## Recent Sessions

| Session | Date | Summary |
|---------|------|---------|
| S465 | 2026-04-14 | Roadmap graduation audit (31 features to SHIPPED & VERIFIED, v107). #245 Feedback Widget → Rejected. STATE.md compacted 1603→150 lines. S428–S449 archived to COMPLETED_PHASES.md. |
| S464 | 2026-04-14 | ebayNeedsReview flag + amber badge, billing webhook secret fix, Stripe price IDs from env vars, two-pass 25005/25021 retry, offer PUT merge fix, roadmap v106 |
| S463 | 2026-04-14 | Live eBay category picker shipped (Taxonomy API), ebayCategoryMap.ts deleted, eBay sync batch architecture spec (GetMultipleItems), roadmap audit v105 |
| S462 | 2026-04-14 | eBay Listing Data Parity A+B+C: merchant location fix, policy picker, HTML sanitizer, 17 schema fields, PostSaleEbayPanel, taxonomy service, catalog API, Auto-fill suggest |
| S461 | 2026-04-14 | eBay push end-to-end WORKING (6 rounds): CategoryID capture, Taxonomy API, app-token fix, condition remap, stale offer cleanup, 25021 retry, required aspect auto-fill. Contigo mug published ✅ |
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
