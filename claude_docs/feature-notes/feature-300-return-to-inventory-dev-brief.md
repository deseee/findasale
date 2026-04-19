# Feature #300 — Return to Inventory: Dev Brief (Option 3)

**Session:** S506 (2026-04-19)  
**Decision:** Option 3 — Nullable `saleId` + `lastSaleId` anchor  
**Architect sign-off:** S506 — full downstream audit complete  
**Status:** Ready for implementation

---

## What We're Building

When a sale closes, organizers need to return unsold items to their inventory pool so those items can be re-listed in a future sale. Currently this is impossible — items are permanently tied to the sale they were created in.

**Root cause:** `Item.saleId` is a required foreign key. Inventory items are forced into a fake "eBay Inventory" container sale (`isInventoryContainer: true`) as a workaround. This means `pullFromInventory()` creates a full COPY of an item into each new sale — resulting in duplicate records for the same physical object.

**Fix:** Make `Item.saleId` nullable. An item in inventory has `saleId = null`. An item in a sale has `saleId = <that sale's id>`. One record per physical item, forever.

**The core behavioral change:**
- `pullFromInventory()`: was CREATE new item → now UPDATE existing item (saleId, inInventory: false)
- Return to inventory: UPDATE item (saleId: null, inInventory: true, returnedToInventoryAt: now)
- No more duplicate records. No more fake container sales for eBay imports.

---

## 1. Schema Changes

File: `packages/database/prisma/schema.prisma`

### Item model — exact changes

```prisma
// CHANGE: saleId from required to optional
saleId                    String?           // WAS: String

// ADD: three new fields (add near saleId/inInventory cluster)
lastSaleId                String?           // historical anchor — last sale item was in
returnedToInventoryAt     DateTime?         // timestamp when returned from sale

// CHANGE: sale relation from required to optional
sale                      Sale?             @relation(fields: [saleId], references: [id])
// WAS: sale Sale @relation(fields: [saleId], references: [id])

// REMOVE: this constraint entirely (NULLs defeat compound unique in Postgres)
// @@unique([saleId, sku])   <-- DELETE THIS LINE

// Keep all existing indexes:
// @@index([saleId])
// @@index([organizerId, inInventory])
// etc.
```

### No new models needed

`lastSaleId` on the Item record is sufficient — no separate `ItemSaleHistory` table required. FlipReport will union query `saleId = X` and `lastSaleId = X AND inInventory = true`.

---

## 2. Migration SQL

File: `packages/database/prisma/migrations/20260419000001_nullable_sale_id_return_to_inventory/migration.sql`

```sql
-- Make saleId nullable
ALTER TABLE "Item" ALTER COLUMN "saleId" DROP NOT NULL;

-- Add new fields
ALTER TABLE "Item" ADD COLUMN "lastSaleId" TEXT;
ALTER TABLE "Item" ADD COLUMN "returnedToInventoryAt" TIMESTAMP(3);

-- Drop the saleId+sku unique constraint (NULLs defeat it in Postgres)
DROP INDEX IF EXISTS "Item_saleId_sku_key";

-- Backfill: preserve lastSaleId for existing inventory items before we null their saleId
UPDATE "Item" SET "lastSaleId" = "saleId"
WHERE "inInventory" = true AND "saleId" IS NOT NULL;

-- Backfill: null out saleId for eBay containerSale inventory items
-- These were always workarounds for the required-FK problem
UPDATE "Item" SET "saleId" = NULL
WHERE "inInventory" = true AND "saleId" IN (
  SELECT id FROM "Sale" WHERE "isInventoryContainer" = true
);
```

