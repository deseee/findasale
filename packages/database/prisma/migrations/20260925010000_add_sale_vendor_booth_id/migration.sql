-- ADR vendor-booth-sale-onboarding-gate (2026-09-25)
-- Adds a nullable FK from Sale to VendorBooth so a BOOTH-type sale can record which of the
-- creating vendor's own claimed booths it represents. Additive-only: existing rows get NULL,
-- no backfill needed. Safe to run at any time; onDelete SET NULL means deleting/soft-removing
-- a VendorBooth never cascades into deleting the vendor's sale history.

ALTER TABLE "Sale" ADD COLUMN "vendorBoothId" TEXT;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_vendorBoothId_fkey"
  FOREIGN KEY ("vendorBoothId") REFERENCES "VendorBooth"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Sale_vendorBoothId_idx" ON "Sale"("vendorBoothId");
