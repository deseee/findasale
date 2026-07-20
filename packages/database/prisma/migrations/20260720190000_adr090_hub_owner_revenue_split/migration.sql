-- ADR-090: VendorBooth 3-Party Payment Split (Platform / Vendor / Hub Owner)
-- Phase 2 + Phase 4 schema additions. Additive only, all new columns nullable, no
-- backfill needed, no destructive changes to any existing table.
--
-- Rollback:
--   DROP TABLE "VendorBoothFeeCharge";
--   ALTER TABLE "VendorBooth" DROP COLUMN "vendorStripeCustomerId";
--   ALTER TABLE "VendorBooth" DROP COLUMN "vendorPaymentMethodId";
--   DROP INDEX "BoothCartLeg_stripeTransferId_idx";
--   ALTER TABLE "BoothCartLeg" DROP COLUMN "hubOwnerShareAmount";
--   ALTER TABLE "BoothCartLeg" DROP COLUMN "stripeTransferId";

-- AlterTable: BoothCartLeg — Phase 2 hub-owner revenue-share tracking
ALTER TABLE "BoothCartLeg" ADD COLUMN     "hubOwnerShareAmount" DECIMAL(10,2),
ADD COLUMN     "stripeTransferId" TEXT;

CREATE INDEX "BoothCartLeg_stripeTransferId_idx" ON "BoothCartLeg"("stripeTransferId");

-- AlterTable: VendorBooth — Phase 4 pre-wire, platform-account saved payment method
ALTER TABLE "VendorBooth" ADD COLUMN     "vendorStripeCustomerId" TEXT,
ADD COLUMN     "vendorPaymentMethodId" TEXT;

-- CreateTable: VendorBoothFeeCharge (Phase 4 flat booth-fee periodic billing)
CREATE TABLE "VendorBoothFeeCharge" (
    "id" TEXT NOT NULL,
    "vendorBoothId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "stripeTransferId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorBoothFeeCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorBoothFeeCharge_stripePaymentIntentId_key" ON "VendorBoothFeeCharge"("stripePaymentIntentId");
CREATE UNIQUE INDEX "VendorBoothFeeCharge_vendorBoothId_periodStart_periodEnd_key" ON "VendorBoothFeeCharge"("vendorBoothId", "periodStart", "periodEnd");
CREATE INDEX "VendorBoothFeeCharge_vendorBoothId_idx" ON "VendorBoothFeeCharge"("vendorBoothId");
CREATE INDEX "VendorBoothFeeCharge_hubId_idx" ON "VendorBoothFeeCharge"("hubId");
CREATE INDEX "VendorBoothFeeCharge_status_idx" ON "VendorBoothFeeCharge"("status");
CREATE INDEX "VendorBoothFeeCharge_stripeTransferId_idx" ON "VendorBoothFeeCharge"("stripeTransferId");

ALTER TABLE "VendorBoothFeeCharge" ADD CONSTRAINT "VendorBoothFeeCharge_vendorBoothId_fkey"
    FOREIGN KEY ("vendorBoothId") REFERENCES "VendorBooth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
