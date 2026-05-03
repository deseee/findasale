-- CreateTable: ShopperOrganizerIntroduction
-- Tracks when a shopper introduces an organizer to FindA.Sale
-- Used for referral XP awards: claimed storefront (200 XP), PRO upgrade within 60d (300 XP), quality tier (100 XP)

CREATE TABLE "ShopperOrganizerIntroduction" (
    "id" TEXT NOT NULL,
    "shopperId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "introducedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "upgradedAt" TIMESTAMP(3),
    "qualityAt" TIMESTAMP(3),

    CONSTRAINT "ShopperOrganizerIntroduction_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ShopperOrganizerIntroduction_shopperId_organizerId_key" ON "ShopperOrganizerIntroduction"("shopperId", "organizerId");
CREATE INDEX "ShopperOrganizerIntroduction_shopperId_idx" ON "ShopperOrganizerIntroduction"("shopperId");
CREATE INDEX "ShopperOrganizerIntroduction_organizerId_idx" ON "ShopperOrganizerIntroduction"("organizerId");
CREATE INDEX "ShopperOrganizerIntroduction_introducedAt_idx" ON "ShopperOrganizerIntroduction"("introducedAt");

-- Foreign Keys
ALTER TABLE "ShopperOrganizerIntroduction" ADD CONSTRAINT "ShopperOrganizerIntroduction_shopperId_fkey" FOREIGN KEY ("shopperId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopperOrganizerIntroduction" ADD CONSTRAINT "ShopperOrganizerIntroduction_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
