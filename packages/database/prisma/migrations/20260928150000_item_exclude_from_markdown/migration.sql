-- ADR item-exclude-from-markdown (2026-09-28)
-- Per-item opt-out from BOTH auto-markdown systems (markdownCron.ts Feature #91
-- free-tier Day-2/Day-3, and markdownCycleCron.ts PRO-tier N-step MarkdownCycle).
-- Hand-written to match schema.prisma exactly, applied via `prisma migrate deploy`
-- (no shadow database involved), matching this sandbox's established pattern (see
-- 20260925130000_cashier_discretionary_discount/migration.sql for precedent).
--
-- Purely additive: one NOT NULL column with a DEFAULT, so every existing row reads
-- false immediately with no backfill UPDATE needed. No index -- both cron jobs'
-- queries already lead with a more selective condition (saleId/organizerId,
-- markdownStepIndexApplied, status), so this rides along as a cheap equality check.
--
-- Down migration (safe at any time -- removes only the opt-out, not an outage):
--   ALTER TABLE "Item" DROP COLUMN "excludeFromMarkdown";

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "excludeFromMarkdown" BOOLEAN NOT NULL DEFAULT false;
