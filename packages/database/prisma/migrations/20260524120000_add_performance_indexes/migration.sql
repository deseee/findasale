-- Sentry NODEJS-2N: DirectoryClaimEmail outreach cron queries (1063ms)
-- outreachEmailsCron findMany WHERE status NOT IN (...) AND touch4SentAt IS NULL ORDER BY touch1SentAt
CREATE INDEX "DirectoryClaimEmail_status_touch4SentAt_touch1SentAt_idx" ON "DirectoryClaimEmail"("status", "touch4SentAt", "touch1SentAt");

-- Sentry NODEJS-2M: DirectoryClaimEmail sentAt lookup (1674ms)
-- outreachEmailsCron findFirst WHERE sentAt != null ORDER BY sentAt DESC
CREATE INDEX "DirectoryClaimEmail_sentAt_idx" ON "DirectoryClaimEmail"("sentAt");

-- Sentry NODEJS-2K: Sale COUNT by createdAt (1086ms)
-- adminController sparklines + newSalesLast7d: sale.count WHERE createdAt >= 7d ago
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- Sentry NODEJS-2J: Sale markdown cron composite (1005ms)
-- markdownCron findMany WHERE status=PUBLISHED AND markdownEnabled=true AND startDate <= now
CREATE INDEX "Sale_status_markdownEnabled_startDate_idx" ON "Sale"("status", "markdownEnabled", "startDate");

-- Sentry NODEJS-1P: Organizer queries by isUnmanagedListing + createdAt (1683ms)
-- adminController real-organizers + recentAdditions findMany WHERE isUnmanagedListing=false ORDER BY createdAt DESC
CREATE INDEX "Organizer_isUnmanagedListing_createdAt_idx" ON "Organizer"("isUnmanagedListing", "createdAt");

-- Sentry NODEJS-1P: Organizer createdAt ordering (1683ms)
-- adminController recentAdditions ORDER BY createdAt DESC on 10k+ row organizer table
CREATE INDEX "Organizer_createdAt_idx" ON "Organizer"("createdAt");
