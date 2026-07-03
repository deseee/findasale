-- Grounded Identity (ADR grounded-identification-production-2026-07-02)
-- Additive, nullable columns on Item — safe migration, no data backfill, no drops.
-- Persists the winning grounded product identity when the cost-gated cascade
-- produces a candidate that passes the confidence gate.
ALTER TABLE "Item" ADD COLUMN "groundedIdentity" TEXT;
ALTER TABLE "Item" ADD COLUMN "groundedConfidence" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN "groundedSource" TEXT;
