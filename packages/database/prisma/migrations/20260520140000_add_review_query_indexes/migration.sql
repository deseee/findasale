-- Add missing indexes on Review table to address slow query patterns
-- Sentry alert NODEJS-1Q context: Review LEFT JOIN Sale was causing full table scans
-- Note: "Review_saleId_idx" and "idx_review_moderationStatus" already exist in production
--       (created in 20260628100000_add_missing_indexes and 20260325_platform_p5bc respectively)

-- Index for dedup check in createReview: findFirst({ where: { userId, saleId } })
CREATE INDEX IF NOT EXISTS "Review_userId_idx" ON "Review"("userId");

-- Composite index for getSaleReviews hot path:
-- WHERE saleId = X AND moderationStatus = 'APPROVED' ORDER BY createdAt DESC
-- Replaces two separate index scans (saleId + moderationStatus) with one covering index
CREATE INDEX IF NOT EXISTS "Review_saleId_moderationStatus_createdAt_idx" ON "Review"("saleId", "moderationStatus", "createdAt" DESC);

-- Index for bulk-review IP anomaly detection in createReview:
-- COUNT WHERE reviewerIp = X AND createdAt >= oneDayAgo
CREATE INDEX IF NOT EXISTS "Review_reviewerIp_idx" ON "Review"("reviewerIp");
