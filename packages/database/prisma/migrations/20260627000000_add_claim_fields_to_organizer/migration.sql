-- Sync schema.prisma with production DB: add all Organizer fields missing from schema
-- All columns already exist in DB — using IF NOT EXISTS for safety

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "isClaimed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "isUnmanagedListing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "removeWatermarkEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "stripeConnectAccountId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "stripeConnectEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "yearFounded" INTEGER;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "twitterUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "tiktokUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "youtubeUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "pinterestUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "byAppointment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "organizerTypes" TEXT[] NOT NULL DEFAULT '{}';
