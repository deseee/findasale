-- Migration: 20260416_admin_tables
-- Adds 4 new tables: FeatureFlag, PwaEvent, OrganizerScore, ApiUsageLog

-- FeatureFlag: kill-switch and feature rollout control
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tierRestricted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- PwaEvent: append-only event log for PWA analytics
CREATE TABLE "PwaEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PwaEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PwaEvent_eventType_idx" ON "PwaEvent"("eventType");
CREATE INDEX "PwaEvent_userId_idx" ON "PwaEvent"("userId");
CREATE INDEX "PwaEvent_createdAt_idx" ON "PwaEvent"("createdAt");

-- OrganizerScore: expansion + churn signal scores (updated by daily cron)
CREATE TABLE "OrganizerScore" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "expansionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expansionTier" TEXT NOT NULL DEFAULT 'LOW',
    "expansionTopSignal" TEXT,
    "churnScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "churnBand" TEXT NOT NULL DEFAULT 'GREEN',
    "churnTopSignal" TEXT,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizerScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizerScore_organizerId_key" ON "OrganizerScore"("organizerId");
CREATE INDEX "OrganizerScore_expansionTier_idx" ON "OrganizerScore"("expansionTier");
CREATE INDEX "OrganizerScore_churnBand_idx" ON "OrganizerScore"("churnBand");
ALTER TABLE "OrganizerScore" ADD CONSTRAINT "OrganizerScore_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ApiUsageLog: persistent daily API call + cost tracking
CREATE TABLE "ApiUsageLog" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiUsageLog_service_dateKey_key" ON "ApiUsageLog"("service", "dateKey");
CREATE INDEX "ApiUsageLog_service_idx" ON "ApiUsageLog"("service");
CREATE INDEX "ApiUsageLog_dateKey_idx" ON "ApiUsageLog"("dateKey");
