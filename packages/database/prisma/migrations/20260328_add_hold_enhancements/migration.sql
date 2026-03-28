-- Feature #121: Hold System Enhancements
-- Add fraud detection and GPS validation to ItemReservation
-- Create SaleCheckin for per-shopper GPS validation
-- Create OrganizerHoldSettings for customization

-- AlterTable ItemReservation: add hold enhancement fields
ALTER TABLE "ItemReservation" ADD COLUMN "gpsLatitude" DOUBLE PRECISION,
ADD COLUMN "gpsLongitude" DOUBLE PRECISION,
ADD COLUMN "qrScanId" TEXT,
ADD COLUMN "fraudScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN "fraudFlags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable SaleCheckin
CREATE TABLE "SaleCheckin" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "qrScanned" BOOLEAN NOT NULL DEFAULT false,
    "qrScanId" TEXT,
    "arrivalRank" INTEGER,
    "checkinAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex SaleCheckin
CREATE UNIQUE INDEX "SaleCheckin_saleId_userId_key" ON "SaleCheckin"("saleId", "userId");
CREATE INDEX "SaleCheckin_saleId_checkinAt_idx" ON "SaleCheckin"("saleId", "checkinAt");
CREATE INDEX "SaleCheckin_userId_idx" ON "SaleCheckin"("userId");

-- Add FK SaleCheckin -> Sale
ALTER TABLE "SaleCheckin" ADD CONSTRAINT "SaleCheckin_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add FK SaleCheckin -> User
ALTER TABLE "SaleCheckin" ADD CONSTRAINT "SaleCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable OrganizerHoldSettings
CREATE TABLE "OrganizerHoldSettings" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "maxHoldsPerRank" INTEGER NOT NULL DEFAULT 3,
    "enableGpsValidation" BOOLEAN NOT NULL DEFAULT false,
    "enableQrValidation" BOOLEAN NOT NULL DEFAULT false,
    "maxHoldsPerSession" INTEGER NOT NULL DEFAULT 10,
    "fraudCheckEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSuspendThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerHoldSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex OrganizerHoldSettings
CREATE UNIQUE INDEX "OrganizerHoldSettings_organizerId_key" ON "OrganizerHoldSettings"("organizerId");

-- Add FK OrganizerHoldSettings -> Organizer
ALTER TABLE "OrganizerHoldSettings" ADD CONSTRAINT "OrganizerHoldSettings_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
