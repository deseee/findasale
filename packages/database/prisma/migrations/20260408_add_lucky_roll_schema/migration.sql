-- Phase 2b: Lucky Roll schema additions

-- 1. Add Lucky Roll tracking fields to User
ALTER TABLE "User" ADD COLUMN "luckyRollPityCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "luckyRollPityYear" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "luckyRollLastRolledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "luckyRollStreakBad" INTEGER NOT NULL DEFAULT 0;

-- 2. Create LuckyRollOutcome enum
CREATE TYPE "LuckyRollOutcome" AS ENUM (
  'CONSOLATION', 'XP_50', 'XP_100', 'XP_200', 'COUPON_1', 'XP_500', 'COSMETIC_RARE'
);

-- 3. Create LuckyRoll event log table
CREATE TABLE "LuckyRoll" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "outcome"     "LuckyRollOutcome" NOT NULL,
  "xpAwarded"   INTEGER,
  "xpSpent"     INTEGER NOT NULL DEFAULT 100,
  "seedHash"    TEXT NOT NULL,
  "rollNumber"  INTEGER NOT NULL,
  "pityFired"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LuckyRoll_pkey" PRIMARY KEY ("id")
);

-- 4. FK and indexes
ALTER TABLE "LuckyRoll" ADD CONSTRAINT "LuckyRoll_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "LuckyRoll_userId_idx" ON "LuckyRoll"("userId");
CREATE INDEX "LuckyRoll_userId_createdAt_idx" ON "LuckyRoll"("userId", "createdAt");
