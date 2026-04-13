-- CreateIndex for new columns (Rapidfire Mode draft status)
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "draftStatus" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "aiErrorLog" JSONB;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "optimisticLockVersion" INTEGER NOT NULL DEFAULT 0;

-- Backfill: all existing items are real published items
UPDATE "Item" SET "draftStatus" = 'PUBLISHED' WHERE "draftStatus" = 'DRAFT';

-- Indexes
CREATE INDEX IF NOT EXISTS "Item_draftStatus_idx" ON "Item"("draftStatus");
CREATE INDEX IF NOT EXISTS "Item_saleId_draftStatus_idx" ON "Item"("saleId", "draftStatus");
