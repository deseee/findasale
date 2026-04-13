-- AddColumn: Organizer.website
-- Schema has this field but no migration was generated. Adding now to fix P2022 runtime error.

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "website" TEXT;
