-- CreateTable
CREATE TABLE "SaleWaitlist" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleWaitlist_saleId_userId_key" ON "SaleWaitlist"("saleId", "userId");

-- CreateIndex
CREATE INDEX "SaleWaitlist_saleId_idx" ON "SaleWaitlist"("saleId");

-- AddForeignKey
ALTER TABLE "SaleWaitlist" ADD CONSTRAINT "SaleWaitlist_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleWaitlist" ADD CONSTRAINT "SaleWaitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
