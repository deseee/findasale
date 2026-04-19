# S507 — Session Start Prompt (paste this at session start)

> Load STATE.md, then dispatch Feature #300 Return-to-Inventory using the dev brief below.

---

## Dispatch: Feature #300 — Return-to-Inventory (Option 3)

Read `claude_docs/feature-notes/feature-300-return-to-inventory-dev-brief.md` in full, then dispatch `findasale-dev` with the following brief:

---

**To findasale-dev:**

Implement Feature #300 — Return-to-Inventory using the completed architectural spec at `claude_docs/feature-notes/feature-300-return-to-inventory-dev-brief.md`. Read that file completely before starting.

**Summary of what you're building:**

Patrick rejected the copy-item pattern. `Item.saleId` is becoming nullable so inventory items have no sale association. This eliminates fake container sales and item duplication.

**Mandatory pre-flight:**
1. Read `packages/database/prisma/schema.prisma` — verify current Item model before touching anything
2. Read `packages/backend/src/services/itemInventoryService.ts` — current state
3. Read `packages/backend/src/services/flipReportService.ts` — current state

**Schema changes (exact):**
- `Item.saleId`: `String` → `String?`
- Add `Item.lastSaleId String?`
- Add `Item.returnedToInventoryAt DateTime?`
- Change `Item.sale` relation to optional
- Drop `@@unique([saleId, sku])` constraint
- Create migration file: `packages/database/prisma/migrations/20260419000001_nullable_sale_id_return_to_inventory/migration.sql`

Migration SQL (exact):
```sql
ALTER TABLE "Item" ALTER COLUMN "saleId" DROP NOT NULL;
ALTER TABLE "Item" ADD COLUMN "lastSaleId" TEXT;
ALTER TABLE "Item" ADD COLUMN "returnedToInventoryAt" TIMESTAMP(3);
DROP INDEX IF EXISTS "Item_saleId_sku_key";
UPDATE "Item" SET "lastSaleId" = "saleId" WHERE "inInventory" = true AND "saleId" IS NOT NULL;
UPDATE "Item" SET "saleId" = NULL WHERE "inInventory" = true AND "saleId" IN (
  SELECT id FROM "Sale" WHERE "isInventoryContainer" = true
);
```

**Core service changes:**
1. `itemInventoryService.ts`:
   - Rewrite `addToInventory()` — no saleId-based lookup needed (see brief §3a)
   - Rewrite `pullFromInventory()` — MOVE not COPY (update item.saleId instead of prisma.item.create)
   - Add `returnItemsToInventory()` — new function (see brief §3a for full implementation)

2. `flipReportService.ts`:
   - Replace `sale.include({ items })` approach with union query (see brief §3b)
   - `saleItems = [...itemsInSale, ...returnedItems]` where returnedItems uses `lastSaleId = saleId AND inInventory = true`

**TypeScript fixes:**
Apply ALL fixes in the TypeScript fix maps in §5 (backend) and §6 (frontend) of the brief. These are ALL the locations where `item.saleId` is used as non-null. Do not skip any.

Key patterns:
- Active-sale operations (reservations, auctions, POS): use `item.saleId!` assertion + brief comment
- Display/logging: use `item.saleId ?? ''` or `item.saleId ?? 'inventory'`
- Skip-if-null: socket pushes, fraud checks, eBay lookups → early return/continue if no saleId
- Search service: add `AND i."inInventory" = false AND i."saleId" IS NOT NULL` to all 6 raw SQL queries

**eBay controller:**
Change eBay import item creation: `saleId: containerSale.id` → `saleId: null`. Add null guards at lines 2956 and 2961.

**New endpoint:**
- `POST /api/sales/:saleId/return-items` in `packages/backend/src/routes/sales.ts`
- New controller file: `packages/backend/src/controllers/returnToInventoryController.ts` (see brief §4)

**New frontend component:**
- `packages/frontend/components/ReturnToInventoryPanel.tsx` (see brief §7 for full spec)
- Entry point: flip-report page, only renders when `sale.status === 'ENDED'`

**Implementation order:**
Schema → prisma generate → itemInventoryService → flipReportService → all TS fixes (backend) → eBay → new controller/route → frontend TS fixes → ReturnToInventoryPanel

**MANDATORY before returning:**
```bash
cd packages/backend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
cd packages/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | grep -v node_modules
```
Zero errors required.

**Return:**
- Explicit list of every file created or modified
- Confirmation that `pullFromInventory()` now does an UPDATE not a CREATE
- Confirmation that TypeScript check passes zero errors
- Any items flagged as DECISION NEEDED (do NOT remove features without Patrick sign-off)
