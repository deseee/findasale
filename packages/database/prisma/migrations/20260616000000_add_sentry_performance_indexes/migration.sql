-- Sentry Performance Index Batch — 2026-06-16
-- Fixes 5 slow queries flagged in Sentry (1098ms–1374ms range)
--
-- Query 1: UPDATE Sale SET lastScrapedAt — index already exists (@@index([lastScrapedAt]))
--          No new index needed. VACUUM ANALYZE "Sale" recommended for write amplification.
--
-- Query 2: SELECT Sale WHERE scrapedMetadata JSON path + sourceName = $2 (1115ms, 6x)
CREATE INDEX "Sale_sourceName_idx" ON "Sale"("sourceName");
-- GIN index for JSON path queries on scrapedMetadata (Prisma cannot express GIN indexes)
-- Enables: WHERE "Sale"."scrapedMetadata"#>ARRAY['key'] = 'value' to use index scan
CREATE INDEX "Sale_scrapedMetadata_gin_idx" ON "Sale" USING GIN ("scrapedMetadata" jsonb_path_ops)
  WHERE "scrapedMetadata" IS NOT NULL;

-- Query 3: SELECT Organizer id+businessName+googlePlaceId+foursquareVenueId+hereBusinessId
--          WHERE isUnmanagedListing=true AND googlePlaceId IS NULL (1114ms, 12x since May)
--          Enrichment backfill job — composite enables index-only scan for null-check pattern
CREATE INDEX "Organizer_isUnmanagedListing_googlePlaceId_idx" ON "Organizer"("isUnmanagedListing", "googlePlaceId");

-- Query 4: SELECT Item id+title+sku+description WHERE saleId+[optional status] (1351ms)
--          Public item browse + POS organizer search with optional status filter
CREATE INDEX "Item_saleId_status_idx" ON "Item"("saleId", "status");
--          markdownCron: findMany WHERE saleId + markdownApplied=false — per-sale full scans
CREATE INDEX "Item_saleId_markdownApplied_idx" ON "Item"("saleId", "markdownApplied");

-- Query 5: SELECT Sale WHERE status=$1 AND markdownEnabled=$2 AND markdownFloor in SELECT (1374ms)
--          Dedicated covering index — existing (status, markdownEnabled, startDate) covers WHERE
--          as a prefix but not the markdownFloor column in SELECT; this index covers all three
CREATE INDEX "Sale_status_markdownEnabled_markdownFloor_idx" ON "Sale"("status", "markdownEnabled", "markdownFloor");
