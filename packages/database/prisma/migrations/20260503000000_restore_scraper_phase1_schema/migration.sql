-- Restore scraper_phase1 schema to match already-deployed DB state
-- These changes were applied via 20260501020000_scraper_phase1 but were lost
-- from schema.prisma during S624/S625 multi-schema syncs.
-- Using IF NOT EXISTS throughout — safe to run even if already applied.

-- Sale scraper metadata fields
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "sourceName" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "lastScrapedAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "scrapeVersion" INTEGER;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "scrapedMetadata" JSONB;

-- Item scraper dedup field
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "sourceItemId" TEXT;

-- ScrapedSalesJob audit table
CREATE TABLE IF NOT EXISTS "ScrapedSalesJob" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "metro" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "logUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ScrapedSalesJob_source_createdAt_idx" ON "ScrapedSalesJob"("source", "createdAt");
CREATE INDEX IF NOT EXISTS "ScrapedSalesJob_status_idx" ON "ScrapedSalesJob"("status");

-- ClaimEmail tracking table for scraped sale claim conversion
CREATE TABLE IF NOT EXISTS "ClaimEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "organizerEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimEmail_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ClaimEmail_saleId_idx" ON "ClaimEmail"("saleId");
CREATE INDEX IF NOT EXISTS "ClaimEmail_organizerEmail_idx" ON "ClaimEmail"("organizerEmail");
CREATE INDEX IF NOT EXISTS "ClaimEmail_claimed_idx" ON "ClaimEmail"("claimed");
