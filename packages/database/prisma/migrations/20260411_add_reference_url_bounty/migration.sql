-- Add referenceUrl field to MissingListingBounty
ALTER TABLE "MissingListingBounty" ADD COLUMN IF NOT EXISTS "referenceUrl" TEXT;
