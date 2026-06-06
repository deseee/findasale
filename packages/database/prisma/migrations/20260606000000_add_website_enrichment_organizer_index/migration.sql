-- Sentry slow query fix 2026-06-06: websiteEnrichmentJob daily cron
-- SELECT id, businessName, address, licenseState, phone FROM Organizer
-- WHERE isUnmanagedListing=true AND isStateLicensed=true AND website IS NULL (1159ms)
-- Composite allows Postgres to narrow to the small intersection before scanning for website IS NULL.
CREATE INDEX IF NOT EXISTS "Organizer_isUnmanagedListing_isStateLicensed_idx"
  ON "public"."Organizer"("isUnmanagedListing", "isStateLicensed");
