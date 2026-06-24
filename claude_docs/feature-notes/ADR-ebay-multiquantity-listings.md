# ADR — eBay Multi-Quantity Listing Support — 2026-06-16

## Context / Problem

FindA.Sale models **one Item = one eBay listing = one unit**. eBay listings can carry
quantity > 1. When a multi-quantity listing sells multiple units over time, FindA.Sale
alerts only on the **first** unit:

- The sold-sync (`syncSoldItemsForOrganizer`, `packages/backend/src/jobs/ebaySoldSyncCron.ts`)
  matches one local Item per order line, sets `status='SOLD'`, notifies once, and withdraws
  the listing.
- After the first sale the Item is no longer `AVAILABLE`, so later unit sales of the same
  listing match nothing → no further alerts.
- The only reprocessing guard is "status flipped to SOLD" — which is exactly what makes
  multi-quantity break, and there is **no idempotency record** of processed eBay orders.

Verified live: organizer "Artifact" MJ card listing (eBay ItemID `136395620707`) sold on
2026-03-21, 2026-04-14, 2026-06-16; only the Apr 14 sale produced a notification.

### Existing schema facts (verified)
- `Item.quantity Int? @default(1)` **already exists** but means "items per cluster (e.g. set
  of 8)" — a single lot sold as one unit. **Do NOT overload it** for eBay unit tracking.
- No eBay order / sold-event table exists (`EbayConnection`, `EbayPolicyMapping`,
  `EbayCategoryFee` only).
- `Notification` has no dedup key.

## Decision

Introduce an **idempotent sold-event ledger** plus a small quantity tracker on `Item`.
The ledger is the single source of truth for "which eBay unit sales have been processed";
the Item counters are a cached projection for fast reads and status decisions.

### Schema changes (additive only)

New model:

```prisma
model EbaySoldEvent {
  id             String   @id @default(uuid())
  itemId         String
  item           Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  ebayListingId  String   // legacyItemId at time of sale
  ebayOrderId    String   // eBay order id
  ebayLineItemId String   // eBay line item id within the order
  quantitySold   Int      @default(1) // units in this line item
  soldAt         DateTime @default(now())
  createdAt      DateTime @default(now())

  @@unique([ebayOrderId, ebayLineItemId]) // IDEMPOTENCY KEY — one row per eBay sale line
  @@index([itemId])
  @@index([ebayListingId])
}
```

New `Item` columns (both nullable/defaulted — single-unit items keep behaving as today):

```prisma
  ebayQuantityAvailable Int? // total units on the eBay listing (from GetItem/Inventory). null/1 = single-unit
  ebayQuantitySold      Int  @default(0) // cached count of units sold via eBay, projected from EbaySoldEvent
```

Plus the back-relation `ebaySoldEvents EbaySoldEvent[]` on `Item`.

**Why a ledger, not just counters:** the unique `(ebayOrderId, ebayLineItemId)` constraint
gives true idempotency across cron runs — the current "status=SOLD" guard cannot. The
counters alone would double-count on re-runs.

### Sold-sync algorithm (pseudocode — replaces the single-match-then-SOLD path)

```
for each eBay order:
  for each lineItem (has: orderId, lineItemId, quantity, sku, legacyItemId, title):
    item = matchItem(lineItem)        // same matching as today (SKU date-strip, legacyItemId, title)
    if !item: continue

    // IDEMPOTENT insert — unique(ebayOrderId, lineItemId) makes re-runs no-ops
    created = tryInsert EbaySoldEvent{ itemId, ebayListingId, ebayOrderId, lineItemId,
                                       quantitySold: lineItem.quantity }
    if !created: continue             // already processed this exact sale line → no re-alert

    // project counter + decide status
    item.ebayQuantitySold += lineItem.quantity
    avail = item.ebayQuantityAvailable ?? 1
    if item.ebayQuantitySold >= avail:
        item.status = 'SOLD'
        endEbayListingIfExists(item.id)   // withdraw only when fully sold out
        notifyFacebookExportedItemSold(item.id)
    // else: keep AVAILABLE — more units remain

    createNotification("Item sold on eBay",
        body = avail > 1
          ? `"${item.title}" sold a unit on eBay (${item.ebayQuantitySold}/${avail}).`
          : `"${item.title}" was purchased on eBay and has been marked as sold.`)
```

