-- Add ReferralReward model to track shopper-to-shopper referral rewards
-- Supports both POINTS and CREDIT reward types

CREATE TABLE "ReferralReward" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "referrerId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "rewardType" TEXT NOT NULL,
  "rewardValue" DOUBLE PRECISION NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redeemedAt" TIMESTAMP(3),
  CONSTRAINT "ReferralReward_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReferralReward_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReferralReward_referrerId_referredUserId_key" UNIQUE("referrerId", "referredUserId")
);

-- Create indexes for common queries
CREATE INDEX "ReferralReward_referrerId_idx" ON "ReferralReward"("referrerId");
CREATE INDEX "ReferralReward_referredUserId_idx" ON "ReferralReward"("referredUserId");
CREATE INDEX "ReferralReward_awardedAt_idx" ON "ReferralReward"("awardedAt");
