-- Feature #103: Photo Retention — archive old photos and delete very old ones
-- Adds fields to track photo archival and Cloudinary deletion status

ALTER TABLE "Item" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "deletedFromCloudinary" BOOLEAN NOT NULL DEFAULT false;

-- Create index for photo retention cron query optimization
CREATE INDEX "Item_saleId_photoUrls_archivedAt_idx" ON "Item"("saleId") WHERE "archivedAt" IS NULL;
