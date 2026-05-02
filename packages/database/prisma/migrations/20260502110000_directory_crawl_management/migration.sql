-- CreateTable DirectoryCrawlQueue
CREATE TABLE IF NOT EXISTS "DirectoryCrawlQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metro" TEXT NOT NULL,
    "subArea" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "province" TEXT,
    "sourceName" TEXT NOT NULL,
    "queryType" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastResultCount" INTEGER,
    "consecutiveZeroRuns" INTEGER NOT NULL DEFAULT 0,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "pauseReason" TEXT,
    "isSaturated" BOOLEAN NOT NULL DEFAULT false,
    "budgetMonthYear" TEXT NOT NULL,
    "requestsUsedThisPeriod" INTEGER NOT NULL DEFAULT 0,
    "requestsBudgetMax" INTEGER NOT NULL DEFAULT 5000,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "backoffMultiplier" REAL NOT NULL DEFAULT 1.0,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "pageTokenState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex DirectoryCrawlQueue unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "DirectoryCrawlQueue_metro_subArea_sourceName_queryType_key"
  ON "DirectoryCrawlQueue"("metro", "subArea", "sourceName", "queryType");

-- CreateIndex DirectoryCrawlQueue nextRunAt
CREATE INDEX IF NOT EXISTS "DirectoryCrawlQueue_nextRunAt_idx" ON "DirectoryCrawlQueue"("nextRunAt");

-- CreateIndex DirectoryCrawlQueue source and budget
CREATE INDEX IF NOT EXISTS "DirectoryCrawlQueue_sourceName_budgetMonthYear_idx"
  ON "DirectoryCrawlQueue"("sourceName", "budgetMonthYear");

-- CreateIndex DirectoryCrawlQueue isSaturated
CREATE INDEX IF NOT EXISTS "DirectoryCrawlQueue_isSaturated_idx" ON "DirectoryCrawlQueue"("isSaturated");

-- CreateIndex DirectoryCrawlQueue country and province
CREATE INDEX IF NOT EXISTS "DirectoryCrawlQueue_country_province_idx"
  ON "DirectoryCrawlQueue"("country", "province");

-- CreateTable DirectoryCrawlLog
CREATE TABLE IF NOT EXISTS "DirectoryCrawlLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceName" TEXT NOT NULL,
    "metro" TEXT NOT NULL,
    "subArea" TEXT,
    "queryType" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "newOrganizersCreated" INTEGER NOT NULL DEFAULT 0,
    "organizersUpdated" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectoryCrawlLog_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "DirectoryCrawlQueue" ("id") ON DELETE CASCADE
);

-- CreateIndex DirectoryCrawlLog queueId
CREATE INDEX IF NOT EXISTS "DirectoryCrawlLog_queueId_idx" ON "DirectoryCrawlLog"("queueId");

-- CreateIndex DirectoryCrawlLog runAt
CREATE INDEX IF NOT EXISTS "DirectoryCrawlLog_runAt_idx" ON "DirectoryCrawlLog"("runAt");

-- CreateIndex DirectoryCrawlLog sourceName and runAt
CREATE INDEX IF NOT EXISTS "DirectoryCrawlLog_sourceName_runAt_idx"
  ON "DirectoryCrawlLog"("sourceName", "runAt");

-- CreateTable DirectoryClaimEmail
CREATE TABLE IF NOT EXISTS "DirectoryClaimEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizerId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DirectoryClaimEmail_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer" ("id") ON DELETE CASCADE
);

-- CreateIndex DirectoryClaimEmail organizerId
CREATE INDEX IF NOT EXISTS "DirectoryClaimEmail_organizerId_idx" ON "DirectoryClaimEmail"("organizerId");

-- CreateIndex DirectoryClaimEmail status and nextAttemptAt
CREATE INDEX IF NOT EXISTS "DirectoryClaimEmail_status_nextAttemptAt_idx"
  ON "DirectoryClaimEmail"("status", "nextAttemptAt");

-- AlterTable Organizer — add directory management fields
ALTER TABLE "Organizer" ADD COLUMN "directoryStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Organizer" ADD COLUMN "directoryStatusSetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Organizer" ADD COLUMN "directoryStatusReason" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "directoryNextCheckAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN "directoryCheckIntervalDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "Organizer" ADD COLUMN "directoryLastCheckedAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN "directoryLastCheckedSource" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "directoryDataHash" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "directoryHashUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN "directoryMostRecentSource" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "directoryMostRecentAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN "hereBusinessId" TEXT UNIQUE;
ALTER TABLE "Organizer" ADD COLUMN "foursquareVenueId" TEXT UNIQUE;
ALTER TABLE "Organizer" ADD COLUMN "osmNodeId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "suppressOutreach" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN "directoryNextClaimEmailAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN "claimEmailIntervalDays" INTEGER NOT NULL DEFAULT 14;
ALTER TABLE "Organizer" ADD COLUMN "claimStatus" TEXT NOT NULL DEFAULT 'UNCLAIMED';

-- CreateIndex Organizer directoryStatus
CREATE INDEX IF NOT EXISTS "Organizer_directoryStatus_idx" ON "Organizer"("directoryStatus");

-- CreateIndex Organizer directoryNextCheckAt
CREATE INDEX IF NOT EXISTS "Organizer_directoryNextCheckAt_idx" ON "Organizer"("directoryNextCheckAt");

-- CreateIndex Organizer suppressOutreach
CREATE INDEX IF NOT EXISTS "Organizer_suppressOutreach_idx" ON "Organizer"("suppressOutreach");

-- CreateIndex Organizer claimStatus
CREATE INDEX IF NOT EXISTS "Organizer_claimStatus_idx" ON "Organizer"("claimStatus");
