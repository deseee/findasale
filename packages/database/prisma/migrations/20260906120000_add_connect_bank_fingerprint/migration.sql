-- Migration: add_connect_bank_fingerprint
-- S1198 (2026-09-06): synthetic-identity Stripe Connect fraud-ring incident. Two different
-- "vendor/consignor" identities shared one bank account (same routing number + same Stripe
-- bank-account fingerprint) across two different Connect accounts registered through
-- FindA.Sale's own onboarding. FindA.Sale had no check of its own that would have caught
-- this before Stripe's own Connect risk review did. This migration is purely additive:
-- one new table (ConnectBankFingerprint) + one new nullable/defaulted boolean+string pair
-- on each of the three existing Connect-account-holder tables (Organizer, Consignor,
-- VendorBooth). No existing column is altered, dropped, or backfilled, and no existing row
-- is touched by this migration (all new columns default false/NULL). Hand-authored to match
-- schema.prisma exactly -- `prisma migrate dev` cannot run in this sandbox
-- (packages/backend/node_modules/@prisma/client is a broken NTFS junction here, confirmed
-- recurring across prior sessions). Applied for real via Patrick's own
-- `prisma migrate deploy` run against Railway.

-- Composite unique includes ownerType/ownerId (not just stripeAccountId+fingerprint):
-- the SAME physical Stripe account can legitimately map to more than one FindA.Sale
-- owner row (e.g. an operator who is both an Organizer and a VendorBooth) -- see
-- stripeController.ts's account.updated handler, which already does this same
-- one-account-many-owners resolution today.
-- New table: one row per (stripeAccountId, fingerprint) pair ever seen on any connected
-- account, populated from the account.updated webhook. @@index([fingerprint]) is the whole
-- point of this table -- it is what lets connectAccountGuard.ts detect, in a single fast
-- indexed lookup, whether a newly-seen bank account is already attached to a DIFFERENT
-- Stripe Connect account somewhere else on the platform.
CREATE TABLE IF NOT EXISTS "ConnectBankFingerprint" (
    "id"                TEXT NOT NULL,
    "stripeAccountId"   TEXT NOT NULL,
    "fingerprint"       TEXT NOT NULL,
    "last4"             TEXT,
    "bankName"          TEXT,
    "routingLast4"      TEXT,
    "ownerType"         TEXT NOT NULL,
    "ownerId"           TEXT NOT NULL,
    "flagged"           BOOLEAN NOT NULL DEFAULT false,
    "flagReason"        TEXT,
    "reviewOutcome"     TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "reviewedAt"        TIMESTAMP(3),
    "notes"             TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectBankFingerprint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConnectBankFingerprint_stripeAccountId_fingerprint_ownerType_ownerId_key" UNIQUE ("stripeAccountId", "fingerprint", "ownerType", "ownerId")
);

CREATE INDEX IF NOT EXISTS "ConnectBankFingerprint_fingerprint_idx" ON "ConnectBankFingerprint"("fingerprint");
CREATE INDEX IF NOT EXISTS "ConnectBankFingerprint_ownerType_ownerId_idx" ON "ConnectBankFingerprint"("ownerType", "ownerId");
CREATE INDEX IF NOT EXISTS "ConnectBankFingerprint_flagged_idx" ON "ConnectBankFingerprint"("flagged");
CREATE INDEX IF NOT EXISTS "ConnectBankFingerprint_reviewOutcome_idx" ON "ConnectBankFingerprint"("reviewOutcome");

-- Admin-review flag + reason on each of the three existing Connect-account-holder tables.
-- Never auto-blocks onboarding or existing functionality -- see the ConnectBankFingerprint
-- model comment in schema.prisma for why a hard block is not used (legitimate shared-bank
-- cases already exist in this product, e.g. ADR-090's own reuse of one Organizer's
-- stripeConnectId across the Organizer + hub-owner roles).
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "payoutsFlaggedForReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "payoutsFlaggedReason" TEXT;
CREATE INDEX IF NOT EXISTS "Organizer_payoutsFlaggedForReview_idx" ON "Organizer"("payoutsFlaggedForReview");

ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "payoutsFlaggedForReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "payoutsFlaggedReason" TEXT;
CREATE INDEX IF NOT EXISTS "Consignor_payoutsFlaggedForReview_idx" ON "Consignor"("payoutsFlaggedForReview");

ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "payoutsFlaggedForReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "payoutsFlaggedReason" TEXT;
CREATE INDEX IF NOT EXISTS "VendorBooth_payoutsFlaggedForReview_idx" ON "VendorBooth"("payoutsFlaggedForReview");
