-- Feature #71: Organizer Reputation Score
DROP TABLE IF EXISTS "OrganizerReputation";

-- CreateTable: OrganizerReputation
CREATE TABLE "OrganizerReputation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizerId" TEXT NOT NULL UNIQUE,
  "score" FLOAT NOT NULL DEFAULT 0,
  "responseTimeAvg" FLOAT NOT NULL DEFAULT 0,
  "saleCount" INTEGER NOT NULL DEFAULT 0,
  "photoQualityAvg" FLOAT NOT NULL DEFAULT 0,
  "shopperRating" FLOAT,
  "disputeRate" FLOAT NOT NULL DEFAULT 0,
  "isNew" BOOLEAN NOT NULL DEFAULT true,
  "lastCalculated" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizerReputation_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrganizerReputation_organizerId_idx" ON "OrganizerReputation"("organizerId");
