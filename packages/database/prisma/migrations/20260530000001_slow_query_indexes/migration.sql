-- Sentry slow query fix 2026-05-30: Batch index additions for 7 recurring slow queries

-- Issue 1 (1020ms): emailDiscoveryJob WHERE contactEmail IS NULL AND website IS NOT NULL
-- Organizer table has no index on contactEmail — full table scan on large directory dataset
CREATE INDEX IF NOT EXISTS "Organizer_contactEmail_idx" ON "Organizer"("contactEmail");

-- Issue 2 (2113ms): DirectoryClaimEmail SELECT WHERE organizerId ORDER BY sentAt DESC
-- Existing @@index([organizerId]) cannot eliminate the sort; composite covers both filter + sort
CREATE INDEX IF NOT EXISTS "DirectoryClaimEmail_organizerId_sentAt_idx" ON "DirectoryClaimEmail"("organizerId", "sentAt");

-- Issue 3 (1460ms): Organizer SELECT WHERE isClaimed = $1 OR isUnmanagedListing = $2
-- OR predicate prevents individual single-column indexes from being used together;
-- composite index lets the planner use an index scan for both columns in one pass
CREATE INDEX IF NOT EXISTS "Organizer_isClaimed_isUnmanagedListing_idx" ON "Organizer"("isClaimed", "isUnmanagedListing");

-- Issue 4 (1577ms): COUNT Sale LEFT JOIN Organizer — WHERE organizerId + status combo
-- Existing (organizerId, status, endDate) 3-column composite covers prefix scans but
-- a dedicated 2-column index is faster for pure count queries that don't filter on endDate
CREATE INDEX IF NOT EXISTS "Sale_organizerId_status_idx" ON "Sale"("organizerId", "status");

-- Issue 5 (4225ms): UPDATE Sale SET lastScrapedAt WHERE id = $3
-- PK lookup is fast; slowness is likely table bloat on the large Sale table.
-- NOTE: UPDATE latency on a 30+ index table may need VACUUM ANALYZE rather than more indexes.
-- Adding lastScrapedAt index to help scraper deduplication queries (WHERE lastScrapedAt < cutoff).
CREATE INDEX IF NOT EXISTS "Sale_lastScrapedAt_idx" ON "Sale"("lastScrapedAt");

-- Issue 6 (4300ms): Review JOIN Sale WHERE Sale.organizerId
-- Review has no organizerId field — query requires Review→Sale JOIN to filter by organizerId.
-- Adding denormalized organizerId column to Review (nullable; backfill below) + composite index
-- eliminates the JOIN for organizer-scoped review queries.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "organizerId" TEXT;

-- Backfill organizerId from the joined Sale record for all existing rows
UPDATE "Review" r
SET "organizerId" = s."organizerId"
FROM "Sale" s
WHERE r."saleId" = s.id
  AND r."organizerId" IS NULL;

CREATE INDEX IF NOT EXISTS "Review_organizerId_saleId_idx" ON "Review"("organizerId", "saleId");

-- Add foreign key constraint (deferred — safe to add after backfill)
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_organizerId_fkey"
  FOREIGN KEY ("organizerId")
  REFERENCES "Organizer"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Issue 7 (6298ms): Sale SELECT — discoveryService bounding box + potential city ILIKE
-- Existing (status, endDate, lat, lng) covers the bounding box path.
-- Adding standalone city index to support prefix-match city queries (note: leading-wildcard
-- ILIKE '%..%' will not use this index — only anchored patterns like 'Grand%' benefit).
CREATE INDEX IF NOT EXISTS "Sale_city_idx" ON "Sale"("city");
