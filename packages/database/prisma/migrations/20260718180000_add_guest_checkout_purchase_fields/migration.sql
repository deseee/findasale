-- Guest checkout (single-item Buy It Now): Purchase.userId was already nullable
-- (POS walk-ins). This migration adds guest-checkout-specific fields, purely additive,
-- nullable, no backfill, no locking risk.
-- Rollback:
--   DROP INDEX "Purchase_buyerCardFingerprint_idx";
--   ALTER TABLE "Purchase" DROP COLUMN "buyerCardFingerprint";
--   ALTER TABLE "Purchase" DROP COLUMN "guestName";

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "guestName" TEXT,
ADD COLUMN     "buyerCardFingerprint" TEXT;

-- CreateIndex
CREATE INDEX "Purchase_buyerCardFingerprint_idx" ON "Purchase"("buyerCardFingerprint");
