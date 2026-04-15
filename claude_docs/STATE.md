# PROJECT STATE

Compression anchor. Active state only.
Historical detail: `claude_docs/COMPLETED_PHASES.md`

---

## Current Work

**S465 IN PROGRESS (2026-04-14) — Roadmap graduation audit + STATE.md compaction**

**S465 What happened:**
- **Roadmap graduation pass (v106 → v107):** Moved 31 features from "Only Human Left", Building, and UNTESTED sections into SHIPPED & VERIFIED based on ✅✅ dual QA marks. Newly graduated: #222 Dashboard Redesign, #225 Revenue/Metrics API, #229 AI Comp Tool, #236 Weather Strip, #246 Camera Coaching Banner, #247 AI Branding Purge, #248 FAQ Expansion, #250 Price Research Panel, #262 Tier Restructure, #149 Email Reminders. Plus 21 items from Only-Human-Left table already graduated earlier in session.
- **#245 Feedback Widget** moved to Rejected section (deprecated → replaced with micro-surveys).
- **STATE.md compaction:** Session narratives S428–S449 (~850 lines) archived to COMPLETED_PHASES.md. STATE.md rewritten from 1603 lines to ~250 lines.
- **Prior S464 context carried forward** (see Pending Patrick Actions below).

**S465 Files changed:**
- `claude_docs/strategy/roadmap.md` — v107 header, 10 new SHIPPED rows, 10 Building/UNTESTED removals, #245 → Rejected
- `claude_docs/STATE.md` — full compaction rewrite
- `claude_docs/COMPLETED_PHASES.md` — S428–S449 archive appended
- `claude_docs/patrick-dashboard.md` — sync to new STATE

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

1. **Pre-work smoke test (per CLAUDE.md §10):** Open finda.sale in Chrome. Touch dashboard, pricing, eBay flow, POS — catch any regression from S464 push before starting new work.
2. **S464 migration verification:** If Patrick ran the migration, push an item that exhausts all 5 category suggestions (e.g. "Whip-It butane" item) → confirm amber "eBay Category Needed" badge appears on sale detail.
3. **Broader eBay category coverage:** Push book (267 category), clothing, furniture items to verify S461–S464 hold beyond Contigo/travel-mug case.
4. **eBay sync batch refactor:** Dispatch findasale-dev to replace sequential GetItem loop (ebayController.ts ~2746–2895) with `GetMultipleItems` Shopping API batches of 20/call. Target: 86 items in 5 calls instead of 86. No schema change needed.
5. **Chrome QA clearing the Blocked/Unverified Queue** (see below) — none of these items require Patrick intervention; all need a Chrome session with the right test data.

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
