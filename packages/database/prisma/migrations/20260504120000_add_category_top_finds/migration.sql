CREATE TABLE "CategoryTopFinds" (
  "id" TEXT NOT NULL,
  "categorySlug" TEXT NOT NULL,
  "categoryDisplay" TEXT NOT NULL,
  "itemTitle" TEXT NOT NULL,
  "itemCategory" TEXT,
  "listingPrice" DECIMAL(10,2) NOT NULL,
  "imageUrl" TEXT,
  "ebayListingId" TEXT NOT NULL,
  "ebayUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CategoryTopFinds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoryTopFinds_categorySlug_ebayListingId_key" ON "CategoryTopFinds"("categorySlug", "ebayListingId");
CREATE INDEX "CategoryTopFinds_categorySlug_createdAt_idx" ON "CategoryTopFinds"("categorySlug", "createdAt");
