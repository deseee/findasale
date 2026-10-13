-- Quantity-drift detection for extension-tier marketplace listings (2026-10-13, kits listable on every marketplace)
--
-- WHY: a component sale that only shrinks a kit's stock (or a sale elsewhere of a multi-unit item) changes the ONE platform stock
-- number without touching the price, so the extension's price-sync queues (getPriceSyncQueue / getPendingUpdates) never offered
-- the listing for an update. This records, per (item, platform) POST row, the quantity last confirmed on that live listing
-- (set when the listing is reported posted and when a sync is confirmed). A row whose syncedQuantity differs from the item's
-- current stock number (COALESCE(stockTotal,1) - stockSold) is due for a quantity update. NULL = never recorded, read as 1.
--
-- SAFETY: additive only. Nullable, no default, no backfill, no data movement.
ALTER TABLE "MarketplaceListingJob" ADD COLUMN "syncedQuantity" INTEGER;
