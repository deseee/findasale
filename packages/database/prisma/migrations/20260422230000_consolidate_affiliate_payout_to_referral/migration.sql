-- Consolidate AffiliatePayout → AffiliateReferral (Batch 1 Foundation)
-- This migration:
-- 1. Backs up old AffiliateReferral to AffiliateReferral_OLD
-- 2. Drops the old AffiliatePayout model
-- 3. Creates new AffiliateReferral with consolidated schema
-- 4. Adds missing fields: qualifiedAt, payoutCalculatedAt, stripeTransferId
-- 5. Adds User.affiliateReferralCode if not exists

-- Rename old AffiliateReferral to backup
ALTER TABLE "AffiliateReferral" RENAME TO "AffiliateReferral_OLD";

-- Drop old AffiliatePayout model
DROP TABLE IF EXISTS "AffiliatePayout" CASCADE;

-- Create new consolidated AffiliateReferral with full schema
CREATE TABLE IF NOT EXISTS "AffiliateReferral" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "referrerId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "referralCode" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "qualifiedAt" TIMESTAMP(3),
  "payoutAmountCents" INTEGER,
  "payoutCalculatedAt" TIMESTAMP(3),
  "stripeTransferId" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffiliateReferral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AffiliateReferral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  UNIQUE("referrerId", "referredUserId")
);

-- Create indexes for performance
CREATE INDEX "AffiliateReferral_referrerId_idx" ON "AffiliateReferral" ("referrerId");
CREATE INDEX "AffiliateReferral_referredUserId_idx" ON "AffiliateReferral" ("referredUserId");
CREATE INDEX "AffiliateReferral_referralCode_idx" ON "AffiliateReferral" ("referralCode");
CREATE INDEX "AffiliateReferral_status_idx" ON "AffiliateReferral" ("status");
CREATE INDEX "AffiliateReferral_qualifiedAt_idx" ON "AffiliateReferral" ("qualifiedAt");

-- Migrate data from old AffiliateReferral to new one (preserve existing records)
INSERT INTO "AffiliateReferral" (
  "id",
  "referrerId",
  "referredUserId",
  "referralCode",
  "status",
  "payoutAmountCents",
  "paidAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "referrerId",
  "referredUserId",
  "referralCode",
  "status",
  "payoutAmountCents",
  "paidAt",
  "createdAt",
  "updatedAt"
FROM "AffiliateReferral_OLD"
ON CONFLICT DO NOTHING;

-- Drop backup after migration
DROP TABLE IF EXISTS "AffiliateReferral_OLD" CASCADE;

-- Add affiliateReferralCode to User if not already present
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "affiliateReferralCode" TEXT UNIQUE;

-- Update timestamp triggers
-- (Prisma manages this via @updatedAt)
