-- ADR-080 — Auto-Classify Video Pipeline (Phase 1 foundation)
-- Additive only: 3 new enums + 2 new tables (FootageBatch, FootageAsset).
-- No changes to existing tables — the FootageBatch<->VideoJob 1-1 link is carried
-- by FootageBatch."videoJobId" (FK), so "VideoJob" gains NO new column.
-- Rollback:
--   DROP TABLE "FootageAsset"; DROP TABLE "FootageBatch";
--   DROP TYPE "FootageRole"; DROP TYPE "FootageAssetStatus"; DROP TYPE "FootageBatchStatus";

-- CreateEnum
CREATE TYPE "FootageBatchStatus" AS ENUM ('OPEN', 'SEALED', 'ANALYZING', 'ASSEMBLING', 'AWAITING_REVIEW', 'NEEDS_INPUT', 'APPROVED', 'REJECTED', 'PUBLISHED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FootageAssetStatus" AS ENUM ('UPLOADED', 'ANALYZED', 'USED', 'UNUSABLE');

-- CreateEnum
CREATE TYPE "FootageRole" AS ENUM ('HOOK', 'FIND', 'PRICE_REVEAL', 'BEFORE', 'AFTER', 'MAP', 'STYLING', 'CTA', 'UNKNOWN');

-- CreateTable
CREATE TABLE "FootageBatch" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT,
    "status" "FootageBatchStatus" NOT NULL DEFAULT 'OPEN',
    "templateId" TEXT,
    "templateConfidence" DOUBLE PRECISION,
    "openQuestion" TEXT,
    "questionField" TEXT,
    "sealedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3),
    "videoJobId" TEXT,
    "stagedFile" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FootageBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FootageAsset" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'video',
    "sizeBytes" INTEGER,
    "durationMs" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FootageAssetStatus" NOT NULL DEFAULT 'UPLOADED',
    "role" "FootageRole" NOT NULL DEFAULT 'UNKNOWN',
    "roleConfidence" DOUBLE PRECISION,
    "ocrCaptions" TEXT[],
    "transcript" TEXT,
    "analysisJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FootageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FootageBatch_videoJobId_key" ON "FootageBatch"("videoJobId");

-- CreateIndex
CREATE INDEX "FootageBatch_status_idx" ON "FootageBatch"("status");

-- CreateIndex
CREATE INDEX "FootageBatch_organizerId_idx" ON "FootageBatch"("organizerId");

-- CreateIndex
CREATE UNIQUE INDEX "FootageAsset_r2Key_key" ON "FootageAsset"("r2Key");

-- CreateIndex
CREATE INDEX "FootageAsset_batchId_idx" ON "FootageAsset"("batchId");

-- CreateIndex
CREATE INDEX "FootageAsset_status_idx" ON "FootageAsset"("status");

-- AddForeignKey
ALTER TABLE "FootageBatch" ADD CONSTRAINT "FootageBatch_videoJobId_fkey" FOREIGN KEY ("videoJobId") REFERENCES "VideoJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FootageAsset" ADD CONSTRAINT "FootageAsset_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "FootageBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
