-- ADR-136 Addendum C (2026-10-05, roadmap #659): eBay fixed-size bundles for bulk lots.
--   "ItemBulkLotEbayBundle"        one row per bulk lot offered on eBay as bundles of N cards (new table, empty on creation)
--   "EbaySoldEvent"."bulkQuantity" nullable cards-taken count on an eBay order line for a bundle lot (NULL on every existing row)
--
-- SAFETY: additive and idempotent. One new empty table and one nullable column, no backfill, no change to any existing
-- column, no change to any existing constraint. Nothing reads or writes either object unless CARD_BULK_LOTS_ENABLED and
-- CARD_BULK_EBAY_ENABLED are both true, so applying this is harmless with the flags off.
-- Apply AFTER 20261005130000_card_bulk_lots (the table references "Item") and BEFORE deploying the matching backend
-- build: the regenerated Prisma client selects "EbaySoldEvent"."bulkQuantity" on every default EbaySoldEvent read.
-- Do not apply to production from an agent session; Patrick applies it with prisma migrate deploy, then prisma generate.
--
-- ROLLBACK (only while no bundle order has been recorded, otherwise the cards-per-order record is lost):
--   ALTER TABLE "EbaySoldEvent" DROP CONSTRAINT IF EXISTS "EbaySoldEvent_bulkQuantity_check";
--   ALTER TABLE "EbaySoldEvent" DROP COLUMN IF EXISTS "bulkQuantity";
--   DROP TABLE IF EXISTS "ItemBulkLotEbayBundle";

CREATE TABLE IF NOT EXISTS "ItemBulkLotEbayBundle" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "organizerId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "bundleSize" INTEGER NOT NULL,
    "adjustmentBps" INTEGER NOT NULL DEFAULT 0,
    "ebayTitle" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'USED',
    "language" TEXT NOT NULL DEFAULT 'English',
    "weightOz" DOUBLE PRECISION NOT NULL,
    "lengthIn" DOUBLE PRECISION NOT NULL,
    "widthIn" DOUBLE PRECISION NOT NULL,
    "heightIn" DOUBLE PRECISION NOT NULL,
    "dimsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "listedQty" INTEGER,
    "listedPriceCents" INTEGER,
    "endedForStock" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ItemBulkLotEbayBundle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ItemBulkLotEbayBundle_itemId_key" ON "ItemBulkLotEbayBundle"("itemId");
CREATE INDEX IF NOT EXISTS "ItemBulkLotEbayBundle_organizerId_idx" ON "ItemBulkLotEbayBundle"("organizerId");
CREATE INDEX IF NOT EXISTS "ItemBulkLotEbayBundle_enabled_endedForStock_idx" ON "ItemBulkLotEbayBundle"("enabled", "endedForStock");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemBulkLotEbayBundle_itemId_fkey') THEN
    ALTER TABLE "ItemBulkLotEbayBundle" ADD CONSTRAINT "ItemBulkLotEbayBundle_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemBulkLotEbayBundle_bundleSize_check') THEN
    ALTER TABLE "ItemBulkLotEbayBundle" ADD CONSTRAINT "ItemBulkLotEbayBundle_bundleSize_check" CHECK ("bundleSize" >= 100 AND "bundleSize" <= 5000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemBulkLotEbayBundle_adjustmentBps_check') THEN
    ALTER TABLE "ItemBulkLotEbayBundle" ADD CONSTRAINT "ItemBulkLotEbayBundle_adjustmentBps_check" CHECK ("adjustmentBps" >= -5000 AND "adjustmentBps" <= 10000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemBulkLotEbayBundle_package_check') THEN
    ALTER TABLE "ItemBulkLotEbayBundle" ADD CONSTRAINT "ItemBulkLotEbayBundle_package_check"
      CHECK ("weightOz" > 0 AND "lengthIn" > 0 AND "widthIn" > 0 AND "heightIn" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemBulkLotEbayBundle_listed_check') THEN
    ALTER TABLE "ItemBulkLotEbayBundle" ADD CONSTRAINT "ItemBulkLotEbayBundle_listed_check"
      CHECK (("listedQty" IS NULL OR "listedQty" >= 0) AND ("listedPriceCents" IS NULL OR "listedPriceCents" >= 0));
  END IF;
END $$;

ALTER TABLE "EbaySoldEvent" ADD COLUMN IF NOT EXISTS "bulkQuantity" INTEGER;
ALTER TABLE "EbaySoldEvent" ADD COLUMN IF NOT EXISTS "bulkShortfall" INTEGER;
ALTER TABLE "EbaySoldEvent" ADD COLUMN IF NOT EXISTS "bulkReleasedAt" TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EbaySoldEvent_bulkQuantity_check') THEN
    ALTER TABLE "EbaySoldEvent" ADD CONSTRAINT "EbaySoldEvent_bulkQuantity_check" CHECK ("bulkQuantity" IS NULL OR "bulkQuantity" >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EbaySoldEvent_bulkShortfall_check') THEN
    ALTER TABLE "EbaySoldEvent" ADD CONSTRAINT "EbaySoldEvent_bulkShortfall_check" CHECK ("bulkShortfall" IS NULL OR ("bulkShortfall" >= 0 AND "bulkShortfall" <= "bulkQuantity"));
  END IF;
END $$;
