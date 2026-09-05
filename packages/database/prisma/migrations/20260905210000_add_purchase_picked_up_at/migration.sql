-- Migration: add_purchase_picked_up_at
-- ADR-115 Phase 3 -- Orders page: local-pickup confirmation marker on Purchase.
-- Purely additive: one new nullable column on an existing table, no backfill (same
-- NULLABLE/NO-BACKFILL posture as the SHIPPING LABEL PURCHASE, DELIVERY METHOD, and
-- FEE SNAPSHOT blocks on this same model). Hand-authored to match schema.prisma's
-- Purchase.pickedUpAt field exactly -- `prisma migrate dev` cannot run in this
-- sandbox (packages/backend/node_modules/@prisma/client is a broken NTFS junction
-- here, confirmed recurring). Applied for real via Patrick's own
-- `prisma migrate deploy` run against Railway.

ALTER TABLE "Purchase" ADD COLUMN "pickedUpAt" TIMESTAMP(3);
