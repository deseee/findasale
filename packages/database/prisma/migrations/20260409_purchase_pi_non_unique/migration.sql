-- Drop unique constraint on Purchase.stripePaymentIntentId
-- A single Stripe PaymentIntent (multi-item POS cart) can produce multiple Purchase rows.
-- The @unique constraint caused a P2002 error on the second item in any POS cart.
DROP INDEX IF EXISTS "Purchase_stripePaymentIntentId_key";

-- Add a regular index for lookup performance (webhook + capture flows use this field)
CREATE INDEX IF NOT EXISTS "Purchase_stripePaymentIntentId_idx" ON "Purchase"("stripePaymentIntentId");
