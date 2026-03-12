-- Migration: add_cash_fee_balance_to_organizer
-- Adds cash platform fee tracking to Organizer table.
-- Cash sales accumulate 10% platform fees in this balance.
-- Fees are deducted from next Stripe payout request.
-- 30-day guardrail: advisory warning if balance > 0 and > 30 days old.

-- Add cash fee balance column (accumulated fees in dollars)
ALTER TABLE "Organizer" ADD COLUMN "cashFeeBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0;

-- Add timestamp for 30-day guardrail checks
ALTER TABLE "Organizer" ADD COLUMN "cashFeeBalanceUpdatedAt" TIMESTAMP(3);

-- Create index for guardrail queries (balance > 0 AND updatedAt > 30 days old)
CREATE INDEX "idx_Organizer_cashFeeBalance_updatedAt" ON "Organizer"("cashFeeBalance", "cashFeeBalanceUpdatedAt");