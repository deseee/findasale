-- Consolidate Retail Mode: move isRetailMode boolean into saleType field

-- Migrate existing retail sales to saleType='RETAIL'
UPDATE "Sale" SET "saleType" = 'RETAIL' WHERE "isRetailMode" = true;

-- Drop the boolean columns now that saleType carries the value
ALTER TABLE "Sale" DROP COLUMN "isRetailMode";
ALTER TABLE "Organizer" DROP COLUMN "hasRetailMode";

-- Update index to use saleType instead of isRetailMode
DROP INDEX IF EXISTS "idx_sale_retail_mode_renewal";
CREATE INDEX "idx_sale_retail_mode_renewal" ON "Sale"("organizerId", "saleType", "status", "endDate");
