-- Feature #244: store eBay numeric CategoryID on Item for push-back
-- Captured from <PrimaryCategory><CategoryID> during eBay inventory import.
-- Used directly on push-to-eBay so we don't re-map category NAMES through a
-- hardcoded lookup that falls back to '1' (Collectibles top-level — branch
-- category, rejects all listings with errorId 25021).

ALTER TABLE "Item" ADD COLUMN "ebayCategoryId" TEXT;
