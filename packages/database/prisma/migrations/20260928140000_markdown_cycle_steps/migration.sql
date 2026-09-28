-- ADR-markdown-cycle-n-steps (2026-09-28)
-- N-step Automatic Markdown Cycles (PRO tier). Replaces MarkdownCycle's hardcoded
-- 2-step shape (daysUntilFirst/firstPct/daysUntilSecond/secondPct) with a child table
-- so an organizer can configure 1-6 ordered steps. Hand-written to match schema.prisma
-- exactly, applied via `prisma migrate deploy` (no shadow database involved), matching
-- this sandbox's established pattern (see 20260925130000_cashier_discretionary_discount
-- for precedent).
--
-- 1. MarkdownCycleStep -- new table, purely additive.
-- 2. Backfill -- every existing MarkdownCycle's daysUntilFirst/firstPct becomes its
--    step 1 verbatim (no inference); daysUntilSecond/secondPct becomes step 2 only where
--    both are set. Exact copy of existing values, no guessing.
-- 3. Item.markdownStepIndexApplied -- new nullable column, additive, no backfill needed.
--    markdownCycleCron.ts's new per-step loop keeps the existing epsilon price-equality
--    skip as its self-healing mechanism for already-marked-down items: the first
--    post-deploy run computes each item's target step, finds the price already matches,
--    and just stamps the pointer with zero side effects (no history row, no alert, no
--    marketplace push) rather than needing a guessed SQL backfill here.
--
-- SAFETY: additive only. MarkdownCycle's 4 old columns are UNTOUCHED (still present,
-- still NOT NULL where they were) -- new code stops reading them but nothing drops them
-- in this migration, so a reverted backend deploy is unaffected by this migration having
-- run. A follow-up migration should drop them once the new path has run clean in
-- production for a few days -- not part of this dispatch.
--
-- Down migration (safe at any time -- purely additive, so a schema-level rollback is
-- close to risk-free; the real risk is in the backend code, not this migration):
--   DROP TABLE "MarkdownCycleStep";
--   ALTER TABLE "Item" DROP COLUMN "markdownStepIndexApplied";

-- 1. New child table
CREATE TABLE IF NOT EXISTS "MarkdownCycleStep" (
    "id"           TEXT NOT NULL,
    "cycleId"      TEXT NOT NULL,
    "stepOrder"    INTEGER NOT NULL,
    "dayThreshold" INTEGER NOT NULL,
    "pctOff"       INTEGER NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkdownCycleStep_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarkdownCycleStep" ADD CONSTRAINT "MarkdownCycleStep_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "MarkdownCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "MarkdownCycleStep_cycleId_stepOrder_key" ON "MarkdownCycleStep"("cycleId", "stepOrder");
CREATE INDEX IF NOT EXISTS "MarkdownCycleStep_cycleId_idx" ON "MarkdownCycleStep"("cycleId");

-- 2. Backfill existing 2-step data verbatim (exact values, no inference)
INSERT INTO "MarkdownCycleStep" ("id", "cycleId", "stepOrder", "dayThreshold", "pctOff", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 1, "daysUntilFirst", "firstPct", now(), now()
FROM "MarkdownCycle";

INSERT INTO "MarkdownCycleStep" ("id", "cycleId", "stepOrder", "dayThreshold", "pctOff", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 2, "daysUntilSecond", "secondPct", now(), now()
FROM "MarkdownCycle"
WHERE "daysUntilSecond" IS NOT NULL AND "secondPct" IS NOT NULL;

-- 3. New idempotency pointer on Item (additive, nullable, no backfill)
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "markdownStepIndexApplied" INTEGER;
