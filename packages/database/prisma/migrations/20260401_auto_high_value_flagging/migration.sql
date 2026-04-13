-- Migration: Auto High-Value Item Flagging
-- Date: 2026-04-01
-- Feature: #371 - Auto-flag items as high-value based on category, price, and AI confidence

-- Step 1: Add columns to Item table
ALTER TABLE "Item"
ADD COLUMN IF NOT EXISTS "highValueSource" VARCHAR(50) DEFAULT 'MANUAL',
ADD COLUMN IF NOT EXISTS "highValueFlaggedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "isHighValueLocked" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Add columns to Sale table
ALTER TABLE "Sale"
ADD COLUMN IF NOT EXISTS "highValueThresholdUSD" DECIMAL(65, 30) NOT NULL DEFAULT 500,
ADD COLUMN IF NOT EXISTS "autoFlagHighValue" BOOLEAN NOT NULL DEFAULT true;

-- Step 3: Create index for auto-flagged items query performance
CREATE INDEX IF NOT EXISTS "Item_highValueSource_idx" ON "Item"("highValueSource");
