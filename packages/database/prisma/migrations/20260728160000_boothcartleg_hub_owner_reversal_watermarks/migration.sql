-- P1 (2026-07-28): close the refund-vs-hub-owner-Transfer race on BoothCartLeg.
-- Additive + nullable only. No backfill of business data required: DEFAULT 0 on the two
-- watermark columns is the correct starting state for every existing leg (nothing owed,
-- nothing reversed). Safe to run online; ADD COLUMN with a constant DEFAULT is a
-- metadata-only operation on PostgreSQL 11+.

ALTER TABLE "BoothCartLeg" ADD COLUMN IF NOT EXISTS "hubOwnerReversalOwedCents" INTEGER DEFAULT 0;
ALTER TABLE "BoothCartLeg" ADD COLUMN IF NOT EXISTS "hubOwnerReversalDoneCents" INTEGER DEFAULT 0;
ALTER TABLE "BoothCartLeg" ADD COLUMN IF NOT EXISTS "hubOwnerTransferFailedAt" TIMESTAMP(3);
ALTER TABLE "BoothCartLeg" ADD COLUMN IF NOT EXISTS "hubOwnerTransferError" TEXT;

-- Reconciliation index: find legs whose hub-owner Transfer failed and was never retried.
CREATE INDEX IF NOT EXISTS "BoothCartLeg_hubOwnerTransferFailedAt_idx"
  ON "BoothCartLeg"("hubOwnerTransferFailedAt");
