-- ADR-136 (2026-10-05, roadmap #659): bulk lots for card shops.
--   "ItemBulkLot"            one row per Item that is a count-based bulk lot (new table, empty on creation)
--   "Purchase"."bulkQuantity" nullable cards-sold count on a bulk-lot sale row (NULL on every existing row)
--
-- SAFETY: additive and idempotent. One new empty table and one nullable column, no backfill, no default, no change to
-- any existing column. Nothing reads or writes either object unless CARD_BULK_LOTS_ENABLED is true, so applying this is
-- harmless with the flag off. Apply BEFORE deploying the matching backend build: the regenerated Prisma client selects
-- "Purchase"."bulkQuantity" on every default Purchase read, so code deployed ahead of this migration would fail those
-- reads. (The lot lookups on sale paths fail open while the flag is off, but the Purchase column has no such cushion.)
-- Do not apply to production from an agent session; Patrick applies it with prisma migrate deploy, then prisma generate.
--
-- ROLLBACK (only if ever needed, and only while no bulk lot has been sold, otherwise card counts are lost):
--   ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_bulkQuantity_check";
--   ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "bulkQuantity";
--   DROP TABLE IF EXISTS "ItemBulkLot";

CREATE TABLE IF NOT EXISTS "ItemBulkLot" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "organizerId" TEXT,
    "game" TEXT NOT NULL DEFAULT 'MTG',
    "lotKind" TEXT NOT NULL DEFAULT 'BULK_COMMON_UNCOMMON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemBulkLot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ItemBulkLot_itemId_key" ON "ItemBulkLot"("itemId");
CREATE INDEX IF NOT EXISTS "ItemBulkLot_organizerId_idx" ON "ItemBulkLot"("organizerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemBulkLot_itemId_fkey') THEN
    ALTER TABLE "ItemBulkLot" ADD CONSTRAINT "ItemBulkLot_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "bulkQuantity" INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Purchase_bulkQuantity_check') THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_bulkQuantity_check" CHECK ("bulkQuantity" IS NULL OR "bulkQuantity" >= 1);
  END IF;
END $$;
