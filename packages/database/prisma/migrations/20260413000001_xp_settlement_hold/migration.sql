-- P0 Exploit Fix: XP Settlement Hold + Hunt Pass Cancellation Tracking

-- Add huntPassCancelledAt to User table
ALTER TABLE "User" ADD COLUMN "huntPassCancelledAt" TIMESTAMP(3);

-- Add purchaseId, holdUntil to PointsTransaction table
ALTER TABLE "PointsTransaction" ADD COLUMN "purchaseId" TEXT;
ALTER TABLE "PointsTransaction" ADD COLUMN "holdUntil" TIMESTAMP(3);

-- Add indexes for performance (holdUntil for querying spendable XP)
CREATE INDEX "PointsTransaction_purchaseId_idx" ON "PointsTransaction"("purchaseId");
CREATE INDEX "PointsTransaction_userId_holdUntil_idx" ON "PointsTransaction"("userId", "holdUntil");
