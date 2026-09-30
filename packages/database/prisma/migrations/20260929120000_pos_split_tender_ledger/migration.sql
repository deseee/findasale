-- POS split-tender ledger + cash-leg recording (2026-09-29)
--
-- WHY: the live cash+card split-tender flow (inline Cash numpad, remainder to card via Send to
-- Phone / QR / manual card) had no durable record of the cash leg on the QR payment-link and
-- manual-card paths, non-idempotent cash-commission accrual on the phone path, and no way for a
-- refund to know how much of a split sale never touched the processor.
--
--   * POSPaymentLink.isSplitPayment / cashAmountCents / cardAmountCents -- record the cash leg
--     of a QR payment-link split (`amount` stays the CARD amount charged through the link).
--   * Purchase.cashLegAmount -- dollars of this row paid in cash; the processor refund for the
--     row is capped at amount - cashLegAmount.
--   * Purchase.refundCashPortion -- dollars of a refund the organizer must hand back in cash.
--   * CashFeeAccrual -- unique (sourceType, sourceId) ledger that makes accruing the cash-leg
--     commission onto Organizer.cashFeeBalance idempotent.
--
-- SAFETY: additive only. New nullable columns / one column with a constant default, one new
-- table. No DROP, no data rewrite, no backfill (NULL/false means "not a split sale" and is true
-- of every existing row). Fully idempotent: every statement is guarded (IF NOT EXISTS), so
-- re-running is a no-op. Apply manually.
--
-- Down migration (safe at any time -- nothing else depends on these objects yet):
--   DROP TABLE IF EXISTS "CashFeeAccrual";
--   ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "refundCashPortion";
--   ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "cashLegAmount";
--   ALTER TABLE "POSPaymentLink" DROP COLUMN IF EXISTS "cardAmountCents";
--   ALTER TABLE "POSPaymentLink" DROP COLUMN IF EXISTS "cashAmountCents";
--   ALTER TABLE "POSPaymentLink" DROP COLUMN IF EXISTS "isSplitPayment";

-- AlterTable: POSPaymentLink
ALTER TABLE "POSPaymentLink" ADD COLUMN IF NOT EXISTS "isSplitPayment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "POSPaymentLink" ADD COLUMN IF NOT EXISTS "cashAmountCents" INTEGER;
ALTER TABLE "POSPaymentLink" ADD COLUMN IF NOT EXISTS "cardAmountCents" INTEGER;

-- AlterTable: Purchase
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "cashLegAmount" DOUBLE PRECISION;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "refundCashPortion" DOUBLE PRECISION;

-- CreateTable: CashFeeAccrual
CREATE TABLE IF NOT EXISTS "CashFeeAccrual" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "cashAmountCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashFeeAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CashFeeAccrual_sourceType_sourceId_key" ON "CashFeeAccrual"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "CashFeeAccrual_organizerId_createdAt_idx" ON "CashFeeAccrual"("organizerId", "createdAt");
