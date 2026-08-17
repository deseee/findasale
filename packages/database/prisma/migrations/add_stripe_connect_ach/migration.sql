-- Add Stripe Connect ACH fields to Organizer
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "stripeConnectAccountId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "stripeConnectEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Add Stripe Connect fields to Consignor
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT;
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "stripeOnboarded" BOOLEAN NOT NULL DEFAULT false;

-- Add Stripe transfer tracking to ConsignorPayout
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "stripeTransferId" TEXT;
