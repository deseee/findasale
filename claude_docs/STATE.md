# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

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

**S464 Patrick manual actions OUTSTANDING:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

Vercel env cleanup: delete old NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID and NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID; confirm live publishable key; confirm Railway STRIPE_TEAMS_MONTHLY_PRICE_ID.

---

## Recent Sessions

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

**TOP OF SESSION — Chrome QA S469 functional flow + S467 remaining verifications**

**1. Chrome QA — remaining S469 functional flow:**
- Advanced Setup → click "Use suggested defaults" → weight tiers auto-match → Save setup → verify persistence on reload.
- Toggle "Push as Draft" → push an item → confirm eBay creates unpublished offer (Seller Hub check).
- Select each merchant location source (Sale Address / Organizer / Existing) → push → verify correct location in payload.
- Description template with `{{DESCRIPTION}}` placeholder → push → verify eBay listing renders template wrapped around item description.
- Minor: investigate whether `1+ lb` through `5+ lb` policies classifying as `unknown` (only last `N+ lb` promoted to Infinity) is correct UX — check weight-tier parser behavior against Patrick's full policy list.

**2. S469 P2 bug — sticky save bar hidden behind footer:**
- `packages/frontend/pages/organizer/settings/ebay.tsx` — sticky bar container needs `z-50` so it renders above footer when at page bottom. <5 lines.

**3. Remaining S467 QA (carry over):**
- Push USED grade-S item → confirm eBay gets USED_EXCELLENT not NEW — needs item with weight set + policies configured (code-verified S480, live UNVERIFIED).
- Confirm watermark QR is smaller (85px) and bottom-right — needs successful push to verify on eBay listing photos (UNVERIFIED).

**4. eBay sync batch refactor:**
- Replace sequential GetItem loop (ebayController.ts ~2746–2895) with GetMultipleItems Shopping API batches of 20/call

**6. Chrome QA queue:**
- Full "push a real item" flow — book (category 267), clothing, furniture — verify condition/aspect/price land correctly
- PostSaleEbayPanel end-to-end (ENDED sale)

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
- Stripe Connect webhook config (items not marking SOLD after POS card payment — P2 since S421)
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
