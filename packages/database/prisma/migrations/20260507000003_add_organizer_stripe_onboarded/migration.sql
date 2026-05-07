-- Add stripeOnboarded to Organizer table
-- Missing from add_stripe_connect_ach migration which only added it to Consignor
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "stripeOnboarded" BOOLEAN NOT NULL DEFAULT false;
