-- SaleAiTagUsage (2026-10-23): per-sale meter for the 500 auto tags included with the $9.99 a-la-carte sale upgrade.
--
-- WHY: the upgrade was advertised as including 500 auto tags for that sale, but nothing metered tags per sale, so a paid
-- sale only drew from the organizer's 100/month SIMPLE allowance. lib/aiTagsQuotaTracker.ts reserves from this row first
-- for items of a paid ALA_CARTE sale, then falls back to the monthly allowance.
--
-- SAFETY: additive. New table only; no existing table or data changes. Idempotent (IF NOT EXISTS / guarded FK).
-- ROLLBACK: DROP TABLE IF EXISTS "SaleAiTagUsage"; (code degrades to the monthly allowance when the table is missing).
CREATE TABLE IF NOT EXISTS "SaleAiTagUsage" (
  "saleId" TEXT NOT NULL,
  "tagsUsed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleAiTagUsage_pkey" PRIMARY KEY ("saleId")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SaleAiTagUsage_saleId_fkey') THEN
    ALTER TABLE "SaleAiTagUsage" ADD CONSTRAINT "SaleAiTagUsage_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
