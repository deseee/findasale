-- Direct-charges migration (2026-08-08): persisted, authoritative charge shape on Purchase.
-- Additive-only. All 22 existing production Purchase rows correctly default to DESTINATION
-- (confirmed zero booth-cart-linked rows exist in Purchase; those live in the separate
-- BoothCartLeg table, which already has its own stripeAccountId field as naming precedent).
ALTER TABLE "Purchase" ADD COLUMN "chargeType" TEXT NOT NULL DEFAULT 'DESTINATION';
ALTER TABLE "Purchase" ADD COLUMN "stripeAccountId" TEXT;
CREATE INDEX "Purchase_chargeType_idx" ON "Purchase"("chargeType");
