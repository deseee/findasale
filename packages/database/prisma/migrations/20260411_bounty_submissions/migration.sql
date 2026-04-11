-- AlterTable
ALTER TABLE "MissingListingBounty" ADD COLUMN "xpReward" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN "expiry" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BountySubmission" (
    "id" TEXT NOT NULL,
    "bountyId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "shopperMessage" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "purchasedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BountySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BountySubmission_bountyId_status_idx" ON "BountySubmission"("bountyId", "status");

-- CreateIndex
CREATE INDEX "BountySubmission_organizerId_idx" ON "BountySubmission"("organizerId");

-- CreateIndex
CREATE INDEX "BountySubmission_expiresAt_idx" ON "BountySubmission"("expiresAt");

-- CreateIndex
CREATE INDEX "BountySubmission_status_idx" ON "BountySubmission"("status");

-- CreateIndex
CREATE INDEX "MissingListingBounty_status_expiry_idx" ON "MissingListingBounty"("status", "expiry");

-- AddForeignKey
ALTER TABLE "BountySubmission" ADD CONSTRAINT "BountySubmission_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "MissingListingBounty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountySubmission" ADD CONSTRAINT "BountySubmission_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BountySubmission" ADD CONSTRAINT "BountySubmission_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON UPDATE CASCADE;
