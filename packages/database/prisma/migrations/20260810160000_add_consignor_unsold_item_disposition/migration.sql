-- Consignor Onboarding: unsold-item disposition field
-- Additive, nullable, no backfill needed. Rollback: DROP COLUMN "unsoldItemDisposition" FROM "Consignor".
ALTER TABLE "Consignor" ADD COLUMN "unsoldItemDisposition" TEXT;
