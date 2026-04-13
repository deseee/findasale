-- Step 1: Add User.roles array column
ALTER TABLE "User" ADD COLUMN roles TEXT[] DEFAULT ARRAY['USER']::TEXT[];

-- Step 2: Create UserRoleSubscription table
CREATE TABLE "UserRoleSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "subscriptionTier" TEXT NOT NULL DEFAULT 'SIMPLE',
  "subscriptionStatus" TEXT,
  "trialEndsAt" TIMESTAMP(3),
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "tierLapseWarning" TIMESTAMP(3),
  "tierLapsedAt" TIMESTAMP(3),
  "tierResumedAt" TIMESTAMP(3),
  "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  "stripeConnectId" TEXT,
  "reputationTier" TEXT NOT NULL DEFAULT 'NEW',
  "verificationStatus" TEXT NOT NULL DEFAULT 'NONE',
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRoleSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "UserRoleSubscription_userId_role_key" UNIQUE ("userId", "role")
);

-- Step 3: Create RoleConsent table
CREATE TABLE "RoleConsent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subscriptionId" TEXT NOT NULL UNIQUE,
  "role" TEXT NOT NULL,
  "termsAcceptedAt" TIMESTAMP(3),
  "privacyAcceptedAt" TIMESTAMP(3),
  "businessVerificationAcceptedAt" TIMESTAMP(3),
  "paymentMethodAcceptedAt" TIMESTAMP(3),
  "marketingOptInAt" TIMESTAMP(3),
  "emailOptOut" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoleConsent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserRoleSubscription" ("id") ON DELETE CASCADE
);

-- Step 4: Backfill User.roles from User.role
UPDATE "User"
SET roles = ARRAY['USER', 'ORGANIZER']::TEXT[]
WHERE role = 'ORGANIZER';

UPDATE "User"
SET roles = ARRAY['USER', 'ORGANIZER', 'ADMIN']::TEXT[]
WHERE role = 'ADMIN';

-- Step 5: Create indexes for performance
CREATE INDEX "UserRoleSubscription_userId_idx" ON "UserRoleSubscription" ("userId");
CREATE INDEX "UserRoleSubscription_role_idx" ON "UserRoleSubscription" ("role");
CREATE INDEX "RoleConsent_subscriptionId_idx" ON "RoleConsent" ("subscriptionId");
