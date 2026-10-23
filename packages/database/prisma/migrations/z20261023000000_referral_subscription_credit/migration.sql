-- Roadmap #661 (2026-10-23): organizer-to-organizer referral credit, paid as subscription credit.
--
-- WHAT
--   1. AffiliateReferral.referralCode loses its UNIQUE constraint. The column holds the REFERRER's own code, so the
--      second organizer a referrer brought in failed its whole registration transaction with a unique violation (P2002).
--      The non-unique index AffiliateReferral_referralCode_idx already exists and stays.
--   2. AffiliateReferral gains fraud-gate columns (ADR-119, decisions approved 2026-09-04). All defaulted or nullable.
--   3. New table AffiliateFraudSignal (one row per raised signal, mirrors ReferralFraudSignal).
--   4. New table SubscriptionCreditEntry (append-only credit ledger; balance = SUM of rows).
--
-- SAFETY: additive except the dropped unique constraint (relaxing a constraint can not fail on existing data).
-- Idempotent (IF EXISTS / IF NOT EXISTS) so a partial earlier run can be re-applied.
--
-- ROLLBACK (only if no referral has been created since, otherwise step 1 fails on duplicate codes):
--   DROP TABLE IF EXISTS "SubscriptionCreditEntry"; DROP TABLE IF EXISTS "AffiliateFraudSignal";
--   ALTER TABLE "AffiliateReferral" DROP COLUMN IF EXISTS "fraudReviewStatus", DROP COLUMN IF EXISTS "deviceFraudFlag",
--     DROP COLUMN IF EXISTS "cardFraudFlag", DROP COLUMN IF EXISTS "fraudCompositeScore", DROP COLUMN IF EXISTS "holdUntil",
--     DROP COLUMN IF EXISTS "reviewedByAdminId", DROP COLUMN IF EXISTS "reviewedAt";
--   (Re-adding the unique constraint on referralCode is NOT recommended: it re-breaks multi-referral signups.)

-- 1. The consolidated table declared the column inline as UNIQUE, which Postgres names <table>_<column>_key.
ALTER TABLE "AffiliateReferral" DROP CONSTRAINT IF EXISTS "AffiliateReferral_referralCode_key";
DROP INDEX IF EXISTS "AffiliateReferral_referralCode_key";
CREATE INDEX IF NOT EXISTS "AffiliateReferral_referralCode_idx" ON "AffiliateReferral"("referralCode");

-- 2. Fraud-gate columns
ALTER TABLE "AffiliateReferral" ADD COLUMN IF NOT EXISTS "fraudReviewStatus" TEXT NOT NULL DEFAULT 'CLEAR';
ALTER TABLE "AffiliateReferral" ADD COLUMN IF NOT EXISTS "deviceFraudFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AffiliateReferral" ADD COLUMN IF NOT EXISTS "cardFraudFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AffiliateReferral" ADD COLUMN IF NOT EXISTS "fraudCompositeScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AffiliateReferral" ADD COLUMN IF NOT EXISTS "holdUntil" TIMESTAMP(3);
ALTER TABLE "AffiliateReferral" ADD COLUMN IF NOT EXISTS "reviewedByAdminId" TEXT;
ALTER TABLE "AffiliateReferral" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "AffiliateReferral_fraudReviewStatus_idx" ON "AffiliateReferral"("fraudReviewStatus");

-- 3. AffiliateFraudSignal
CREATE TABLE IF NOT EXISTS "AffiliateFraudSignal" (
  "id" TEXT NOT NULL,
  "affiliateReferralId" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "purchaseId" TEXT,
  "signalType" TEXT NOT NULL,
  "confidenceScore" INTEGER NOT NULL DEFAULT 0,
  "flags" TEXT[],
  "reviewOutcome" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedByAdminId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateFraudSignal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateFraudSignal_affiliateReferralId_signalType_purchaseId_key" ON "AffiliateFraudSignal"("affiliateReferralId", "signalType", "purchaseId");
CREATE INDEX IF NOT EXISTS "AffiliateFraudSignal_referrerId_idx" ON "AffiliateFraudSignal"("referrerId");
CREATE INDEX IF NOT EXISTS "AffiliateFraudSignal_referredUserId_idx" ON "AffiliateFraudSignal"("referredUserId");
CREATE INDEX IF NOT EXISTS "AffiliateFraudSignal_reviewOutcome_idx" ON "AffiliateFraudSignal"("reviewOutcome");
DO $$ BEGIN
  ALTER TABLE "AffiliateFraudSignal" ADD CONSTRAINT "AffiliateFraudSignal_affiliateReferralId_fkey"
    FOREIGN KEY ("affiliateReferralId") REFERENCES "AffiliateReferral"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. SubscriptionCreditEntry
CREATE TABLE IF NOT EXISTS "SubscriptionCreditEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "availableAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT,
  "affiliateReferralId" TEXT,
  "sourcePurchaseId" TEXT,
  "netFeeCents" INTEGER,
  "commissionRateBps" INTEGER,
  "billingChargeId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionCreditEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionCreditEntry_idempotencyKey_key" ON "SubscriptionCreditEntry"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "SubscriptionCreditEntry_userId_status_availableAt_idx" ON "SubscriptionCreditEntry"("userId", "status", "availableAt");
CREATE INDEX IF NOT EXISTS "SubscriptionCreditEntry_affiliateReferralId_idx" ON "SubscriptionCreditEntry"("affiliateReferralId");
CREATE INDEX IF NOT EXISTS "SubscriptionCreditEntry_sourcePurchaseId_idx" ON "SubscriptionCreditEntry"("sourcePurchaseId");
DO $$ BEGIN
  ALTER TABLE "SubscriptionCreditEntry" ADD CONSTRAINT "SubscriptionCreditEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SubscriptionCreditEntry" ADD CONSTRAINT "SubscriptionCreditEntry_affiliateReferralId_fkey"
    FOREIGN KEY ("affiliateReferralId") REFERENCES "AffiliateReferral"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
