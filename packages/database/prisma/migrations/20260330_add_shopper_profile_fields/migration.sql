-- Task #200: Shopper Public Profiles
-- Add fields for shopper profile customization and purchase visibility control

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileSlug" TEXT UNIQUE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purchasesVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "collectorTitle" TEXT;
