-- Sentry slow Organizer queries: Add missing performance indices
-- Covers 4 slow query patterns identified in Sentry (1066ms–1888ms range)

-- Organizer.leadTier: adminController scrape-pool-stats groupBy + internal route leadTier counts
CREATE INDEX IF NOT EXISTS "Organizer_leadTier_idx" ON "public"."Organizer"("leadTier");

-- Organizer.totalSales: organizer percentile rank query (count where totalSales < X)
CREATE INDEX IF NOT EXISTS "Organizer_totalSales_idx" ON "public"."Organizer"("totalSales");

-- Organizer.country: adminController Canada analytics filter (count where country = 'CA')
CREATE INDEX IF NOT EXISTS "Organizer_country_idx" ON "public"."Organizer"("country");

-- Organizer composite (isUnmanagedListing, directoryStatus): hot activeScrapedWhere combo
-- Used together in 7+ adminController queries (getScrapePoolStats etc.) as a simultaneous filter
-- Individual single-column indices exist but Postgres cannot merge them as efficiently as a composite
CREATE INDEX IF NOT EXISTS "Organizer_isUnmanagedListing_directoryStatus_idx" ON "public"."Organizer"("isUnmanagedListing", "directoryStatus");
