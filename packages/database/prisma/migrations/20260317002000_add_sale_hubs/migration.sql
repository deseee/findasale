-- CreateTable "SaleHub"
CREATE TABLE "SaleHub" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "organizerId" TEXT NOT NULL,
  "lat" REAL NOT NULL,
  "lng" REAL NOT NULL,
  "radiusKm" REAL NOT NULL DEFAULT 5.0,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "saleDate" TIMESTAMPTZ,
  "eventName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "SaleHub_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SaleHub_organizerId_idx" ON "SaleHub"("organizerId");

-- CreateIndex
CREATE INDEX "SaleHub_lat_lng_idx" ON "SaleHub"("lat", "lng");

-- CreateIndex
CREATE INDEX "SaleHub_isActive_idx" ON "SaleHub"("isActive");

-- CreateTable "SaleHubMembership"
CREATE TABLE "SaleHubMembership" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "hubId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "addedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleHubMembership_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "SaleHub" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SaleHubMembership_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleHubMembership_hubId_saleId_key" ON "SaleHubMembership"("hubId", "saleId");

-- CreateIndex
CREATE INDEX "SaleHubMembership_hubId_idx" ON "SaleHubMembership"("hubId");

-- CreateIndex
CREATE INDEX "SaleHubMembership_saleId_idx" ON "SaleHubMembership"("saleId");
