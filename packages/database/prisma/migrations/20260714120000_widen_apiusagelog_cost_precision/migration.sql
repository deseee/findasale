-- Fix: ApiUsageLog.estimatedCostCents was an Int column incremented per-call via
-- Prisma `{ increment: Math.round(costUsd * 100) }`. A single Haiku call typically
-- costs well under $0.01 (e.g. ~626 tokens * $3/1M = ~$0.0019 = 0.19 cents), so
-- Math.round() to a whole cent rounds every individual call down to 0 BEFORE it's
-- added to the running total. Confirmed live: anthropic:listing_enrichment had
-- 368 calls on 2026-07-13 with estimatedCostCents = 0 for every row in the table.
-- Widening to DOUBLE PRECISION lets recordApiUsage() accumulate fractional cents
-- per call so the running total reflects real spend. See
-- claude_docs/feature-notes/adr-ai-cost-attribution-2026-07-12.md addendum.
-- Rollback: ALTER TABLE "ApiUsageLog" ALTER COLUMN "estimatedCostCents" TYPE INTEGER USING ROUND("estimatedCostCents");

ALTER TABLE "ApiUsageLog" ALTER COLUMN "estimatedCostCents" TYPE DOUBLE PRECISION;
