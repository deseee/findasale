-- CreateTable
CREATE TABLE "MetroTopFinds" (
    "id" TEXT NOT NULL,
    "citySlug" TEXT NOT NULL,
    "metro" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "itemCategory" TEXT,
    "soldPrice" DECIMAL(10,2) NOT NULL,
    "imageUrl" TEXT,
    "ebayListingId" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetroTopFinds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetroTopFinds_citySlug_ebayListingId_key" ON "MetroTopFinds"("citySlug", "ebayListingId");

-- CreateIndex
CREATE INDEX "MetroTopFinds_citySlug_soldAt_idx" ON "MetroTopFinds"("citySlug", "soldAt");
