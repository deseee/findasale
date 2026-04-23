-- Feature #XXX: Referral XP Anti-Fraud System — 4-Tranche Escrow with Reputation Scoring
-- Create ReferralTranche model for tracking progressive XP release
-- Create ReferrerReputationScore model for silent reputation multiplier
-- Add User relations for tranche tracking

-- Create ReferralTranche table
CREATE TABLE "ReferralTranche" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "trancheAReleasedAt" TIMESTAMP(3),
    "trancheBReleasedAt" TIMESTAMP(3),
    "trancheCReleasedAt" TIMESTAMP(3),
    "trancheDReleasedAt" TIMESTAMP(3),
    "loginsOnDistinctDays" INTEGER NOT NULL DEFAULT 0,
    "distinctSalesVisited" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secondPurchaseId" TEXT,
    "trailCompletedAt" TIMESTAMP(3),
    "ownReferralSucceeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralTranche_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "ReferralTranche_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "ReferralTranche_referrerId_referredUserId_key" UNIQUE("referrerId", "referredUserId")
);

-- Create indexes on ReferralTranche
CREATE INDEX "ReferralTranche_referredUserId_idx" ON "ReferralTranche"("referredUserId");

-- Create ReferrerReputationScore table
CREATE TABLE "ReferrerReputationScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerId" TEXT NOT NULL UNIQUE,
    "totalReferrals" INTEGER NOT NULL DEFAULT 0,
    "fullyEarnedCount" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferrerReputationScore_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- Create index on ReferrerReputationScore
CREATE INDEX "ReferrerReputationScore_referrerId_idx" ON "ReferrerReputationScore"("referrerId");