**Deploy instructions for Patrick:**
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
$env:DATABASE_URL="postgresql://postgres:QvnUGsnsjujFVoeVyORLTusAovQkirAq@maglev.proxy.rlwy.net:13949/railway"
npx prisma migrate deploy
npx prisma generate
```

---

## 3. Service Layer Rewrites

### 3a. `itemInventoryService.ts` — full rewrite

File: `packages/backend/src/services/itemInventoryService.ts`

**`addToInventory()`** — remove saleId-based lookup. Items may not have a saleId anymore.

```typescript
export const addToInventory = async (itemId: string, organizerId: string) => {
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) throw new Error('Item not found');

  // Verify ownership directly on item (saleId may be null for eBay-imported items)
  if (item.organizerId !== organizerId) {
    // Fallback: check via sale if organizerId not denormalized
    if (item.saleId) {
      const sale = await prisma.sale.findUnique({
        where: { id: item.saleId },
        select: { organizerId: true },
      });
      if (!sale || sale.organizerId !== organizerId) {
        throw new Error('Unauthorized: item does not belong to this organizer');
      }
    } else {
      throw new Error('Unauthorized: item does not belong to this organizer');
    }
  }

  return prisma.item.update({
    where: { id: itemId },
    data: {
      inInventory: true,
      libraryId: itemId, // self-referential — deprecated, keep for backward compat
    },
  });
};
```

**`pullFromInventory()`** — MOVE not COPY. Replace the entire function body:

```typescript
export const pullFromInventory = async (
  inventoryItemId: string,
  saleId: string,
  organizerId: string,
  priceOverride?: number
) => {
  const item = await prisma.item.findUnique({ where: { id: inventoryItemId } });

  if (!item || !item.inInventory) {
    throw new Error('Inventory item not found or not in inventory');
  }

  if (item.organizerId !== organizerId) {
    throw new Error('Unauthorized: inventory item does not belong to this organizer');
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { organizerId: true },
  });

  if (!sale || sale.organizerId !== organizerId) {
    throw new Error('Unauthorized: sale does not belong to this organizer');
  }

  // Dedup: item already pulled into this sale (saleId already set to this sale)
  if (item.saleId === saleId) {
    throw new Error('This item has already been pulled into this sale');
  }

  // MOVE (update in place) — no copy created
  const movedItem = await prisma.item.update({
    where: { id: inventoryItemId },
    data: {
      saleId,
      inInventory: false,
      lastSaleId: item.saleId ?? item.lastSaleId, // preserve history
      price: priceOverride ?? item.price,
      status: 'AVAILABLE',
    },
  });

  if (movedItem.price) {
    await prisma.itemPriceHistory.create({
      data: {
        itemId: movedItem.id,
        price: movedItem.price,
        changedBy: 'inventory_pulled',
        note: `Pulled to sale ${saleId}`,
      },
    });
  }

  return movedItem;
};
```

**`returnItemsToInventory()`** — NEW function (add to itemInventoryService.ts):

```typescript
export const returnItemsToInventory = async (
  saleId: string,
  itemIds: string[],
  organizerId: string
) => {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { organizerId: true, status: true },
  });

  if (!sale || sale.organizerId !== organizerId) {
    throw new Error('Unauthorized');
  }

  if (sale.status !== 'ENDED') {
    throw new Error('Sale must be ENDED to return items to inventory');
  }

  const query =
    itemIds.length > 0
      ? { id: { in: itemIds }, saleId }
      : { saleId, status: { notIn: ['SOLD', 'DONATED'] as const } };

  const items = await prisma.item.findMany({ where: query });

  let returned = 0;
  const skipped: Array<{ id: string; title: string; reason: string }> = [];

  for (const item of items) {
    if (['SOLD', 'DONATED'].includes(item.status)) {
      skipped.push({ id: item.id, title: item.title, reason: item.status });
      continue;
    }
    if (item.status === 'INVOICE_ISSUED') {
      skipped.push({ id: item.id, title: item.title, reason: 'INVOICE_ISSUED' });
      continue;
    }

    // Cancel active reservation + notify shopper
    const reservation = await prisma.itemReservation.findUnique({
      where: { itemId: item.id },
    });
    if (
      reservation &&
      ['PENDING', 'CONFIRMED', 'HOLD_IN_CART'].includes(reservation.status)
    ) {
      await prisma.itemReservation.update({
        where: { id: reservation.id },
        data: { status: 'EXPIRED' },
      });
      await prisma.notification.create({
        data: {
          userId: reservation.userId,
          type: 'RESERVATION_CANCELLED',
          message: `A hold on "${item.title}" was released — the sale has ended.`,
        },
      });
    }

    // Clear waitlist
    await prisma.itemWaitlist.deleteMany({ where: { itemId: item.id } });

    // Return to inventory
    await prisma.item.update({
      where: { id: item.id },
      data: {
        inInventory: true,
        returnedToInventoryAt: new Date(),
        saleId: null,
        lastSaleId: item.saleId,
      },
    });

    await prisma.itemPriceHistory.create({
      data: {
        itemId: item.id,
        price: item.price ?? 0,
        changedBy: 'returned_from_sale',
        note: `Returned to inventory from sale ${saleId}`,
      },
    });

    returned++;
  }

  return { returned, skipped };
};
```

### 3b. `flipReportService.ts` — fix item query

The `sale.include({ items })` Prisma relation will no longer include returned items (their saleId is null). Replace the sale query with a union:

Find the section that does `prisma.sale.findUnique({ include: { items: { include: { purchases } } } })` and replace items fetching with:

```typescript
// Replace the single sale.items reference — query in two passes instead
const [itemsInSale, returnedItems] = await Promise.all([
  prisma.item.findMany({
    where: { saleId },
    include: { purchases: { where: { status: 'PAID' } } },
  }),
  prisma.item.findMany({
    where: { lastSaleId: saleId, inInventory: true },
    include: { purchases: { where: { status: 'PAID' } } },
  }),
]);
const saleItems = [...itemsInSale, ...returnedItems];
```

Then replace all `sale.items` references in the function with `saleItems`.

The `sale.purchases` reference (for total revenue) stays as-is — returned items have no new purchases after return.

---

## 4. New Backend Endpoint

### Route

Add to `packages/backend/src/routes/sales.ts`:
```typescript
router.post('/:saleId/return-items', authenticate, returnItemsToInventory);
```

### Controller

New file: `packages/backend/src/controllers/returnToInventoryController.ts`

```typescript
import { Request, Response } from 'express';
import { returnItemsToInventory } from '../services/itemInventoryService';

