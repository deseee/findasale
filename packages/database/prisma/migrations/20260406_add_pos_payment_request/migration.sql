-- CreateTable "POSPaymentRequest"
CREATE TABLE "POSPaymentRequest" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "organizerUserId" TEXT NOT NULL,
    "shopperUserId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalAmountCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "stripeFeeEstimate" INTEGER,
    "stripePaymentIntentId" TEXT,
    "clientSecret" VARCHAR(255),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POSPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "POSPaymentRequest_stripePaymentIntentId_key" ON "POSPaymentRequest"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "POSPaymentRequest_organizerId_saleId_idx" ON "POSPaymentRequest"("organizerId", "saleId");

-- CreateIndex
CREATE INDEX "POSPaymentRequest_organizerUserId_saleId_idx" ON "POSPaymentRequest"("organizerUserId", "saleId");

-- CreateIndex
CREATE INDEX "POSPaymentRequest_shopperUserId_status_idx" ON "POSPaymentRequest"("shopperUserId", "status");

-- CreateIndex
CREATE INDEX "POSPaymentRequest_status_expiresAt_idx" ON "POSPaymentRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "POSPaymentRequest_stripePaymentIntentId_idx" ON "POSPaymentRequest"("stripePaymentIntentId");

-- AddForeignKey
ALTER TABLE "POSPaymentRequest" ADD CONSTRAINT "POSPaymentRequest_organizerUserId_fkey" FOREIGN KEY ("organizerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSPaymentRequest" ADD CONSTRAINT "POSPaymentRequest_shopperUserId_fkey" FOREIGN KEY ("shopperUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSPaymentRequest" ADD CONSTRAINT "POSPaymentRequest_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
