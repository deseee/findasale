-- ADR-100 -- Marketplace Listing Auto-Renew (FB Marketplace / Craigslist, Browser Extension)
-- Additive only: 1 new enum + 2 new columns on existing MarketplaceListingJob + 1 new index.
-- Rollback:
--   ALTER TABLE "MarketplaceListingJob" DROP COLUMN "renewDueAt";
--   ALTER TABLE "MarketplaceListingJob" DROP COLUMN "platform";
--   DROP TYPE "MarketplaceJobPlatform";

-- CreateEnum
CREATE TYPE "MarketplaceJobPlatform" AS ENUM ('FACEBOOK', 'CRAIGSLIST');

-- AlterTable
-- Default FACEBOOK preserves backward compatibility with every existing row (all of which
-- are FB -- Craigslist never wrote a MarketplaceListingJob row before this feature, see
-- ADR-100 §2.2). renewDueAt is nullable and left NULL on every existing row -- no backfill
-- (ADR-100 §7 Q4, Patrick has not yet decided whether a one-time backfill is worth doing);
-- existing rows simply won't surface a renewal nudge until a fresh POST row is written.
ALTER TABLE "MarketplaceListingJob" ADD COLUMN IF NOT EXISTS "platform" "MarketplaceJobPlatform" NOT NULL DEFAULT 'FACEBOOK';
ALTER TABLE "MarketplaceListingJob" ADD COLUMN IF NOT EXISTS "renewDueAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplaceListingJob_platform_renewDueAt_idx" ON "MarketplaceListingJob"("platform", "renewDueAt");
