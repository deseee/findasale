-- Feature #XXX: Shopify Cross-Listing
-- Add Shopify connection fields to Organizer
ALTER TABLE "Organizer" ADD COLUMN "shopifyAccessToken" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "shopifyShopDomain" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "shopifyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Create ShopifyListing model table
CREATE TABLE "ShopifyListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL UNIQUE,
    "organizerId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopifyListing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE,
    CONSTRAINT "ShopifyListing_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer" ("id") ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX "ShopifyListing_itemId_idx" ON "ShopifyListing"("itemId");
CREATE INDEX "ShopifyListing_organizerId_idx" ON "ShopifyListing"("organizerId");
CREATE INDEX "ShopifyListing_status_idx" ON "ShopifyListing"("status");
