-- Add missing createdAt column to ReferralReward
-- Column exists in schema.prisma but was absent from the original create-table migration.
-- The referralRewardAgeGateJob fails with P2022 without this column.

ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ReferralReward_createdAt_idx" ON "ReferralReward"("createdAt");
