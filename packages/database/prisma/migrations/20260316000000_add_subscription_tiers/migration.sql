-- CreateEnum for SubscriptionTier
CREATE TYPE "SubscriptionTier" AS ENUM ('SIMPLE', 'PRO', 'TEAMS');

-- AddColumn subscriptionTier to Organizer
ALTER TABLE "Organizer" ADD COLUMN "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'SIMPLE';

-- AddColumn subscriptionStatus to Organizer
ALTER TABLE "Organizer" ADD COLUMN "subscriptionStatus" TEXT;

-- AddColumn trialEndsAt to Organizer
ALTER TABLE "Organizer" ADD COLUMN "trialEndsAt" TIMESTAMP(3);

-- AddColumn stripeCustomerId to Organizer
ALTER TABLE "Organizer" ADD COLUMN "stripeCustomerId" TEXT;

-- AddColumn stripeSubscriptionId to Organizer
ALTER TABLE "Organizer" ADD COLUMN "stripeSubscriptionId" TEXT;

-- Backfill all existing organizers to SIMPLE tier
UPDATE "Organizer" SET "subscriptionTier" = 'SIMPLE' WHERE "subscriptionTier" IS NULL;
