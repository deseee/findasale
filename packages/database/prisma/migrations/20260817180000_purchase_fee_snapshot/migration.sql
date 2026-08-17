-- Purchase fee snapshot (2026-08-17)
--
-- WHY: "Purchase"."platformFeeAmount" stores the COMBINED Stripe application_fee_amount
-- (auction buyer premium + organizer commission) with no record of how it split. Every
-- organizer earnings surface therefore recomputed the split from LIVE config -- the premium
-- from today's platform constant, the commission from "Organizer"."subscriptionTier" as it
-- stands right now. A rate change, or an organizer upgrading SIMPLE -> PRO, silently restated
-- the reported fee on every sale they had ever made. These columns pin what was actually
-- charged, at charge time.
--
-- SAFETY: additive and nullable only. No DROP, no ALTER of an existing column, no NOT NULL, no
-- DEFAULT, no backfill. Historical rows stay NULL, which the reporting code reads as "unknown,
-- fall back to the existing recompute" -- so existing-row behaviour is unchanged. Backfilling
-- would mean inventing rates we do not have.

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "buyerPremiumAmount" DOUBLE PRECISION;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "buyerPremiumRate" DOUBLE PRECISION;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "commissionAmount" DOUBLE PRECISION;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "organizerAbsorbedPremium" BOOLEAN;
