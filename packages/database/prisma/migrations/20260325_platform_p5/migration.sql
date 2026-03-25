-- Platform Safety Batch P5: User Reputation & Suspension Fields
-- Feature #107-#114: Organizer reputation scoring, chargeback tracking, bid cancellation audit, serial buyer suspension

-- Add reputation and suspension fields to User table
ALTER TABLE "User" ADD COLUMN "chargebackCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "bidCancellationCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "suspendReason" TEXT;

-- Add index on suspendedAt for fast suspension lookup in auth
CREATE INDEX "User_suspendedAt_idx" ON "User"("suspendedAt");
