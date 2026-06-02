-- Partial index fixes for 2 slow queries still firing after 20260530000001_slow_query_indexes
-- Root cause: plain column indexes are ineffective when most rows satisfy the WHERE clause.
-- Partial indexes only index the matching subset — far more selective and smaller.

-- Fix 1 (1203ms): emailDiscoveryJob WHERE contactEmail IS NULL AND website IS NOT NULL
-- Organizer_contactEmail_idx (full column) is ignored by planner when ~80%+ of rows have NULL.
-- Partial index only covers the ~20k rows the job actually queries.
CREATE INDEX IF NOT EXISTS "Organizer_email_discovery_partial_idx"
  ON "Organizer"("id")
  WHERE "contactEmail" IS NULL AND "website" IS NOT NULL;

-- Fix 2 (1126ms): DirectoryClaimEmail SELECT WHERE organizerId ORDER BY sentAt DESC
-- The composite index Organizer_contactEmail_idx may have stale planner stats after
-- the 20260530 migration. Force stats refresh for both hot tables.
-- Note: VACUUM ANALYZE cannot run inside a migration transaction — run manually if
-- slow query persists after this migration deploys:
--   VACUUM ANALYZE "Organizer";
--   VACUUM ANALYZE "DirectoryClaimEmail";
