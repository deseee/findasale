-- ADR-136 Addendum C follow-up (2026-10-06): add the bulk-lot columns to "EbaySoldEvent" on FRESH databases.
--
-- WHY: "EbaySoldEvent" is created by the non-timestamped migration folder "ebay_multiquantity". Prisma applies migrations
-- in directory-name order, so on a fresh database (CI, a new dev machine) that folder runs AFTER every 2026... folder, and
-- 20261005170000_bulk_lot_ebay_bundles ran before the table existed (P3018 relation "EbaySoldEvent" does not exist). That
-- migration now skips its "EbaySoldEvent" statements when the table is missing; this migration (named "z..." so it sorts
-- after "ebay_multiquantity" and "stripe_event_idempotency") adds them once the table has been created.
--
-- SAFETY: additive and idempotent. On production, where the columns and constraints already exist, every statement is a
-- no-op. Columns are nullable with no backfill and no change to any existing column or constraint.
--
-- ROLLBACK (only while no bundle order has been recorded): see 20261005170000_bulk_lot_ebay_bundles.

ALTER TABLE "EbaySoldEvent" ADD COLUMN IF NOT EXISTS "bulkQuantity" INTEGER;
ALTER TABLE "EbaySoldEvent" ADD COLUMN IF NOT EXISTS "bulkShortfall" INTEGER;
ALTER TABLE "EbaySoldEvent" ADD COLUMN IF NOT EXISTS "bulkReleasedAt" TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EbaySoldEvent_bulkQuantity_check') THEN
    ALTER TABLE "EbaySoldEvent" ADD CONSTRAINT "EbaySoldEvent_bulkQuantity_check" CHECK ("bulkQuantity" IS NULL OR "bulkQuantity" >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EbaySoldEvent_bulkShortfall_check') THEN
    ALTER TABLE "EbaySoldEvent" ADD CONSTRAINT "EbaySoldEvent_bulkShortfall_check" CHECK ("bulkShortfall" IS NULL OR ("bulkShortfall" >= 0 AND "bulkShortfall" <= "bulkQuantity"));
  END IF;
END $$;
