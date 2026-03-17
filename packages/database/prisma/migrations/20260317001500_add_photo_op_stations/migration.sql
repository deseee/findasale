-- Feature #39: Photo Op Stations — branded selfie spots for sales
CREATE TABLE "PhotoOpStation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "saleId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "frameImageUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhotoOpStation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE
);

CREATE TABLE "PhotoOpShare" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stationId" TEXT NOT NULL,
  "userId" TEXT,
  "photoUrl" TEXT NOT NULL,
  "caption" TEXT,
  "likesCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhotoOpShare_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "PhotoOpStation" ("id") ON DELETE CASCADE
);

CREATE INDEX "PhotoOpStation_saleId_idx" ON "PhotoOpStation"("saleId");
CREATE INDEX "PhotoOpShare_stationId_idx" ON "PhotoOpShare"("stationId");
CREATE INDEX "PhotoOpShare_userId_idx" ON "PhotoOpShare"("userId");
