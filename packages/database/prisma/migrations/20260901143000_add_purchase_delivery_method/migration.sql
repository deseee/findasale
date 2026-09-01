-- Migration: add_purchase_delivery_method
-- ADR-115 Phase 1 -- explicit deliveryMethod discriminator on Purchase.
-- Purely additive: one new nullable column on an existing table, no backfill
-- (same NULLABLE/NO-BACKFILL posture as the ADR-110 SHIPPING DESTINATION block
-- and the FEE SNAPSHOT block on this same model). Hand-authored to match
-- schema.prisma's Purchase.deliveryMethod field exactly -- `prisma migrate dev`
-- cannot run in this sandbox (packages/backend/node_modules/@prisma/client is
-- a broken NTFS junction here, confirmed recurring). Applied for real via
-- Patrick's own `prisma migrate deploy` run against Railway.

ALTER TABLE "Purchase" ADD COLUMN "deliveryMethod" TEXT;
