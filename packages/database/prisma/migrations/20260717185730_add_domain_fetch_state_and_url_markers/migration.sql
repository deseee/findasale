-- DEV Batch 0: Domain fetch-health circuit breaker + URL fetch-failure markers.
-- Additive and non-locking only: new table, nullable/defaulted columns, plain indexes.
-- No NOT NULL without default, no backfill, no drops.
-- Rollback:
--   DROP TABLE "DomainFetchState";
--   DROP INDEX "Sale_sourceName_sourceUrlFetchFailedAt_idx";
--   DROP INDEX "Organizer_isUnmanagedListing_websiteEnrichmentExhausted_idx";
--   ALTER TABLE "Sale" DROP COLUMN "sourceUrlFetchFailedAt", DROP COLUMN "sourceUrlFetchAttempts";
--   ALTER TABLE "Organizer" DROP COLUMN "listingUrl", DROP COLUMN "websiteEnrichmentExhausted";

-- CreateTable
CREATE TABLE "DomainFetchState" (
    "registrableDomain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastOutcome" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextEligibleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainFetchState_pkey" PRIMARY KEY ("registrableDomain")
);

-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN     "listingUrl" TEXT,
ADD COLUMN     "websiteEnrichmentExhausted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "sourceUrlFetchFailedAt" TIMESTAMP(3),
ADD COLUMN     "sourceUrlFetchAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DomainFetchState_status_nextEligibleAt_idx" ON "DomainFetchState"("status", "nextEligibleAt");

-- CreateIndex
CREATE INDEX "Organizer_isUnmanagedListing_websiteEnrichmentExhausted_idx" ON "Organizer"("isUnmanagedListing", "websiteEnrichmentExhausted");

-- CreateIndex
CREATE INDEX "Sale_sourceName_sourceUrlFetchFailedAt_idx" ON "Sale"("sourceName", "sourceUrlFetchFailedAt");
