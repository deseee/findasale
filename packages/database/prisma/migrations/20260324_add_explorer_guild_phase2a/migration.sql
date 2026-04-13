-- Phase 2a: Explorer's Guild XP Economy System
-- Adds guildXp tracking, explorer rank system, rarity boosts, and XP sinks

-- Step 1: Create ExplorerRank enum
CREATE TYPE "ExplorerRank" AS ENUM ('INITIATE', 'SCOUT', 'RANGER', 'SAGE', 'GRANDMASTER');

-- Step 2: Add guild XP and explorer rank fields to User table
ALTER TABLE "User" ADD COLUMN "guildXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "explorerRank" "ExplorerRank" NOT NULL DEFAULT 'INITIATE';
ALTER TABLE "User" ADD COLUMN "seasonalResetAt" TIMESTAMP(3);

-- Step 3: Create indexes on User table for leaderboard queries
CREATE INDEX "User_guildXp_idx" ON "User" ("guildXp");
CREATE INDEX "User_explorerRank_idx" ON "User" ("explorerRank");

-- Step 4: Extend PointsTransaction with XP sink fields
ALTER TABLE "PointsTransaction" ADD COLUMN "couponId" TEXT;
ALTER TABLE "PointsTransaction" ADD COLUMN "boostType" TEXT;
ALTER TABLE "PointsTransaction" ADD COLUMN "boostPct" INTEGER;
ALTER TABLE "PointsTransaction" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Step 5: Create indexes on PointsTransaction for better query performance
CREATE INDEX "PointsTransaction_userId_type_idx" ON "PointsTransaction" ("userId", "type");
CREATE INDEX "PointsTransaction_type_idx" ON "PointsTransaction" ("type");

-- Step 6: Add foreign key constraint from PointsTransaction to Coupon
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE SET NULL;

-- Step 7: Extend Coupon table with XP sink tracking
ALTER TABLE "Coupon" ADD COLUMN "xpSpent" INTEGER;

-- Step 8: Create RarityBoost table for shopper XP → rarity odds boost
CREATE TABLE "RarityBoost" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "boostPct" INTEGER NOT NULL DEFAULT 2,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RarityBoost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "RarityBoost_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE,
  CONSTRAINT "RarityBoost_userId_saleId_key" UNIQUE ("userId", "saleId")
);

-- Step 9: Create indexes on RarityBoost for efficient queries
CREATE INDEX "RarityBoost_userId_expiresAt_idx" ON "RarityBoost" ("userId", "expiresAt");
CREATE INDEX "RarityBoost_saleId_idx" ON "RarityBoost" ("saleId");
