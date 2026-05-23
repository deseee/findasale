-- Add soft-delete to User
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- Add directory hidden flag to Organizer
ALTER TABLE "Organizer" ADD COLUMN "isHiddenFromDirectory" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Organizer_isHiddenFromDirectory_idx" ON "Organizer"("isHiddenFromDirectory");

-- Backfill: hide all existing scraped/unmanaged organizers from directory
UPDATE "Organizer" SET "isHiddenFromDirectory" = true WHERE "isUnmanagedListing" = true;
