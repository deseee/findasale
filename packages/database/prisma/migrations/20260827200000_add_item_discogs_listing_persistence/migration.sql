-- Discogs listing persistence (2026-08-27)
--
-- WHY: createDiscogsListing() (discogsListingConnector.ts) already creates real Discogs
-- marketplace listings, but the result was never stored anywhere -- confirmed via the
-- connector controller's own code comment ("FindA.Sale does not yet persist the remote
-- Discogs listing id anywhere"). Without these columns, a push confirmation shown to the
-- organizer would vanish the instant they refreshed the item edit page, with no way to
-- tell whether an item had already been pushed.
--
-- SAFETY: additive and nullable only, same posture as every other marketplace-id column
-- in this schema. No DROP, no ALTER of an existing column, no NOT NULL, no backfill.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "discogsListingId" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "discogsListedAt" TIMESTAMP(3);
