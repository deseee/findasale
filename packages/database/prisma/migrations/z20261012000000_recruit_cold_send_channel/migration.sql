-- Organizer-recruitment cold-send channel (findasale-architect handoff 2026-10-12).
-- Additive only: one enum, three new tables, one nullable column on EmailSuppression.
-- Nothing here touches the existing Gmail OUTREACH_* pipeline tables.
--
-- Rollback (manual, if ever needed):
--   DROP TABLE "RecruitSend";
--   DROP TABLE "RecruitLead";
--   DROP TABLE "RecruitDailyStat";
--   DROP TYPE "RecruitLeadStatus";
--   ALTER TABLE "EmailSuppression" DROP COLUMN "source";

-- CreateEnum
CREATE TYPE "RecruitLeadStatus" AS ENUM ('NEW', 'VERIFIED', 'RISKY', 'INVALID', 'QUEUED', 'SENT', 'REPLIED', 'SUPPRESSED', 'DONE');

-- CreateTable
CREATE TABLE "RecruitLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT,
    "city" TEXT,
    "state" TEXT,
    "organizerId" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" "RecruitLeadStatus" NOT NULL DEFAULT 'NEW',
    "verifyReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "touchCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "nextSendAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitSend" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "touchNumber" INTEGER NOT NULL,
    "resendEmailId" TEXT,
    "subject" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "bounceType" TEXT,
    "complainedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitDailyStat" (
    "date" TEXT NOT NULL,
    "attempted" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "hardBounced" INTEGER NOT NULL DEFAULT 0,
    "softBounced" INTEGER NOT NULL DEFAULT 0,
    "complained" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecruitDailyStat_pkey" PRIMARY KEY ("date")
);

-- AlterTable
ALTER TABLE "EmailSuppression" ADD COLUMN "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RecruitLead_email_key" ON "RecruitLead"("email");

-- CreateIndex
CREATE INDEX "RecruitLead_status_nextSendAt_idx" ON "RecruitLead"("status", "nextSendAt");

-- CreateIndex
CREATE INDEX "RecruitLead_organizerId_idx" ON "RecruitLead"("organizerId");

-- CreateIndex
CREATE UNIQUE INDEX "RecruitSend_resendEmailId_key" ON "RecruitSend"("resendEmailId");

-- CreateIndex
CREATE INDEX "RecruitSend_leadId_idx" ON "RecruitSend"("leadId");

-- CreateIndex
CREATE INDEX "RecruitSend_sentAt_idx" ON "RecruitSend"("sentAt");

-- AddForeignKey
ALTER TABLE "RecruitLead" ADD CONSTRAINT "RecruitLead_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitSend" ADD CONSTRAINT "RecruitSend_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "RecruitLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
