-- PrunedSaleTombstone.citySlug (2026-11-19, GSC "Not found (404)" cleanup).
--
-- WHAT: one nullable TEXT column. pruneScrapedSales.ts now records the canonical city slug of every sale it
-- hard-deletes, so GET /sales/:id can answer 410 SALE_GONE with that slug and the frontend /sales/[id] page can
-- 301 a pruned sale to /city/<slug> for every pruned id, not only the newest 5,000 synced to Global Config.
--
-- SAFETY: additive only. ADD COLUMN with no default is metadata-only on Postgres (no table rewrite, no lock beyond
-- a brief ACCESS EXCLUSIVE for the catalog change). Existing rows keep citySlug = NULL (their Sale rows are already
-- deleted, so the city cannot be recovered). Idempotent (IF NOT EXISTS).
--
-- APPLY: prisma migrate deploy (never prisma db push).
--
-- ROLLBACK:
--   ALTER TABLE "PrunedSaleTombstone" DROP COLUMN IF EXISTS "citySlug";

ALTER TABLE "PrunedSaleTombstone" ADD COLUMN IF NOT EXISTS "citySlug" TEXT;
