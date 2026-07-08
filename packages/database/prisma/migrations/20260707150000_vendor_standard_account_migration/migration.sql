-- ADR-020: Vendor Booth / Consignor Standard-Account Migration (2026-07-07)
-- Adds account-type tracking to VendorBooth/Consignor (Stripe does not allow
-- changing an existing account's type, so we must record which type each row's
-- stripeAccountId actually is) and a new BoothCartLeg table to track one row
-- per vendor-booth "leg" of a roaming multi-booth cart checkout (replaces the
-- old single-PaymentIntent-per-cart model with one PaymentIntent per booth,
-- each scoped to that booth's own Direct-charge Standard account).
--
-- Additive only. No destructive changes to any existing table.
-- stripeAccountType defaults to 'express' for all pre-existing rows (the only
-- account type ever created before this migration) — 0 backfill needed beyond
-- the column default itself.

-- AlterTable: VendorBooth — track which Stripe account type stripeAccountId is
ALTER TABLE "VendorBooth" ADD COLUMN "stripeAccountType" TEXT DEFAULT 'express';

-- AlterTable: Consignor — same tracking, mirrors VendorBooth
ALTER TABLE "Consignor" ADD COLUMN "stripeAccountType" TEXT DEFAULT 'express';

-- CreateTable: BoothCartLeg
CREATE TABLE "BoothCartLeg" (
    "id" TEXT NOT NULL,
    "cartTransactionId" TEXT NOT NULL,
    "vendorBoothId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "rail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoothCartLeg_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoothCartLeg_stripePaymentIntentId_key" ON "BoothCartLeg"("stripePaymentIntentId");
CREATE INDEX "BoothCartLeg_cartTransactionId_idx" ON "BoothCartLeg"("cartTransactionId");
CREATE INDEX "BoothCartLeg_vendorBoothId_idx" ON "BoothCartLeg"("vendorBoothId");
CREATE INDEX "BoothCartLeg_stripePaymentIntentId_idx" ON "BoothCartLeg"("stripePaymentIntentId");
CREATE INDEX "BoothCartLeg_status_idx" ON "BoothCartLeg"("status");

ALTER TABLE "BoothCartLeg" ADD CONSTRAINT "BoothCartLeg_cartTransactionId_fkey"
    FOREIGN KEY ("cartTransactionId") REFERENCES "BoothCartTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoothCartLeg" ADD CONSTRAINT "BoothCartLeg_vendorBoothId_fkey"
    FOREIGN KEY ("vendorBoothId") REFERENCES "VendorBooth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (manual, per Architect skill's rollback-format rule — ADR-020 flagged
-- that a schema addition made during implementation needs its own rollback block):
--   DROP TABLE "BoothCartLeg";
--   ALTER TABLE "Consignor" DROP COLUMN "stripeAccountType";
--   ALTER TABLE "VendorBooth" DROP COLUMN "stripeAccountType";
