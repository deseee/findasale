-- Feature #XXX: Shop Mode — always-live storefronts for resale shops/antique dealers

-- Add Shop Mode fields to Organizer model
ALTER TABLE "Organizer" ADD COLUMN "hasShopMode" BOOLEAN NOT NULL DEFAULT false;

-- Add Shop Mode fields to Sale model
ALTER TABLE "Sale" ADD COLUMN "isShopMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN "shopAutoRenewDays" INTEGER NOT NULL DEFAULT 30;

-- Create index for shop mode sales auto-renewal query performance
CREATE INDEX "idx_sale_shop_mode_renewal" ON "Sale"("organizerId", "isShopMode", "status", "endDate");
