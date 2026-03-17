-- CreateTable TreasureTrail
DROP TABLE IF EXISTS "TrailHighlight";
DROP TABLE IF EXISTS "TreasureTrail";
CREATE TABLE "TreasureTrail" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" VARCHAR(500),
  "stops" JSONB NOT NULL DEFAULT '[]',
  "totalDistanceKm" DOUBLE PRECISION,
  "totalDurationMin" INTEGER,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "shareToken" VARCHAR(32),
  "completedSaleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TreasureTrail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable TrailHighlight
CREATE TABLE "TrailHighlight" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrailHighlight_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "TreasureTrail"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TrailHighlight_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TreasureTrail_userId_idx" ON "TreasureTrail"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TreasureTrail_isPublic_idx" ON "TreasureTrail"("isPublic");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TreasureTrail_shareToken_key" ON "TreasureTrail"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TrailHighlight_trailId_itemId_key" ON "TrailHighlight"("trailId", "itemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrailHighlight_trailId_idx" ON "TrailHighlight"("trailId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrailHighlight_itemId_idx" ON "TrailHighlight"("itemId");
