-- Add onboarding fields to Organizer
ALTER TABLE "Organizer" ADD COLUMN "bio" TEXT,
ADD COLUMN "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;
