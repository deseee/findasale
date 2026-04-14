-- AddColumn ebayShippingClassification and ebayShippingOverride to Item
ALTER TABLE "Item" ADD COLUMN "ebayShippingClassification" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "Item" ADD COLUMN "ebayShippingOverride" TEXT;
