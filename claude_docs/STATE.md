# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

**S466 (2026-04-14) — Post-push triage: Add Items filter + eBay price priority; 6-item queue for next session**

**S466 What happened:**
- Patrick published a Celestion guitar speaker to eBay and discovered multiple listing-quality problems, plus "can't find the item in the app" after ending the listing on eBay.
- **Root cause #1 (surgical fix shipped):** `getDraftItemsBySaleId` filtered to `draftStatus IN ('DRAFT','PENDING_REVIEW')` — published items disappeared from Add Items (the organizer's mental home base for sale inventory). Filter removed; added `status`/`ebayListingId`/`listedOnEbayAt` to select so the existing "Live" chip renders for published items.
- **Root cause #2 (surgical fix shipped):** eBay push price priority was `aiSuggestedPrice → estimatedValue → item.price`. Patrick's explicit $285 was overridden by AI's $169.09. Inverted: `item.price` now wins when set and > 0; AI fields are fallbacks only for unpriced items.
- **6 items queued for next session — see Next Session Priority.**
- **No migrations this session. No schema change.**

**S466 Files changed (2):**
- `packages/backend/src/controllers/itemController.ts` — `getDraftItemsBySaleId` filter removed + 3 select fields added
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

**TOP OF SESSION — parallel dev dispatch for 6 eBay listing-quality items (S466 queue)**

Goal: run up to 4 dev agents in parallel where file ownership allows, sequential where they overlap. Per CLAUDE.md §7 Batch Dispatch Protocol, group by file ownership before dispatching.

**Pre-work (main session, before dispatch):**
1. Smoke test finda.sale in Chrome — confirm S466 fixes landed: Add Items shows published items with "Live" chip, and a re-pushed priced item hits eBay at the organizer-set price (not AI).
2. Read `packages/backend/src/controllers/ebayController.ts` lines 1490–1570 (push flow) and 2119–2250 (condition mapping) and 2346–2398 (aspect auto-fill) before writing dispatch specs. Grep for `getWatermarkedUrlWithQR` to find the watermark utility before writing Item 6.

**Dispatch groupings (4 parallel agents, 1 sequential group):**

**Agent A — ebayController.ts push-flow trio (SEQUENTIAL, single agent — all three items touch the same file):**
- **Item 1: Honor manual `ebayCategoryId`.** Current code at `ebayController.ts:1500-1510` uses stored ebayCategoryId first, then falls back to title-based auto-detection and caches the result. Problem: if a cached auto-detect was wrong and the organizer then picks a category via the new EbayCategoryPicker, the cached value can still win on re-push. Need to differentiate "picker-selected" (locked — never override) from "auto-detected-cached" (replaceable). Add a boolean like `ebayCategorySource: 'MANUAL' | 'AUTO'` (schema change — flag to architect before dispatch) OR simpler approach: always respect the DB value if set, and never auto-overwrite in the push path — only write on initial push when DB value is null.
- **Item 2: Condition grade → eBay enum respects `item.condition`.** `mapGradeToInventoryCondition` at line 2119 ignores `item.condition`. Grade S on a USED item currently ships as NEW. Fix: signature becomes `mapGradeToInventoryCondition(grade, condition)`. USED + S → USED_EXCELLENT (fallback chain). NEW + S → NEW. Update caller at line 1513.
- **Item 3: Aspect auto-fill quality.** `fillRequiredAspects` at line 2346 ships `enumValues[0]` as last resort → nonsense like Brand="RIC" / Type="Control Knob" on a speaker. Fix priority: (a) `item.brand`, `item.mpn`, `item.tags` values first (string-match against enum), (b) "Unbranded" / "Does Not Apply" for identifier-like aspects, (c) "Unspecified" for free-text, (d) enum[0] only for SELECTION_ONLY required aspects where eBay would otherwise reject. Log each auto-fill with source ("from tags" / "from brand field" / "from enum[0] fallback").

**Agent B — frontend push-flow toast (PARALLEL — touches frontend only):**
- **Item 4: "Failed to push" toast on success.** Grep frontend for the eBay push button/handler (likely in `components/PostSaleEbayPanel.tsx`, `pages/organizer/sales/[id]/index.tsx`, `pages/organizer/edit-item/[id].tsx`, and wherever the bulk push is called from review.tsx). Check the response handling. Backend returns `{ status: 'success' | 'error', ... }` per item in `results[]`. Frontend is misreading success as failure somewhere. Fix the conditional.

**Agent C — backend watermark utility (PARALLEL — touches util only):**
- **Item 6: Watermark QR sizing/position.** Grep for `getWatermarkedUrlWithQR` in `packages/backend/src/`. Shrink QR code width by ~30–40%; reposition so the QR sits under the ENDED banner in the bottom corner without overlapping. "FindA.Sale" text position unchanged. Test by pushing one watermarked URL through Cloudinary transformation and eyeballing the result. Coordinate with Patrick's reference image saved in S466 wrap notes.

**Needs Architect first — do NOT dispatch dev until architect returns:**
- **Item 5: eBay listing reconciliation.** No mechanism to detect when a seller ends a listing on eBay directly (eBay only pings checkout_complete). Patrick ended a test listing on eBay and the app still thought it was live. Architect spec needed for: polling cadence (cron? on-demand button? webhook alternative?), use of `GetMultipleItems` to batch-check stored ebayListingIds, state transitions (clear `ebayListingId` + `listedOnEbayAt`, do/don't flip `draftStatus` back, do/don't restore item to the sale feed, do/don't re-enable re-push). This touches sync logic — flag the red-flag veto gate (CLAUDE.md §10).

**Orchestrator handoff loop:**
- Dispatch A + B + C in parallel (single message, 3 Agent blocks).
- While they work, dispatch findasale-architect in parallel for Item 5 spec.
- When all four return, process per §7 Step 4 (roadmap rows, STATE.md Current Work, inline-fixes if <20 lines, compile changed-files list).
- Provide Patrick one consolidated push block covering all four agents' output.
- Item 5 dev dispatch happens AFTER architect returns, ideally in the same session if context allows.

**After the S466 queue is done:**
- Chrome QA: full "push a real item" flow across book (267), clothing, furniture categories — verify condition/aspect/price all land correctly.
- Chrome QA: watermark layout confirm (QR smaller, under ENDED banner, FindA.Sale text unchanged).
- eBay sync batch refactor: replace sequential GetItem loop (ebayController.ts ~2746–2895) with `GetMultipleItems` Shopping API batches of 20/call.
- Chrome QA clearing the Blocked/Unverified Queue (none require Patrick intervention).

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
