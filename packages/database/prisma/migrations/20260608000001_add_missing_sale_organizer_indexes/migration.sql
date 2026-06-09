-- Sentry NODEJS-3E: search.ts COUNT query WHERE status=PUBLISHED AND isInventoryContainer=false AND endDate >= now
-- Missing composite index caused full-table scans on search count queries
CREATE INDEX IF NOT EXISTS "Sale_status_isInventoryContainer_endDate_idx" ON "Sale"("status", "isInventoryContainer", "endDate");

-- Sentry NODEJS-38: emailDiscoveryJob WHERE contactEmail IS NULL AND website IS NOT NULL AND isUnmanagedListing=true
-- Composite replaces two single-column indexes with a covering index for the composite predicate
CREATE INDEX IF NOT EXISTS "Organizer_contactEmail_isUnmanagedListing_idx" ON "Organizer"("contactEmail", "isUnmanagedListing");
