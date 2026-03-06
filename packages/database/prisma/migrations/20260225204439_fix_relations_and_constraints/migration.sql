/*
  Warnings:

  - You are about to drop the column `earlyAccess` on the `Sale` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[saleId,userId]` on the table `SaleSubscriber` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[saleId,phone]` on the table `SaleSubscriber` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "SaleSubscriber" DROP CONSTRAINT "SaleSubscriber_userId_fkey";

-- DropIndex
DROP INDEX "SaleSubscriber_userId_saleId_key";

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "earlyAccess";

-- AlterTable
ALTER TABLE "SaleSubscriber" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "LineEntry" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "enteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineEntry_saleId_userId_key" ON "LineEntry"("saleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleSubscriber_saleId_userId_unique" ON "SaleSubscriber"("saleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleSubscriber_saleId_phone_unique" ON "SaleSubscriber"("saleId", "phone");

-- AddForeignKey
ALTER TABLE "SaleSubscriber" ADD CONSTRAINT "SaleSubscriber_userId_fkey_unique" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineEntry" ADD CONSTRAINT "LineEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineEntry" ADD CONSTRAINT "LineEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;