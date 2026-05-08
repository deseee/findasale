-- ADR-073: Directory Scraper Phase 1 — Schema additions for scraped listings

-- Add scraper metadata columns to Sale table
ALTER TABLE "Sale" ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "sourceName" TEXT,
ADD COLUMN "lastScrapedAt" TIMESTAMP(3),
ADD COLUMN "scrapeVersion" INTEGER,
ADD COLUMN "scrapedMetadata" JSONB;

-- Add sourceItemId to Item table
ALTER TABLE "Item" ADD COLUMN "sourceItemId" TEXT;

-- Create ScrapedSalesJob audit table
CREATE TABLE "ScrapedSalesJob" (
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

-- Create indices for ScrapedSalesJob
CREATE INDEX "ScrapedSalesJob_source_createdAt_idx" ON "ScrapedSalesJob"("source", "createdAt");
CREATE INDEX "ScrapedSalesJob_status_idx" ON "ScrapedSalesJob"("status");

-- Create ClaimEmail table for email tracking
CREATE TABLE "ClaimEmail" (
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

-- Create indices for ClaimEmail
CREATE INDEX "ClaimEmail_saleId_idx" ON "ClaimEmail"("saleId");
CREATE INDEX "ClaimEmail_organizerEmail_idx" ON "ClaimEmail"("organizerEmail");
CREATE INDEX "ClaimEmail_claimed_idx" ON "ClaimEmail"("claimed");
