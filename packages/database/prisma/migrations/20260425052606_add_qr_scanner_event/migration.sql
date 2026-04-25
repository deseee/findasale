-- QR Scanner Phase 2: Scan analytics
-- Create QRScannerEvent model to track QR code engagement across sales

-- CreateTable
CREATE TABLE "QRScannerEvent" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "shopperId" TEXT,
    "eventType" TEXT NOT NULL,
    "decodedUrl" TEXT,
    "deviceType" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QRScannerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QRScannerEvent_saleId_createdAt_idx" ON "QRScannerEvent"("saleId", "createdAt");

-- CreateIndex
CREATE INDEX "QRScannerEvent_saleId_eventType_idx" ON "QRScannerEvent"("saleId", "eventType");

-- CreateIndex
CREATE INDEX "QRScannerEvent_shopperId_createdAt_idx" ON "QRScannerEvent"("shopperId", "createdAt");

-- AddForeignKey
ALTER TABLE "QRScannerEvent" ADD CONSTRAINT "QRScannerEvent_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRScannerEvent" ADD CONSTRAINT "QRScannerEvent_shopperId_fkey" FOREIGN KEY ("shopperId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
