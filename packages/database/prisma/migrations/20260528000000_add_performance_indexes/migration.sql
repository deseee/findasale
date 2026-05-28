-- Migration: add_performance_indexes
-- Created: 2026-05-28
-- Reason: Sentry slow-query alerts — Sale full-table scans (6298ms, 49x) and Review JOIN Sale (4300ms, 2x)
-- Note: CONCURRENTLY removed — cannot run inside Prisma's transaction block (P3018)

-- Slow query A (4300ms): SELECT Review.id, Review.rating FROM Review
--   LEFT JOIN Sale AS j1 ON j1.id = Review.saleId
--   WHERE j1.organizerId = $1 AND ...
-- Review.saleId already indexed. Sale needs a dedicated organizerId+startDate index
-- for queries that filter by organizer and order/filter by date.
CREATE INDEX IF NOT EXISTS "Sale_organizerId_startDate_idx"
  ON "Sale" ("organizerId", "startDate");

-- Slow query B (6298ms, 49x): Full table scan on Sale with multiple WHERE conditions
-- including status + date range combinations not covered by existing indexes.
-- Covers: WHERE status = $1 AND startDate <= $2 AND endDate >= $3 (active sale range queries)
CREATE INDEX IF NOT EXISTS "Sale_status_startDate_endDate_idx"
  ON "Sale" ("status", "startDate", "endDate");
