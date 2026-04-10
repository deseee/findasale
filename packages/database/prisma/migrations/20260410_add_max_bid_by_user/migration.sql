-- ADR-013 Phase 2: Proxy bidding (MaxBidByUser table)
CREATE TABLE "MaxBidByUser" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "maxAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaxBidByUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaxBidByUser_itemId_userId_key" ON "MaxBidByUser"("itemId", "userId");

ALTER TABLE "MaxBidByUser" ADD CONSTRAINT "MaxBidByUser_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaxBidByUser" ADD CONSTRAINT "MaxBidByUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
