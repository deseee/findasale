-- Consolidate AffiliatePayout → AffiliateReferral (Batch 1 Foundation)
-- This migration:
-- 1. Renames OLD AffiliateReferral indexes so their names don't collide with the new table's indexes
-- 2. Backs up old AffiliateReferral to AffiliateReferral_OLD
-- 3. Drops the old AffiliatePayout model
-- 4. Creates new AffiliateReferral with consolidated schema
-- 5. Migrates preserved data
-- 6. Drops the _OLD backup (takes the renamed old indexes with it)
-- 7. Adds User.affiliateReferralCode if not already present

-- Step 1: Rename the indexes attached to the existing AffiliateReferral table.
-- PostgreSQL index names are global per schema. When we RENAME the table below,
-- the indexes travel with it but keep their names, which would collide with the
-- new indexes we create later. Rename them out of the way first.
ALTER INDEX IF EXISTS "AffiliateReferral_pkey"                 RENAME TO "AffiliateReferral_OLD_pkey";
ALTER INDEX IF EXISTS "AffiliateReferral_referralCode_key"     RENAME TO "AffiliateReferral_OLD_referralCode_key";
ALTER INDEX IF EXISTS "AffiliateReferral_referralCode_idx"     RENAME TO "AffiliateReferral_OLD_referralCode_idx";
ALTER INDEX IF EXISTS "AffiliateReferral_referrerId_idx"       RENAME TO "AffiliateReferral_OLD_referrerId_idx";
ALTER INDEX IF EXISTS "AffiliateReferral_referredUserId_idx"   RENAME TO "AffiliateReferral_OLD_referredUserId_idx";
ALTER INDEX IF EXISTS "AffiliateReferral_status_idx"           RENAME TO "AffiliateReferral_OLD_status_idx";

-- Step 2: Rename old AffiliateReferral to backup
ALTER TABLE "AffiliateReferral" RENAME TO "AffiliateReferral_OLD";

-- Step 3: Drop old AffiliatePayout model
DROP TABLE IF EXISTS "AffiliatePayout" CASCADE;

-- Step 4: Create new consolidated AffiliateReferral with full schema
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

-- Step 5: Create indexes for performance
CREATE INDEX "AffiliateReferral_referrerId_idx"     ON "AffiliateReferral" ("referrerId");
CREATE INDEX "AffiliateReferral_referredUserId_idx" ON "AffiliateReferral" ("referredUserId");
CREATE INDEX "AffiliateReferral_referralCode_idx"   ON "AffiliateReferral" ("referralCode");
CREATE INDEX "AffiliateReferral_status_idx"         ON "AffiliateReferral" ("status");
CREATE INDEX "AffiliateReferral_qualifiedAt_idx"    ON "AffiliateReferral" ("qualifiedAt");

-- Step 6: Migrate data from old AffiliateReferral to new one (preserve existing records)
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

-- Step 7: Drop backup (carries the renamed old indexes with it)
DROP TABLE IF EXISTS "AffiliateReferral_OLD" CASCADE;

-- Step 8: Add affiliateReferralCode to User if not already present
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "affiliateReferralCode" TEXT UNIQUE;

-- Prisma manages updatedAt via @updatedAt — no trigger needed.
