-- #31 Brand Kit: add brandLogoUrl, brandPrimaryColor, brandSecondaryColor to Organizer
ALTER TABLE "Organizer" ADD COLUMN "brandLogoUrl" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "brandPrimaryColor" VARCHAR(7);
ALTER TABLE "Organizer" ADD COLUMN "brandSecondaryColor" VARCHAR(7);
