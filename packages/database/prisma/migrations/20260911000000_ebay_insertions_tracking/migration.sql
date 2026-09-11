-- ADR-115: eBay Queue Fee-Awareness Redesign
-- Additive only. No backfill needed -- defaults cover existing rows.

-- Organizer: monthly free-insertion observability counter (NOT a gate -- see
-- ebayInsertionsQuotaTracker.ts and ebayListingQueueCron.ts's live getListingFees check).
ALTER TABLE "Organizer" ADD COLUMN "ebayInsertionsThisMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organizer" ADD COLUMN "ebayInsertionsResetAt" TIMESTAMP(3);

-- Item: true when the last live eBay fee check found this item would incur a real
-- insertion fee right now. Lets the queue UI distinguish "waiting for a slot" from
-- "waiting for free eBay quota".
ALTER TABLE "Item" ADD COLUMN "ebayFeeBlocked" BOOLEAN NOT NULL DEFAULT false;
