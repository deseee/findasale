-- Add isClaimed and isUnmanagedListing to Organizer for scraper/claim workflow
-- Uses IF NOT EXISTS — idempotent (columns already exist in production DB, missing from schema.prisma)
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "isClaimed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "isUnmanagedListing" BOOLEAN NOT NULL DEFAULT false;
