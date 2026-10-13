-- Organizer recruit channel (2026-10-14, ADR-139 + sales-ops review 2026-10-12). Additive only:
-- three enums, five new tables, one FeatureFlag row (enabled=false). No existing table or column is changed.
-- The Organizer.recruitLeads relation lives on RecruitLead.organizerId (no column on Organizer).
-- Ships disabled: nothing sends until RECRUIT_TRANSPORT, RECRUIT_SEND_ENABLED and the flag are all turned on.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruitLeadSource') THEN
    CREATE TYPE "RecruitLeadSource" AS ENUM ('DIRECTORY', 'OPT_IN_FORM', 'MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruitLeadStatus') THEN
    CREATE TYPE "RecruitLeadStatus" AS ENUM ('PENDING_CONFIRM', 'QUEUED', 'APPROVED', 'SENDING', 'SENT', 'SKIPPED', 'FAILED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecruitChannelEventType') THEN
    CREATE TYPE "RecruitChannelEventType" AS ENUM ('PAUSED', 'RESUMED', 'AUTO_PAUSED', 'CAP_REACHED', 'BATCH_APPROVED', 'TEST_SENT');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecruitBatch" (
    "id" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadCount" INTEGER NOT NULL,
    "note" TEXT,
    CONSTRAINT "RecruitBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecruitBatch_approvedAt_idx" ON "RecruitBatch"("approvedAt");

CREATE TABLE IF NOT EXISTS "RecruitLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "state" TEXT,
    "source" "RecruitLeadSource" NOT NULL,
    "sourceDetail" TEXT,
    "organizerId" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentSource" TEXT,
    "consentIpHash" TEXT,
    "status" "RecruitLeadStatus" NOT NULL DEFAULT 'QUEUED',
    "sequenceStep" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" TIMESTAMP(3),
    "confirmSentCount" INTEGER NOT NULL DEFAULT 0,
    "lastConfirmSentAt" TIMESTAMP(3),
    "batchId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "transport" TEXT,
    "providerMessageId" TEXT,
    "skipReason" TEXT,
    "lastError" TEXT,
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "convertedUserId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecruitLead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecruitLead_email_key" ON "RecruitLead"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "RecruitLead_providerMessageId_key" ON "RecruitLead"("providerMessageId");
CREATE INDEX IF NOT EXISTS "RecruitLead_status_source_idx" ON "RecruitLead"("status", "source");
CREATE INDEX IF NOT EXISTS "RecruitLead_status_nextSendAt_idx" ON "RecruitLead"("status", "nextSendAt");
CREATE INDEX IF NOT EXISTS "RecruitLead_batchId_idx" ON "RecruitLead"("batchId");
CREATE INDEX IF NOT EXISTS "RecruitLead_organizerId_idx" ON "RecruitLead"("organizerId");
CREATE INDEX IF NOT EXISTS "RecruitLead_sentAt_idx" ON "RecruitLead"("sentAt");

CREATE TABLE IF NOT EXISTS "RecruitSend" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    CONSTRAINT "RecruitSend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecruitSend_providerMessageId_key" ON "RecruitSend"("providerMessageId");
CREATE INDEX IF NOT EXISTS "RecruitSend_sentAt_idx" ON "RecruitSend"("sentAt");
CREATE INDEX IF NOT EXISTS "RecruitSend_leadId_idx" ON "RecruitSend"("leadId");
CREATE INDEX IF NOT EXISTS "RecruitSend_bouncedAt_idx" ON "RecruitSend"("bouncedAt");
CREATE INDEX IF NOT EXISTS "RecruitSend_complainedAt_idx" ON "RecruitSend"("complainedAt");

CREATE TABLE IF NOT EXISTS "RecruitQuotaLog" (
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecruitQuotaLog_pkey" PRIMARY KEY ("date")
);

CREATE TABLE IF NOT EXISTS "RecruitChannelEvent" (
    "id" TEXT NOT NULL,
    "type" "RecruitChannelEventType" NOT NULL,
    "reason" TEXT,
    "metrics" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecruitChannelEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecruitChannelEvent_type_createdAt_idx" ON "RecruitChannelEvent"("type", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecruitLead_organizerId_fkey') THEN
    ALTER TABLE "RecruitLead" ADD CONSTRAINT "RecruitLead_organizerId_fkey"
      FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecruitLead_batchId_fkey') THEN
    ALTER TABLE "RecruitLead" ADD CONSTRAINT "RecruitLead_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "RecruitBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecruitSend_leadId_fkey') THEN
    ALTER TABLE "RecruitSend" ADD CONSTRAINT "RecruitSend_leadId_fkey"
      FOREIGN KEY ("leadId") REFERENCES "RecruitLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Seed the DB kill switch, OFF. Shows up on /admin/feature-flags.
INSERT INTO "FeatureFlag" ("id", "key", "description", "enabled", "updatedAt")
VALUES (gen_random_uuid()::text, 'recruit_send_enabled', 'Organizer recruit channel send switch (ADR-139)', false, now())
ON CONFLICT ("key") DO NOTHING;

-- Rollback (manual, not executed by migrate deploy):
-- ## Rollback: z20261014000000_organizer_recruit_channel
-- Down migration (prisma db execute --stdin against the target DB):
--   DROP TABLE IF EXISTS "RecruitSend"; DROP TABLE IF EXISTS "RecruitLead"; DROP TABLE IF EXISTS "RecruitBatch";
--   DROP TABLE IF EXISTS "RecruitQuotaLog"; DROP TABLE IF EXISTS "RecruitChannelEvent";
--   DROP TYPE IF EXISTS "RecruitLeadSource"; DROP TYPE IF EXISTS "RecruitLeadStatus"; DROP TYPE IF EXISTS "RecruitChannelEventType";
--   DELETE FROM "FeatureFlag" WHERE "key" = 'recruit_send_enabled';
--   then delete this migration's _prisma_migrations row.
-- Playbook: "If the deploy fails after the migration, leave RECRUIT_SEND_ENABLED unset. The tables are inert with no sender,
-- so revert the code first and drop the tables later."
