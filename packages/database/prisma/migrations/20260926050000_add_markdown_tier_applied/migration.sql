-- AlterTable
ALTER TABLE "Item" ADD COLUMN "markdownTierApplied" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX "Item_saleId_markdownApplied_idx";

-- CreateIndex
CREATE INDEX "Item_saleId_markdownTierApplied_idx" ON "Item"("saleId", "markdownTierApplied");
