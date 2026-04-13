# ADR — B1: Sale Type → Item Listing Type — 2026-03-10

Backlog ref: B1 | Gates: B4 (auction reserves), D1 (quasi-POS), B7 (referral analytics)

---

## The Problem

`Sale.isAuctionSale Boolean` is a blunt instrument. It creates two problems:

1. **It can't describe real-world sales.** Estate sales routinely have a few auctioned items (jewelry, art) alongside fixed-price items. A yard sale might have a reverse auction on slow-moving goods by day two. The boolean forces an artificial "pure auction" vs "not auction" distinction.

2. **Fees calculated at the wrong level.** Fee is 5% (regular) or 7% (auction). If a sale is flagged `isAuctionSale = false` but contains auctioned items, those auction items bill at 5% — leaving 2% on the table.

Additionally, `isAuctionSale` gives no signal for yard vs estate vs flea market — all three are `false`. This limits discovery filtering and analytics.

---

## Current Schema State

```
Sale:
  isAuctionSale  Boolean  @default(false)  ← only type signal on sale

Item (type inferred from field presence, not explicit):
  auctionStartPrice  Float?
  currentBid         Float?
  auctionEndTime     DateTime?
  reverseAuction     Boolean  @default(false)
  isLiveDrop         Boolean  @default(false)
  ← no explicit listingType field
```

---

## Options Considered

**Option A — Replace `isAuctionSale` with `saleType String`, leave items as-is.**
Better discovery, but fee still can't be item-level. Doesn't solve mixed-format sales.

**Option B — Remove sale-level type entirely; items own all type signals.**
Maximum flexibility. Problem: sale cards on the browse page have no display category.
Shopper filtering ("show me auction sales") becomes expensive — requires joining all items.
Discovery and marketing tags are broken.

**Option C — Two-track: sale type for display/discovery, item listing type for transacting.**
Sale gets a display category (`saleType`) used on cards, filters, and analytics.
Item gets an explicit `listingType` used for bidding UI, fee calculation, and checkout flow.
These are independent — a sale can be `saleType = ESTATE` and still have items with
`listingType = AUCTION`. Fees are calculated per-item at purchase time.

---

## Decision: Option C

Two-track approach. Sale type answers "what kind of sale is this?"
Item listing type answers "how is this item sold?"

### Sale.saleType

Replace `isAuctionSale Boolean` with:

```prisma
saleType  String  @default("ESTATE")
// Values: ESTATE | YARD | AUCTION | FLEA_MARKET
```

Rules:
- ESTATE — estate or downsizing sale (default)
- YARD — yard/garage sale
- AUCTION — sale where most/all items are auctioned (organizer-selected)
- FLEA_MARKET — multi-seller / booth format

The organizer selects `saleType` during sale creation (replaces the current
"Is this an auction sale?" toggle). Display of auction UI on the sale card
is driven by `saleType = AUCTION` OR the presence of any item with
`listingType = AUCTION` in the sale.

### Item.listingType

Add to Item:

```prisma
listingType  String  @default("FIXED")
// Values: FIXED | AUCTION | REVERSE_AUCTION | LIVE_DROP | POS
```

Rules:
- FIXED — standard priced item (default)
- AUCTION — live bidding item (requires auctionStartPrice, auctionEndTime)
- REVERSE_AUCTION — daily declining price (requires reverseAuction fields)
- LIVE_DROP — item hidden until release time (requires liveDropAt)
- POS — cheap catch-all item captured via quick-capture flow (D1 — reserved for future)

The existing boolean/nullable fields (`reverseAuction`, `isLiveDrop`, `auctionStartPrice`)
remain in the schema for the current sprint but are treated as **deprecated** — they'll be
read by the new code as fallbacks only. Full cleanup migration in a future sprint after
all code paths migrate to `listingType`.

### Fee Calculation

**Decision: 10% flat — locked 2026-03-10.**

Fee is read from the `FeeStructure` DB table at Purchase creation time. Single row seeded at 10%. No per-type routing needed. Rate is configurable without code deployment.

| listingType | Fee |
|-------------|-----|
| FIXED | 10% |
| AUCTION | 10% |
| REVERSE_AUCTION | 10% |
| LIVE_DROP | 10% |
| POS | 10% of order total |

All-in with Stripe (~3.2%): **13.2%** — matches Etsy, well below eBay (17%) and MaxSold (33%).
Tier/subscription discounts: deferred post-beta.

---

## Schema Migration Plan

Migration file: `20260311000001_add_sale_type_item_listing_type`

```prisma
-- Phase 1: Add new columns with defaults
ALTER TABLE "Sale" ADD COLUMN "saleType" TEXT NOT NULL DEFAULT 'ESTATE';
ALTER TABLE "Item" ADD COLUMN "listingType" TEXT NOT NULL DEFAULT 'FIXED';

-- Phase 2: Backfill Sale.saleType from isAuctionSale
UPDATE "Sale" SET "saleType" = 'AUCTION' WHERE "isAuctionSale" = true;

-- Phase 3: Backfill Item.listingType from existing booleans/nullables
UPDATE "Item" SET "listingType" = 'AUCTION'
  WHERE "auctionStartPrice" IS NOT NULL AND "auctionEndTime" IS NOT NULL;
UPDATE "Item" SET "listingType" = 'REVERSE_AUCTION'
  WHERE "reverseAuction" = true;
UPDATE "Item" SET "listingType" = 'LIVE_DROP'
  WHERE "isLiveDrop" = true;
-- FIXED is already the default — no update needed

-- Phase 4: isAuctionSale stays in schema (deprecated, not dropped yet)
-- Dropping it is a separate migration after all code migrates to saleType
```

