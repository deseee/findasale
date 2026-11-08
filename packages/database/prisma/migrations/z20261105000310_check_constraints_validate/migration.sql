-- CHECK constraints, step 2 of 2: validate existing rows (2026-11-05, schema review items #7, #14).
-- Separate migration on purpose: Prisma runs each migration in its own transaction, so the ACCESS EXCLUSIVE lock taken
-- by ADD CONSTRAINT ... NOT VALID (previous migration) is already released, and VALIDATE CONSTRAINT here only needs
-- SHARE UPDATE EXCLUSIVE (reads and writes continue during the scan).
-- If a pre-check in z20261105000300 was skipped and a bad row exists, THIS migration fails and rolls back; the
-- constraints stay NOT VALID (still enforced on new writes). Fix the rows, then
-- `prisma migrate resolve --rolled-back z20261105000310_check_constraints_validate` and deploy again.
-- ROLLBACK: nothing to undo (validation changes no data); drop the constraints as in z20261105000300 if needed.

ALTER TABLE "Item" VALIDATE CONSTRAINT "Item_stockSold_check";
ALTER TABLE "ItemKitComponent" VALIDATE CONSTRAINT "ItemKitComponent_quantity_check";
ALTER TABLE "Purchase" VALIDATE CONSTRAINT "Purchase_status_check";
