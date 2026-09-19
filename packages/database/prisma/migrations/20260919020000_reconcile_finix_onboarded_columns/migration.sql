-- Reconcile schema drift: the Finix onboarding fields (finixIdentityId, finixMerchantId,
-- finixOnboarded) exist in schema.prisma on Organizer, Consignor, and VendorBooth, and all
-- nine columns already exist in production (applied out-of-band previously) -- but no
-- migration file was ever committed for them. `prisma migrate deploy` against a fresh
-- database (e.g. CI's ephemeral test Postgres) therefore never creates them, which broke
-- 17 backend test suites (stripe.e2e, auctionPremium, holdInvoiceClaim, payment.integration,
-- and others) with "column ... does not exist" (CI Typecheck & Tests, 2026-09-19). Auto-fixed
-- by the findasale-ci-sentry-health scheduled task. IF NOT EXISTS makes this safe to run
-- against production, where the columns already exist (confirmed via direct query:
-- finixIdentityId/finixMerchantId are nullable text, finixOnboarded is boolean NOT NULL
-- DEFAULT false).

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "finixIdentityId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "finixMerchantId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "finixOnboarded" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "finixIdentityId" TEXT;
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "finixMerchantId" TEXT;
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "finixOnboarded" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "finixIdentityId" TEXT;
ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "finixMerchantId" TEXT;
ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "finixOnboarded" BOOLEAN NOT NULL DEFAULT false;
