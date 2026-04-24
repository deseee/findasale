-- Add fallback tier tracking and PriceCharting integration to ItemCompLookup

ALTER TABLE "ItemCompLookup" ADD COLUMN "fallbackTier" INTEGER DEFAULT 1;
ALTER TABLE "ItemCompLookup" ADD COLUMN "priceChartingId" TEXT;
ALTER TABLE "ItemCompLookup" ADD COLUMN "priceChartingPrice" DOUBLE PRECISION;
ALTER TABLE "ItemCompLookup" ADD COLUMN "priceChartingConfidence" TEXT;
ALTER TABLE "ItemCompLookup" ADD COLUMN "source" TEXT DEFAULT 'ebay';
