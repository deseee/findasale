-- CHECK constraints, step 1 of 2: added NOT VALID (2026-11-05, database schema review 2026-11-04 items #7, #14).
--
-- WHAT:
--   Item_stockSold_check            stockSold >= 0 AND (stockTotal IS NULL OR stockSold <= stockTotal)
--                                   (a NULL stockTotal means "single unit"; every writer already guards stockSold against
--                                   COALESCE(stockTotal, 1), so NULL is left unconstrained here rather than risk a
--                                   legacy row failing validation)
--   ItemKitComponent_quantity_check quantity > 0
--   Purchase_status_check           status IN every value the backend writes (PENDING, PAID, REFUNDED, FAILED, DISPUTED,
--                                   REFUNDING, DISPUTE_LOST, REFUND_FAILED) plus VOID_DUPLICATE (ops-only, present in
--                                   production). A new status value must be added here BEFORE code writes it.
-- NOT VALID: new and updated rows are checked from this migration on; existing rows are checked by the next migration
-- (z20261105000310_check_constraints_validate), which runs in its own transaction and only takes a SHARE UPDATE
-- EXCLUSIVE lock, so normal reads and writes continue while it scans.
-- A CHECK is evaluated per statement (never deferred): code must never write a transient bad value and fix it in a
-- second statement. Audited 2026-11-05: itemStockService / itemKitStock / refund paths are single guarded statements;
-- saleReopenService and ebaySaleReopenService were changed in the same commit from decrement-then-floor to one
-- GREATEST(...) statement, and markSoldOffPlatform caps stockSold at stockTotal.
-- Prisma does not model CHECK constraints, so schema.prisma only documents them in comments (no drift).
--
-- PRE-CHECK (production; each must return 0 rows, or step 2 fails and the constraint stays NOT VALID):
--   SELECT id, "stockSold", "stockTotal" FROM "Item" WHERE "stockSold" < 0 OR ("stockTotal" IS NOT NULL AND "stockSold" > "stockTotal");
--   SELECT id, quantity FROM "ItemKitComponent" WHERE quantity <= 0;
--   SELECT status, count(*) FROM "Purchase" WHERE status NOT IN ('PENDING','PAID','REFUNDED','FAILED','DISPUTED','REFUNDING','DISPUTE_LOST','REFUND_FAILED','VOID_DUPLICATE') GROUP BY 1;
-- (2026-11-05 owner checks: the Item and ItemKitComponent queries returned 0; Purchase statuses seen: FAILED, REFUNDED, PAID, VOID_DUPLICATE.)
--
-- ROLLBACK: ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_stockSold_check";
--           ALTER TABLE "ItemKitComponent" DROP CONSTRAINT IF EXISTS "ItemKitComponent_quantity_check";
--           ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_status_check";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Item_stockSold_check' AND conrelid = '"Item"'::regclass) THEN
    ALTER TABLE "Item" ADD CONSTRAINT "Item_stockSold_check"
      CHECK ("stockSold" >= 0 AND ("stockTotal" IS NULL OR "stockSold" <= "stockTotal")) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemKitComponent_quantity_check' AND conrelid = '"ItemKitComponent"'::regclass) THEN
    ALTER TABLE "ItemKitComponent" ADD CONSTRAINT "ItemKitComponent_quantity_check"
      CHECK ("quantity" > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Purchase_status_check' AND conrelid = '"Purchase"'::regclass) THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_status_check"
      CHECK ("status" IN ('PENDING', 'PAID', 'REFUNDED', 'FAILED', 'DISPUTED', 'REFUNDING', 'DISPUTE_LOST', 'REFUND_FAILED', 'VOID_DUPLICATE')) NOT VALID;
  END IF;
END $$;
