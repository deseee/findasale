-- ADR-128 -- eBay price-sync failure handling: two prices, not one (2026-09-19)
--   claude_docs/architecture/ADR-128-ebay-price-sync-failure-handling.md
--
-- WHY: markdownCycleCron.ts writes the markdown price to Item.price, attempts an eBay push,
-- and console.warns on failure. The schema records WHEN eBay last agreed (priceUpdatedAt /
-- ebayPriceSyncedAt, migration 20260915140000) but not WHAT price eBay is actually charging,
-- not WHY a push is stuck, and not WHETHER retrying is pointless. Without that last part
-- ebayListingSyncCron.ts retries every failure every 4h forever -- which is why the same
-- handful of items fail on every run and their organizer gets the same markdown_sync_failure
-- notification day after day for a problem no retry can fix.
--
-- ADR-128 explicitly REJECTS rolling Item.price back: the markdown is a real business
-- decision the organizer configured. This migration adds the missing representation of the
-- gap instead -- one enum and four Item columns.
--
-- SAFETY: additive only. No DROP, no ALTER of an existing column, no backfill, no data
-- movement. Three of the four columns are nullable with no default; the fourth is
-- INTEGER NOT NULL DEFAULT 0, which on PostgreSQL 11+ is stored as a catalogued "fast
-- default" and does NOT rewrite the table -- the same shape as the already-deployed
-- 20260917130000_add_item_qr_asset_ready migration on this same table. "Item" holds real
-- production rows; nothing here takes a rewrite-length ACCESS EXCLUSIVE lock.
--
-- Every existing row reads ebaySyncState = NULL ("not tracked by this mechanism"), which
-- falls through to today's priceUpdatedAt/ebayPriceSyncedAt behavior -- zero behavior change
-- on deploy until the propagation code starts writing these columns.
--
-- ROLLBACK: ALTER TABLE "Item" DROP COLUMN "ebaySyncAttempts", DROP COLUMN
--           "ebaySyncFailureReason", DROP COLUMN "ebaySyncState", DROP COLUMN
--           "ebayLivePrice"; DROP TYPE "EbaySyncState";

-- CreateEnum
-- SYNCED           eBay confirmed Item.price; "ebayLivePrice" matches it.
-- PENDING          FindA.Sale changed the price, eBay has not confirmed it yet (in flight).
-- FAILED_RETRYABLE transient (rate limit, lapsed OAuth token, network, eBay 429/5xx).
-- FAILED_TERMINAL  listing content eBay rejected (4xx), or no eBay offer at all -- retrying
--                  can never help, so ebayListingSyncCron.ts must stop calling eBay for it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EbaySyncState') THEN
    CREATE TYPE "EbaySyncState" AS ENUM ('SYNCED', 'PENDING', 'FAILED_RETRYABLE', 'FAILED_TERMINAL');
  END IF;
END
$$;

-- AlterTable
-- ebayLivePrice: the last price eBay actually CONFIRMED, as distinct from Item.price (the
-- price FindA.Sale decided). The two differing is a normal in-flight sync, not corruption.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebayLivePrice" DOUBLE PRECISION;

-- ebaySyncState: classified at the propagation boundary (markdownPricePropagationService.ts's
-- classifyPropagationFailure) so the retry cron knows when to stop.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebaySyncState" "EbaySyncState";

-- ebaySyncFailureReason: the REAL eBay error text, not a category -- this is what the
-- one-time terminal-failure notification actually shows the organizer.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebaySyncFailureReason" TEXT;

-- ebaySyncAttempts: consecutive failed eBay price-push attempts; reset to 0 on a confirmed
-- sync. NOT NULL DEFAULT 0 so the increment path never has to cope with a null counter.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebaySyncAttempts" INTEGER NOT NULL DEFAULT 0;
