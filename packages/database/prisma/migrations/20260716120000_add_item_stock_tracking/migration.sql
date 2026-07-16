-- ADR-085 Track B Phase 1: general, cross-channel stock pool on Item.
-- Purely additive -- every existing row gets stockTotal=1, stockSold=0,
-- which is byte-for-byte identical to today's single-unit-per-Item behavior.
-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "stockTotal" INTEGER DEFAULT 1,
ADD COLUMN     "stockSold" INTEGER NOT NULL DEFAULT 0;
