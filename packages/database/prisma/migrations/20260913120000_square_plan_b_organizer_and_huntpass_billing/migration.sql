-- Square Plan B recurring billing (2026-09-13) -- PRO/TEAMS organizer subscriptions +
-- Hunt Pass shopper subscriptions, built on Square's Cards API + a FindA.Sale-owned
-- scheduler (jobs/squareBillingChargeJob.ts), NOT Square's native Subscriptions API
-- (confirmed unsuitable for a pure-SaaS/no-shipping product -- see
-- claude_docs/feature-notes/square-changeover-remaining-work-scoping-2026-09-09.md
-- Section 2.2, architect-approved GO).
--
-- Purely additive: every column is nullable or has a default. No column dropped, renamed,
-- or made non-nullable. Zero downtime, safe to run against a live database with existing
-- Stripe-billed organizers/Hunt Pass subscribers (they simply have NULL in every new
-- column until they migrate or freshly subscribe via Square).

-- ============================================================
-- Organizer -- PRO/TEAMS subscription billing (platform-account Square Cards API)
-- ============================================================
ALTER TABLE "Organizer" ADD COLUMN "billingProcessor" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "squareCustomerId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "squareCardId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "billingInterval" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "billingCurrentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN "billingDunningFailCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organizer" ADD COLUMN "billingNextRetryAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN "billingGraceEndsAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN "billingLastFailureReason" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "billingMigrationNoticeSentAt" TIMESTAMP(3);

-- ============================================================
-- User -- Hunt Pass shopper subscription billing (platform-account Square Cards API)
-- ============================================================
ALTER TABLE "User" ADD COLUMN "huntPassBillingProcessor" TEXT;
ALTER TABLE "User" ADD COLUMN "huntPassSquareCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "huntPassSquareCardId" TEXT;
ALTER TABLE "User" ADD COLUMN "huntPassCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "huntPassDunningFailCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "huntPassNextRetryAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "huntPassGraceEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "huntPassLastFailureReason" TEXT;

-- Indexes to support squareBillingChargeJob.ts's daily due-for-charge scans without a
-- full table scan (mirrors the existing @@index([stripeCustomerId]) / @@index([subscriptionStatus, subscriptionTier]) precedent on Organizer).
CREATE INDEX "Organizer_billingProcessor_billingCurrentPeriodEnd_idx" ON "Organizer"("billingProcessor", "billingCurrentPeriodEnd");
CREATE INDEX "User_huntPassBillingProcessor_huntPassExpiry_idx" ON "User"("huntPassBillingProcessor", "huntPassExpiry");
