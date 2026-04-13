-- Add auctionClosed field to Item model (auctionEndTime already exists)
ALTER TABLE "Item" ADD COLUMN "auctionClosed" BOOLEAN NOT NULL DEFAULT false;
