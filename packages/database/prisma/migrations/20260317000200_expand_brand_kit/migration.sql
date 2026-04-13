-- AlterTable: Expand Organizer Brand Kit with new fields for PRO tier
ALTER TABLE "Organizer" ADD COLUMN "customStorefrontSlug" TEXT UNIQUE;
ALTER TABLE "Organizer" ADD COLUMN "brandFontFamily" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "brandBannerImageUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "brandAccentColor" TEXT;
