-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "ebayQuantityAvailable" INTEGER,
ADD COLUMN     "ebayQuantitySold" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EbaySoldEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ebayListingId" TEXT NOT NULL,
    "ebayOrderId" TEXT NOT NULL,
    "ebayLineItemId" TEXT NOT NULL,
    "quantitySold" INTEGER NOT NULL DEFAULT 1,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbaySoldEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EbaySoldEvent_itemId_idx" ON "EbaySoldEvent"("itemId");

-- CreateIndex
CREATE INDEX "EbaySoldEvent_ebayListingId_idx" ON "EbaySoldEvent"("ebayListingId");

-- CreateIndex
CREATE UNIQUE INDEX "EbaySoldEvent_ebayOrderId_ebayLineItemId_key" ON "EbaySoldEvent"("ebayOrderId", "ebayLineItemId");

-- AddForeignKey
ALTER TABLE "EbaySoldEvent" ADD CONSTRAINT "EbaySoldEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

