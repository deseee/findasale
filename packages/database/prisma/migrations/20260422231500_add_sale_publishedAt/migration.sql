-- Rank-Based Early Access (Option A): Add publishedAt timestamp to Sale
-- This field gates early access based on shopper rank

-- Check if column already exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Sale' AND column_name = 'publishedAt'
  ) THEN
    ALTER TABLE "Sale" ADD COLUMN "publishedAt" TIMESTAMP(3);
  END IF;
END $$;

-- Backfill all existing sales: publishedAt = createdAt (no one locked out retroactively)
UPDATE "Sale"
SET "publishedAt" = "createdAt"
WHERE "publishedAt" IS NULL AND status = 'PUBLISHED';

-- For DRAFT sales, leave publishedAt as null until they are published
-- (they will be set to NOW() when status transitions to PUBLISHED)
