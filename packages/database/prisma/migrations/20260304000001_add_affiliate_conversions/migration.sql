-- Add conversions column to AffiliateLink (idempotent)
ALTER TABLE "AffiliateLink" ADD COLUMN IF NOT EXISTS "conversions" INTEGER NOT NULL DEFAULT 0;

-- Add affiliateLinkId to Purchase for conversion attribution (idempotent)
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "affiliateLinkId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Purchase_affiliateLinkId_fkey'
      AND table_name = 'Purchase'
  ) THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_affiliateLinkId_fkey"
      FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
