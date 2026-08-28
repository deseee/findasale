-- POS Cashier Discount Permission (2026-08-28)
-- Hand-written migration file: the columns below were already applied directly to Railway
-- production via `prisma db execute --stdin` (Option B, dev-environment skill) to avoid
-- `prisma migrate dev`'s shadow-database drift-reset prompt against a DB with significant
-- pre-existing, unrelated drift. This file exists so CI's own fresh ephemeral test database
-- gets the same columns via `prisma migrate deploy`, and so Railway's `_prisma_migrations`
-- table correctly records this migration as applied. All statements are idempotent
-- (IF NOT EXISTS) so re-running this against Railway, where the columns already exist, is a
-- safe no-op. See claude_docs/feature-notes/ADR-pos-cashier-discount-permission.md.

ALTER TABLE "WorkspaceSettings" ADD COLUMN IF NOT EXISTS "staffDiscountCapType" TEXT;
ALTER TABLE "WorkspaceSettings" ADD COLUMN IF NOT EXISTS "staffDiscountCapValue" DECIMAL(10,2);

ALTER TABLE "POSPaymentRequest" ADD COLUMN IF NOT EXISTS "discountType" TEXT;
ALTER TABLE "POSPaymentRequest" ADD COLUMN IF NOT EXISTS "discountValueRaw" DECIMAL(10,2);
ALTER TABLE "POSPaymentRequest" ADD COLUMN IF NOT EXISTS "discountAmountCents" INTEGER;
ALTER TABLE "POSPaymentRequest" ADD COLUMN IF NOT EXISTS "discountReasonNote" TEXT;
ALTER TABLE "POSPaymentRequest" ADD COLUMN IF NOT EXISTS "discountAppliedByUserId" TEXT;

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "discountType" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "discountValueRaw" DECIMAL(10,2);
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "discountAmountCents" INTEGER;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "discountReasonNote" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "discountAppliedByUserId" TEXT;
