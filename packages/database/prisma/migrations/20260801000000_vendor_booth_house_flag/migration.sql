-- Fix 2 (2026-08-01): auto-provisioned "house booth" so a hub owner can sell their own
-- inventory through their own venue-mode register. isHubOwnerBooth marks the single
-- synthetic VendorBooth row per hub created lazily by houseBoothService.ts.
ALTER TABLE "VendorBooth" ADD COLUMN "isHubOwnerBooth" BOOLEAN NOT NULL DEFAULT false;

-- At most one house booth per hub. Partial index -- cannot be expressed in schema.prisma's
-- DSL, hand-written here.
CREATE UNIQUE INDEX "VendorBooth_hubId_house_booth_unique"
  ON "VendorBooth"("hubId") WHERE "isHubOwnerBooth" = true;
