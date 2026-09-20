-- ADR ebay-store-tier-cap (2026-09-20) -- real eBay Store subscription tier + free-
-- insertion cap, replacing the flat 250/1000 guess in platformStatsService.ts's
-- resolveEbayLimit() and config/ebayInsertionLimits.ts's EBAY_FREE_INSERTIONS_CAP.
--
-- WHY: eBay's real free-listing allotment varies a lot by Store subscription level
-- (Starter 250, Basic 1,000, Premium 10,000, Anchor 25,000, Enterprise 100,000 per
-- month -- ebay.com/help/selling/fees-credits-invoices/store-selling-fees-managed-
-- payments-sellers?id=4809, confirmed 2026-09-20). The old flat guess (250 for no
-- store, 1000 for "any store detected") was wrong for every tier except Basic.
-- Patrick's explicit direction (2026-09-20): stop estimating this, get real numbers.
--
-- These three columns cache the result of a live eBay Account API lookup
-- (services/ebayStoreSubscriptionService.ts) so the forecast/dashboard path never
-- has to call eBay itself (ADR ebay-renewal-forecasting's "zero eBay API calls"
-- constraint stays intact -- see that service file's header comment for the full
-- reasoning on where the live call is allowed to happen instead).
--
-- SAFETY: additive only. No DROP, no ALTER of an existing column, no backfill, no
-- data movement. All three columns are nullable with no default -- on PostgreSQL
-- this is a metadata-only change, no table rewrite. "EbayConnection" is a small
-- one-row-per-organizer table; this is not a hot or large table either way.
--
-- Every existing row reads all three columns as NULL ("not yet looked up"), which
-- falls through to the existing flat-guess fallback (getCachedEbayFreeInsertionsCap)
-- until the next OAuth reconnect or 4h pull-sync cycle backfills it -- zero behavior
-- change on deploy until that backfill starts writing these columns.
--
-- ROLLBACK: ALTER TABLE "EbayConnection" DROP COLUMN "storeSubscriptionCheckedAt",
--           DROP COLUMN "freeInsertionsCap", DROP COLUMN "storeSubscriptionLevel";

-- AlterTable
-- storeSubscriptionLevel: eBay's raw subscriptionLevel string from GET
-- /sell/account/v1/subscription (e.g. STARTER/BASIC/FEATURED/ANCHOR/ENTERPRISE).
ALTER TABLE "EbayConnection" ADD COLUMN IF NOT EXISTS "storeSubscriptionLevel" TEXT;

-- freeInsertionsCap: OUR resolved real monthly free-insertion allotment, mapped from
-- storeSubscriptionLevel via ebayStoreSubscriptionService.ts's STORE_TIER_CAPS table.
ALTER TABLE "EbayConnection" ADD COLUMN IF NOT EXISTS "freeInsertionsCap" INTEGER;

-- storeSubscriptionCheckedAt: when the live lookup last SUCCEEDED. A failed lookup
-- never writes this, so a transient eBay/network error retries on the next
-- opportunity instead of waiting out the full re-check interval.
ALTER TABLE "EbayConnection" ADD COLUMN IF NOT EXISTS "storeSubscriptionCheckedAt" TIMESTAMP(3);
