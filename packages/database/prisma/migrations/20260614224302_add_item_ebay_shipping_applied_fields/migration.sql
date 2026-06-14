ALTER TABLE "Item" ADD COLUMN "ebayFulfillmentPolicyId" TEXT;
ALTER TABLE "Item" ADD COLUMN "ebayShippingAmountCents" INTEGER;
ALTER TABLE "Item" ADD COLUMN "ebayShippingRatedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "ebayRateVersion" TEXT;