export const returnItemsToInventoryHandler = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;
    const { itemIds = [] } = req.body as { itemIds: string[] };
    const organizerId = (req as any).organizer?.id;

    if (!organizerId) {
      return res.status(401).json({ error: 'Organizer not authenticated' });
    }

    const result = await returnItemsToInventory(saleId, itemIds, organizerId);
    return res.json(result);
  } catch (err: any) {
    if (err.message === 'Unauthorized') return res.status(403).json({ error: err.message });
    if (err.message?.includes('must be ENDED')) return res.status(400).json({ error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

---

## 5. TypeScript Fix Map — Backend

All locations where `item.saleId` is used as non-null and needs a guard after making it nullable.

| File | Lines | Fix Type | Fix |
|---|---|---|---|
| `bountyController.ts` | 168 | conditional | `item.saleId && item.saleId !== bounty.saleId` |
| `ebayController.ts` | 2956, 2961 | early return | `if (!item.saleId) { console.warn('eBay item has no saleId'); continue; }` |
| `exportController.ts` | 589 | fallback | `item.saleId ?? ''` |
| `flashDealController.ts` | 35, 50, 64, 83 | early return | `if (!item.saleId) return res.status(400).json({ error: 'Item not in a sale' })` |
| `itemController.ts` | 814, 835 | fallback | `item.saleId ?? ''` |
| `itemController.ts` | 867 | skip-if-null | `if (item.saleId) pushEvent(io, item.saleId, ...)` |
| `itemController.ts` | 871, 1144, 1285, 2141 | null guard | `item.saleId!` (these paths only reach items with saleId — add comment) |
| `posController.ts` | 880, 985 | fallback | `item.saleId ?? ''` |
| `reservationController.ts` | 177, 193, 241, 244, 254, 265, 275, 282, 303, 351, 354, 364, 902, 912, 977, 1000 | assertion | `item.saleId!` — reservations only exist for items in active sales (always have saleId); add brief comment per site |
| `userController.ts` | 660 | fallback | `hold.item.saleId ?? ''` |
| `cleanupStaleDrafts.ts` | 48 | fallback | `item.saleId ?? 'inventory'` |
| `routes/search.ts` | 183 | null filter | `if (item.saleId) saleIdsToFetch.add(item.saleId)` |
| `auctionService.ts` | 57, 97, 101, 128, 138 | assertion | `item.saleId!` — auction items always have saleId by domain invariant |
| `commandCenterService.ts` | 193 | fallback | `r.item.saleId ?? ''` |
| `fraudService.ts` | 62, 200, 281, 290, 431 | null guard | Check `if (!item.saleId) return` / `if (!purchase.item.saleId) continue` before lookup |
| `organizerActivityFeedService.ts` | 169 | already safe | has `|| ''` — no change needed |
| `valuationService.ts` | 23 | conditional spread | `...(item.saleId ? { saleId: { not: item.saleId } } : {})` |
| `itemInventoryService.ts` | 22 | remove lookup | Remove saleId-based ownership check from `addToInventory()` — rewrite per §3a above |
| `itemSearchService.ts` | 141, 212, 265, 299, 331, 364 | explicit filter | Keep INNER JOINs (null items naturally excluded from public search) **but add** `AND i."inInventory" = false AND i."saleId" IS NOT NULL` to all 6 query WHERE clauses to make intent explicit and safe |

---

## 6. TypeScript Fix Map — Frontend

| File | Line | Fix |
|---|---|---|
| `pages/organizer/edit-item/[id].tsx` | 167 | `if (item.saleId) fd.append('saleId', item.saleId)` |
| `pages/organizer/offline.tsx` | 223 | `(item.saleId ?? 'inventory').slice(0, 8)` |

---

## 7. New Frontend Component

### `ReturnToInventoryPanel.tsx`

Location: `packages/frontend/components/ReturnToInventoryPanel.tsx`

Entry point: flip-report page (`/organizer/flip-report/[saleId]`)

**Behavior:**
- Shows unsold items (AVAILABLE + RESERVED) with checkboxes
- Pre-selection defaults by sale type:
  - `FLEA_MARKET` → all pre-checked
  - `ESTATE` → none pre-checked
  - `YARD`, `AUCTION` → all pre-checked, with a note to review
- "Return X items to inventory" CTA button
- Calls `POST /api/sales/:saleId/return-items` with `{ itemIds: string[] }`
- On success: "X items returned to inventory." + link to `/organizer/inventory`
- Shows skipped items list with human-readable reason (SOLD, DONATED, INVOICE_ISSUED)
- Only renders when `sale.status === 'ENDED'`

**Props:**
```typescript
interface ReturnToInventoryPanelProps {
  saleId: string;
  saleType: string; // 'ESTATE' | 'YARD' | 'FLEA_MARKET' | 'AUCTION' | 'CONSIGNMENT'
  unsoldItems: Array<{ id: string; title: string; price: number | null; category: string | null }>;
}
```

---

## 8. eBay Controller Cleanup (ebayController.ts)

With `saleId` now nullable, eBay-imported inventory items should be created with `saleId: null` directly instead of being parked in a fake container sale.

In `ebayController.ts`, find the `containerSale` creation block (around lines 3032–3052) and change eBay import item creation to:
```typescript
// WAS:
saleId: containerSale.id,
inInventory: true,

// NOW:
saleId: null,           // inventory items need no sale container
inInventory: true,
```

The `isInventoryContainer` Sale flag and `containerSale` fetch can be removed from the eBay import path once this is done. Leave the `isInventoryContainer` field on the Sale model for now (don't remove from schema) — deprecate later.

Add null guards at lines 2956 and 2961 where `item.saleId` is used:
```typescript
if (!item.saleId) { console.warn(`eBay item ${item.id} has no saleId — skipping sale lookup`); continue; }
```

---

## 9. Implementation Order

Run in this exact order to avoid TS errors blocking early:

1. **Schema + migration** — make saleId nullable, add lastSaleId + returnedToInventoryAt, drop @@unique([saleId, sku])
2. **`prisma generate`** — regenerate client so TS types update
3. **`itemInventoryService.ts`** — rewrite addToInventory, pullFromInventory (move not copy), add returnItemsToInventory
4. **`flipReportService.ts`** — union query for saleItems
5. **All backend TypeScript fixes** from §5 (work file by file)
6. **eBay controller cleanup** from §8
7. **New controller + route** from §4
8. **Frontend TypeScript fixes** from §6
9. **`ReturnToInventoryPanel.tsx`** from §7
10. **TypeScript check gate (MANDATORY before returning):**
```bash
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```
Zero errors required.

---

## 10. Return explicit file list

Return an explicit list of every file created or modified. Main session will build the push block from this list.

---

## Acceptance Criteria

- [ ] `prisma.item.findUnique({ where: { id } })` — `item.saleId` is `string | null` in TS
- [ ] Pulling an item from inventory: item count stays the same (1 record, saleId updated), no new record created
- [ ] Returning items to inventory: `saleId = null`, `inInventory = true`, `lastSaleId` set to old saleId
- [ ] FlipReport for a sale that had items returned: returned items appear in `itemsUnsold` count, sell-through rate is correct
- [ ] eBay-imported items created with `saleId = null` (no container sale lookup)
- [ ] `npx tsc --noEmit` — zero errors in both packages
- [ ] No new Item records created by `pullFromInventory` (verify by record count before/after)
