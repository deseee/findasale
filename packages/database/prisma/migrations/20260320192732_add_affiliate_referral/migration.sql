-- CreateAffiliateReferral table for tracking individual referral relationships
CREATE TABLE "AffiliateReferral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutAmountCents" INTEGER,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on referralCode
CREATE UNIQUE INDEX "AffiliateReferral_referralCode_key" ON "AffiliateReferral"("referralCode");

-- Create indexes for query performance
CREATE INDEX "AffiliateReferral_referrerId_idx" ON "AffiliateReferral"("referrerId");
CREATE INDEX "AffiliateReferral_referredUserId_idx" ON "AffiliateReferral"("referredUserId");
CREATE INDEX "AffiliateReferral_referralCode_idx" ON "AffiliateReferral"("referralCode");
CREATE INDEX "AffiliateReferral_status_idx" ON "AffiliateReferral"("status");

-- Add foreign key constraints
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
