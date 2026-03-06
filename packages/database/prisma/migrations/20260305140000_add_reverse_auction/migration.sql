-- CD2 Phase 4: Add Reverse Auction fields to Item model
ALTER TABLE "Item" ADD COLUMN "reverseAuction" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "reverseDailyDrop" INTEGER;
ALTER TABLE "Item" ADD COLUMN "reverseFloorPrice" INTEGER;
ALTER TABLE "Item" ADD COLUMN "reverseStartDate" TIMESTAMP(3);
