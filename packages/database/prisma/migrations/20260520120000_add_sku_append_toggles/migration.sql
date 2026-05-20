-- AddColumn: eBay Custom Label append toggles
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "skuAppendDate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "skuAppendCost" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "skuAppendLocation" BOOLEAN NOT NULL DEFAULT false;
