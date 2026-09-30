-- Consignor settlement, organizer-settles ledger (2026-09-29)
--
-- FindA.Sale never initiates, holds or routes consignor money. This adds the ledger, statement and
-- payment-record tables and columns. Patrick applies this manually.
--
-- SAFETY
--   * Additive and idempotent: every CREATE / ADD uses IF NOT EXISTS (or a pg_constraint check), so
--     running it twice is harmless.
--   * No column is dropped. No existing row is changed. NO BACKFILL runs here. The optional status
--     backfill lives in packages/database/prisma/manual/consignor_payout_status_backfill.sql and is
--     NOT APPLIED (it needs Patrick's data check first). Until it is applied, legacy status values
--     are mapped on read by the backend (consignorLedgerService.normalizePayoutStatus).
--   * Two existing objects are RELAXED, not removed, both on ConsignorSettlementBatch:
--       1. "saleId" drops NOT NULL so a run can settle consignment inventory (Item.saleId null) or
--          several sales at once. Every existing row already has a value, so nothing changes for them.
--       2. The "saleId" foreign key goes from ON DELETE CASCADE to ON DELETE SET NULL, so deleting a
--          sale can no longer erase a financial batch header.
--   * ConsignorPayoutItem."itemId", "workspaceId" and "purchaseId" are plain indexed columns with no
--     foreign key on purpose (Item, Purchase and OrganizerWorkspace are outside the Consignor models,
--     and a snapshot line must survive an item being deleted).
--
-- ROLLBACK (safe until real ledger rows exist; after that, export the tables first)
--   DROP TABLE IF EXISTS "ConsignorPayoutEvent";
--   DROP TABLE IF EXISTS "ConsignorPayoutItem";
--   ALTER TABLE "Consignor" DROP COLUMN IF EXISTS "preferredPayoutMethod";
--   ALTER TABLE "ConsignorSettlementBatch"
--     DROP COLUMN IF EXISTS "runNumber", DROP COLUMN IF EXISTS "payoutMode", DROP COLUMN IF EXISTS "snapshotAt",
--     DROP COLUMN IF EXISTS "asOf", DROP COLUMN IF EXISTS "scopeConsignorIds", DROP COLUMN IF EXISTS "approvedByUserId",
--     DROP COLUMN IF EXISTS "cancelledAt", DROP COLUMN IF EXISTS "cancelledReason", DROP COLUMN IF EXISTS "cancelledByUserId";
--   ALTER TABLE "ConsignorPayout"
--     DROP COLUMN IF EXISTS "paidAmount", DROP COLUMN IF EXISTS "paidReference", DROP COLUMN IF EXISTS "paidRecordedByUserId",
--     DROP COLUMN IF EXISTS "paidRecordedAt", DROP COLUMN IF EXISTS "voidedAt", DROP COLUMN IF EXISTS "voidReason",
--     DROP COLUMN IF EXISTS "voidedByUserId", DROP COLUMN IF EXISTS "holdReason", DROP COLUMN IF EXISTS "statementSentAt",
--     DROP COLUMN IF EXISTS "statementSentTo";
--   DROP INDEX IF EXISTS "ConsignorPayout_status_idx";
--   -- Restoring the two relaxed constraints is only possible while no batch has a NULL saleId:
--   --   UPDATE "ConsignorSettlementBatch" SET "saleId" = ... (or delete those rows) first, then
--   --   ALTER TABLE "ConsignorSettlementBatch" ALTER COLUMN "saleId" SET NOT NULL;
--   --   ALTER TABLE "ConsignorSettlementBatch" DROP CONSTRAINT IF EXISTS "ConsignorSettlementBatch_saleId_fkey";
--   --   ALTER TABLE "ConsignorSettlementBatch" ADD CONSTRAINT "ConsignorSettlementBatch_saleId_fkey"
--   --     FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Consignor ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "preferredPayoutMethod" TEXT;

-- ── ConsignorPayout: payment records, hold, void, statement stamps ───────────────────────────
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(10,2);
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "paidReference" TEXT;
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "paidRecordedByUserId" TEXT;
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "paidRecordedAt" TIMESTAMP(3);
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "voidedByUserId" TEXT;
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "holdReason" TEXT;
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "statementSentAt" TIMESTAMP(3);
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "statementSentTo" TEXT;
CREATE INDEX IF NOT EXISTS "ConsignorPayout_status_idx" ON "ConsignorPayout"("status");

-- ── ConsignorSettlementBatch: run number, mode, snapshot, approval and cancel fields ─────────
ALTER TABLE "ConsignorSettlementBatch" ADD COLUMN IF NOT EXISTS "runNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ConsignorSettlementBatch" ADD COLUMN IF NOT EXISTS "payoutMode" TEXT NOT NULL DEFAULT 'ORGANIZER_SETTLES';
ALTER TABLE "ConsignorSettlementBatch" ADD COLUMN IF NOT EXISTS "snapshotAt" TIMESTAMP(3);
ALTER TABLE "ConsignorSettlementBatch" ADD COLUMN IF NOT EXISTS "asOf" TIMESTAMP(3);
ALTER TABLE "ConsignorSettlementBatch" ADD COLUMN IF NOT EXISTS "scopeConsignorIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ConsignorSettlementBatch" ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT;
ALTER TABLE "ConsignorSettlementBatch" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "ConsignorSettlementBatch" ADD COLUMN IF NOT EXISTS "cancelledReason" TEXT;
ALTER TABLE "ConsignorSettlementBatch" ADD COLUMN IF NOT EXISTS "cancelledByUserId" TEXT;

-- Relax: a run may have no sale (consignment inventory) or span sales. Idempotent (no error if already nullable).
ALTER TABLE "ConsignorSettlementBatch" ALTER COLUMN "saleId" DROP NOT NULL;

-- Relax: deleting a sale must not delete a financial batch header. Drop and re-add the FK as SET NULL.
ALTER TABLE "ConsignorSettlementBatch" DROP CONSTRAINT IF EXISTS "ConsignorSettlementBatch_saleId_fkey";
ALTER TABLE "ConsignorSettlementBatch"
  ADD CONSTRAINT "ConsignorSettlementBatch_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── ConsignorPayoutItem: per-item snapshot lines. activeItemKey UNIQUE is the double-pay guard ─
CREATE TABLE IF NOT EXISTS "ConsignorPayoutItem" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "consignorId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "saleId" TEXT,
    "itemId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "listPrice" DECIMAL(10,2) NOT NULL,
    "priceBeforeMarkdown" DECIMAL(10,2),
    "collectedAmount" DECIMAL(10,2),
    "purchaseId" TEXT,
    "basisSource" TEXT NOT NULL DEFAULT 'ITEM_PRICE',
    "varianceFlag" BOOLEAN NOT NULL DEFAULT false,
    "soldAt" TIMESTAMP(3),
    "ratePct" DECIMAL(5,2) NOT NULL,
    "consignorShare" DECIMAL(10,2) NOT NULL,
    "organizerShare" DECIMAL(10,2) NOT NULL,
    "activeItemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignorPayoutItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConsignorPayoutItem_activeItemKey_key" ON "ConsignorPayoutItem"("activeItemKey");
CREATE INDEX IF NOT EXISTS "ConsignorPayoutItem_payoutId_idx" ON "ConsignorPayoutItem"("payoutId");
CREATE INDEX IF NOT EXISTS "ConsignorPayoutItem_consignorId_idx" ON "ConsignorPayoutItem"("consignorId");
CREATE INDEX IF NOT EXISTS "ConsignorPayoutItem_workspaceId_idx" ON "ConsignorPayoutItem"("workspaceId");
CREATE INDEX IF NOT EXISTS "ConsignorPayoutItem_itemId_idx" ON "ConsignorPayoutItem"("itemId");
CREATE INDEX IF NOT EXISTS "ConsignorPayoutItem_saleId_idx" ON "ConsignorPayoutItem"("saleId");

-- ── ConsignorPayoutEvent: append-only audit trail ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ConsignorPayoutEvent" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "batchId" TEXT,
    "consignorId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "method" TEXT,
    "amount" DECIMAL(10,2),
    "reference" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignorPayoutEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConsignorPayoutEvent_payoutId_idx" ON "ConsignorPayoutEvent"("payoutId");
CREATE INDEX IF NOT EXISTS "ConsignorPayoutEvent_batchId_idx" ON "ConsignorPayoutEvent"("batchId");
CREATE INDEX IF NOT EXISTS "ConsignorPayoutEvent_workspaceId_createdAt_idx" ON "ConsignorPayoutEvent"("workspaceId", "createdAt");

-- ── Foreign keys for the two new tables (guarded so re-running is a no-op) ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsignorPayoutItem_payoutId_fkey') THEN
    ALTER TABLE "ConsignorPayoutItem" ADD CONSTRAINT "ConsignorPayoutItem_payoutId_fkey"
      FOREIGN KEY ("payoutId") REFERENCES "ConsignorPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsignorPayoutItem_consignorId_fkey') THEN
    ALTER TABLE "ConsignorPayoutItem" ADD CONSTRAINT "ConsignorPayoutItem_consignorId_fkey"
      FOREIGN KEY ("consignorId") REFERENCES "Consignor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsignorPayoutEvent_payoutId_fkey') THEN
    ALTER TABLE "ConsignorPayoutEvent" ADD CONSTRAINT "ConsignorPayoutEvent_payoutId_fkey"
      FOREIGN KEY ("payoutId") REFERENCES "ConsignorPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
