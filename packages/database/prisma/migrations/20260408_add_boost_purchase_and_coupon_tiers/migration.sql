-- Migration: 20260408_add_boost_purchase_and_coupon_tiers
-- Phase 2b: BoostPurchase dual-rail system + shopper XP coupon tiers
-- ADR: claude_docs/feature-notes/ADR-featured-boost-dual-rail-S418.md

-- Create enums for BoostPurchase
CREATE TYPE "BoostType" AS ENUM (
  'SALE_BUMP',
  'HAUL_VISIBILITY',
  'BOUNTY_VISIBILITY',
  'EVENT_SPONSORSHIP',
  'WISHLIST_NOTIFICATION',
  'SEASONAL_CHALLENGE_ACCESS',
  'GUIDE_PUBLICATION',
  'RARITY_BOOST'
);

CREATE TYPE "PaymentMethod" AS ENUM (
  'XP',
  'STRIPE'
);

CREATE TYPE "BoostStatus" AS ENUM (
  'ACTIVE',
  'EXPIRED',
  'REFUNDED',
  'FAILED',
  'PENDING'
);

-- Create BoostPurchase table
CREATE TABLE "BoostPurchase" (
  "id"                    TEXT NOT NULL,
  "userId"                TEXT NOT NULL,
  "boostType"             "BoostType" NOT NULL,
  "targetType"            TEXT,
  "targetId"              TEXT,
  "paymentMethod"         "PaymentMethod" NOT NULL,
  "xpCost"                INTEGER,
  "stripeAmountCents"     INTEGER,
  "stripePaymentIntentId" TEXT,
  "durationDays"          INTEGER NOT NULL,
  "activatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"             TIMESTAMP(3) NOT NULL,
  "status"                "BoostStatus" NOT NULL DEFAULT 'ACTIVE',
  "refundedAt"            TIMESTAMP(3),
  "refundReason"          TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BoostPurchase_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on stripePaymentIntentId
CREATE UNIQUE INDEX "BoostPurchase_stripePaymentIntentId_key"
  ON "BoostPurchase"("stripePaymentIntentId")
  WHERE "stripePaymentIntentId" IS NOT NULL;

-- Indexes for BoostPurchase
CREATE INDEX "BoostPurchase_userId_status_idx"      ON "BoostPurchase"("userId", "status");
CREATE INDEX "BoostPurchase_boostType_status_exp_idx" ON "BoostPurchase"("boostType", "status", "expiresAt");
CREATE INDEX "BoostPurchase_target_idx"              ON "BoostPurchase"("targetType", "targetId", "status");
CREATE INDEX "BoostPurchase_expiresAt_idx"           ON "BoostPurchase"("expiresAt");

-- FK: BoostPurchase.userId → User.id
ALTER TABLE "BoostPurchase"
  ADD CONSTRAINT "BoostPurchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Add shopper XP coupon fields to Coupon table
ALTER TABLE "Coupon"
  ADD COLUMN "generatedFromXp" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Coupon"
  ADD COLUMN "xpTier" TEXT;
