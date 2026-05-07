-- AddIndex: Sale feed performance indexes
-- Fixes Sentry slow query alert (1391–1656ms on Sale SELECT)

CREATE INDEX IF NOT EXISTS "Sale_status_endDate_idx" ON "Sale"("status", "endDate");
CREATE INDEX IF NOT EXISTS "Sale_city_status_endDate_idx" ON "Sale"("city", "status", "endDate");
CREATE INDEX IF NOT EXISTS "Sale_status_startDate_idx" ON "Sale"("status", "startDate");
CREATE INDEX IF NOT EXISTS "Sale_sourceUrl_idx" ON "Sale"("sourceUrl");
