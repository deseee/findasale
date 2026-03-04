-- Add conversions column to AffiliateLink
ALTER TABLE "AffiliateLink" ADD COLUMN "conversions" INTEGER NOT NULL DEFAULT 0;

-- Add affiliateLinkId to Purchase for conversion attribution
ALTER TABLE "Purchase" ADD COLUMN "affiliateLinkId" TEXT;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_affiliateLinkId_fkey"
  FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
