CREATE UNIQUE INDEX "Purchase_stripePaymentIntentId_unique"
ON "Purchase" ("stripePaymentIntentId")
WHERE "stripePaymentIntentId" IS NOT NULL;
