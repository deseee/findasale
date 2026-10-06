-- ADR-136 Addendum E (2026-10-06, roadmap #659): fixed-size packs for bulk lots.
--   "ItemBulkLot"."packSize"  nullable cards-per-pack count (100 to 5000). NULL on every existing row = the lot is not sold in packs.
--
-- SAFETY: additive and idempotent. One nullable column and one CHECK constraint on a table that already exists. No backfill, no
-- change to any existing column, no change to any existing constraint. Every existing row has packSize NULL, so behavior is
-- unchanged until a vendor sets a pack size. Nothing reads the column unless CARD_BULK_LOTS_ENABLED is true.
-- Apply BEFORE deploying the matching backend build: the regenerated Prisma client selects "ItemBulkLot"."packSize" on every
-- ItemBulkLot read, and that read fails if the column is missing.
-- ORDERING: "ItemBulkLot" is created by 20261005130000_card_bulk_lots and altered only by 20261005160000_bulk_lot_followups.
-- Prisma applies folders in name order, and this folder name sorts after both of them, so on a fresh database the table exists
-- when this runs. (The lettered folders such as add_stripe_connect_ach sort after every dated folder and do not touch this table.)
-- Do not apply to production from an agent session; Patrick applies it with prisma migrate deploy, then prisma generate.
--
-- ROLLBACK (only before any pack has been sold, since pack sales are recorded in cards on Purchase.bulkQuantity and stay valid,
-- but the vendor's pack setting is lost):
--   ALTER TABLE "ItemBulkLot" DROP CONSTRAINT IF EXISTS "ItemBulkLot_packSize_check";
--   ALTER TABLE "ItemBulkLot" DROP COLUMN IF EXISTS "packSize";

ALTER TABLE "ItemBulkLot" ADD COLUMN IF NOT EXISTS "packSize" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ItemBulkLot_packSize_check'
      AND conrelid = to_regclass('"ItemBulkLot"')
  ) THEN
    ALTER TABLE "ItemBulkLot"
      ADD CONSTRAINT "ItemBulkLot_packSize_check"
      CHECK ("packSize" IS NULL OR ("packSize" >= 100 AND "packSize" <= 5000));
  END IF;
END $$;
