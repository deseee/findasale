-- Feature #314 Part A: Add ebayImageUrl field to ItemCompLookup for storing eBay gallery images

ALTER TABLE "ItemCompLookup" ADD COLUMN "ebayImageUrl" TEXT;
