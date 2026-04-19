-- Feature #300: Return-to-Inventory — make saleId nullable + anchor fields
-- Session S507 (2026-04-19)

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
