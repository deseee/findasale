-- Per-vendor booth sale notification (2026-07-28).
--
-- Purely additive: two nullable columns on "BoothCartLeg". Nothing is dropped, nothing is
-- retyped, no default is applied, and no existing row changes meaning. ADD COLUMN with no
-- default is metadata-only on PostgreSQL 11+, so this is safe to run online.
--
--   platformFeeCents      the platform's cut for this leg, exactly as computeLegFeeSplit
--                         computed it at authorize time (vendorBoothCartController.ts).
--                         Stored so the vendor-facing disclosure quotes the number that was
--                         actually charged rather than re-deriving it from the organizer's
--                         MUTABLE subscriptionTier at notify time.
--   vendorSaleNotifiedAt  idempotency stamp for the per-leg "your item sold" notification.
--
-- Backfill: deliberately none, for BOTH columns.
--   platformFeeCents stays NULL on every already-captured leg. The value is not recoverable:
--   only hubOwnerShareAmount was persisted, and the tier that produced the platform rate may
--   have changed since. The notifier treats NULL as "fee breakdown unknown" and reports gross
--   only. Do NOT seed it by recomputing getPlatformFeeRate against today's tier -- that would
--   print a fee that was never taken.
--
--   vendorSaleNotifiedAt stays NULL, which is the truth: no vendor has ever been told about a
--   sale by this codebase. It is left NULL rather than seeded from createdAt because the
--   notifier is only ever invoked from the live capture path going forward, so historical
--   legs are never revisited and cannot produce a backlog of emails about old sales.
--
-- ORDERING WARNING -- APPLY THIS MIGRATION BEFORE OR WITH THE CODE DEPLOY, NEVER AFTER.
-- vendorBoothCartController.captureBoothCart reads legs with
-- prisma.boothCartLeg.findMany({ where: ... }) and NO explicit select, and
-- transferHubOwnerShareForLeg / stripeController.createRefund both use
-- prisma.boothCartLeg.findUnique with no select. The generated Prisma client emits EVERY
-- column in the model for those queries. Against a database missing these two columns that
-- is a Postgres 42703 undefined_column error, which would 500 the capture endpoint, the
-- hub-owner Transfer and the refund path -- i.e. it would break live card payments at the
-- register. Migrate first.

ALTER TABLE "BoothCartLeg" ADD COLUMN IF NOT EXISTS "platformFeeCents" INTEGER;

ALTER TABLE "BoothCartLeg" ADD COLUMN IF NOT EXISTS "vendorSaleNotifiedAt" TIMESTAMP(3);
