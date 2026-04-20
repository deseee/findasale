-- AlterTable
ALTER TABLE "ReferralReward" ADD COLUMN "deferredUntil" TIMESTAMP(3),
ADD COLUMN "deferredReason" TEXT,
ADD COLUMN "deviceFraudScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ipFraudScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "fraudReviewStatus" TEXT NOT NULL DEFAULT 'CLEAR',
ADD COLUMN "reviewedByAdminId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ReferralReward_deferredUntil_idx" ON "ReferralReward"("deferredUntil");

-- CreateIndex
CREATE INDEX "ReferralReward_fraudReviewStatus_idx" ON "ReferralReward"("fraudReviewStatus");

-- CreateTable
CREATE TABLE "ReferralFraudSignal" (
    "id" TEXT NOT NULL,
    "referralRewardId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "flags" TEXT[],
    "reviewOutcome" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralFraudSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralFraudSignal_referrerId_idx" ON "ReferralFraudSignal"("referrerId");

-- CreateIndex
CREATE INDEX "ReferralFraudSignal_referredUserId_idx" ON "ReferralFraudSignal"("referredUserId");

-- CreateIndex
CREATE INDEX "ReferralFraudSignal_reviewOutcome_idx" ON "ReferralFraudSignal"("reviewOutcome");

-- AddForeignKey
ALTER TABLE "ReferralFraudSignal" ADD CONSTRAINT "ReferralFraudSignal_referralRewardId_fkey" FOREIGN KEY ("referralRewardId") REFERENCES "ReferralReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
