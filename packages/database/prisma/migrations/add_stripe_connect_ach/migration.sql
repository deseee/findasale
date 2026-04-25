-- Add Stripe Connect ACH fields to Organizer
ALTER TABLE "Organizer" ADD COLUMN "stripeConnectAccountId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "stripeConnectEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Add Stripe Connect fields to Consignor
ALTER TABLE "Consignor" ADD COLUMN "stripeAccountId" TEXT;
ALTER TABLE "Consignor" ADD COLUMN "stripeOnboarded" BOOLEAN NOT NULL DEFAULT false;

-- Add Stripe transfer tracking to ConsignorPayout
ALTER TABLE "ConsignorPayout" ADD COLUMN "stripeTransferId" TEXT;
