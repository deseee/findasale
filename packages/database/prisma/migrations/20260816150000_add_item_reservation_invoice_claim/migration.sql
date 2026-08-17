-- Hold-to-Pay P0 (2026-08-16): replace the FK-violating `CLAIMING:<holdId>` sentinel
-- (written into ItemReservation.invoiceId, a real FK to HoldInvoice.id) with dedicated
-- non-FK claim columns. Additive and nullable -- safe on a live table, no rewrite.
ALTER TABLE "ItemReservation" ADD COLUMN IF NOT EXISTS "invoiceClaimToken" TEXT;
ALTER TABLE "ItemReservation" ADD COLUMN IF NOT EXISTS "invoiceClaimedAt"  TIMESTAMP(3);

-- ItemReservation_invoiceId_fkey has never had a supporting index (confirmed via
-- pg_indexes). Postgres does not auto-index the referencing side, so every HoldInvoice
-- delete/update does a seq scan here, as does invoiceExpiryJob's reclaim query.
CREATE INDEX IF NOT EXISTS "ItemReservation_invoiceId_idx" ON "ItemReservation"("invoiceId");
