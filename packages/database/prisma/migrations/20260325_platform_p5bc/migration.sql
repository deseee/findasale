-- Platform Safety Batches P5B and P5C: Features #111-120

-- #115 Verified Purchase Badge + #116 Review Timing Anomaly Detection
ALTER TABLE "Review" ADD COLUMN "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN "timingFlag" TEXT; -- 'RAPID' | 'BULK'
ALTER TABLE "Review" ADD COLUMN "reviewerIp" TEXT; -- IP address for bulk-review detection
ALTER TABLE "Review" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'APPROVED'; -- 'PENDING' | 'APPROVED' | 'REJECTED'

-- #112 Soft-Delete Archival
ALTER TABLE "Sale" ADD COLUMN "deletedAt" TIMESTAMP;
ALTER TABLE "Sale" ADD COLUMN "cancellationReason" TEXT; -- #120 Sale Cancellation Audit
ALTER TABLE "Item" ADD COLUMN "deletedAt" TIMESTAMP;
ALTER TABLE "Item" ADD COLUMN "storageArchive" BOOLEAN NOT NULL DEFAULT false; -- #121 pre-wire

-- #119 Chargeback Monitoring — Aggregate platform-level metrics
CREATE TABLE "PlatformMetrics" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "monthYear" TEXT NOT NULL UNIQUE,
  "chargebackCount" INTEGER NOT NULL DEFAULT 0,
  "transactionCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for soft-delete queries
CREATE INDEX "idx_sale_deletedAt" ON "Sale"("deletedAt");
CREATE INDEX "idx_item_deletedAt" ON "Item"("deletedAt");
CREATE INDEX "idx_review_moderationStatus" ON "Review"("moderationStatus");
CREATE INDEX "idx_platformMetrics_monthYear" ON "PlatformMetrics"("monthYear");
