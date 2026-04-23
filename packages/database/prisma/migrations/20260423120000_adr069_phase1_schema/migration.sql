-- ADR-069 Phase 1: Burst Clustering + Vision Aggregation + Valuation Wiring
-- Adds clustering fields, photo role/vision labels, Encyclopedia auto-generation tracking, and ItemCompLookup table

-- Item model additions: clustering support
ALTER TABLE "Item" ADD COLUMN "quantity" INTEGER DEFAULT 1;
ALTER TABLE "Item" ADD COLUMN "isSet" BOOLEAN DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "setRole" VARCHAR(255);
ALTER TABLE "Item" ADD COLUMN "clusterConfidence" DOUBLE PRECISION;

-- Photo model additions: role + vision labels + ordering
ALTER TABLE "Photo" ADD COLUMN "photoRole" VARCHAR(255);
ALTER TABLE "Photo" ADD COLUMN "visionLabels" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Photo" ADD COLUMN "orderIndex" INTEGER;

-- EncyclopediaEntry model additions: auto-generation tracking
ALTER TABLE "EncyclopediaEntry" ADD COLUMN "triggerItemId" VARCHAR(255);

-- PriceBenchmark model addition: data source tracking
ALTER TABLE "PriceBenchmark" ADD COLUMN "dataSource" VARCHAR(255) DEFAULT 'curated';

-- Create index for dataSource queries on PriceBenchmark
CREATE INDEX "PriceBenchmark_dataSource_idx" ON "PriceBenchmark"("dataSource");

-- Create ItemCompLookup table for async eBay comp lookup (Phase 2)
CREATE TABLE "ItemCompLookup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL UNIQUE,
  "ebayListingId" TEXT,
  "ebayPrice" DOUBLE PRECISION,
  "ebayCondition" VARCHAR(255),
  "ebayCategory" VARCHAR(255),
  "fetchedAt" TIMESTAMP(3),
  "expireAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemCompLookup_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE
);

-- Indexes for ItemCompLookup
CREATE INDEX "ItemCompLookup_itemId_idx" ON "ItemCompLookup"("itemId");
CREATE INDEX "ItemCompLookup_fetchedAt_idx" ON "ItemCompLookup"("fetchedAt");
