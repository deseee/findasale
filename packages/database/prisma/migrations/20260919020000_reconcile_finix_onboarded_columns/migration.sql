-- Reconcile schema drift: finixOnboarded columns exist in schema.prisma (and in
-- production, applied out-of-band previously) but had no corresponding migration
-- file, so `prisma migrate deploy` against a fresh database (e.g. CI's test DB)
-- never created them, causing stripe.e2e.test.ts to fail with "column finixOnboarded
-- does not exist" (CI Typecheck & Tests run 35418948125, 2026-09-19). Auto-fixed
-- by the findasale-ci-sentry-health scheduled task. IF NOT EXISTS makes this safe
-- to run against production, where the columns already exist (confirmed via direct
-- query: all three are boolean NOT NULL DEFAULT false).

ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "finixOnboarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "finixOnboarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "finixOnboarded" BOOLEAN NOT NULL DEFAULT false;
