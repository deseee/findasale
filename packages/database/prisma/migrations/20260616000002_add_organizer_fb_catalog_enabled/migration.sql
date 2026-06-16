-- AddColumn: fbCatalogEnabled + fbCatalogRegisteredAt on Organizer
-- Tracks whether organizer has registered their Commerce Manager catalog feed with Facebook.
-- Additive only — no existing data affected.

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "fbCatalogEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "fbCatalogRegisteredAt" TIMESTAMP(3);