Notes:
- **Match query must include already-SOLD multi-qty items** OR (cleaner) the availableItems
  query stays `AVAILABLE` and we additionally fetch items where `ebayQuantityAvailable > 1`
  regardless of status, because a fully-sold multi-qty item flips to SOLD but we still want
  the ledger to absorb idempotent re-runs without error. Simplest: match against items where
  `status='AVAILABLE' OR ebayQuantityAvailable > 1`. The unique constraint prevents
  double-processing either way.
- `ebayQuantityAvailable` is populated by the existing import / ended-sync GetItem calls
  (eBay `Item.Quantity` − `QuantitySold`, or listing `Quantity`). If unknown, leave null →
  treated as 1 → identical to today.

### Idempotency key
`@@unique([ebayOrderId, ebayLineItemId])` on `EbaySoldEvent`. One eBay sale line can only ever
create one event → exactly one notification, exactly one counter increment, forever.

### Composition with this session's fixes (must not undo)
- **Completed-vs-Ended split** (`syncEndedListingsForOrganizer`): unchanged. Completed listings
  stay linked; this design is what then reconciles the units. For multi-qty, the listing stays
  active until sold out, so ended-sync won't see Completed until the last unit — correct.
- **Date-SKU strip** and **inventory-item inclusion** in the sold-sync match: unchanged; the new
  ledger logic wraps the same `matchItem` step.

## Consequences
- Sold alerts fire once per unit sale, never duplicate, survive cron re-runs and the 90-day window.
- Single-unit items (the vast majority) are untouched: `ebayQuantityAvailable` null/1, first sale
  marks SOLD exactly as today.
- New audit trail of eBay unit sales (useful for future payout/ROI features).

## Migration Plan
Additive: one new table + two new Item columns + one back-relation. Local dev:
`prisma migrate dev --name ebay_multiquantity`; production: `prisma migrate deploy` against
Railway (never `db push`). Then `prisma generate`. Backfill not required — defaults cover
existing rows (`ebayQuantitySold=0`, `ebayQuantityAvailable=null`→1).

### Rollback: <timestamp>_ebay_multiquantity
Down migration: `DROP TABLE "EbaySoldEvent";` then
`ALTER TABLE "Item" DROP COLUMN "ebayQuantityAvailable", DROP COLUMN "ebayQuantitySold";`
Playbook: "If deploy fails after migrate but before code ships, the new columns/table are
inert (nothing reads them yet) — safe to leave or drop. If the sold-sync code is live and
misbehaving, revert the cron commit; the ledger table is harmless when unread."

## Dev Instructions (handoff to findasale-dev — ordered)
1. **Schema** (`packages/database`): add `EbaySoldEvent` model, `Item.ebayQuantityAvailable Int?`,
   `Item.ebayQuantitySold Int @default(0)`, and `Item.ebaySoldEvents` back-relation. Create the
   migration. Provide Patrick the `migrate deploy` + `generate` block per Schema Change Protocol.
2. **Sold-sync** (`ebaySoldSyncCron.ts`): replace the match→SOLD path with the ledger algorithm
   above. Destructure `lineItemId` and `quantity` from the eBay order line (currently only sku/
   legacyItemId/title are read — verify the Fulfillment response field names). Keep the existing
   matchItem logic (SKU date-strip, legacyItemId, title) intact.
3. **Quantity source**: populate `ebayQuantityAvailable` where the import / ended-sync already
   call GetItem (`Item.Quantity`). If not readily available, leave null (=1) and flag a follow-up.
4. **TS gate** + changed-files list. No `db push`. No git.

## Flagged
- **findasale-ux**: multi-quantity items need a display treatment (e.g. "3 of 5 sold") on the
  sale page, edit-item, and inventory. Not pixel-designed here — route to UX before/with dev step 2.
- **Patrick**: confirm desired notification wording for per-unit sales ("sold a unit (2/5)") and
  whether a fully-sold multi-qty item should remain visible as SOLD or be archived.
