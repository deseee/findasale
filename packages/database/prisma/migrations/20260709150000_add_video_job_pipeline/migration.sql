-- ADR-078 Wave 1 -- Video Content Pipeline (schema-only foundation)
-- Additive only: 3 new enums + 1 new table (VideoJob) + 1 new column on existing
-- SocialPost ("videoJobId") + 1 new FK on SocialPost + 1 new FK on VideoJob (saleId).
--
-- HISTORY NOTE: this migration was hand-authored after the fact. Commit dcfb9dcc4
-- added the VideoJob model (+ VideoJobStatus/VideoTriggerType/VideoPurpose enums,
-- Sale.videoJobs relation, SocialPost.videoJobId FK) to schema.prisma WITHOUT a
-- migration file. The next day's 20260710120000_add_footage_batch migration adds
-- FootageBatch.videoJobId referencing "VideoJob", silently assuming this table
-- already existed. The objects described below already exist for real on both
-- local and Railway databases (created out-of-band); this file exists solely to
-- close the migration-history gap so `prisma migrate resolve --applied` has a
-- real file to point at, and so migration history replays cleanly on any FUTURE
-- fresh database (new hire, CI, disaster recovery). It is not meant to be run
-- against local/Railway today.
--
-- Sale.videoJobs (VideoJob[]) is a bare Prisma relation array with no @relation
-- scalar attribute -- it requires no column on "Sale". The FK lives on
-- "VideoJob"."saleId" instead (see below).
--
-- Rollback:
--   ALTER TABLE "SocialPost" DROP CONSTRAINT "SocialPost_videoJobId_fkey";
--   ALTER TABLE "SocialPost" DROP COLUMN "videoJobId";
--   DROP TABLE "VideoJob";
--   DROP TYPE "VideoJobStatus"; DROP TYPE "VideoTriggerType"; DROP TYPE "VideoPurpose";

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN "videoJobId" TEXT;

-- CreateEnum
CREATE TYPE "VideoJobStatus" AS ENUM ('QUEUED', 'CURATING_ASSETS', 'SCRIPTING', 'VOICEOVER', 'ASSEMBLING', 'CAPTIONING', 'THUMBNAIL', 'AWAITING_REVIEW', 'APPROVED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VideoTriggerType" AS ENUM ('SALE_LIVE', 'SALE_ENDING', 'GUIDE_LIBRARY', 'MANUAL');

-- CreateEnum
CREATE TYPE "VideoPurpose" AS ENUM ('TUTORIAL', 'ATTENTION', 'PROMO');

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL,
    "trigger" "VideoTriggerType" NOT NULL,
    "purpose" "VideoPurpose" NOT NULL,
    "saleId" TEXT,
    "guideTopic" TEXT,
    "status" "VideoJobStatus" NOT NULL DEFAULT 'QUEUED',
    "sourceAssetUrls" TEXT[],
    "scriptText" TEXT,
    "voiceoverUrl" TEXT,
    "rawVideoUrl" TEXT,
    "captionedVideoUrl" TEXT,
    "thumbnailUrl" TEXT,
    "stagedFile" TEXT,
    "stagedHash" TEXT,
    "reviewNotes" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoJob_status_idx" ON "VideoJob"("status");

-- CreateIndex
CREATE INDEX "VideoJob_trigger_idx" ON "VideoJob"("trigger");

-- CreateIndex
CREATE INDEX "VideoJob_saleId_idx" ON "VideoJob"("saleId");

-- AddForeignKey
ALTER TABLE "VideoJob" ADD CONSTRAINT "VideoJob_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_videoJobId_fkey" FOREIGN KEY ("videoJobId") REFERENCES "VideoJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
