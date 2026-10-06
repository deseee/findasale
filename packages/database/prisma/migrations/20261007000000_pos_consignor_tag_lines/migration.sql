-- Consignor price tags (2026-10-06). Additive + idempotent. No Item DDL (listingType already exists).
-- Verified tag lines persisted on the async payment paths so the SOLD consignor Item is minted
-- inside the PAID/COMPLETED flip transaction.
ALTER TABLE "POSPaymentRequest" ADD COLUMN IF NOT EXISTS "consignorLines" JSONB;
ALTER TABLE "POSPaymentLink" ADD COLUMN IF NOT EXISTS "consignorLines" JSONB;
ALTER TABLE "BoothCartTransaction" ADD COLUMN IF NOT EXISTS "consignorLines" JSONB;

-- Consignor archive (soft-delete) so a consignor with a money trail is archived, not deleted.
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- ROLLBACK (manual, only if no tag lines / archives need preserving):
-- ALTER TABLE "POSPaymentRequest" DROP COLUMN IF EXISTS "consignorLines";
-- ALTER TABLE "POSPaymentLink" DROP COLUMN IF EXISTS "consignorLines";
-- ALTER TABLE "BoothCartTransaction" DROP COLUMN IF EXISTS "consignorLines";
-- ALTER TABLE "Consignor" DROP COLUMN IF EXISTS "archivedAt";
