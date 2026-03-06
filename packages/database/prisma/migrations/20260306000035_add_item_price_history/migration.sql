-- CreateTable
CREATE TABLE "ItemPriceHistory" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "changedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemPriceHistory_itemId_idx" ON "ItemPriceHistory"("itemId");

-- AddForeignKey
ALTER TABLE "ItemPriceHistory" ADD CONSTRAINT "ItemPriceHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
