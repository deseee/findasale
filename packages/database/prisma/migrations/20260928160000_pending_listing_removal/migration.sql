-- ADR item-delete-cross-marketplace-removal (2026-09-28)
-- New standalone table (no FK to "Item" -- it exists specifically to survive that row's
-- deletion). Written by itemController.ts's deleteItem for each extension-driven
-- marketplace platform (Facebook/Vinted/Mercari/Poshmark/Grailed/Craigslist/Gumtree AU)
-- that was still live at delete time, since those platforms have no removal API and the
-- Item row deleteItem is about to hard-delete is the only thing getPendingRemovals could
-- otherwise key off of. Read by getPendingRemovals (extensionController.ts) alongside its
-- existing SOLD-item and PUBLISHED_INELIGIBLE queries; rows are deleted by markItemRemoved
-- once background.js confirms the platform-side removal, or skipCount-bumped by
-- markItemRemovalSkipped on a failed attempt (mirrors the REMOVE/SKIPPED bookkeeping those
-- two endpoints already keep in MarketplaceListingJob for real items).
--
-- Down migration (safe at any time -- these rows are a removal TODO list, not a source of
-- truth; dropping it just stops tracking any not-yet-confirmed deleted-item removals):
--   DROP TABLE IF EXISTS "PendingListingRemoval";

CREATE TABLE IF NOT EXISTS "PendingListingRemoval" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "platform" "MarketplaceJobPlatform" NOT NULL,
    "remoteListingId" TEXT,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "lastSkipReason" TEXT,
    "lastSkipAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingListingRemoval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PendingListingRemoval_organizerId_idx" ON "PendingListingRemoval"("organizerId");
