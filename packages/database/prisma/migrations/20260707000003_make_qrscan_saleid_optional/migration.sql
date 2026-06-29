-- Make QRScannerEvent.saleId optional so global nav scanner events
-- (fired without a sale context) are recorded rather than rejected.
-- Also switches onDelete from CASCADE to SET NULL so scan events
-- survive sale deletion for historical analytics.

ALTER TABLE "QRScannerEvent" ALTER COLUMN "saleId" DROP NOT NULL;

-- NULL values bypass FK checks in PostgreSQL — no constraint change needed.
