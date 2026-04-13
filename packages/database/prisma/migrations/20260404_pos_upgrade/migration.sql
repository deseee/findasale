-- POS Upgrade: POSSession + POSPaymentLink
CREATE TABLE "POSSession" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "shopperId" TEXT,
    "cartItems" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "POSSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "POSPaymentLink" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "stripePaymentLinkId" TEXT NOT NULL,
    "stripePaymentLinkUrl" TEXT NOT NULL,
    "qrCodeDataUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purchaseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "POSPaymentLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "POSSession" ADD CONSTRAINT "POSSession_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "POSSession" ADD CONSTRAINT "POSSession_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "POSSession" ADD CONSTRAINT "POSSession_shopperId_fkey" FOREIGN KEY ("shopperId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "POSPaymentLink" ADD CONSTRAINT "POSPaymentLink_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "POSPaymentLink" ADD CONSTRAINT "POSPaymentLink_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "POSPaymentLink_stripePaymentLinkId_key" ON "POSPaymentLink"("stripePaymentLinkId");
CREATE INDEX "POSSession_organizerId_saleId_status_idx" ON "POSSession"("organizerId", "saleId", "status");
CREATE INDEX "POSSession_shopperId_idx" ON "POSSession"("shopperId");
CREATE INDEX "POSSession_expiresAt_idx" ON "POSSession"("expiresAt");
CREATE INDEX "POSPaymentLink_organizerId_status_idx" ON "POSPaymentLink"("organizerId", "status");
CREATE INDEX "POSPaymentLink_saleId_idx" ON "POSPaymentLink"("saleId");
