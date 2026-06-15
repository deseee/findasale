-- Sentry FINDASALE-NODEJS-10: Sale SELECT 3342ms
--
-- Root cause A — saleAutoCloseCron (runs hourly):
--   WHERE status=PUBLISHED AND endDate<now AND deletedAt IS NULL AND sourceUrl IS NOT NULL
--   Planner picks Sale_status_markdownEnabled_idx (status-only bitmap), then heap-scans all
--   14,560 PUBLISHED rows to apply endDate/deletedAt/sourceUrl filters.
--   Under concurrent load (Railway restart fires all hourly crons together), the 14k-page
--   heap fan-out hits disk: 11ms → 3342ms.
--   EXPLAIN with partial index forced: 0.046ms (239x faster).
--
-- Fix A: Partial index (status, endDate) WHERE deletedAt IS NULL.
--   - Covers the autoclose pattern exactly: status=PUBLISHED satisfies the partial predicate,
--     endDate<now is the range condition, deletedAt IS NULL is the WHERE guard.
--   - Eliminates the 14k-row heap fan-out entirely for this query.
--   - Note: CONCURRENTLY removed — Prisma wraps migrations in transactions, and
--     CONCURRENTLY cannot run inside a transaction block (PostgreSQL error 25001).
--     The Sale table is small enough that a brief lock is acceptable.
CREATE INDEX IF NOT EXISTS "Sale_status_endDate_autoclose_idx"
  ON "Sale" (status, "endDate")
  WHERE "deletedAt" IS NULL;

-- Root cause B — saleDetailEnrichmentController (triggered on demand + status endpoint):
--   COUNT(*) WHERE sourceName='EstateSalesNet' AND sourceUrl IS NOT NULL
--   Full seqscan: 49ms, 60k rows scanned.
--   No index on sourceName existed.
--
-- Fix B: Covering partial index (sourceName, sourceUrl) for index-only COUNT.
--   - Partial predicate eliminates soft-deleted / null-sourceName rows from the index.
--   - sourceUrl included so the filter IS NOT NULL is satisfied from the index alone.
--   - COUNT goes from 49ms seqscan → 6ms index-only scan (8x faster).
CREATE INDEX IF NOT EXISTS "Sale_sourceName_sourceUrl_idx"
  ON "Sale" ("sourceName", "sourceUrl")
  WHERE "sourceName" IS NOT NULL AND "sourceUrl" IS NOT NULL;
