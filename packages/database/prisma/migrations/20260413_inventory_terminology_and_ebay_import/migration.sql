-- Terminology cleanup: rename inLibrary → inInventory on Item
ALTER TABLE "Item" RENAME COLUMN "inLibrary" TO "inInventory";

-- Drop old index, create new one with correct name
DROP INDEX IF EXISTS "Item_organizerId_inLibrary_idx";
CREATE INDEX "Item_organizerId_inInventory_idx" ON "Item"("organizerId", "inInventory");

-- eBay inventory import: mark a Sale as an inventory container (hidden holding sale)
ALTER TABLE "Sale" ADD COLUMN "isInventoryContainer" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Sale_isInventoryContainer_idx" ON "Sale"("organizerId", "isInventoryContainer") WHERE "isInventoryContainer" = true;

-- eBay inventory sync tracking: when was eBay inventory last pulled
ALTER TABLE "EbayConnection" ADD COLUMN "lastEbayInventorySyncAt" TIMESTAMP(3);
