/*
  Warnings:

  - A unique constraint covering the columns `[saleId,authorId]` on the table `SourcebookEntry` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizerId,authorId]` on the table `SourcebookEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "prelaunchAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SourcebookEntry" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "saleId" TEXT,
    "organizerId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourcebookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourcebookEntry_saleId_authorId_key" ON "SourcebookEntry"("saleId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "SourcebookEntry_organizerId_authorId_key" ON "SourcebookEntry"("organizerId", "authorId");

-- CreateIndex
CREATE INDEX "SourcebookEntry_authorId_createdAt_idx" ON "SourcebookEntry"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "SourcebookEntry_saleId_idx" ON "SourcebookEntry"("saleId");

-- CreateIndex
CREATE INDEX "SourcebookEntry_organizerId_idx" ON "SourcebookEntry"("organizerId");

-- CreateIndex
CREATE INDEX "Sale_prelaunchAt_idx" ON "Sale"("prelaunchAt");

-- AddForeignKey
ALTER TABLE "SourcebookEntry" ADD CONSTRAINT "SourcebookEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcebookEntry" ADD CONSTRAINT "SourcebookEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcebookEntry" ADD CONSTRAINT "SourcebookEntry_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
