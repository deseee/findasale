-- U2 (2026-10-04): Item pull-sync hold columns for "Save without updating marketplaces".
--   ebaySyncHeldAt     set while the organizer has paused eBay sync for this item (cron skips pull and price push-first)
--   ebayHeldFields     Item field names changed locally while held (empty array = none)
--   ebayContentDirtyAt set when title/description/condition really change on an eBay-listed item, cleared on confirmed push
--
-- SAFETY: additive and idempotent. Nullable or defaulted, no backfill, no index. Apply BEFORE deploying the matching
-- backend build. Safe to leave in place on rollback.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebaySyncHeldAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebayHeldFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebayContentDirtyAt" TIMESTAMP(3);
