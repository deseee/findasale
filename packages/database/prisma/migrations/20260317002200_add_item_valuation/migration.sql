-- CreateTable ItemValuation
DROP TABLE IF EXISTS "ItemValuation";
CREATE TABLE "ItemValuation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL UNIQUE,
  "priceLow" DOUBLE PRECISION NOT NULL,
  "priceHigh" DOUBLE PRECISION NOT NULL,
  "priceMedian" DOUBLE PRECISION NOT NULL,
  "confidenceScore" INTEGER NOT NULL,
  "comparableCount" INTEGER NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'STATISTICAL',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemValuation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ItemValuation_itemId_idx" ON "ItemValuation"("itemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ItemValuation_generatedAt_idx" ON "ItemValuation"("generatedAt");
