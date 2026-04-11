-- Make saleId nullable
ALTER TABLE "MissingListingBounty" ALTER COLUMN "saleId" DROP NOT NULL;

-- Make description nullable
ALTER TABLE "MissingListingBounty" ALTER COLUMN "description" DROP NOT NULL;

-- Drop and recreate FK with SET NULL on delete
ALTER TABLE "MissingListingBounty" DROP CONSTRAINT IF EXISTS "MissingListingBounty_saleId_fkey";
ALTER TABLE "MissingListingBounty" ADD CONSTRAINT "MissingListingBounty_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Add shopper-first fields
ALTER TABLE "MissingListingBounty" ADD COLUMN IF NOT EXISTS "itemName" TEXT;
ALTER TABLE "MissingListingBounty" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "MissingListingBounty" ADD COLUMN IF NOT EXISTS "maxBudget" DOUBLE PRECISION;
ALTER TABLE "MissingListingBounty" ADD COLUMN IF NOT EXISTS "radiusMiles" INTEGER;

-- Add index
CREATE INDEX IF NOT EXISTS "MissingListingBounty_category_radiusMiles_idx" ON "MissingListingBounty"("category", "radiusMiles");
