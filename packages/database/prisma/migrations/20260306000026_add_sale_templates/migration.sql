-- CreateTable SaleTemplate
CREATE TABLE "SaleTemplate" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultItems" JSONB,
    "settings" JSONB,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleTemplate_organizerId_idx" ON "SaleTemplate"("organizerId");

-- AddForeignKey
ALTER TABLE "SaleTemplate" ADD CONSTRAINT "SaleTemplate_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
