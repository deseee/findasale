-- Reverb listing persistence (2026-09-14, ADR addendum --
-- ADR-2026-09-14-add-items-multichannel-status-aggregation.md)
--
-- WHY: createReverbListing() (reverbConnector.ts) already creates real Reverb marketplace
-- listings, but the result was never stored anywhere -- confirmed via
-- reverbMarketplaceController.ts's own prior code comment ("FindA.Sale does not yet
-- persist the remote Reverb listing id anywhere"). Without these columns, a push
-- confirmation shown to the organizer would vanish the instant they refreshed the item
-- edit page, with no way to tell whether an item had already been pushed -- same failure
-- mode the Discogs columns (20260827200000_add_item_discogs_listing_persistence) were
-- added to fix. Mirrors that migration exactly.
--
-- SAFETY: additive and nullable only, same posture as every other marketplace-id column
-- in this schema. No DROP, no ALTER of an existing column, no NOT NULL, no backfill.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "reverbListingId" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "reverbListedAt" TIMESTAMP(3);
