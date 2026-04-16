-- Feature: First Sale Free PRO security gates

-- User: email verification
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

-- Organizer: first-sale free offer tracking + AI quota
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "firstSaleFreeProUsedAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "aiTagsUsedThisMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "aiTagsResetAt" TIMESTAMP(3);

-- Backfill: existing users already verified (pre-2026-04-16)
UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" = false;
