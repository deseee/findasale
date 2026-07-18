-- ADR-086: Facebook Marketplace price sync -- tracks the rounded price last successfully
-- pushed to an item's live Facebook post, so the extension's pending-updates poll can detect
-- drift (Math.round(price) !== marketplaceListedPrice). Purely additive, nullable, no backfill,
-- no locking risk.
-- Rollback:
--   ALTER TABLE "Item" DROP COLUMN "marketplaceListedPrice";

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "marketplaceListedPrice" INTEGER;
