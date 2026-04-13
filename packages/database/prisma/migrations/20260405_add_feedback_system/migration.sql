-- Step 1: Create FeedbackSuppression table
CREATE TABLE "FeedbackSuppression" (
  id VARCHAR(255) PRIMARY KEY,
  "userId" VARCHAR(255) NOT NULL,
  "surveyType" VARCHAR(255) NOT NULL,
  "suppressedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("userId", "surveyType"),
  FOREIGN KEY("userId") REFERENCES "User"(id) ON DELETE CASCADE
);

-- Create index for fast lookups during trigger checks
CREATE INDEX "FeedbackSuppression_userId_idx" ON "FeedbackSuppression"("userId");

-- Step 2: Add columns to User table
ALTER TABLE "User" ADD COLUMN "firstSalePublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lastSurveyShownAt" TIMESTAMP;

-- Step 3: Backfill firstSalePublished = true for organizers with published sales
UPDATE "User"
SET "firstSalePublished" = true
WHERE id IN (
  SELECT DISTINCT "organizerId"
  FROM "Sale"
  WHERE status = 'PUBLISHED'
    AND "deletedAt" IS NULL
);

-- Step 4: Extend Feedback model with new columns
ALTER TABLE "Feedback"
  ADD COLUMN "surveyType" VARCHAR(255),
  ADD COLUMN "deviceType" VARCHAR(50),
  ADD COLUMN "userTierAtTime" VARCHAR(255),
  ALTER COLUMN "rating" DROP NOT NULL;

-- Step 5: Create indexes for analytics queries
CREATE INDEX "Feedback_surveyType_createdAt_idx" ON "Feedback"("surveyType", "createdAt" DESC);
CREATE INDEX "Feedback_userId_surveyType_idx" ON "Feedback"("userId", "surveyType");
