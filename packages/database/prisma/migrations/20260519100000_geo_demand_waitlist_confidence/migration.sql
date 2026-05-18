-- #453: UnmetDemandSignal
CREATE TABLE "UnmetDemandSignal" (
  "id" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "city" TEXT,
  "state" TEXT,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnmetDemandSignal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UnmetDemandSignal_query_idx" ON "UnmetDemandSignal"("query");
CREATE INDEX "UnmetDemandSignal_city_idx" ON "UnmetDemandSignal"("city");
CREATE INDEX "UnmetDemandSignal_createdAt_idx" ON "UnmetDemandSignal"("createdAt");

-- #455: ShopperWaitlistEntry
CREATE TABLE "ShopperWaitlistEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemType" TEXT NOT NULL,
  "city" TEXT,
  "state" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopperWaitlistEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShopperWaitlistEntry_userId_idx" ON "ShopperWaitlistEntry"("userId");
CREATE INDEX "ShopperWaitlistEntry_itemType_idx" ON "ShopperWaitlistEntry"("itemType");
CREATE INDEX "ShopperWaitlistEntry_city_isActive_idx" ON "ShopperWaitlistEntry"("city", "isActive");
ALTER TABLE "ShopperWaitlistEntry" ADD CONSTRAINT "ShopperWaitlistEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- #458: Confidence score columns on Organizer
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "directoryConfidenceScore" DOUBLE PRECISION;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "confidenceLastCalculated" TIMESTAMP(3);
