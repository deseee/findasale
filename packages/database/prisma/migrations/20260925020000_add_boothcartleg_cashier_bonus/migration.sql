-- ADR-127 (2026-09-25, cashier-bonus/self-checkout-fee-waiver build spec)
-- Adds a nullable FK snapshot of the cart's cashierBoothId onto BoothCartLeg (who was
-- operating the register when this leg was authorized -- null means a TEAM_MEMBER or the
-- HUB_OWNER personally cashiered, not a vendor booth) plus a queryable cashierBonusCents
-- column recording the mall's own bookkeeping of what it owes the cashiering vendor
-- out-of-band. Additive-only, nullable, existing rows get NULL/0 -- nothing reads these
-- columns until the computeLegFeeSplit()/call-site changes in this same dispatch ship.
-- onDelete SET NULL so deleting/soft-removing a VendorBooth never cascades into deleting
-- leg history (same posture as the existing cashierBoothId FK on BoothCartTransaction).
--
-- Down migration (safe at any time pre-launch of this feature):
--   ALTER TABLE "BoothCartLeg" DROP CONSTRAINT "BoothCartLeg_cashierBoothId_fkey";
--   ALTER TABLE "BoothCartLeg" DROP COLUMN "cashierBoothId";
--   ALTER TABLE "BoothCartLeg" DROP COLUMN "cashierBonusCents";

ALTER TABLE "BoothCartLeg" ADD COLUMN "cashierBoothId" TEXT;
ALTER TABLE "BoothCartLeg" ADD COLUMN "cashierBonusCents" INTEGER DEFAULT 0;
ALTER TABLE "BoothCartLeg" ADD CONSTRAINT "BoothCartLeg_cashierBoothId_fkey"
  FOREIGN KEY ("cashierBoothId") REFERENCES "VendorBooth"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "BoothCartLeg_cashierBoothId_idx" ON "BoothCartLeg"("cashierBoothId");
