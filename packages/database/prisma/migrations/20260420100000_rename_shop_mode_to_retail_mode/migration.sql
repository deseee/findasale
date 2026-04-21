-- Rename Shop Mode → Retail Mode fields
ALTER TABLE "Organizer" RENAME COLUMN "hasShopMode" TO "hasRetailMode";
ALTER TABLE "Sale" RENAME COLUMN "isShopMode" TO "isRetailMode";
ALTER TABLE "Sale" RENAME COLUMN "shopAutoRenewDays" TO "retailAutoRenewDays";
DROP INDEX IF EXISTS "idx_sale_shop_mode_renewal";
CREATE INDEX "idx_sale_retail_mode_renewal" ON "Sale"("organizerId", "isRetailMode", "status", "endDate");
