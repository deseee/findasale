-- Sentry slow query fix: markdownCron queries WHERE status = 'PUBLISHED' AND markdownEnabled = true
-- without a composite index, Postgres scans all PUBLISHED sales then filters on markdownEnabled
CREATE INDEX IF NOT EXISTS "Sale_status_markdownEnabled_idx" ON "Sale"("status", "markdownEnabled");
