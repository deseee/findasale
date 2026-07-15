-- ADR-083 -- Facebook Marketplace Poster (In-House Playwright, Dedicated Accounts)
-- Additive only: 3 new enums + 2 new tables + 1 new column on existing Organizer, 1 new FK.
-- Rollback: DROP TABLE "MarketplaceListingJob"; DROP TABLE "MarketplacePosterAccount";
--           DROP TYPE "MarketplaceJobStatus"; DROP TYPE "MarketplaceJobAction";
--           DROP TYPE "MarketplacePosterAccountStatus";
--           ALTER TABLE "Organizer" DROP COLUMN "marketplaceAutoPostEnabled";

-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN "marketplaceAutoPostEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "MarketplacePosterAccountStatus" AS ENUM ('ACTIVE', 'COOLDOWN', 'FLAGGED', 'BANNED');

-- CreateEnum
CREATE TYPE "MarketplaceJobAction" AS ENUM ('POST', 'REMOVE');

-- CreateEnum
CREATE TYPE "MarketplaceJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'POSTED', 'REMOVED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "MarketplacePosterAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sessionCookie" TEXT NOT NULL,
    "status" "MarketplacePosterAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "dailyPostCount" INTEGER NOT NULL DEFAULT 0,
    "dailyCountResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplacePosterAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingJob" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "action" "MarketplaceJobAction" NOT NULL,
    "status" "MarketplaceJobStatus" NOT NULL DEFAULT 'QUEUED',
    "accountId" TEXT,
    "remoteListingId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplacePosterAccount_status_idx" ON "MarketplacePosterAccount"("status");

-- CreateIndex
CREATE INDEX "MarketplaceListingJob_status_scheduledFor_idx" ON "MarketplaceListingJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "MarketplaceListingJob_itemId_idx" ON "MarketplaceListingJob"("itemId");

-- AddForeignKey
ALTER TABLE "MarketplaceListingJob" ADD CONSTRAINT "MarketplaceListingJob_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingJob" ADD CONSTRAINT "MarketplaceListingJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MarketplacePosterAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
