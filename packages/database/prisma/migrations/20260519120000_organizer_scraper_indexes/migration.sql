-- Add indexes on isClaimed and isUnmanagedListing for leadScoringService nightly batch query
-- These fields are used in OR conditions across 56k+ Organizer rows — without indexes this was a full table scan
-- Fixes Sentry FINDASALE-NODEJS-1G (slow query ~1000-1134ms)

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Organizer_isClaimed_idx" ON "public"."Organizer"("isClaimed");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Organizer_isUnmanagedListing_idx" ON "public"."Organizer"("isUnmanagedListing");
