-- AddConsignmentFieldsToItem
ALTER TABLE "Item" ADD COLUMN "consignorId" TEXT;
ALTER TABLE "Item" ADD COLUMN "consignmentSplitPct" DECIMAL(5,2);

-- AddAffiliateFieldsToUser
ALTER TABLE "User" ADD COLUMN "affiliateReferralCode" TEXT;
CREATE UNIQUE INDEX "User_affiliateReferralCode_key" ON "User"("affiliateReferralCode");

-- CreateAffiliatePayout
CREATE TABLE "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT,
    "saleId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "AffiliatePayout_referrerId_idx" ON "AffiliatePayout"("referrerId");
CREATE INDEX "AffiliatePayout_referredUserId_idx" ON "AffiliatePayout"("referredUserId");
CREATE INDEX "AffiliatePayout_saleId_idx" ON "AffiliatePayout"("saleId");
CREATE INDEX "AffiliatePayout_status_idx" ON "AffiliatePayout"("status");

-- AddForeignKeys
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
