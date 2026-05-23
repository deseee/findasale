-- Add soft-delete to User
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- Add directory hidden flag to Organizer
ALTER TABLE "Organizer" ADD COLUMN "isHiddenFromDirectory" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Organizer_isHiddenFromDirectory_idx" ON "Organizer"("isHiddenFromDirectory");

-- NOTE: Backfill removed from migration to prevent WAL overflow on large tables.
-- Run backfill separately in batches of 100 after migration completes:
--   UPDATE "Organizer" SET "isHiddenFromDirectory" = true
--   WHERE "isUnmanagedListing" = true AND "isHiddenFromDirectory" = false
--   LIMIT 100;  (repeat until 0 rows affected)
