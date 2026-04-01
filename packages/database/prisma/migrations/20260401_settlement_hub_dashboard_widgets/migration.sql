-- Migration: Settlement Hub + Dashboard Widgets (Phase 1)
-- Date: 2026-04-01
-- Features: #228, #230, #231, #232, #233, #234, #236, #237

-- Step 1: Create SaleSettlement table
CREATE TABLE "SaleSettlement" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "lifecycleStage" TEXT NOT NULL DEFAULT 'LEAD',
  "settledAt" TIMESTAMP(3),
  "totalRevenue" DECIMAL(65, 30) NOT NULL DEFAULT 0,
  "platformFeeAmount" DECIMAL(65, 30) NOT NULL DEFAULT 0,
  "totalExpenses" DECIMAL(65, 30) NOT NULL DEFAULT 0,
  "netProceeds" DECIMAL(65, 30) NOT NULL DEFAULT 0,
  "clientPayoutRequested" TIMESTAMP(3),
  "clientPayoutStatus" TEXT,
  "clientPayoutAmount" DECIMAL(65, 30),
  "clientPayoutMethod" TEXT,
  "clientPayoutStripeTransferId" TEXT,
  "clientPayoutFailureReason" TEXT,
  "commissionRate" DECIMAL(65, 30),
  "buyerPremiumRate" DECIMAL(65, 30),
  "buyerPremiumCollected" DECIMAL(65, 30),
  "notes" TEXT,
  "settlementNotes" TEXT,
  "internalNotes" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleSettlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SaleSettlement_saleId_key" ON "SaleSettlement"("saleId");
CREATE INDEX "SaleSettlement_saleId_idx" ON "SaleSettlement"("saleId");
CREATE INDEX "SaleSettlement_lifecycleStage_idx" ON "SaleSettlement"("lifecycleStage");
CREATE INDEX "SaleSettlement_clientPayoutStatus_idx" ON "SaleSettlement"("clientPayoutStatus");
ALTER TABLE "SaleSettlement" ADD CONSTRAINT "SaleSettlement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 2: Create SaleExpense table
CREATE TABLE "SaleExpense" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(65, 30) NOT NULL,
  "vendorName" TEXT,
  "receiptUrl" TEXT,
  "receiptDate" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SaleExpense_settlementId_idx" ON "SaleExpense"("settlementId");
CREATE INDEX "SaleExpense_category_idx" ON "SaleExpense"("category");
ALTER TABLE "SaleExpense" ADD CONSTRAINT "SaleExpense_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "SaleSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Create ClientPayout table
CREATE TABLE "ClientPayout" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "clientEmail" TEXT,
  "clientPhone" TEXT,
  "amount" DECIMAL(65, 30) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "method" TEXT NOT NULL,
  "stripeTransferId" TEXT,
  "stripeAccountId" TEXT,
  "bankAccountLast4" TEXT,
  "bankRoutingNumber" TEXT,
  "failureReason" TEXT,
  "processedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientPayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientPayout_settlementId_key" ON "ClientPayout"("settlementId");
CREATE UNIQUE INDEX "ClientPayout_stripeTransferId_key" ON "ClientPayout"("stripeTransferId");
CREATE INDEX "ClientPayout_settlementId_idx" ON "ClientPayout"("settlementId");
CREATE INDEX "ClientPayout_status_idx" ON "ClientPayout"("status");
ALTER TABLE "ClientPayout" ADD CONSTRAINT "ClientPayout_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "SaleSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 4: Create SaleTransaction table (analytics read model for Sale Pulse)
CREATE TABLE "SaleTransaction" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "buyerId" TEXT,
  "itemId" TEXT,
  "amount" DECIMAL(65, 30) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "paymentMethod" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'ONLINE',
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SaleTransaction_saleId_timestamp_idx" ON "SaleTransaction"("saleId", "timestamp");
CREATE INDEX "SaleTransaction_buyerId_idx" ON "SaleTransaction"("buyerId");
CREATE INDEX "SaleTransaction_status_idx" ON "SaleTransaction"("status");
ALTER TABLE "SaleTransaction" ADD CONSTRAINT "SaleTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleTransaction" ADD CONSTRAINT "SaleTransaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleTransaction" ADD CONSTRAINT "SaleTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Alter Sale table — add settlement-related columns
ALTER TABLE "Sale"
ADD COLUMN "lifecycleStage" TEXT NOT NULL DEFAULT 'LEAD',
ADD COLUMN "commissionRate" DECIMAL(65, 30),
ADD COLUMN "settlementNotes" TEXT;

CREATE INDEX "Sale_lifecycleStage_idx" ON "Sale"("lifecycleStage");

-- Step 6: Alter Item table — add high-value + AI comp fields
ALTER TABLE "Item"
ADD COLUMN "isHighValue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "highValueThreshold" DECIMAL(65, 30),
ADD COLUMN "estimatedValue" DECIMAL(65, 30),
ADD COLUMN "aiSuggestedPrice" DECIMAL(65, 30);

CREATE INDEX "Item_isHighValue_idx" ON "Item"("isHighValue");

-- Step 7: Alter Organizer table — add default commission rate
ALTER TABLE "Organizer"
ADD COLUMN "defaultCommissionRate" DECIMAL(65, 30);
