-- Feature #72 Phase 2: Add notificationChannel field to Notification model
ALTER TABLE "Notification" ADD COLUMN "notificationChannel" TEXT NOT NULL DEFAULT 'IN_APP';

-- D1: Auto-backfill UserRoleSubscription from existing Organizer records
-- For each user with an Organizer record, ensure they have a UserRoleSubscription with role='ORGANIZER'
INSERT INTO "UserRoleSubscription" (
  "id",
  "userId",
  "role",
  "subscriptionTier",
  "subscriptionStatus",
  "trialEndsAt",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "tierLapseWarning",
  "tierLapsedAt",
  "tierResumedAt",
  "tokenVersion",
  "stripeConnectId",
  "reputationTier",
  "verificationStatus",
  "verifiedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  o."userId",
  'ORGANIZER',
  o."subscriptionTier"::text,
  o."subscriptionStatus",
  o."trialEndsAt",
  o."stripeCustomerId",
  o."stripeSubscriptionId",
  NULL,
  NULL,
  NULL,
  COALESCE(o."tokenVersion", 0),
  o."stripeConnectId",
  COALESCE(o."reputationTier", 'NEW'),
  COALESCE(o."verificationStatus", 'NONE'),
  o."verifiedAt",
  o."createdAt",
  COALESCE(o."updatedAt", o."createdAt")
FROM "Organizer" o
WHERE NOT EXISTS (
  SELECT 1 FROM "UserRoleSubscription" urs
  WHERE urs."userId" = o."userId" AND urs."role" = 'ORGANIZER'
)
ON CONFLICT ("userId", "role") DO NOTHING;
