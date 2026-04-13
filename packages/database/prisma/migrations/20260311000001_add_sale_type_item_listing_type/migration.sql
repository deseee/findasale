-- Add saleType to Sale
ALTER TABLE "Sale" ADD COLUMN "saleType" TEXT NOT NULL DEFAULT 'ESTATE';

-- Add listingType to Item
ALTER TABLE "Item" ADD COLUMN "listingType" TEXT NOT NULL DEFAULT 'FIXED';

-- Backfill Sale.saleType from isAuctionSale
UPDATE "Sale" SET "saleType" = 'AUCTION' WHERE "isAuctionSale" = true;

-- Backfill Item.listingType from existing booleans/nullables
UPDATE "Item" SET "listingType" = 'AUCTION'
  WHERE "auctionStartPrice" IS NOT NULL AND "auctionEndTime" IS NOT NULL;

UPDATE "Item" SET "listingType" = 'REVERSE_AUCTION'
  WHERE "reverseAuction" = true;

UPDATE "Item" SET "listingType" = 'LIVE_DROP'
  WHERE "isLiveDrop" = true;

-- Create FeeStructure table
CREATE TABLE "FeeStructure" (
  "id" SERIAL PRIMARY KEY,
  "listingType" TEXT NOT NULL DEFAULT '*',
  "feeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
