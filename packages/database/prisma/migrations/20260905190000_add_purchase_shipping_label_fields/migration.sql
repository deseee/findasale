-- Migration: add_purchase_shipping_label_fields
-- ADR-115 Phase 2 -- Shippo label-purchase result fields on Purchase.
-- Purely additive: five new nullable columns on an existing table, no backfill
-- (same NULLABLE/NO-BACKFILL posture as the DELIVERY METHOD, SHIPPING DESTINATION,
-- and FEE SNAPSHOT blocks on this same model). Hand-authored to match
-- schema.prisma's Purchase.shippingLabel* fields exactly -- `prisma migrate dev`
-- cannot run in this sandbox (packages/backend/node_modules/@prisma/client is
-- a broken NTFS junction here, confirmed recurring). Applied for real via
-- Patrick's own `prisma migrate deploy` run against Railway.

ALTER TABLE "Purchase" ADD COLUMN "shippingLabelUrl" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "shippingTrackingNumber" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "shippingCarrier" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "shippingLabelCostCents" INTEGER;
ALTER TABLE "Purchase" ADD COLUMN "shippingLabelPurchasedAt" TIMESTAMP(3);
