-- Overture/BrightQuery enrichment (#556) timeout fix — 2026-08-08
--
-- Root cause (confirmed by reading packages/backend/src/scripts/runOvertureEnrichment.ts
-- resolveAndUpdate(), steps 3 and 5): the dedup fallback queries filter on
-- Organizer.website and Organizer.phone using Prisma `contains` (translates to SQL
-- `LIKE '%value%'`), which cannot use a standard btree index regardless of whether
-- one exists. Neither column has ANY index today (confirmed by reading the Organizer
-- model's @@index list in schema.prisma). Every Overture candidate that reaches
-- these fallback steps (i.e. no gersId/email precedence match) triggers a full
-- sequential scan of the Organizer table, which an existing index comment in
-- schema.prisma puts at 83k+ rows. This runs once per candidate, sequentially,
-- inside a for-await loop with no batching — for a nationwide monthly run with
-- many thousands of candidates, the multiplied full-table-scan cost is a direct,
-- code-verifiable contributor to the job hitting its GitHub Actions timeout
-- (.github/workflows/scrape-overture-enrichment.yml).
--
-- Fix: GIN trigram indexes so `contains` (LIKE '%value%') queries can use an index
-- scan instead of a full table scan. Same pattern already used for Item.title —
-- see 20260310000001_add_item_fulltext_search_indexes/migration.sql. pg_trgm was
-- already enabled by that earlier migration; IF NOT EXISTS guards re-running safely.
--
-- No schema.prisma change — Prisma cannot express GIN indexes (see precedent
-- comment in 20260616000000_add_sentry_performance_indexes/migration.sql:
-- "GIN index for JSON path queries ... Prisma cannot express GIN indexes").
-- The Postgres query planner picks up these indexes automatically for `contains`
-- filters regardless of Prisma schema declarations.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_organizer_website_trgm"
  ON "Organizer" USING gin ("website" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_organizer_phone_trgm"
  ON "Organizer" USING gin ("phone" gin_trgm_ops);
