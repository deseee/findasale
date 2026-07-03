-- #561 offline POS cash-checkout queuing: idempotency key for replayed offline sales.
-- Additive, nullable, no backfill needed (existing rows get NULL, unaffected).
ALTER TABLE "Purchase" ADD COLUMN "clientTransactionId" TEXT;

CREATE INDEX "Purchase_clientTransactionId_idx" ON "Purchase"("clientTransactionId");
