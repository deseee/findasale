-- Make QRScannerEvent.saleId nullable.
-- The global QR scanner (nav button) fires SCAN_INITIATED / SCAN_CAMERA_DENIED
-- before any sale context exists, and decodes can target arbitrary off-domain
-- QR codes. These are legitimate sale-less events; the prior NOT NULL constraint
-- caused every null-saleId write to fail and be silently swallowed by the
-- fire-and-forget controller (DB record count = 0).

-- Drop the existing FK so we can alter the column, then re-add it as nullable.
-- Guarded so a re-run (or a DB where the FK name differs) does not error.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'QRScannerEvent_saleId_fkey'
      AND table_name = 'QRScannerEvent'
  ) THEN
    ALTER TABLE "QRScannerEvent" DROP CONSTRAINT "QRScannerEvent_saleId_fkey";
  END IF;
END $$;

-- Relax the NOT NULL constraint (idempotent — DROP NOT NULL is a no-op if already nullable).
ALTER TABLE "QRScannerEvent" ALTER COLUMN "saleId" DROP NOT NULL;

-- Re-add the foreign key (now nullable). ON DELETE CASCADE matches the Prisma relation.
ALTER TABLE "QRScannerEvent"
  ADD CONSTRAINT "QRScannerEvent_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
