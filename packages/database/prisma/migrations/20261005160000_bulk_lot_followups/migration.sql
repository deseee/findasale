-- ADR-136 Addendum B (2026-10-05, roadmap #659): bulk lot follow-ups (partial refunds, holds, hub cart lines, recount history).
--   "Purchase"."bulkRefundedQuantity"  cards already put back by refunds of a bulk sale row (default 0)
--   "BulkLotRefund"       one row per bulk refund event, unique (purchaseId, idempotencyKey) = the client replay guard
--   "BulkLotAdjustment"   history of organizer recounts and corrections of a lot's card count
--   "BulkLotHold"         a hold on N cards of a lot for one customer
--   "BoothCartBulkLine"   a lot line (N cards) in a multi-vendor hub cart
--
-- SAFETY: additive and idempotent. Four new empty tables and one column with a constant default (no table rewrite on
-- Postgres 11 and later), no foreign keys, no change to any existing column's definition. One data statement at the end:
-- bulk lots (rows in "ItemBulkLot", none exist until the flag is switched on) are set "excludeFromMarkdown" = true so the
-- markdown cycle can never reprice a per-1,000 price. It touches only those rows. Nothing reads or writes any of the new
-- tables unless CARD_BULK_LOTS_ENABLED is true, so applying this is harmless with the flag off.
-- Apply AFTER 20261005130000_card_bulk_lots and BEFORE deploying the matching backend build: the regenerated Prisma
-- client selects "Purchase"."bulkRefundedQuantity" on every default Purchase read.
-- Do not apply to production from an agent session; Patrick applies it with prisma migrate deploy, then prisma generate.
--
-- ROLLBACK (only while no bulk refund, hold or cart line exists, otherwise card counts are lost):
--   DROP TABLE IF EXISTS "BoothCartBulkLine";
--   DROP TABLE IF EXISTS "BulkLotHold";
--   DROP TABLE IF EXISTS "BulkLotAdjustment";
--   DROP TABLE IF EXISTS "BulkLotRefund";
--   ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_bulkRefundedQuantity_check";
--   ALTER TABLE "Purchase" DROP COLUMN IF EXISTS "bulkRefundedQuantity";

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "bulkRefundedQuantity" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Purchase_bulkRefundedQuantity_check') THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_bulkRefundedQuantity_check" CHECK ("bulkRefundedQuantity" >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "BulkLotRefund" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "cardsReturned" INTEGER NOT NULL,
    "cumulativeCards" INTEGER NOT NULL,
    "cents" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "actorUserId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BulkLotRefund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BulkLotRefund_purchaseId_idempotencyKey_key" ON "BulkLotRefund"("purchaseId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "BulkLotRefund_purchaseId_idx" ON "BulkLotRefund"("purchaseId");
CREATE INDEX IF NOT EXISTS "BulkLotRefund_itemId_idx" ON "BulkLotRefund"("itemId");

CREATE TABLE IF NOT EXISTS "BulkLotAdjustment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeCount" INTEGER NOT NULL,
    "afterCount" INTEGER NOT NULL,
    "totalBefore" INTEGER NOT NULL,
    "totalAfter" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BulkLotAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BulkLotAdjustment_itemId_createdAt_idx" ON "BulkLotAdjustment"("itemId", "createdAt");
CREATE INDEX IF NOT EXISTS "BulkLotAdjustment_organizerId_idx" ON "BulkLotAdjustment"("organizerId");

CREATE TABLE IF NOT EXISTS "BulkLotHold" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "shopperUserId" TEXT,
    "customerName" TEXT,
    "quantity" INTEGER NOT NULL,
    "pricePerThousandCents" INTEGER NOT NULL,
    "lineCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "holdInvoiceId" TEXT,
    "purchaseId" TEXT,
    "releasedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BulkLotHold_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BulkLotHold_itemId_status_idx" ON "BulkLotHold"("itemId", "status");
CREATE INDEX IF NOT EXISTS "BulkLotHold_status_expiresAt_idx" ON "BulkLotHold"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "BulkLotHold_holdInvoiceId_idx" ON "BulkLotHold"("holdInvoiceId");
CREATE INDEX IF NOT EXISTS "BulkLotHold_organizerId_status_idx" ON "BulkLotHold"("organizerId", "status");

CREATE TABLE IF NOT EXISTS "BoothCartBulkLine" (
    "id" TEXT NOT NULL,
    "boothCartTransactionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "vendorBoothId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricePerThousandCents" INTEGER NOT NULL,
    "lineCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "purchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BoothCartBulkLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BoothCartBulkLine_boothCartTransactionId_status_idx" ON "BoothCartBulkLine"("boothCartTransactionId", "status");
CREATE INDEX IF NOT EXISTS "BoothCartBulkLine_itemId_status_idx" ON "BoothCartBulkLine"("itemId", "status");

UPDATE "Item" SET "excludeFromMarkdown" = true WHERE "excludeFromMarkdown" = false AND "id" IN (SELECT "itemId" FROM "ItemBulkLot");
