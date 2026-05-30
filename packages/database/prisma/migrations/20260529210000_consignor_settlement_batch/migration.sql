-- #239 Multi-Consignor Estate Settlement — Phase 1 (additive, safe on populated tables)
-- NOTE: ConsignorPayout."stripeTransferId" already exists in the DB
-- (added by migration add_stripe_connect_ach). It is intentionally NOT re-added here —
-- this migration only reconciles the genuinely-new settlement fields.

-- CreateTable: ConsignorSettlementBatch
CREATE TABLE "ConsignorSettlementBatch" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalConsignorPayouts" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ConsignorSettlementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsignorSettlementBatch_saleId_idx" ON "ConsignorSettlementBatch"("saleId");
CREATE INDEX "ConsignorSettlementBatch_status_idx" ON "ConsignorSettlementBatch"("status");

-- AddForeignKey
ALTER TABLE "ConsignorSettlementBatch" ADD CONSTRAINT "ConsignorSettlementBatch_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsignorSettlementBatch" ADD CONSTRAINT "ConsignorSettlementBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: ConsignorPayout — additive settlement columns (nullable / defaulted, back-compat safe)
ALTER TABLE "ConsignorPayout" ADD COLUMN "settlementBatchId" TEXT;
ALTER TABLE "ConsignorPayout" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "ConsignorPayout" ADD COLUMN "failureReason" TEXT;

-- CreateIndex
CREATE INDEX "ConsignorPayout_settlementBatchId_idx" ON "ConsignorPayout"("settlementBatchId");

-- AddForeignKey
ALTER TABLE "ConsignorPayout" ADD CONSTRAINT "ConsignorPayout_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "ConsignorSettlementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
