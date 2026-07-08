-- ADR-023: Organizer login-time Stripe Standard-migration prompt
-- Additive only. Rollback: DROP the three columns below.
ALTER TABLE "Organizer" ADD COLUMN "stripeAccountType" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "pendingStripeMigrationAccountId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "stripeMigrationPromptedAt" TIMESTAMP(3);
