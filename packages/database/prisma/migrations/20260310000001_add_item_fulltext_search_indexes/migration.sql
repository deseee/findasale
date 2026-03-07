-- Sprint 4a: Full-text search indexes for Item model
-- Adds tsvector generated column + GIN index for FTS, plus supporting indexes.
-- Safe to run on live DB — no table rewrites, no downtime (index builds are non-blocking on PG 12+).

-- Enable pg_trgm extension for trigram matching (ILIKE optimization for fallback path)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add searchVector generated column (auto-computed from title+description+category, stored on disk)
-- Weights: title = A (highest), description = B, category = C
ALTER TABLE "Item"
ADD COLUMN IF NOT EXISTS "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', COALESCE("title", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE("description", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("category", '')), 'C')
) STORED;

-- FTS index (GIN) — powers the @@ operator queries
CREATE INDEX IF NOT EXISTS "idx_item_search_vector"
  ON "Item" USING gin ("searchVector");

-- Compound index for category + condition + status filtering
CREATE INDEX IF NOT EXISTS "idx_item_category_condition_status"
  ON "Item" (category, condition, status);

-- Trigram index on title for ILIKE fallback path
CREATE INDEX IF NOT EXISTS "idx_item_title_trgm"
  ON "Item" USING gin ("title" gin_trgm_ops);

-- Composite sale+status index for cross-sale queries
CREATE INDEX IF NOT EXISTS "idx_item_sale_status"
  ON "Item" ("saleId", status);
