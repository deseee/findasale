-- eBay Push — publish-mode cascade + shipping smart-pick (organizer-level defaults)
-- Adds: EbayPublishMode enum, Organizer.ebayDefaultPublishMode, Organizer.ebayDefaultShippingPolicyId
-- Idempotent: safe to re-run.

-- 1. Create the EbayPublishMode enum (idempotent)
DO $$ BEGIN
  CREATE TYPE "EbayPublishMode" AS ENUM ('DRAFT', 'LIVE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add Organizer.ebayDefaultPublishMode (default DRAFT, not null)
ALTER TABLE "Organizer"
  ADD COLUMN IF NOT EXISTS "ebayDefaultPublishMode" "EbayPublishMode" NOT NULL DEFAULT 'DRAFT';

-- 3. Add Organizer.ebayDefaultShippingPolicyId (nullable — null means smart-pick)
ALTER TABLE "Organizer"
  ADD COLUMN IF NOT EXISTS "ebayDefaultShippingPolicyId" TEXT;
