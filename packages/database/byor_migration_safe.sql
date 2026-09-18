-- BYOR-only additive migration, hand-extracted from the full drift script.
-- Every statement here is scoped to OffPlatformSale/PlatformInvoice/offPlatformSalesEnabled/offPlatformSalesConsentedAt.
-- Nothing else from the full diff (drops, type changes, renames on unrelated tables) is included -- deliberately excluded, not an oversight.

ALTER TABLE "Organizer" ADD COLUMN "offPlatformSalesEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "RoleConsent" ADD COLUMN "offPlatformSalesConsentedAt" TIMESTAMP(3);

CREATE TABLE "OffPlatformSale" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "markedByUserId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reportedAmount" DECIMAL(10,2),
    "paymentMethodNote" TEXT,
    "buyerNameNote" TEXT,
    "buyerEmailNote" TEXT,
    "billingPeriodKey" TEXT NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OffPlatformSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformInvoice" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "billingPeriodKey" TEXT NOT NULL,
    "pricingModel" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "reportedGrossAmount" DECIMAL(10,2),
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stripeInvoiceItemId" TEXT,
    "stripeInvoiceId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoicedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OffPlatformSale_organizerId_billingPeriodKey_idx" ON "OffPlatformSale"("organizerId", "billingPeriodKey");
CREATE INDEX "OffPlatformSale_itemId_idx" ON "OffPlatformSale"("itemId");
CREATE INDEX "OffPlatformSale_saleId_idx" ON "OffPlatformSale"("saleId");
CREATE INDEX "OffPlatformSale_invoiceId_idx" ON "OffPlatformSale"("invoiceId");
CREATE INDEX "PlatformInvoice_status_idx" ON "PlatformInvoice"("status");
CREATE INDEX "PlatformInvoice_billingPeriodKey_idx" ON "PlatformInvoice"("billingPeriodKey");
CREATE UNIQUE INDEX "PlatformInvoice_organizerId_billingPeriodKey_kind_key" ON "PlatformInvoice"("organizerId", "billingPeriodKey", "kind");

ALTER TABLE "OffPlatformSale" ADD CONSTRAINT "OffPlatformSale_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OffPlatformSale" ADD CONSTRAINT "OffPlatformSale_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OffPlatformSale" ADD CONSTRAINT "OffPlatformSale_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OffPlatformSale" ADD CONSTRAINT "OffPlatformSale_markedByUserId_fkey" FOREIGN KEY ("markedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OffPlatformSale" ADD CONSTRAINT "OffPlatformSale_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformInvoice" ADD CONSTRAINT "PlatformInvoice_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
