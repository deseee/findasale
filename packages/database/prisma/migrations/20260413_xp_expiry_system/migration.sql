-- D-XP-002: XP Expiry System
-- Adds XP expiry tracking (365 days from last activity)
-- Grandmaster+ exemption (lifetimeXpEarned >= 5000)
-- In-app warnings at 300-day and 350-day marks

-- Add XP tracking and expiry columns to User
ALTER TABLE "User" ADD COLUMN "lifetimeXpEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lastXpActivityAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "xpExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "xpExpiryWarned300" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "xpExpiryWarned350" BOOLEAN NOT NULL DEFAULT false;

-- Create indexes for nightly cron queries
CREATE INDEX "User_xpExpiresAt_idx" ON "User"("xpExpiresAt");
CREATE INDEX "User_lastXpActivityAt_idx" ON "User"("lastXpActivityAt");
