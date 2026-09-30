-- AlterTable: SaleHub city/state/zip (vendor-booth-hub-autofill-adr, schema.prisma 2026-09-25)
-- schema.prisma declares SaleHub.city / SaleHub.state / SaleHub.zip (String?) and the hub
-- create/manage code reads and writes them, but no earlier migration ever created the
-- columns (20260925120000_salehub_venue_details added only address/phone/contactEmail/hoursText).
-- Purely additive and idempotent: nullable TEXT, no defaults, no indexes (schema.prisma
-- declares none for these fields). Existing hubs simply read NULL until edited.
ALTER TABLE "SaleHub" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "SaleHub" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "SaleHub" ADD COLUMN IF NOT EXISTS "zip" TEXT;

-- DOWN (manual, not run by prisma migrate; only if the columns must be rolled back and the
-- code that reads them has been reverted first):
--   ALTER TABLE "SaleHub" DROP COLUMN IF EXISTS "zip";
--   ALTER TABLE "SaleHub" DROP COLUMN IF EXISTS "state";
--   ALTER TABLE "SaleHub" DROP COLUMN IF EXISTS "city";
