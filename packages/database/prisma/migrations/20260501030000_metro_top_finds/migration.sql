-- ADR-074: Metro Sync — eBay sold items synced to populate city top-finds page
CREATE TABLE "MetroTopFinds" (
  "id" TEXT NOT NULL,
  "citySlug" TEXT NOT NULL,
  "metro" TEXT NOT NULL,
  "itemTitle" TEXT NOT NULL,
  "itemCategory" TEXT,
  "soldPrice" DECIMAL(65,30) NOT NULL,
  "imageUrl" TEXT,
  "ebayListingId" TEXT NOT NULL,
  "soldAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MetroTopFinds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetroTopFinds_citySlug_ebayListingId_key" ON "MetroTopFinds"("citySlug", "ebayListingId");
CREATE INDEX "MetroTopFinds_citySlug_idx" ON "MetroTopFinds"("citySlug");
CREATE INDEX "MetroTopFinds_metro_idx" ON "MetroTopFinds"("metro");
CREATE INDEX "MetroTopFinds_soldAt_idx" ON "MetroTopFinds"("soldAt");
