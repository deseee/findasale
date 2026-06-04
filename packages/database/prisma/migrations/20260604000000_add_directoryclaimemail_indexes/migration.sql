-- Sentry NODEJS-2P: Slow DB query (1120ms) on DirectoryClaimEmail SELECT
-- Investigation found both indexes already exist from prior migrations:
--   DirectoryClaimEmail_organizerId_idx  → 20260502110000_directory_crawl_management
--   DirectoryClaimEmail_emailAddress_idx → 20260505000000_add_outreach_pipeline
-- Using IF NOT EXISTS to safely no-op. Slow query likely stale planner stats.
-- If still slow after deploy: VACUUM ANALYZE "DirectoryClaimEmail";

CREATE INDEX IF NOT EXISTS "DirectoryClaimEmail_organizerId_idx" ON "DirectoryClaimEmail"("organizerId");
CREATE INDEX IF NOT EXISTS "DirectoryClaimEmail_emailAddress_idx" ON "DirectoryClaimEmail"("emailAddress");
