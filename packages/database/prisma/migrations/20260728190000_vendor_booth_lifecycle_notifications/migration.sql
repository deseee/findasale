-- Vendor booth lifecycle notification stamps (2026-07-28).
--
-- Purely additive: four nullable TIMESTAMP columns on "VendorBooth". Nothing is dropped,
-- nothing is retyped, no default is applied, and no existing row changes meaning.
--
-- Backfill: deliberately none. Every pre-existing booth gets NULL in all four columns,
-- which is the truth -- no lifecycle notification has ever been sent by this codebase.
-- Do NOT seed these from confirmedAt / rejectedAt / createdAt. Seeding them would be a
-- lie about what was delivered, and it would also permanently suppress the notification
-- for any booth currently sitting mid-lifecycle (for example a booth that has been
-- claimed but not yet confirmed -- the exact case these columns exist to fix).
--
-- ORDERING: this migration MUST be applied BEFORE (or in the same release as) the deploy
-- that ships services/vendorBoothLifecycleNotificationService.ts. That service selects
-- all four columns, and vendorBoothController.claimVendorBooth / updateVendorBooth /
-- getVendorBoothStripeStatus call prisma.vendorBooth.findUnique with no explicit select,
-- which makes the generated Prisma client emit every column in the model. Against a
-- database without these columns that is a Postgres 42703 undefined_column error, so the
-- Vendor Booths page and the claim endpoint would both 500.

ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "claimNotifiedAt" TIMESTAMP(3);

ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "confirmNotifiedAt" TIMESTAMP(3);

ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "decisionNotifiedAt" TIMESTAMP(3);

ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "stripeNotifiedAt" TIMESTAMP(3);
