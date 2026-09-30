-- Backfill Purchase.processor (2026-09-30). NOT RUN. Review, then uncomment the UPDATEs.
-- Context: Purchase.processor has schema default 'STRIPE'; rows created without an explicit processor
-- were persisted as STRIPE even when paid via Square or taken in cash.
-- Table/column names verified against schema.prisma (model Purchase, no @@map):
--   "Purchase"."processor", "squarePaymentId", "stripePaymentIntentId".
-- Cash convention: processor = 'CASH' (refundService.executeVerifiedRefund also treats 'MANUAL' as cash).
-- Both UPDATEs are guarded so they only touch rows still labelled 'STRIPE' and are safe to re-run.

BEGIN;

-- 1a. DRY RUN: Square-paid rows mislabelled STRIPE
SELECT COUNT(*) AS square_rows_to_fix
FROM "Purchase"
WHERE "processor" = 'STRIPE'
  AND "squarePaymentId" IS NOT NULL;

-- 1b. UPDATE (commented out for review)
-- UPDATE "Purchase"
-- SET "processor" = 'SQUARE'
-- WHERE "processor" = 'STRIPE'
--   AND "squarePaymentId" IS NOT NULL;

-- 2a. DRY RUN: cash rows mislabelled STRIPE (placeholder id 'cash_<uuid>' / 'cash_test_<uuid>')
-- Rows with a squarePaymentId are excluded so step 1 owns them.
SELECT COUNT(*) AS cash_rows_to_fix
FROM "Purchase"
WHERE "processor" = 'STRIPE'
  AND "squarePaymentId" IS NULL
  AND "stripePaymentIntentId" LIKE 'cash\_%' ESCAPE '\';

-- 2b. UPDATE (commented out for review)
-- UPDATE "Purchase"
-- SET "processor" = 'CASH'
-- WHERE "processor" = 'STRIPE'
--   AND "squarePaymentId" IS NULL
--   AND "stripePaymentIntentId" LIKE 'cash\_%' ESCAPE '\';

-- 3. Post-check: distribution after review/apply
SELECT "processor", COUNT(*) FROM "Purchase" GROUP BY "processor" ORDER BY 2 DESC;

-- Review the counts above. To apply: uncomment 1b and/or 2b, then replace ROLLBACK with COMMIT.
ROLLBACK;
