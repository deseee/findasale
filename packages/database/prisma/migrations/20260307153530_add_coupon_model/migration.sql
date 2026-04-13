/*
  Warnings:

  - You are about to alter the column `amount` on the `Bid` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `price` on the `Item` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `auctionStartPrice` on the `Item` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `currentBid` on the `Item` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `bidIncrement` on the `Item` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `amount` on the `Purchase` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to drop the column `betaInviteUsed` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `feedbacks` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `referredBy` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `Badge` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[saleId,sku]` on the table `Item` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[referredUserId]` on the table `Referral` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Bid` table without a default value. This is not possible if the table is not empty.
  - Made the column `phone` on table `Organizer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `address` on table `Organizer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lat` on table `Sale` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lng` on table `Sale` required. This step will fail if there are existing NULL values in that column.
  - Made the column `name` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "OrganizerReferral" DROP CONSTRAINT "OrganizerReferral_refereeId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizerReferral" DROP CONSTRAINT "OrganizerReferral_referrerId_fkey";

-- DropForeignKey
ALTER TABLE "PushSubscription" DROP CONSTRAINT "PushSubscription_userId_fkey";

-- DropForeignKey
ALTER TABLE "ReviewVote" DROP CONSTRAINT "ReviewVote_reviewId_fkey";

-- DropForeignKey
ALTER TABLE "ReviewVote" DROP CONSTRAINT "ReviewVote_userId_fkey";

-- DropForeignKey
ALTER TABLE "SavedSearch" DROP CONSTRAINT "SavedSearch_userId_fkey";

-- DropIndex
DROP INDEX "BuyingPool_creatorId_idx";

-- DropIndex
DROP INDEX "BuyingPool_itemId_idx";

-- DropIndex
DROP INDEX "BuyingPool_status_idx";

-- DropIndex
DROP INDEX "PoolParticipant_userId_idx";

-- DropIndex
DROP INDEX "Sale_neighborhood_status_idx";

-- DropIndex
DROP INDEX "UnsubscribeToken_userId_idx";

-- DropIndex
DROP INDEX "Webhook_userId_isActive_idx";

-- AlterTable
ALTER TABLE "Bid" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Item" ALTER COLUMN "price" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "auctionStartPrice" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "currentBid" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "bidIncrement" SET DEFAULT 1,
ALTER COLUMN "bidIncrement" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "embedding" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MissingListingBounty" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN     "etsy" TEXT,
ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "pickupWindows" TEXT,
ADD COLUMN     "profilePhoto" TEXT,
ADD COLUMN     "serviceAreas" TEXT,
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "address" SET NOT NULL;

-- AlterTable
ALTER TABLE "Purchase" ALTER COLUMN "amount" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Sale" ALTER COLUMN "lat" SET NOT NULL,
ALTER COLUMN "lng" SET NOT NULL;

-- AlterTable
ALTER TABLE "SaleChecklist" ALTER COLUMN "items" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "betaInviteUsed",
DROP COLUMN "feedbacks",
DROP COLUMN "referredBy",
ALTER COLUMN "name" SET NOT NULL;

-- AlterTable
ALTER TABLE "UserStreak" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Webhook" ALTER COLUMN "events" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "minPurchaseAmount" DOUBLE PRECISION,
    "maxDiscountAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sourcePurchaseId" TEXT,
    "redeemedPurchaseId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_userId_status_idx" ON "Coupon"("userId", "status");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_saleId_sku_key" ON "Item"("saleId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "UnsubscribeToken_token_idx" ON "UnsubscribeToken"("token");

-- RenameForeignKey
ALTER TABLE "SaleSubscriber" RENAME CONSTRAINT "SaleSubscriber_userId_fkey_unique" TO "SaleSubscriber_userId_fkey";

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewVote" ADD CONSTRAINT "ReviewVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerReferral" ADD CONSTRAINT "OrganizerReferral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerReferral" ADD CONSTRAINT "OrganizerReferral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "SaleSubscriber_saleId_phone_unique" RENAME TO "SaleSubscriber_saleId_phone_key";

-- RenameIndex
ALTER INDEX "SaleSubscriber_saleId_userId_unique" RENAME TO "SaleSubscriber_saleId_userId_key";
