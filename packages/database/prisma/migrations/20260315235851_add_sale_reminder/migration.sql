-- CreateTable
CREATE TABLE "SaleReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleReminder_userId_idx" ON "SaleReminder"("userId");

-- CreateIndex
CREATE INDEX "SaleReminder_saleId_idx" ON "SaleReminder"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReminder_userId_saleId_reminderType_key" ON "SaleReminder"("userId", "saleId", "reminderType");

-- AddForeignKey
ALTER TABLE "SaleReminder" ADD CONSTRAINT "SaleReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReminder" ADD CONSTRAINT "SaleReminder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
