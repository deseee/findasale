-- Migration: add_isr_regeneration_log
-- ADR: claude_docs/feature-notes/ADR-2026-09-16-isr-regeneration-logging.md
-- Purely additive: one new table, no changes to any existing table, no relations
-- to any existing model. Hand-written to match schema.prisma exactly, applied via
-- `prisma migrate deploy` (no shadow database involved), matching the established
-- pattern for this sandbox (see 20260902220000_add_pruned_sale_tombstone_and_cost_snapshot/migration.sql
-- for precedent).

CREATE TABLE IF NOT EXISTS "IsrRegenerationLog" (
    "id"           TEXT NOT NULL,
    "route"        TEXT NOT NULL,
    "outcome"      TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "hourBucket"   TIMESTAMP(3) NOT NULL,
    "count"        INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IsrRegenerationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IsrRegenerationLog_route_outcome_deploymentId_hourBucket_key" ON "IsrRegenerationLog"("route", "outcome", "deploymentId", "hourBucket");
CREATE INDEX IF NOT EXISTS "IsrRegenerationLog_hourBucket_idx" ON "IsrRegenerationLog"("hourBucket");
CREATE INDEX IF NOT EXISTS "IsrRegenerationLog_deploymentId_idx" ON "IsrRegenerationLog"("deploymentId");
