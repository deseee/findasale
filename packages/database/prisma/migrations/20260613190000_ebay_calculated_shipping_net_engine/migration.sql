-- eBay calculated-shipping + fee-aware net-proceeds + package-estimation system
-- Locked product decisions: default shipping = CALCULATED (buyer pays); existing
-- organizers with non-empty weightTierMappings keep FLAT_TIERS behavior.

-- ── Item: package-estimate provenance fields ────────────────────────────────
ALTER TABLE "Item" ADD COLUMN "packageEstimateSource" TEXT;
ALTER TABLE "Item" ADD COLUMN "packageEstimateConfidence" DECIMAL(3,2);
ALTER TABLE "Item" ADD COLUMN "packageConfirmedByOrganizer" BOOLEAN NOT NULL DEFAULT false;

-- ── EbayConnection: calculated fulfillment policy provisioning ───────────────
ALTER TABLE "EbayConnection" ADD COLUMN "calculatedFulfillmentPolicyId" TEXT;
ALTER TABLE "EbayConnection" ADD COLUMN "calculatedPolicyProvisionedAt" TIMESTAMP(3);
ALTER TABLE "EbayConnection" ADD COLUMN "handlingTimeDays" INTEGER NOT NULL DEFAULT 3;

-- ── EbayPolicyMapping: shipping mode + free-shipping opt-in ──────────────────
ALTER TABLE "EbayPolicyMapping" ADD COLUMN "shippingMode" TEXT NOT NULL DEFAULT 'CALCULATED';
ALTER TABLE "EbayPolicyMapping" ADD COLUMN "freeShippingOptIn" BOOLEAN NOT NULL DEFAULT false;

-- DATA BACKFILL: existing organizers who already configured weight-tier flat rates
-- must keep their live FLAT_TIERS behavior (do not silently switch them to CALCULATED).
-- weightTierMappings is JSON; treat NULL and the empty array '[]' as "no tiers".
UPDATE "EbayPolicyMapping"
SET "shippingMode" = 'FLAT_TIERS'
WHERE "weightTierMappings" IS NOT NULL
  AND "weightTierMappings"::text <> '[]'
  AND "weightTierMappings"::text <> 'null';

-- ── PackageProfile: global package-dimension lookup table ────────────────────
CREATE TABLE "PackageProfile" (
    "id" TEXT NOT NULL,
    "ebayCategoryId" TEXT,
    "category" TEXT,
    "keyword" TEXT,
    "weightOz" INTEGER NOT NULL,
    "lengthIn" DECIMAL(6,2) NOT NULL,
    "widthIn" DECIMAL(6,2) NOT NULL,
    "heightIn" DECIMAL(6,2) NOT NULL,
    "packageType" TEXT NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL DEFAULT 0.50,
    "source" TEXT NOT NULL DEFAULT 'SEED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PackageProfile_ebayCategoryId_idx" ON "PackageProfile"("ebayCategoryId");
CREATE INDEX "PackageProfile_category_idx" ON "PackageProfile"("category");
CREATE INDEX "PackageProfile_keyword_idx" ON "PackageProfile"("keyword");

-- ── EbayCategoryFee: FVF rates by category for the net-proceeds engine ───────
CREATE TABLE "EbayCategoryFee" (
    "id" TEXT NOT NULL,
    "ebayCategoryId" TEXT,
    "categoryLabel" TEXT,
    "fvfPercent" DECIMAL(5,4) NOT NULL,
    "perOrderFeeCents" INTEGER NOT NULL DEFAULT 40,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbayCategoryFee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EbayCategoryFee_ebayCategoryId_key" ON "EbayCategoryFee"("ebayCategoryId");
