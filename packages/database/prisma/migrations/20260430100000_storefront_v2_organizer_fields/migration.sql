-- Storefront v2 Organizer Fields: Tagline, Year Founded, and Social Links Expansion
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "yearFounded" INTEGER;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "twitterUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "tiktokUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "youtubeUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "pinterestUrl" TEXT;