Note: Prisma migration dev will generate the SQL from schema diff. The above
is the logical backfill — dev will write the actual Prisma migration file.

### Rollback: `20260311000001_add_sale_type_item_listing_type`

Down migration: Drop `Sale.saleType` and `Item.listingType` columns. Safe —
no foreign keys depend on them. `isAuctionSale` and item booleans remain intact.

Playbook: "If deploy vX fails after this migration, run:
`ALTER TABLE Sale DROP COLUMN saleType;`
`ALTER TABLE Item DROP COLUMN listingType;`
No data loss — old columns untouched."

---

## Cross-Layer Impacts

**Frontend:**
- Sale creation form: replace "Is this an auction sale?" toggle with `saleType` selector (ESTATE / YARD / AUCTION / FLEA_MARKET)
- Item creation form: replace manual auction fields toggle with `listingType` selector; show/hide relevant fields based on selection
- Sale card badge: show based on `saleType` (existing logic)
- Item detail page: drive bidding UI, countdown, buy-now vs bid-now by `listingType`
- Search/filter: `saleType` filter replaces `isAuctionSale` filter in search query

**Backend:**
- `saleController.ts`: accept `saleType` on create/update, remove `isAuctionSale` handling
- `itemController.ts`: accept `listingType` on create/update
- `purchaseController.ts` / payment flow: compute fee from `item.listingType`, not `sale.isAuctionSale`
- Search/filter endpoints: filter by `saleType` instead of `isAuctionSale`
- Auction bid validation: require `listingType === 'AUCTION'` instead of inferring from null check on `auctionStartPrice`

**Shared types:**
- Add `SaleType` and `ListingType` enums to `packages/shared`

---

## Patrick Decisions — RESOLVED 2026-03-10

1. **Fee structure** — ✅ 10% flat across all item types. `FeeStructure` DB table, single row.
2. **Sale creation UX** — ✅ Organizer picks sale type upfront (ESTATE/YARD/AUCTION/FLEA_MARKET).
3. **Tier/subscription discounts** — ✅ Deferred. Revisit after beta data.

---

## Dev Instructions — APPROVED 2026-03-10

Fee: 10% flat. FeeStructure table. No per-type routing.

**Session 107A — Schema**
1. Add `SaleType` + `ListingType` enums to `packages/shared/src/types.ts`
2. Write migration `20260311000001_add_sale_type_item_listing_type`: add `Sale.saleType String @default("ESTATE")`, `Item.listingType String @default("FIXED")`, backfill from `isAuctionSale`/`reverseAuction`/`isLiveDrop`
3. Add `FeeStructure` model: `{ id, listingType String @default("*"), feeRate Float @default(0.10), updatedAt }` — seed single row `{ listingType: "*", feeRate: 0.10 }`
4. Run locally, verify backfill counts, stage for Neon deploy

**Session 107B — Backend**
5. `saleController` — accept `saleType` on create/update; deprecate `isAuctionSale` write paths (keep read for backwards compat)
6. `itemController` — accept `listingType` on create/update; map from form selection, not booleans
7. Purchase/payment flow — read `feeRate` from `FeeStructure` table at transaction time (single query: `WHERE listingType = item.listingType OR listingType = "*" ORDER BY specificity`). No hardcoded rates anywhere.
8. Search endpoints — filter by `saleType` instead of `isAuctionSale`

**Session 107C — Frontend + QA**
9. `SaleForm` — replace "Is this an auction sale?" toggle with `saleType` selector (ESTATE / YARD / AUCTION / FLEA_MARKET)
10. `ItemForm` — `listingType` selector driving conditional field groups (auction fields show on AUCTION, reverse fields on REVERSE_AUCTION, live-drop fields on LIVE_DROP)
11. Search/browse filter params updated to use `saleType`
12. QA: verify 10% fee on test Purchase records across all item types; verify saleType filters; verify auction bidding flow on `listingType = AUCTION` items

Do NOT remove `isAuctionSale`, `reverseAuction`, or `isLiveDrop` from schema in this sprint.
Mark them deprecated in code comments only. Full cleanup is a separate backlog item.

---

## Constraints Added

- Fee calculation is now item-level (`listingType`), not sale-level (`isAuctionSale`).
- `saleType` is the canonical display/discovery field on Sale going forward.
- `listingType` is the canonical transacting-method field on Item going forward.
- `isAuctionSale`, `reverseAuction`, and `isLiveDrop` are deprecated — read only, not written to.
- POS `listingType` is reserved for D1 (quasi-POS) and must not be used until D1 is scoped.

---

## Consequences for B4, D1, B7

**B4 (auction reserves):** Implement against `listingType = 'AUCTION'` items. Add `reservePrice Float?` to Item. Now clean — reserve only applies to auction items, and the type is explicit.

**D1 (quasi-POS):** Add `listingType = 'POS'` when D1 is scoped. The schema slot is pre-reserved. D1 items bypass Stripe per-item flow — fee model TBD in D1 ADR.

**B7 (referral program):** Referral analytics can now segment by `saleType` for reporting (e.g., "referrals driving estate sales vs yard sales").
