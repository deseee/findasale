-- ItemDeletionLog (2026-10-01): audit trail for every hard delete of an Item row.
--
-- WHY: eBay listings were found live on eBay with no matching FindA item and nothing recorded how the item
-- disappeared. Every delete path (single, bulk, stale-draft cleanup) now writes one row here.
-- No FK to "Item" on purpose: the log must outlive the deleted row.
--
-- SAFETY: additive only (new table + indexes), idempotent. Apply manually BEFORE deploying the matching backend build.

CREATE TABLE IF NOT EXISTS "ItemDeletionLog" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "organizerId" TEXT,
    "title" TEXT NOT NULL,
    "ebayListingId" TEXT,
    "ebayOfferId" TEXT,
    "status" TEXT,
    "source" TEXT NOT NULL,
    "actorUserId" TEXT,
    "withdrawSucceeded" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemDeletionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ItemDeletionLog_itemId_idx" ON "ItemDeletionLog"("itemId");
CREATE INDEX IF NOT EXISTS "ItemDeletionLog_ebayListingId_idx" ON "ItemDeletionLog"("ebayListingId");
CREATE INDEX IF NOT EXISTS "ItemDeletionLog_createdAt_idx" ON "ItemDeletionLog"("createdAt");
