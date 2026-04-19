-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "isTestTransaction" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Purchase_isTestTransaction_idx" ON "Purchase"("isTestTransaction");
