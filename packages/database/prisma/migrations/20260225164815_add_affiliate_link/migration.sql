/*
  Warnings:

  - A unique constraint covering the columns `[userId,saleId]` on the table `AffiliateLink` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_userId_saleId_key" ON "AffiliateLink"("userId", "saleId");