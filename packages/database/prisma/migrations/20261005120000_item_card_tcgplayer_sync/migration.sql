-- ADR-137 (2026-10-05, roadmap #660): TCGplayer round trip for card shops.
-- Four nullable columns on ItemCard, no backfill, no index, no default. Additive and idempotent.
--   tcgplayerQty         quantity last known to be listed on TCGplayer for this card (NULL = not known to be listed there)
--   tcgplayerSyncedAt    when tcgplayerQty was last set
--   tcgplayerPendingQty  quantity the most recent export would leave on TCGplayer if that file is uploaded
--   tcgplayerPendingAt   when that export was made
--
-- SAFETY: apply BEFORE deploying the matching backend build (the backend selects these columns). Nothing is
-- rewritten. Safe to leave in place on rollback: the old build never reads or writes these columns.
-- ROLLBACK (only if ever needed): ALTER TABLE "ItemCard" DROP COLUMN IF EXISTS "tcgplayerQty", DROP COLUMN IF EXISTS
-- "tcgplayerSyncedAt", DROP COLUMN IF EXISTS "tcgplayerPendingQty", DROP COLUMN IF EXISTS "tcgplayerPendingAt";

ALTER TABLE "ItemCard" ADD COLUMN IF NOT EXISTS "tcgplayerQty" INTEGER;
ALTER TABLE "ItemCard" ADD COLUMN IF NOT EXISTS "tcgplayerSyncedAt" TIMESTAMP(3);
ALTER TABLE "ItemCard" ADD COLUMN IF NOT EXISTS "tcgplayerPendingQty" INTEGER;
ALTER TABLE "ItemCard" ADD COLUMN IF NOT EXISTS "tcgplayerPendingAt" TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemCard_tcgplayerQty_nonneg') THEN
    ALTER TABLE "ItemCard" ADD CONSTRAINT "ItemCard_tcgplayerQty_nonneg" CHECK ("tcgplayerQty" IS NULL OR "tcgplayerQty" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemCard_tcgplayerPendingQty_nonneg') THEN
    ALTER TABLE "ItemCard" ADD CONSTRAINT "ItemCard_tcgplayerPendingQty_nonneg" CHECK ("tcgplayerPendingQty" IS NULL OR "tcgplayerPendingQty" >= 0);
  END IF;
END $$;
