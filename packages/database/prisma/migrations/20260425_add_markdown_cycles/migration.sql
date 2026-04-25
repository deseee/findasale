-- CreateTable MarkdownCycle
CREATE TABLE "MarkdownCycle" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "saleId" TEXT,
    "daysUntilFirst" INTEGER NOT NULL,
    "firstPct" INTEGER NOT NULL,
    "daysUntilSecond" INTEGER,
    "secondPct" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkdownCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex on organizerId
CREATE INDEX "MarkdownCycle_organizerId_idx" ON "MarkdownCycle"("organizerId");

-- CreateIndex on saleId
CREATE INDEX "MarkdownCycle_saleId_idx" ON "MarkdownCycle"("saleId");

-- CreateIndex on organizerId and isActive for efficient querying
CREATE INDEX "MarkdownCycle_organizerId_isActive_idx" ON "MarkdownCycle"("organizerId", "isActive");

-- AddForeignKey for organizerId
ALTER TABLE "MarkdownCycle" ADD CONSTRAINT "MarkdownCycle_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for saleId (nullable)
ALTER TABLE "MarkdownCycle" ADD CONSTRAINT "MarkdownCycle_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
