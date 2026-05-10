-- S696 Schema Additions
-- Migration: 20260510120000_s696_schema_additions

-- Sale model additions
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "coversFee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "safetyNotes" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "estatePrivacyMode" BOOLEAN NOT NULL DEFAULT false;

-- Item model additions
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "costBasis" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "roomTag" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "bundleId" TEXT;

-- Organizer model additions
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "foundingOrgBadge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "venmoHandle" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "zelleHandle" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "province" TEXT;

-- New model: ItemBundle
CREATE TABLE IF NOT EXISTS "ItemBundle" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "bundlePrice" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemBundle_pkey" PRIMARY KEY ("id")
);

-- Foreign key: ItemBundle -> Sale
ALTER TABLE "ItemBundle" ADD CONSTRAINT "ItemBundle_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign key: Item -> ItemBundle (bundleId)
ALTER TABLE "Item" ADD CONSTRAINT "Item_bundleId_fkey"
    FOREIGN KEY ("bundleId") REFERENCES "ItemBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
