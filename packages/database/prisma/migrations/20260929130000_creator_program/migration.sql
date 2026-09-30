-- Creator program (2026-09-29): finish the per-sale affiliate ("creator") program.
--
-- Adds three tables:
--   CreatorProfile      self-serve opt-in profile (terms acceptance, unique creator code); the gate
--                       for generating per-sale affiliate links. No role string is assigned.
--   AffiliateClick      de-duplicated click ledger, unique per (link, hashed IP, UTC day) so the
--                       same visitor cannot inflate AffiliateLink.clicks.
--   AffiliateConversion commission ledger, one row per attributed paid Purchase (purchaseId unique).
--                       Nothing is paid automatically: payoutStatus stays UNPAID until an admin acts.
--
-- SAFETY: additive only. New tables, indexes and foreign keys; no change to any existing column and
-- no DROP. Every statement is idempotent (IF NOT EXISTS / duplicate_object guard), safe to re-run.
--
-- Down migration (safe at any time; nothing outside the creator program reads these tables):
--   DROP TABLE IF EXISTS "AffiliateConversion";
--   DROP TABLE IF EXISTS "AffiliateClick";
--   DROP TABLE IF EXISTS "CreatorProfile";

-- CreateTable: CreatorProfile
CREATE TABLE IF NOT EXISTS "CreatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "notifyOnCommission" BOOLEAN NOT NULL DEFAULT true,
    "notifyWeeklySummary" BOOLEAN NOT NULL DEFAULT false,
    "lastSummarySentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreatorProfile_userId_key" ON "CreatorProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CreatorProfile_code_key" ON "CreatorProfile"("code");
CREATE INDEX IF NOT EXISTS "CreatorProfile_status_idx" ON "CreatorProfile"("status");

DO $$ BEGIN
    ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: AffiliateClick
CREATE TABLE IF NOT EXISTS "AffiliateClick" (
    "id" TEXT NOT NULL,
    "affiliateLinkId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateClick_affiliateLinkId_ipHash_day_key" ON "AffiliateClick"("affiliateLinkId", "ipHash", "day");
CREATE INDEX IF NOT EXISTS "AffiliateClick_affiliateLinkId_createdAt_idx" ON "AffiliateClick"("affiliateLinkId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "AffiliateClick" ADD CONSTRAINT "AffiliateClick_affiliateLinkId_fkey"
        FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: AffiliateConversion
CREATE TABLE IF NOT EXISTS "AffiliateConversion" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "affiliateLinkId" TEXT,
    "creatorUserId" TEXT NOT NULL,
    "saleId" TEXT,
    "purchaseAmountCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "commissionRateBps" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "eligibleAt" TIMESTAMP(3) NOT NULL,
    "payoutStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "payoutNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateConversion_pkey" PRIMARY KEY ("id")
);

-- Idempotent catch-up for a database where an earlier draft of this migration already created the table
-- without the admin payout columns.
ALTER TABLE "AffiliateConversion" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "AffiliateConversion" ADD COLUMN IF NOT EXISTS "payoutNote" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateConversion_purchaseId_key" ON "AffiliateConversion"("purchaseId");
CREATE INDEX IF NOT EXISTS "AffiliateConversion_creatorUserId_createdAt_idx" ON "AffiliateConversion"("creatorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AffiliateConversion_affiliateLinkId_idx" ON "AffiliateConversion"("affiliateLinkId");
CREATE INDEX IF NOT EXISTS "AffiliateConversion_saleId_idx" ON "AffiliateConversion"("saleId");

DO $$ BEGIN
    ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_purchaseId_fkey"
        FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_affiliateLinkId_fkey"
        FOREIGN KEY ("affiliateLinkId") REFERENCES "AffiliateLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_creatorUserId_fkey"
        FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
