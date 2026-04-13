-- AddColumn: Add teamsOnboardingComplete to User model for Feature #60 TEAMS Onboarding Wizard
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "teamsOnboardingComplete" BOOLEAN NOT NULL DEFAULT false;
