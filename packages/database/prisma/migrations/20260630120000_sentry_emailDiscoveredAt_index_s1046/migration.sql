-- S1046: Add emailDiscoveredAt index on Organizer
-- Sentry NODEJS-48: outreachEmailsCron WHERE emailDiscoveredAt >= 7d ago
-- Only 98 of 83,647 organizers match (0.12%) — full seq scan was 253ms
-- CONCURRENTLY avoids locking the table during index build
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Organizer_emailDiscoveredAt_idx" ON "Organizer"("emailDiscoveredAt");
