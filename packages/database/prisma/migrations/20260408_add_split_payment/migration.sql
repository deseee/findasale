-- Add split payment fields to POSPaymentRequest
ALTER TABLE "POSPaymentRequest"
ADD COLUMN "isSplitPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cashAmountCents" INTEGER,
ADD COLUMN "cardAmountCents" INTEGER;

-- Add index for split payment lookups
CREATE INDEX idx_pos_split_payment ON "POSPaymentRequest"("isSplitPayment") WHERE "isSplitPayment" = true;
