-- Hold-to-Pay feature: Add HoldInvoice model and related schema changes

-- Add invoice status enum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- Add invoiceId to ItemReservation
ALTER TABLE "ItemReservation" ADD COLUMN "invoiceId" TEXT UNIQUE;

-- Add flashLiquidationEnabled to OrganizerHoldSettings
ALTER TABLE "OrganizerHoldSettings" ADD COLUMN "flashLiquidationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Create HoldInvoice table
CREATE TABLE "HoldInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reservationId" TEXT NOT NULL UNIQUE,
    "shopperUserId" TEXT NOT NULL,
    "organizerUserId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "stripeSessionId" TEXT UNIQUE,
    "stripePaymentIntentId" TEXT UNIQUE,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" INTEGER NOT NULL,
    "platformFeeAmount" INTEGER NOT NULL,
    "stripeFeeAmount" INTEGER,
    "itemIds" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HoldInvoice_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "ItemReservation" ("id") ON DELETE CASCADE,
    CONSTRAINT "HoldInvoice_shopperUserId_fkey" FOREIGN KEY ("shopperUserId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "HoldInvoice_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "HoldInvoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE
);

-- Create indices for HoldInvoice
CREATE INDEX "HoldInvoice_saleId_status_idx" ON "HoldInvoice"("saleId", "status");
CREATE INDEX "HoldInvoice_shopperUserId_idx" ON "HoldInvoice"("shopperUserId");
CREATE INDEX "HoldInvoice_organizerUserId_idx" ON "HoldInvoice"("organizerUserId");
CREATE INDEX "HoldInvoice_expiresAt_idx" ON "HoldInvoice"("expiresAt");

-- Add foreign key constraint for ItemReservation.invoiceId
ALTER TABLE "ItemReservation" ADD CONSTRAINT "ItemReservation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HoldInvoice" ("id") ON DELETE SET NULL;
