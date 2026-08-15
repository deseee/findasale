-- ADR-106 (2026-08-15): native-checkout shipping auto-pricing provenance --
-- additive, nullable/defaulted columns, no backfill required. Existing rows
-- read shippingPriceSource: null, shippingPriceConfirmedByOrganizer: false,
-- which correctly means "never auto-priced yet, eligible for auto-suggest on
-- next weight-touching save" -- the safe default for pre-existing items too.
ALTER TABLE "Item" ADD COLUMN "shippingPriceSource" TEXT;
ALTER TABLE "Item" ADD COLUMN "shippingPriceConfirmedByOrganizer" BOOLEAN NOT NULL DEFAULT false;
