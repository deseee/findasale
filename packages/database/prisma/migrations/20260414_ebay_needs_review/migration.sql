-- Migration: add ebayNeedsReview to Item
-- Set when all eBay category suggestions fail 25005; organizer must set category manually

ALTER TABLE "Item" ADD COLUMN "ebayNeedsReview" BOOLEAN NOT NULL DEFAULT false;
