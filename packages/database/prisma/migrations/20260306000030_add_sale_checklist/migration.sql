-- Sale Day-Of Checklist feature
CREATE TABLE "SaleChecklist" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaleChecklist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SaleChecklist_saleId_key" ON "SaleChecklist"("saleId");
ALTER TABLE "SaleChecklist" ADD CONSTRAINT "SaleChecklist_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
