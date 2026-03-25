-- Add auction end time and closed fields to Item model
ALTER TABLE "Item" ADD COLUMN "auctionEndTime" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "auctionClosed" BOOLEAN NOT NULL DEFAULT false;
