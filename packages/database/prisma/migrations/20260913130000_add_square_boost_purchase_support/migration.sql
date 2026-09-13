-- Square cash rail for boost XP-shortfall purchases (2026-09-13). Adds SQUARE as a
-- live PaymentMethod alongside XP (STRIPE stays permanently unreachable -- account
-- closed for fraud). Purely additive: new enum value, two nullable columns, one
-- unique index mirroring the existing stripePaymentIntentId column. Zero downtime,
-- safe against existing BoostPurchase rows (they simply have NULL in both new
-- columns). See claude_docs/STATE.md 2026-09-13 boost/cash-rail dispatch entry.

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'SQUARE';

ALTER TABLE "BoostPurchase" ADD COLUMN "squareAmountCents" INTEGER;
ALTER TABLE "BoostPurchase" ADD COLUMN "squarePaymentId" TEXT;

CREATE UNIQUE INDEX "BoostPurchase_squarePaymentId_key" ON "BoostPurchase"("squarePaymentId");
