-- Migration: add_pruned_sale_tombstone_and_cost_snapshot
-- ADR: claude_docs/feature-notes/ADR-2026-09-02-automated-410-tombstones-and-cost-snapshots.md
-- Purely additive: two new tables, no changes to any existing table, no relations
-- to any existing model (see ADR for why PrunedSaleTombstone intentionally has no
-- FK to Sale -- the whole point is the Sale row is already gone).
-- Hand-written to match schema.prisma exactly, applied via `prisma migrate deploy`
-- (no shadow database involved), matching the established pattern for this sandbox
-- (see 20260829010000_add_curio_scan/migration.sql for precedent).

CREATE TABLE IF NOT EXISTS "PrunedSaleTombstone" (
    "id"       TEXT NOT NULL,
    "prunedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrunedSaleTombstone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PrunedSaleTombstone_prunedAt_idx" ON "PrunedSaleTombstone"("prunedAt");

CREATE TABLE IF NOT EXISTS "PlatformCostSnapshot" (
    "id"        TEXT NOT NULL,
    "date"      TIMESTAMP(3) NOT NULL,
    "provider"  TEXT NOT NULL,
    "metric"    TEXT NOT NULL,
    "quantity"  DECIMAL(65,30) NOT NULL,
    "costUsd"   DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformCostSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformCostSnapshot_date_provider_metric_key" ON "PlatformCostSnapshot"("date", "provider", "metric");
CREATE INDEX IF NOT EXISTS "PlatformCostSnapshot_provider_metric_date_idx" ON "PlatformCostSnapshot"("provider", "metric", "date");
